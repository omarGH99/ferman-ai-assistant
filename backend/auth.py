"""Authentication + opt-in command collection for the Multilingual Assistant.

Storage is swappable so the same code runs locally and in the cloud:

  * no ``DATABASE_URL``            -> SQLite file (``app.db``, override with ``AUTH_DB``)
  * ``DATABASE_URL=postgres://...`` -> Postgres (e.g. a free Neon database)

Two tables — ``users`` (accounts) and ``commands`` (opt-in log). PBKDF2 (stdlib)
hashes passwords; PyJWT issues tokens. Nothing is written without a valid token,
and command text is only stored for users who turned collection on.
"""
import os
import re
import hashlib
import secrets
import datetime as dt
from contextlib import contextmanager

import jwt
from fastapi import Header, HTTPException

HERE = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.environ.get("DATABASE_URL", "")
PG = DATABASE_URL.startswith("postgres")

# ---------------- storage backend (SQLite or Postgres) ----------------
if PG:
    import psycopg
    from psycopg.rows import dict_row

    _IntegrityError = psycopg.errors.IntegrityError
    _ID_COL = "SERIAL PRIMARY KEY"

    def _connect():
        return psycopg.connect(DATABASE_URL, row_factory=dict_row)

    def _q(sql):
        return sql.replace("?", "%s")
else:
    import sqlite3

    DB_PATH = os.environ.get("AUTH_DB", os.path.join(HERE, "app.db"))
    _IntegrityError = sqlite3.IntegrityError
    _ID_COL = "INTEGER PRIMARY KEY AUTOINCREMENT"

    def _connect():
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

    def _q(sql):
        return sql

# AUTH_SECRET signs every login token. A hardcoded fallback is fine for local
# dev but catastrophic in production — anyone who reads this file could mint a
# valid token for any account. A printed warning is not enough protection: in a
# container it scrolls past unread, so a deploy that loses the env var would come
# up looking healthy while every token is forgeable.
#
# So: refuse to start if it's missing anywhere that looks like production.
# DATABASE_URL (Neon) and K_SERVICE (set by Cloud Run) are the two signals.
_DEV_SECRET = "dev-insecure-secret-change-me"
_IS_PROD = bool(DATABASE_URL) or bool(os.environ.get("K_SERVICE"))
_SECRET = os.environ.get("AUTH_SECRET") or ""

if not _SECRET or _SECRET == _DEV_SECRET:
    if _IS_PROD:
        raise RuntimeError(
            "AUTH_SECRET is missing (or still the dev default) but this looks "
            "like a production environment (DATABASE_URL/K_SERVICE is set). "
            "Refusing to start with a forgeable token secret. Generate one with "
            "`python -c \"import secrets;print(secrets.token_hex(32))\"` and set "
            "it via --set-env-vars AUTH_SECRET=..."
        )
    _SECRET = _DEV_SECRET
    print("WARNING: AUTH_SECRET not set — using an insecure dev secret. "
          "This is allowed locally but will refuse to start in production.")

_ALGO = "HS256"
_TOKEN_DAYS = 30
_PBKDF2_ITERS = 200_000
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@contextmanager
def _db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _migrate_email_nullable(conn):
    """Relax users.email from NOT NULL to nullable on a table that was created
    before signup made email optional. CREATE TABLE IF NOT EXISTS only applies
    to brand-new tables, so an existing database needs this run once."""
    if PG:
        conn.execute(
            "ALTER TABLE users ALTER COLUMN email DROP NOT NULL"
        )
    else:
        cols = conn.execute("PRAGMA table_info(users)").fetchall()
        email_col = next((c for c in cols if c["name"] == "email"), None)
        if email_col is None or not email_col["notnull"]:
            return
        conn.execute("ALTER TABLE users RENAME TO users_old")
        conn.execute(
            f"""CREATE TABLE users (
                id {_ID_COL},
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                consent_data_collection INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            "INSERT INTO users (id, username, email, password_hash, salt, "
            "consent_data_collection, created_at) "
            "SELECT id, username, email, password_hash, salt, "
            "consent_data_collection, created_at FROM users_old"
        )
        conn.execute("DROP TABLE users_old")


def init_db():
    with _db() as conn:
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS users (
                id {_ID_COL},
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                consent_data_collection INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )"""
        )
        _migrate_email_nullable(conn)
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS commands (
                id {_ID_COL},
                user_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                lang TEXT,
                predicted_intent TEXT,
                confidence REAL,
                corrected_intent TEXT,
                created_at TEXT NOT NULL
            )"""
        )
        # One row per user: the whole app state (tasks, reminders, shopping) as a
        # JSON blob, so an account's data follows the user to any device.
        conn.execute(
            """CREATE TABLE IF NOT EXISTS user_state (
                user_id INTEGER PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        # Shared task/event bundles. A share is a *copy handed over*, never a
        # write into someone else's data: the recipient's own client merges the
        # payload into its own state blob, so the one-writer-per-blob rule that
        # last-write-wins sync depends on still holds.
        conn.execute(
            """CREATE TABLE IF NOT EXISTS shares (
                code TEXT PRIMARY KEY,
                from_user_id INTEGER NOT NULL,
                from_username TEXT NOT NULL,
                kind TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )"""
        )
        # Tester feedback. user_id/username are captured when available so replies
        # can be traced, but anonymous feedback is allowed too.
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS feedback (
                id {_ID_COL},
                user_id INTEGER,
                username TEXT,
                message TEXT NOT NULL,
                rating INTEGER,
                created_at TEXT NOT NULL
            )"""
        )


# ---------------- passwords ----------------
def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                 bytes.fromhex(salt), _PBKDF2_ITERS)
    return digest.hex(), salt


def verify_password(password, salt, expected_hash):
    digest, _ = hash_password(password, salt)
    return secrets.compare_digest(digest, expected_hash)


# ---------------- tokens ----------------
def create_token(user_id):
    now = dt.datetime.now(dt.timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + dt.timedelta(days=_TOKEN_DAYS)}
    return jwt.encode(payload, _SECRET, algorithm=_ALGO)


def _decode_token(token):
    try:
        payload = jwt.decode(token, _SECRET, algorithms=[_ALGO])
        return int(payload["sub"])
    except Exception:
        return None


# ---------------- users ----------------
def _row_to_user(row):
    if row is None:
        return None
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "consent_data_collection": bool(row["consent_data_collection"]),
    }


def create_user(username, email, password):
    username = (username or "").strip()
    email = (email or "").strip().lower() or None
    if len(username) < 3:
        raise ValueError("Username must be at least 3 characters.")
    if email is not None and not _EMAIL_RE.match(email):
        raise ValueError("Please enter a valid email address.")
    if len(password or "") < 6:
        raise ValueError("Password must be at least 6 characters.")

    pw_hash, salt = hash_password(password)
    created = dt.datetime.now(dt.timezone.utc).isoformat()
    insert = ("INSERT INTO users (username, email, password_hash, salt, "
              "consent_data_collection, created_at) VALUES (?, ?, ?, ?, 0, ?)")
    try:
        with _db() as conn:
            if PG:
                row = conn.execute(_q(insert + " RETURNING id"),
                                   (username, email, pw_hash, salt, created)).fetchone()
                user_id = row["id"]
            else:
                cur = conn.execute(_q(insert), (username, email, pw_hash, salt, created))
                user_id = cur.lastrowid
    except _IntegrityError as e:
        msg = str(e).lower()
        if "username" in msg:
            raise ValueError("That username is already taken.")
        if "email" in msg:
            raise ValueError("An account with that email already exists.")
        raise ValueError("Account already exists.")
    return get_user_by_id(user_id)


def get_user_by_id(user_id):
    with _db() as conn:
        row = conn.execute(_q("SELECT * FROM users WHERE id = ?"), (user_id,)).fetchone()
    return _row_to_user(row)


def authenticate(login, password):
    """`login` may be a username or an email."""
    login = (login or "").strip()
    with _db() as conn:
        row = conn.execute(
            _q("SELECT * FROM users WHERE username = ? OR email = ?"),
            (login, login.lower()),
        ).fetchone()
    if row is None or not verify_password(password, row["salt"], row["password_hash"]):
        return None
    return _row_to_user(row)


def change_username(user_id, new_username):
    new_username = (new_username or "").strip()
    if len(new_username) < 3:
        raise ValueError("Username must be at least 3 characters.")
    try:
        with _db() as conn:
            conn.execute(_q("UPDATE users SET username = ? WHERE id = ?"),
                         (new_username, user_id))
    except _IntegrityError:
        raise ValueError("That username is already taken.")
    return get_user_by_id(user_id)


def change_password(user_id, current_password, new_password):
    with _db() as conn:
        row = conn.execute(_q("SELECT * FROM users WHERE id = ?"), (user_id,)).fetchone()
    if row is None:
        raise ValueError("User not found.")
    if not verify_password(current_password, row["salt"], row["password_hash"]):
        raise ValueError("Current password is incorrect.")
    if len(new_password or "") < 6:
        raise ValueError("New password must be at least 6 characters.")
    pw_hash, salt = hash_password(new_password)
    with _db() as conn:
        conn.execute(_q("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?"),
                     (pw_hash, salt, user_id))
    return True


def set_consent(user_id, consent):
    with _db() as conn:
        conn.execute(_q("UPDATE users SET consent_data_collection = ? WHERE id = ?"),
                     (1 if consent else 0, user_id))
    return get_user_by_id(user_id)


# ---------------- command collection ----------------
def log_command(user_id, text, lang=None, predicted_intent=None,
                confidence=None, corrected_intent=None):
    """Store a command only if the user has consent turned on. Returns the new
    row's id, or None if nothing was written."""
    user = get_user_by_id(user_id)
    if not user or not user["consent_data_collection"]:
        return None
    insert = ("INSERT INTO commands (user_id, text, lang, predicted_intent, "
              "confidence, corrected_intent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    args = (user_id, text, lang, predicted_intent, confidence, corrected_intent,
            dt.datetime.now(dt.timezone.utc).isoformat())
    with _db() as conn:
        if PG:
            row = conn.execute(_q(insert + " RETURNING id"), args).fetchone()
            return row["id"]
        return conn.execute(_q(insert), args).lastrowid


def set_correction(user_id, command_id, corrected_intent):
    """Attach the user's correction to a command they logged earlier.

    This updates the original row rather than inserting a second one: the export
    is training data, and the same utterance appearing twice — once unlabelled,
    once labelled — would both inflate the counts and teach the model to weight
    corrected examples twice.

    Scoped to the calling user so one account cannot relabel another's data.
    Returns True if a row was actually updated.
    """
    if not corrected_intent:
        return False
    with _db() as conn:
        cur = conn.execute(
            _q("UPDATE commands SET corrected_intent = ? WHERE id = ? AND user_id = ?"),
            (corrected_intent, command_id, user_id),
        )
        return cur.rowcount > 0


# ---------------- cross-device state sync ----------------
def get_state(user_id):
    """Return (data_json_text, updated_at) for the user, or (None, None)."""
    with _db() as conn:
        row = conn.execute(_q("SELECT data, updated_at FROM user_state WHERE user_id = ?"),
                           (user_id,)).fetchone()
    if row is None:
        return None, None
    return row["data"], row["updated_at"]


def _as_ts(value):
    """updated_at is stored as TEXT holding a millisecond epoch. Compare it
    numerically — string comparison would order '9' after '10'. Anything
    unparseable counts as the oldest possible write."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def set_state(user_id, data, updated_at):
    """Upsert the user's state blob, but only if it is newer than what is
    already stored. `data` is already JSON-encoded text.

    The last-write-wins guard has to live here, not just in the client: a
    retried or out-of-order PUT (flaky mobile connection, two devices syncing
    at once) would otherwise overwrite newer data with older data and silently
    lose the user's tasks. Returns True if the write was applied.
    """
    incoming = _as_ts(updated_at)
    with _db() as conn:
        row = conn.execute(_q("SELECT updated_at FROM user_state WHERE user_id = ?"),
                           (user_id,)).fetchone()
        if row is not None and _as_ts(row["updated_at"]) > incoming:
            return False
        conn.execute(
            _q("INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, ?) "
               "ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, "
               "updated_at = excluded.updated_at"),
            (user_id, data, updated_at),
        )
    return True


# ---------------- sharing (copy handed over, not joint ownership) ----------------
# Ambiguous characters are left out so a code can be read aloud or copied off a
# screenshot without 0/O or 1/I/l confusion.
_SHARE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_SHARE_LEN = 6
SHARE_TTL_DAYS = 14


def _new_share_code():
    return "".join(secrets.choice(_SHARE_ALPHABET) for _ in range(_SHARE_LEN))


def create_share(user_id, username, kind, payload):
    """Store a shared bundle and return its code.

    The code is the only credential — anyone holding it can read the payload —
    so it expires, and creation is rate limited at the endpoint. 31^6 ≈ 8.9e8
    combinations makes blind guessing impractical at those limits.
    """
    created = dt.datetime.now(dt.timezone.utc)
    expires = created + dt.timedelta(days=SHARE_TTL_DAYS)
    with _db() as conn:
        for _ in range(5):  # retry on the vanishingly unlikely collision
            code = _new_share_code()
            try:
                conn.execute(
                    _q("INSERT INTO shares (code, from_user_id, from_username, kind, "
                       "payload, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
                    (code, user_id, username, kind, payload,
                     created.isoformat(), expires.isoformat()),
                )
                return code
            except _IntegrityError:
                continue
    raise ValueError("Could not allocate a share code, please try again.")


def get_share(code):
    """Return the bundle for a code, or None if unknown or expired."""
    code = (code or "").strip().upper()
    if not code:
        return None
    with _db() as conn:
        row = conn.execute(_q("SELECT * FROM shares WHERE code = ?"), (code,)).fetchone()
    if row is None:
        return None
    try:
        if dt.datetime.fromisoformat(row["expires_at"]) < dt.datetime.now(dt.timezone.utc):
            return None
    except ValueError:
        return None
    return {
        "code": row["code"],
        "from": row["from_username"],
        "kind": row["kind"],
        "payload": row["payload"],
    }


# ---------------- tester feedback ----------------
def add_feedback(message, user_id=None, username=None, rating=None):
    message = (message or "").strip()
    if not message:
        return False
    with _db() as conn:
        conn.execute(
            _q("INSERT INTO feedback (user_id, username, message, rating, created_at) "
               "VALUES (?, ?, ?, ?, ?)"),
            (user_id, username, message[:4000], rating,
             dt.datetime.now(dt.timezone.utc).isoformat()),
        )
    return True


def list_feedback(limit=500):
    with _db() as conn:
        rows = conn.execute(
            _q("SELECT id, user_id, username, message, rating, created_at "
               "FROM feedback ORDER BY id DESC LIMIT ?"),
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


# ---------------- FastAPI dependency ----------------
def current_user(authorization: str = Header(default="")):
    """Resolve the bearer token in the Authorization header to a user, or 401."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user_id = _decode_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user
