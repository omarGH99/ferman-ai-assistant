"""Workspaces and the Diwan register — office-mode data.

Kept as its own module, parallel to auth.py and ratelimit.py, rather than
folded into auth.py (which is about personal accounts) or split into a
routers/ package (this app stays a flat set of top-level modules; endpoints
still live in main.py). Reuses auth.py's storage plumbing — same SQLite/
Postgres switch, same ? -> %s shim — instead of duplicating it.

Two tables:
  * workspaces / workspace_members — a workspace is a name plus a set of
    members with a role. Two roles only for now, owner and member; richer
    roles wait for a real workspace to ask for them rather than being guessed
    up front.
  * diwan_records — the incoming/outgoing correspondence log (Al-Wared /
    Al-Sader). Built first because it digitizes a habit offices already have
    (the physical register) rather than asking them to adopt a new one.
  * debt_records — Daftar Al-Dayn, who owes whom, tracked in whichever
    currency was actually promised (USD or IQD) rather than converted to one
    total — a debt agreed in dollars stays in dollars even as the exchange
    rate moves.
  * approval_requests — single-step sign-off: one requester, one assigned
    approver, approve or reject with a note. Not the multi-tier
    Requester -> Auditor -> GM chain the original spec sketched — there is no
    role data yet to route a chain through (still just owner/member, on
    purpose), so a hierarchy would be routed on invented data rather than
    anything a real workspace asked for. Add tiers when a real approval flow
    needs more than one decision-maker, not before.
  * workspace_tasks — shared, assignable tasks. This is its own table rather
    than an extension of the personal task list in user_state: that blob is
    one-per-user by design (see set_state's last-write-wins guard), so a task
    two people need to see can't live there no matter how the UI presents it.
    The wireframe drew this as a filter chip inside the existing Lists
    screen; it's built here the same way Diwan and the debt ledger were
    instead, because that would mean teaching a screen that currently only
    ever renders one user's data to also render a second, differently-shaped
    data source — a bigger and riskier change than this feature is worth
    before Phase 1 has a single real workspace using it.

Workspace invites reuse auth.py's `shares` table with kind="workspace"
instead of a second code table — same generator, same expiry, same
redemption shape as sharing a list. No schema change needed in auth.py: the
kind whitelist there is enforced by the /share endpoint, not by create_share
itself.

Attachments on a Diwan entry are a URL reference only. There is no file/blob
storage in this app's infrastructure (Cloud Run + Neon, no S3/GCS bucket), so
actual upload-and-store is out of scope until that gap is deliberately
closed, not silently faked here.
"""
import datetime as dt
import json

from auth import _db, _q, _ID_COL, PG


def init_db():
    with _db() as conn:
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS workspaces (
                id {_ID_COL},
                name TEXT NOT NULL,
                owner_user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS workspace_members (
                workspace_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL DEFAULT 'member',
                joined_at TEXT NOT NULL,
                PRIMARY KEY (workspace_id, user_id)
            )"""
        )
        # No declared FK to workspace_members/users, matching the rest of this
        # codebase (user_state, commands, ... all reference user_id without a
        # DB-level FK) — membership is checked in code before every access.
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS diwan_records (
                id {_ID_COL},
                workspace_id INTEGER NOT NULL,
                direction TEXT NOT NULL,
                serial_number INTEGER NOT NULL,
                entity_name TEXT NOT NULL,
                subject TEXT,
                department TEXT,
                entry_date TEXT NOT NULL,
                reply_to_id INTEGER,
                replied INTEGER NOT NULL DEFAULT 0,
                attachment_url TEXT,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS debt_records (
                id {_ID_COL},
                workspace_id INTEGER NOT NULL,
                party_name TEXT NOT NULL,
                party_phone TEXT,
                direction TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                note TEXT,
                settled INTEGER NOT NULL DEFAULT 0,
                due_date TEXT,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                settled_at TEXT
            )"""
        )
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS workspace_tasks (
                id {_ID_COL},
                workspace_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                assignee_user_id INTEGER,
                due_date TEXT,
                done INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'todo',
                attachment_url TEXT,
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS task_comments (
                id {_ID_COL},
                workspace_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                author_user_id INTEGER NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        # Deliberately a flat checklist, not nested sub-tasks: a title and a
        # done flag, ordered by insertion (id) with no drag-reorder -- same
        # "no drag-and-drop" call already made for the Kanban board. A
        # second layer of assignees/due-dates/statuses under each task would
        # be a whole second task system, not a checklist.
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS task_checklist_items (
                id {_ID_COL},
                workspace_id INTEGER NOT NULL,
                task_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS approval_requests (
                id {_ID_COL},
                workspace_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                amount REAL,
                currency TEXT,
                requested_by INTEGER NOT NULL,
                approver_user_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                decision_note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                decided_at TEXT
            )"""
        )
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS activity_log (
                id {_ID_COL},
                workspace_id INTEGER NOT NULL,
                actor_user_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            f"""CREATE TABLE IF NOT EXISTS notifications (
                id {_ID_COL},
                workspace_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                detail TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )"""
        )
        _migrate_debt_due_date(conn)
        _migrate_task_status(conn)
        _migrate_task_attachment(conn)


def _migrate_debt_due_date(conn):
    """debt_records predates the due_date column -- existing local/dev
    databases already have the table without it, and CREATE TABLE IF NOT
    EXISTS above is a no-op against a table that already exists. Postgres can
    add a nullable column in one statement; SQLite needs the column-existence
    check first since it lacks ADD COLUMN IF NOT EXISTS."""
    if PG:
        conn.execute("ALTER TABLE debt_records ADD COLUMN IF NOT EXISTS due_date TEXT")
    else:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(debt_records)").fetchall()]
        if "due_date" not in cols:
            conn.execute("ALTER TABLE debt_records ADD COLUMN due_date TEXT")


def _migrate_task_status(conn):
    """workspace_tasks predates the status column -- same shape of migration
    as _migrate_debt_due_date, plus a backfill: a row that already has
    done = 1 should read as status = 'done', not the column's default
    'todo', so existing completed tasks don't visually un-complete
    themselves the moment this deploys."""
    if PG:
        conn.execute("ALTER TABLE workspace_tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'todo'")
    else:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(workspace_tasks)").fetchall()]
        if "status" not in cols:
            conn.execute("ALTER TABLE workspace_tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'")
    conn.execute("UPDATE workspace_tasks SET status = 'done' WHERE done = 1 AND status = 'todo'")


def _migrate_task_attachment(conn):
    """Same shape as _migrate_debt_due_date -- workspace_tasks predates this
    column on any database that already has rows."""
    if PG:
        conn.execute("ALTER TABLE workspace_tasks ADD COLUMN IF NOT EXISTS attachment_url TEXT")
    else:
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(workspace_tasks)").fetchall()]
        if "attachment_url" not in cols:
            conn.execute("ALTER TABLE workspace_tasks ADD COLUMN attachment_url TEXT")


def _now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


# ---------------- workspaces & membership ----------------
def _row_to_workspace(row):
    if row is None:
        return None
    return {"id": row["id"], "name": row["name"], "owner_user_id": row["owner_user_id"],
            "created_at": row["created_at"]}


def create_workspace(owner_user_id, name):
    name = (name or "").strip()
    if len(name) < 2:
        raise ValueError("Workspace name must be at least 2 characters.")
    created = _now()
    insert = "INSERT INTO workspaces (name, owner_user_id, created_at) VALUES (?, ?, ?)"
    with _db() as conn:
        if PG:
            row = conn.execute(_q(insert + " RETURNING id"),
                               (name, owner_user_id, created)).fetchone()
            ws_id = row["id"]
        else:
            cur = conn.execute(_q(insert), (name, owner_user_id, created))
            ws_id = cur.lastrowid
        conn.execute(
            _q("INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) "
               "VALUES (?, ?, 'owner', ?)"),
            (ws_id, owner_user_id, created),
        )
    return get_workspace(ws_id)


def get_workspace(workspace_id):
    with _db() as conn:
        row = conn.execute(_q("SELECT * FROM workspaces WHERE id = ?"),
                           (workspace_id,)).fetchone()
    return _row_to_workspace(row)


def list_my_workspaces(user_id):
    with _db() as conn:
        rows = conn.execute(
            _q("SELECT w.*, m.role FROM workspaces w "
               "JOIN workspace_members m ON m.workspace_id = w.id "
               "WHERE m.user_id = ? ORDER BY w.created_at"),
            (user_id,),
        ).fetchall()
    out = []
    for r in rows:
        item = _row_to_workspace(r)
        item["role"] = r["role"]
        out.append(item)
    return out


def list_workspace_members(workspace_id):
    """Joined against auth.py's users table so callers get a username to show,
    not just an id — the two tables live in the same database regardless of
    backend, so this is one query rather than a round trip per member."""
    with _db() as conn:
        rows = conn.execute(
            _q("SELECT m.user_id, m.role, m.joined_at, u.username FROM workspace_members m "
               "JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.joined_at"),
            (workspace_id,),
        ).fetchall()
    return [{"user_id": r["user_id"], "username": r["username"], "role": r["role"]} for r in rows]


def get_member_role(workspace_id, user_id):
    with _db() as conn:
        row = conn.execute(
            _q("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?"),
            (workspace_id, user_id),
        ).fetchone()
    return row["role"] if row else None


def join_workspace(user_id, workspace_id):
    """Idempotent — joining a workspace you're already in just returns it,
    rather than erroring, so a stale/reused invite link doesn't break."""
    if get_member_role(workspace_id, user_id) is None:
        with _db() as conn:
            conn.execute(
                _q("INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) "
                   "VALUES (?, ?, 'member', ?)"),
                (workspace_id, user_id, _now()),
            )
    return get_workspace(workspace_id)


# ---------------- Diwan register ----------------
def _row_to_diwan(row):
    if row is None:
        return None
    return {
        "id": row["id"], "workspace_id": row["workspace_id"], "direction": row["direction"],
        "serial_number": row["serial_number"], "entity_name": row["entity_name"],
        "subject": row["subject"], "department": row["department"],
        "entry_date": row["entry_date"], "reply_to_id": row["reply_to_id"],
        "replied": bool(row["replied"]), "attachment_url": row["attachment_url"],
        "created_by": row["created_by"], "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_diwan_entry(workspace_id, user_id, direction, entity_name, subject=None,
                       department=None, entry_date=None, reply_to_id=None,
                       attachment_url=None):
    direction = (direction or "").strip().lower()
    if direction not in ("incoming", "outgoing"):
        raise ValueError("direction must be 'incoming' or 'outgoing'.")
    entity_name = (entity_name or "").strip()
    if not entity_name:
        raise ValueError("entity_name is required.")
    entry_date = entry_date or _now()[:10]

    parent = get_diwan_entry(workspace_id, reply_to_id) if reply_to_id is not None else None
    if reply_to_id is not None and parent is None:
        raise ValueError("reply_to_id does not refer to an entry in this workspace.")

    now = _now()
    with _db() as conn:
        # Serial numbers are per (workspace, direction) — a real Diwan keeps
        # separate Wared/Sader books, not one shared sequence. Read-then-write
        # inside the same connection; a genuine race between two concurrent
        # writers in the same workspace is a known gap, not expected to matter
        # at the traffic this feature sees for a long while.
        row = conn.execute(
            _q("SELECT COALESCE(MAX(serial_number), 0) AS n FROM diwan_records "
               "WHERE workspace_id = ? AND direction = ?"),
            (workspace_id, direction),
        ).fetchone()
        serial = row["n"] + 1
        insert = (
            "INSERT INTO diwan_records (workspace_id, direction, serial_number, "
            "entity_name, subject, department, entry_date, reply_to_id, replied, "
            "attachment_url, created_by, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)"
        )
        args = (workspace_id, direction, serial, entity_name, subject, department,
                entry_date, reply_to_id, attachment_url, user_id, now, now)
        if PG:
            r = conn.execute(_q(insert + " RETURNING id"), args).fetchone()
            entry_id = r["id"]
        else:
            entry_id = conn.execute(_q(insert), args).lastrowid

        # A reply is what answers the question a Diwan register exists to
        # answer -- "did we respond to this" -- so creating one marks the
        # parent replied in the same transaction rather than leaving that as
        # a second, easy-to-forget manual step.
        if reply_to_id is not None:
            conn.execute(
                _q("UPDATE diwan_records SET replied = 1, updated_at = ? WHERE workspace_id = ? AND id = ?"),
                (now, workspace_id, reply_to_id),
            )
    log_activity(workspace_id, user_id, "diwan_created",
                {"entity_name": entity_name, "serial_number": serial, "direction": direction})
    if parent is not None:
        log_activity(workspace_id, user_id, "diwan_replied",
                    {"entity_name": parent["entity_name"], "serial_number": parent["serial_number"]})
    return get_diwan_entry(workspace_id, entry_id)


def list_diwan_entries(workspace_id, direction=None, department=None, q=None):
    sql = "SELECT * FROM diwan_records WHERE workspace_id = ?"
    args = [workspace_id]
    if direction:
        sql += " AND direction = ?"
        args.append(direction)
    if department:
        sql += " AND department = ?"
        args.append(department)
    if q:
        sql += " AND LOWER(entity_name) LIKE LOWER(?)"
        args.append(f"%{q}%")
    sql += " ORDER BY serial_number DESC"
    with _db() as conn:
        rows = conn.execute(_q(sql), tuple(args)).fetchall()
    return [_row_to_diwan(r) for r in rows]


def get_diwan_entry(workspace_id, entry_id):
    with _db() as conn:
        row = conn.execute(
            _q("SELECT * FROM diwan_records WHERE workspace_id = ? AND id = ?"),
            (workspace_id, entry_id),
        ).fetchone()
    return _row_to_diwan(row)


def update_diwan_entry(workspace_id, entry_id, entity_name=None, subject=None,
                       department=None, replied=None, attachment_url=None,
                       actor_user_id=None):
    """Partial update: only fields passed as not-None are touched. Replaces
    the narrower set_diwan_replied — same PATCH endpoint, just accepting more
    optional fields than it used to. Returns False if the row doesn't exist;
    callers check existence separately when they need to distinguish that
    from "nothing was passed to update". actor_user_id is only used to
    attribute the activity-log entry when replied is explicitly set — it's
    optional so existing callers that don't care about logging don't break."""
    fields, args = [], []
    if entity_name is not None:
        entity_name = entity_name.strip()
        if not entity_name:
            raise ValueError("entity_name cannot be empty.")
        fields.append("entity_name = ?"); args.append(entity_name)
    if subject is not None:
        fields.append("subject = ?"); args.append(subject)
    if department is not None:
        fields.append("department = ?"); args.append(department)
    if replied is not None:
        fields.append("replied = ?"); args.append(1 if replied else 0)
    if attachment_url is not None:
        fields.append("attachment_url = ?"); args.append(attachment_url)
    if not fields:
        return get_diwan_entry(workspace_id, entry_id) is not None
    fields.append("updated_at = ?"); args.append(_now())
    args += [workspace_id, entry_id]
    with _db() as conn:
        cur = conn.execute(
            _q(f"UPDATE diwan_records SET {', '.join(fields)} WHERE workspace_id = ? AND id = ?"),
            tuple(args),
        )
        ok = cur.rowcount > 0
    if ok and replied and actor_user_id is not None:
        entry = get_diwan_entry(workspace_id, entry_id)
        log_activity(workspace_id, actor_user_id, "diwan_replied",
                     {"entity_name": entry["entity_name"], "serial_number": entry["serial_number"]})
    return ok


# ---------------- Debt ledger ----------------
# Sentinel distinct from None, for the one field (task assignee) where
# "omitted" and "explicitly cleared" are different requests.
_UNSET = object()

_DEBT_DIRECTIONS = ("they_owe_us", "we_owe_them")
_DEBT_CURRENCIES = ("USD", "IQD")


def _row_to_debt(row):
    if row is None:
        return None
    return {
        "id": row["id"], "workspace_id": row["workspace_id"], "party_name": row["party_name"],
        "party_phone": row["party_phone"], "direction": row["direction"], "amount": row["amount"],
        "currency": row["currency"], "note": row["note"], "settled": bool(row["settled"]),
        "due_date": row["due_date"], "created_by": row["created_by"], "created_at": row["created_at"],
        "updated_at": row["updated_at"], "settled_at": row["settled_at"],
    }


def create_debt_entry(workspace_id, user_id, party_name, direction, amount, currency,
                      party_phone=None, note=None, due_date=None):
    direction = (direction or "").strip()
    if direction not in _DEBT_DIRECTIONS:
        raise ValueError("direction must be 'they_owe_us' or 'we_owe_them'.")
    currency = (currency or "").strip().upper()
    if currency not in _DEBT_CURRENCIES:
        raise ValueError("currency must be 'USD' or 'IQD'.")
    party_name = (party_name or "").strip()
    if not party_name:
        raise ValueError("party_name is required.")
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        raise ValueError("amount must be a number.")
    if amount <= 0:
        raise ValueError("amount must be greater than zero.")

    now = _now()
    insert = (
        "INSERT INTO debt_records (workspace_id, party_name, party_phone, direction, "
        "amount, currency, note, settled, due_date, created_by, created_at, updated_at, settled_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NULL)"
    )
    args = (workspace_id, party_name, party_phone, direction, amount, currency, note,
            due_date, user_id, now, now)
    with _db() as conn:
        if PG:
            r = conn.execute(_q(insert + " RETURNING id"), args).fetchone()
            entry_id = r["id"]
        else:
            entry_id = conn.execute(_q(insert), args).lastrowid
    log_activity(workspace_id, user_id, "debt_created",
                {"party_name": party_name, "amount": amount, "currency": currency, "direction": direction})
    return get_debt_entry(workspace_id, entry_id)


def list_debt_entries(workspace_id, direction=None, settled=None, q=None):
    sql = "SELECT * FROM debt_records WHERE workspace_id = ?"
    args = [workspace_id]
    if direction:
        sql += " AND direction = ?"
        args.append(direction)
    if settled is not None:
        sql += " AND settled = ?"
        args.append(1 if settled else 0)
    if q:
        sql += " AND LOWER(party_name) LIKE LOWER(?)"
        args.append(f"%{q}%")
    sql += " ORDER BY created_at DESC"
    with _db() as conn:
        rows = conn.execute(_q(sql), tuple(args)).fetchall()
    return [_row_to_debt(r) for r in rows]


def get_debt_entry(workspace_id, entry_id):
    with _db() as conn:
        row = conn.execute(
            _q("SELECT * FROM debt_records WHERE workspace_id = ? AND id = ?"),
            (workspace_id, entry_id),
        ).fetchone()
    return _row_to_debt(row)


def update_debt_entry(workspace_id, entry_id, party_name=None, party_phone=None,
                      amount=None, currency=None, note=None, settled=None,
                      due_date=None, actor_user_id=None):
    """Partial update, same shape as update_diwan_entry. amount/currency are
    validated the same way create_debt_entry validates them, but only when
    actually supplied -- editing the note shouldn't require re-typing a valid
    amount. actor_user_id attributes the activity-log entry when settled is
    explicitly set, same optional-logging shape as update_diwan_entry."""
    fields, args = [], []
    if party_name is not None:
        party_name = party_name.strip()
        if not party_name:
            raise ValueError("party_name cannot be empty.")
        fields.append("party_name = ?"); args.append(party_name)
    if party_phone is not None:
        fields.append("party_phone = ?"); args.append(party_phone)
    if amount is not None:
        try:
            amount = float(amount)
        except (TypeError, ValueError):
            raise ValueError("amount must be a number.")
        if amount <= 0:
            raise ValueError("amount must be greater than zero.")
        fields.append("amount = ?"); args.append(amount)
    if currency is not None:
        currency = currency.strip().upper()
        if currency not in _DEBT_CURRENCIES:
            raise ValueError("currency must be 'USD' or 'IQD'.")
        fields.append("currency = ?"); args.append(currency)
    if note is not None:
        fields.append("note = ?"); args.append(note)
    if due_date is not None:
        fields.append("due_date = ?"); args.append(due_date)
    now = _now()
    if settled is not None:
        fields.append("settled = ?"); args.append(1 if settled else 0)
        fields.append("settled_at = ?"); args.append(now if settled else None)
    if not fields:
        return get_debt_entry(workspace_id, entry_id) is not None
    fields.append("updated_at = ?"); args.append(now)
    args += [workspace_id, entry_id]
    with _db() as conn:
        cur = conn.execute(
            _q(f"UPDATE debt_records SET {', '.join(fields)} WHERE workspace_id = ? AND id = ?"),
            tuple(args),
        )
        ok = cur.rowcount > 0
    if ok and settled and actor_user_id is not None:
        entry = get_debt_entry(workspace_id, entry_id)
        log_activity(workspace_id, actor_user_id, "debt_settled",
                     {"party_name": entry["party_name"], "amount": entry["amount"], "currency": entry["currency"]})
    return ok


# ---------------- shared tasks ----------------
# Four stages, not a freeform string -- matches the stages a ClickUp-style
# board actually uses in practice (see the "most-used features" research
# behind this phase), without inventing a fuller custom-field system nobody
# has asked to configure yet.
_TASK_STATUSES = ("todo", "in_progress", "review", "done")


def _row_to_task(row):
    if row is None:
        return None
    return {
        "id": row["id"], "workspace_id": row["workspace_id"], "title": row["title"],
        "assignee_user_id": row["assignee_user_id"], "due_date": row["due_date"],
        "done": bool(row["done"]), "status": row["status"], "attachment_url": row["attachment_url"],
        "created_by": row["created_by"], "created_at": row["created_at"], "updated_at": row["updated_at"],
    }


def create_workspace_task(workspace_id, user_id, title, assignee_user_id=None, due_date=None,
                          status=None, attachment_url=None):
    title = (title or "").strip()
    if not title:
        raise ValueError("title is required.")
    if assignee_user_id is not None and get_member_role(workspace_id, assignee_user_id) is None:
        raise ValueError("assignee_user_id must be a member of this workspace.")
    if status is not None and status not in _TASK_STATUSES:
        raise ValueError(f"status must be one of {_TASK_STATUSES}.")
    status = status or "todo"
    done = 1 if status == "done" else 0

    now = _now()
    insert = (
        "INSERT INTO workspace_tasks (workspace_id, title, assignee_user_id, due_date, "
        "done, status, attachment_url, created_by, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    args = (workspace_id, title, assignee_user_id, due_date, done, status, attachment_url, user_id, now, now)
    with _db() as conn:
        if PG:
            r = conn.execute(_q(insert + " RETURNING id"), args).fetchone()
            task_id = r["id"]
        else:
            task_id = conn.execute(_q(insert), args).lastrowid
    log_activity(workspace_id, user_id, "task_created", {"title": title})
    if assignee_user_id is not None and assignee_user_id != user_id:
        create_notification(workspace_id, assignee_user_id, "task_assigned",
                            {"title": title, "task_id": task_id})
    return get_workspace_task(workspace_id, task_id)


def list_workspace_tasks(workspace_id, assignee_user_id=None, done=None, status=None, q=None):
    sql = "SELECT * FROM workspace_tasks WHERE workspace_id = ?"
    args = [workspace_id]
    if assignee_user_id is not None:
        sql += " AND assignee_user_id = ?"
        args.append(assignee_user_id)
    if done is not None:
        sql += " AND done = ?"
        args.append(1 if done else 0)
    if status is not None:
        sql += " AND status = ?"
        args.append(status)
    if q:
        sql += " AND LOWER(title) LIKE LOWER(?)"
        args.append(f"%{q}%")
    sql += " ORDER BY (due_date IS NULL), due_date, created_at"
    with _db() as conn:
        rows = conn.execute(_q(sql), tuple(args)).fetchall()
    return [_row_to_task(r) for r in rows]


def get_workspace_task(workspace_id, task_id):
    with _db() as conn:
        row = conn.execute(
            _q("SELECT * FROM workspace_tasks WHERE workspace_id = ? AND id = ?"),
            (workspace_id, task_id),
        ).fetchone()
    return _row_to_task(row)


def update_workspace_task(workspace_id, task_id, title=None, assignee_user_id=_UNSET,
                          due_date=None, done=None, status=None, attachment_url=None, actor_user_id=None):
    """Partial update, same shape as the other update_*_entry functions.
    assignee_user_id is the one field that legitimately needs a third state:
    "don't touch it" (omitted, the default _UNSET sentinel) vs "clear it back
    to unassigned" (explicit None). A plain `assignee_user_id=None` default
    can't distinguish those, so this is the one function in the module that
    needs a sentinel rather than None itself.

    status is the four-stage field the UI now drives; done is kept as a
    derived column rather than dropped, so the existing done=True/False
    callers (and the done filter in list_workspace_tasks) keep working
    unchanged. When both are supplied status wins; when only one is
    supplied the other is derived from it, so the two columns can never
    drift out of sync. actor_user_id attributes the activity-log entry
    when the task newly reaches 'done'."""
    fields, args = [], []
    if title is not None:
        title = title.strip()
        if not title:
            raise ValueError("title cannot be empty.")
        fields.append("title = ?"); args.append(title)
    if assignee_user_id is not _UNSET:
        if assignee_user_id is not None and get_member_role(workspace_id, assignee_user_id) is None:
            raise ValueError("assignee_user_id must be a member of this workspace.")
        fields.append("assignee_user_id = ?"); args.append(assignee_user_id)
    if due_date is not None:
        fields.append("due_date = ?"); args.append(due_date)
    if attachment_url is not None:
        fields.append("attachment_url = ?"); args.append(attachment_url)
    is_done = None
    if status is not None:
        if status not in _TASK_STATUSES:
            raise ValueError(f"status must be one of {_TASK_STATUSES}.")
        fields.append("status = ?"); args.append(status)
        is_done = status == "done"
        fields.append("done = ?"); args.append(1 if is_done else 0)
    elif done is not None:
        is_done = bool(done)
        fields.append("done = ?"); args.append(1 if is_done else 0)
        fields.append("status = ?"); args.append("done" if is_done else "todo")
    if not fields:
        return get_workspace_task(workspace_id, task_id) is not None
    fields.append("updated_at = ?"); args.append(_now())
    args += [workspace_id, task_id]
    with _db() as conn:
        cur = conn.execute(
            _q(f"UPDATE workspace_tasks SET {', '.join(fields)} WHERE workspace_id = ? AND id = ?"),
            tuple(args),
        )
        ok = cur.rowcount > 0
    if ok:
        task = None
        if is_done and actor_user_id is not None:
            task = task or get_workspace_task(workspace_id, task_id)
            log_activity(workspace_id, actor_user_id, "task_completed", {"title": task["title"]})
        if (assignee_user_id is not _UNSET and assignee_user_id is not None
                and assignee_user_id != actor_user_id):
            task = task or get_workspace_task(workspace_id, task_id)
            create_notification(workspace_id, assignee_user_id, "task_assigned",
                                {"title": task["title"], "task_id": task_id})
    return ok


def _row_to_comment(row):
    if row is None:
        return None
    return {
        "id": row["id"], "workspace_id": row["workspace_id"], "task_id": row["task_id"],
        "author_user_id": row["author_user_id"], "author_username": row["username"],
        "body": row["body"], "created_at": row["created_at"],
    }


def list_task_comments(workspace_id, task_id):
    """Joined against users the same way list_workspace_members is, so
    callers get a username to show rather than a bare id."""
    with _db() as conn:
        rows = conn.execute(
            _q("SELECT c.*, u.username FROM task_comments c JOIN users u ON u.id = c.author_user_id "
               "WHERE c.workspace_id = ? AND c.task_id = ? ORDER BY c.id"),
            (workspace_id, task_id),
        ).fetchall()
    return [_row_to_comment(r) for r in rows]


def add_task_comment(workspace_id, task_id, user_id, body):
    body = (body or "").strip()
    if not body:
        raise ValueError("body is required.")
    now = _now()
    insert = (
        "INSERT INTO task_comments (workspace_id, task_id, author_user_id, body, created_at) "
        "VALUES (?, ?, ?, ?, ?)"
    )
    args = (workspace_id, task_id, user_id, body, now)
    with _db() as conn:
        if PG:
            r = conn.execute(_q(insert + " RETURNING id"), args).fetchone()
            comment_id = r["id"]
        else:
            comment_id = conn.execute(_q(insert), args).lastrowid
    task = get_workspace_task(workspace_id, task_id)
    if task is not None:
        log_activity(workspace_id, user_id, "task_commented", {"title": task["title"]})
        # Whoever has a stake in the task -- its creator and its current
        # assignee -- gets notified, except the person who just wrote the
        # comment (no one needs to be told about their own comment).
        recipients = {task["created_by"], task["assignee_user_id"]} - {None, user_id}
        for recipient in recipients:
            create_notification(workspace_id, recipient, "task_commented",
                                {"title": task["title"], "task_id": task_id})
    return next(c for c in list_task_comments(workspace_id, task_id) if c["id"] == comment_id)


def _row_to_checklist_item(row):
    if row is None:
        return None
    return {
        "id": row["id"], "workspace_id": row["workspace_id"], "task_id": row["task_id"],
        "title": row["title"], "done": bool(row["done"]),
        "created_at": row["created_at"], "updated_at": row["updated_at"],
    }


def list_checklist_items(workspace_id, task_id):
    with _db() as conn:
        rows = conn.execute(
            _q("SELECT * FROM task_checklist_items WHERE workspace_id = ? AND task_id = ? ORDER BY id"),
            (workspace_id, task_id),
        ).fetchall()
    return [_row_to_checklist_item(r) for r in rows]


def add_checklist_item(workspace_id, task_id, title):
    title = (title or "").strip()
    if not title:
        raise ValueError("title is required.")
    now = _now()
    insert = (
        "INSERT INTO task_checklist_items (workspace_id, task_id, title, done, created_at, updated_at) "
        "VALUES (?, ?, ?, 0, ?, ?)"
    )
    args = (workspace_id, task_id, title, now, now)
    with _db() as conn:
        if PG:
            r = conn.execute(_q(insert + " RETURNING id"), args).fetchone()
            item_id = r["id"]
        else:
            item_id = conn.execute(_q(insert), args).lastrowid
    return get_checklist_item(workspace_id, task_id, item_id)


def get_checklist_item(workspace_id, task_id, item_id):
    with _db() as conn:
        row = conn.execute(
            _q("SELECT * FROM task_checklist_items WHERE workspace_id = ? AND task_id = ? AND id = ?"),
            (workspace_id, task_id, item_id),
        ).fetchone()
    return _row_to_checklist_item(row)


def update_checklist_item(workspace_id, task_id, item_id, title=None, done=None):
    fields, args = [], []
    if title is not None:
        title = title.strip()
        if not title:
            raise ValueError("title cannot be empty.")
        fields.append("title = ?"); args.append(title)
    if done is not None:
        fields.append("done = ?"); args.append(1 if done else 0)
    if not fields:
        return get_checklist_item(workspace_id, task_id, item_id) is not None
    fields.append("updated_at = ?"); args.append(_now())
    args += [workspace_id, task_id, item_id]
    with _db() as conn:
        cur = conn.execute(
            _q(f"UPDATE task_checklist_items SET {', '.join(fields)} "
               "WHERE workspace_id = ? AND task_id = ? AND id = ?"),
            tuple(args),
        )
        return cur.rowcount > 0


def delete_checklist_item(workspace_id, task_id, item_id):
    with _db() as conn:
        cur = conn.execute(
            _q("DELETE FROM task_checklist_items WHERE workspace_id = ? AND task_id = ? AND id = ?"),
            (workspace_id, task_id, item_id),
        )
        return cur.rowcount > 0


# ---------------- approval requests ----------------
def _row_to_approval(row):
    if row is None:
        return None
    return {
        "id": row["id"], "workspace_id": row["workspace_id"], "title": row["title"],
        "description": row["description"], "amount": row["amount"], "currency": row["currency"],
        "requested_by": row["requested_by"], "approver_user_id": row["approver_user_id"],
        "status": row["status"], "decision_note": row["decision_note"],
        "created_at": row["created_at"], "updated_at": row["updated_at"], "decided_at": row["decided_at"],
    }


def create_approval_request(workspace_id, user_id, title, approver_user_id,
                            description=None, amount=None, currency=None):
    title = (title or "").strip()
    if not title:
        raise ValueError("title is required.")
    if get_member_role(workspace_id, approver_user_id) is None:
        raise ValueError("approver_user_id must be a member of this workspace.")
    if (amount is None) != (currency is None):
        raise ValueError("amount and currency must be provided together.")
    if amount is not None:
        try:
            amount = float(amount)
        except (TypeError, ValueError):
            raise ValueError("amount must be a number.")
        if amount <= 0:
            raise ValueError("amount must be greater than zero.")
        currency = (currency or "").strip().upper()
        if currency not in _DEBT_CURRENCIES:
            raise ValueError("currency must be 'USD' or 'IQD'.")

    now = _now()
    insert = (
        "INSERT INTO approval_requests (workspace_id, title, description, amount, currency, "
        "requested_by, approver_user_id, status, decision_note, created_at, updated_at, decided_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL)"
    )
    args = (workspace_id, title, description, amount, currency, user_id, approver_user_id, now, now)
    with _db() as conn:
        if PG:
            r = conn.execute(_q(insert + " RETURNING id"), args).fetchone()
            request_id = r["id"]
        else:
            request_id = conn.execute(_q(insert), args).lastrowid
    log_activity(workspace_id, user_id, "approval_created", {"title": title})
    if approver_user_id != user_id:
        create_notification(workspace_id, approver_user_id, "approval_requested",
                            {"title": title, "request_id": request_id})
    return get_approval_request(workspace_id, request_id)


def list_approval_requests(workspace_id, status=None, approver_user_id=None):
    sql = "SELECT * FROM approval_requests WHERE workspace_id = ?"
    args = [workspace_id]
    if status:
        sql += " AND status = ?"
        args.append(status)
    if approver_user_id is not None:
        sql += " AND approver_user_id = ?"
        args.append(approver_user_id)
    sql += " ORDER BY created_at DESC"
    with _db() as conn:
        rows = conn.execute(_q(sql), tuple(args)).fetchall()
    return [_row_to_approval(r) for r in rows]


def get_approval_request(workspace_id, request_id):
    with _db() as conn:
        row = conn.execute(
            _q("SELECT * FROM approval_requests WHERE workspace_id = ? AND id = ?"),
            (workspace_id, request_id),
        ).fetchone()
    return _row_to_approval(row)


def decide_approval_request(workspace_id, request_id, approve, note=None, actor_user_id=None):
    """Only flips status while it is still 'pending' -- the WHERE clause makes
    a double-decision a no-op (rowcount 0) rather than silently overwriting an
    earlier decision, so the caller can tell 'already decided' from 'not
    found' by re-reading the row rather than trusting a race."""
    now = _now()
    status = "approved" if approve else "rejected"
    with _db() as conn:
        cur = conn.execute(
            _q("UPDATE approval_requests SET status = ?, decision_note = ?, "
               "updated_at = ?, decided_at = ? "
               "WHERE workspace_id = ? AND id = ? AND status = 'pending'"),
            (status, note, now, now, workspace_id, request_id),
        )
        ok = cur.rowcount > 0
    if ok and actor_user_id is not None:
        req = get_approval_request(workspace_id, request_id)
        log_activity(workspace_id, actor_user_id, "approval_decided",
                     {"title": req["title"], "status": req["status"]})
        if req["requested_by"] != actor_user_id:
            create_notification(workspace_id, req["requested_by"], "approval_decided",
                                {"title": req["title"], "status": req["status"]})
    return ok


def cancel_approval_request(workspace_id, request_id, actor_user_id=None):
    """Withdraws a request the requester changed their mind about. Same
    still-pending guard as decide_approval_request -- once an approver has
    acted, the requester can't retroactively cancel that decision, they can
    only ask for something new."""
    now = _now()
    with _db() as conn:
        cur = conn.execute(
            _q("UPDATE approval_requests SET status = 'cancelled', updated_at = ?, decided_at = ? "
               "WHERE workspace_id = ? AND id = ? AND status = 'pending'"),
            (now, now, workspace_id, request_id),
        )
        ok = cur.rowcount > 0
    if ok and actor_user_id is not None:
        req = get_approval_request(workspace_id, request_id)
        log_activity(workspace_id, actor_user_id, "approval_cancelled", {"title": req["title"]})
    return ok


# ---------------- activity log ----------------
# Deliberately stores structured (kind, detail) pairs, not a pre-rendered
# English sentence -- this app is multilingual (en/ar/ku UI chrome), and a
# server-baked "logged a letter from X" string could never be translated by
# the frontend. The frontend picks an i18n template per kind and interpolates
# detail's fields itself.
def log_activity(workspace_id, actor_user_id, kind, detail):
    with _db() as conn:
        conn.execute(
            _q("INSERT INTO activity_log (workspace_id, actor_user_id, kind, detail, created_at) "
               "VALUES (?, ?, ?, ?, ?)"),
            (workspace_id, actor_user_id, kind, json.dumps(detail, ensure_ascii=False), _now()),
        )


def list_activity(workspace_id, limit=20):
    with _db() as conn:
        rows = conn.execute(
            _q("SELECT * FROM activity_log WHERE workspace_id = ? ORDER BY id DESC LIMIT ?"),
            (workspace_id, limit),
        ).fetchall()
    out = []
    for r in rows:
        out.append({
            "id": r["id"], "workspace_id": r["workspace_id"], "actor_user_id": r["actor_user_id"],
            "kind": r["kind"], "detail": json.loads(r["detail"]), "created_at": r["created_at"],
        })
    return out


# ---------------- notifications ----------------
# In-app only, on purpose: this app has no push or email pipeline wired up
# yet (no Expo push project, no SMTP/SES), and standing one up is a real
# infrastructure decision -- not something to make unilaterally on a solo
# tester's say-so. This gets someone "you were assigned/commented on/decided
# for" the next time they open the app, which covers the notifications
# people actually check in practice, without inventing @-mention text
# parsing (a separate, larger feature) or new delivery infrastructure.
def create_notification(workspace_id, user_id, kind, detail):
    with _db() as conn:
        conn.execute(
            _q("INSERT INTO notifications (workspace_id, user_id, kind, detail, read, created_at) "
               "VALUES (?, ?, ?, ?, 0, ?)"),
            (workspace_id, user_id, kind, json.dumps(detail, ensure_ascii=False), _now()),
        )


def list_notifications(workspace_id, user_id, unread_only=False, limit=30):
    sql = "SELECT * FROM notifications WHERE workspace_id = ? AND user_id = ?"
    args = [workspace_id, user_id]
    if unread_only:
        sql += " AND read = 0"
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(limit)
    with _db() as conn:
        rows = conn.execute(_q(sql), tuple(args)).fetchall()
        unread_row = conn.execute(
            _q("SELECT COUNT(*) AS n FROM notifications WHERE workspace_id = ? AND user_id = ? AND read = 0"),
            (workspace_id, user_id),
        ).fetchone()
    notifications = [
        {"id": r["id"], "workspace_id": r["workspace_id"], "user_id": r["user_id"], "kind": r["kind"],
         "detail": json.loads(r["detail"]), "read": bool(r["read"]), "created_at": r["created_at"]}
        for r in rows
    ]
    return notifications, unread_row["n"]


def mark_notification_read(workspace_id, user_id, notification_id):
    """Scoped to (workspace_id, user_id) same as every other row here -- a
    user can only ever mark their own notification read, not guess at
    someone else's id."""
    with _db() as conn:
        cur = conn.execute(
            _q("UPDATE notifications SET read = 1 WHERE workspace_id = ? AND user_id = ? AND id = ?"),
            (workspace_id, user_id, notification_id),
        )
        return cur.rowcount > 0


def mark_all_notifications_read(workspace_id, user_id):
    with _db() as conn:
        conn.execute(
            _q("UPDATE notifications SET read = 1 WHERE workspace_id = ? AND user_id = ? AND read = 0"),
            (workspace_id, user_id),
        )
