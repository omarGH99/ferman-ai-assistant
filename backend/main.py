"""FastAPI backend for the Multilingual AI Assistant (Ferman).

The intent model is now trained on English, Arabic, Sorani and Badini, so every
language — including Arabic-script Kurdish — goes STRAIGHT to the model. No
translation step.

Intent and slot models load independently: if only the intent model is present,
the app runs on intents (slots come back empty). If neither is present, a small
keyword parser keeps the UI working for demos. Stateless — lists live in the browser.
"""
import os
import json
import logging
import secrets
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
import ratelimit
import workspace as ws

HERE = os.path.dirname(os.path.abspath(__file__))

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ferman")

app = FastAPI(title="Ferman — Multilingual AI Assistant for Iraq")

# The web build is served from this same origin, so it needs no CORS grant at
# all. "*" existed for Expo Go / LAN dev, where the origin varies. Keep that
# convenience locally, but in production allow only the origins named in
# ALLOWED_ORIGINS (comma-separated) so a random site can't drive the API with a
# victim's bearer token.
_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _origins_env:
    _ALLOWED = [o.strip() for o in _origins_env.split(",") if o.strip()]
elif os.environ.get("K_SERVICE") or os.environ.get("DATABASE_URL"):
    _ALLOWED = []          # production with nothing declared: same-origin only
else:
    _ALLOWED = ["*"]       # local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public, unauthenticated endpoints — the ones worth brute-forcing or spamming.
_login_limit = ratelimit.RateLimit(10, 900, "login")        # 10 / 15 min / IP
_signup_limit = ratelimit.RateLimit(5, 3600, "signup")      # 5 / hour / IP
_feedback_limit = ratelimit.RateLimit(5, 3600, "feedback")  # 5 / hour / IP

auth.init_db()
ws.init_db()
_M = {"intent": False, "slot": False}


def _source(local_env, repo_env, default_dir):
    local = os.environ.get(local_env, default_dir)
    if os.path.isdir(local):
        return local
    return os.environ.get(repo_env)


def load_models():
    import torch
    from transformers import (AutoTokenizer, AutoModelForSequenceClassification,
                              AutoModelForTokenClassification)
    _M["torch"] = torch
    isrc = _source("INTENT_DIR", "INTENT_REPO", "xlmr-intent")
    ssrc = _source("SLOT_DIR", "SLOT_REPO", "xlmr-slot")
    if isrc:
        try:
            _M["it_tok"] = AutoTokenizer.from_pretrained(isrc)
            _M["it"] = AutoModelForSequenceClassification.from_pretrained(isrc).eval()
            _M["intent"] = True
        except Exception as e:
            log.warning("Intent model load failed: %s", e)
    if ssrc:
        try:
            _M["sl_tok"] = AutoTokenizer.from_pretrained(ssrc)
            _M["sl"] = AutoModelForTokenClassification.from_pretrained(ssrc).eval()
            _M["slot"] = True
        except Exception as e:
            log.warning("Slot model load failed: %s", e)
    return _M["intent"]


try:
    load_models()
    log.info("Intent model: %s", "loaded" if _M["intent"] else "MISSING (mock parser)")
    log.info("Slot model: %s", "loaded" if _M["slot"] else "not loaded (intents only)")
except Exception as e:
    log.warning("Model load error, using mock: %s", e)


class Command(BaseModel):
    text: str = ""
    lang: str = "auto"      # kept for the UI; all languages now go direct


def _predict_intent(text):
    """Return (top intent, its probability, top-3 candidates, top-2 probability)."""
    torch = _M["torch"]
    enc = _M["it_tok"](text, return_tensors="pt", truncation=True, max_length=64)
    with torch.no_grad():
        logits = _M["it"](**enc).logits[0]
    probs = torch.softmax(logits, dim=-1)
    top = torch.topk(probs, min(3, probs.shape[-1]))
    id2 = _M["it"].config.id2label
    cands = [id2[i] for i in top.indices.tolist()]
    vals = top.values.tolist()
    runner_up = float(vals[1]) if len(vals) > 1 else 0.0
    return cands[0], float(vals[0]), cands, runner_up


# Tagging happens at whole-word granularity (labels sit on each word's first
# sub-token), so a span inherits any punctuation stuck to its edges — "7:30,"
# rather than "7:30". Trim it off, both ASCII and the Arabic-script forms.
_EDGE_PUNCT = " \t\n.,;:!?\"'()[]{}<>-–—…،؛؟«»"


def _trim_span(text, start, end):
    while start < end and text[start] in _EDGE_PUNCT:
        start += 1
    while end > start and text[end - 1] in _EDGE_PUNCT:
        end -= 1
    return start, end


def _predict_slots(text):
    """Extract slot spans as {slot_type: text}, plus every span separately.

    Decoding is driven by the tokenizer's own character offsets rather than
    text.split(). Those two disagree whenever punctuation attaches to a word —
    common in Arabic and Kurdish script — and indexing split() with the
    tokenizer's word ids silently pulled the wrong word. Spans are also cut on
    B- boundaries so two separate entities of the same type ("remind me Monday
    about the thing on Friday") stay separate instead of being concatenated.
    """
    if not _M["slot"]:
        return {}, []
    torch = _M["torch"]
    enc = _M["sl_tok"](text, return_tensors="pt", truncation=True, max_length=64,
                       return_offsets_mapping=True)
    offsets = enc.pop("offset_mapping")[0].tolist()
    with torch.no_grad():
        ids = _M["sl"](**enc).logits.argmax(-1)[0].tolist()
    id2slot = _M["sl"].config.id2label

    spans, cur, seen = [], None, set()
    word_ids = enc.word_ids()
    for pos, wid in enumerate(word_ids):
        # Score each word once, at its first sub-token (standard BIO convention).
        if wid is None or wid in seen:
            continue
        seen.add(wid)
        tag = id2slot[ids[pos]]
        start, end = offsets[pos]
        if tag == "O" or start == end:
            cur = None
            continue
        prefix, _, label = tag.partition("-")
        label = label or tag
        # Continue the current span only on I- of the same label; anything else
        # (a B-, or an I- that switches label) opens a new one.
        if prefix == "I" and cur is not None and cur["type"] == label:
            cur["end"] = end
        else:
            cur = {"type": label, "start": start, "end": end}
            spans.append(cur)
        # A multi-sub-token word ends where its last sub-token ends.
        last = pos
        while last + 1 < len(word_ids) and word_ids[last + 1] == wid:
            last += 1
        cur["end"] = max(cur["end"], offsets[last][1])

    out, flat = {}, []
    for s in spans:
        start, end = _trim_span(text, s["start"], s["end"])
        value = text[start:end]
        if not value:
            continue
        flat.append({"type": s["type"], "value": value, "start": start, "end": end})
        # The client's Slots contract is one string per type; keep the first
        # occurrence rather than gluing unrelated spans together. Callers that
        # need them all can read `slot_spans`.
        out.setdefault(s["type"], value)
    return out, flat


_MOCK = [("calendar_set", ["remind", "schedul", "meeting", "\u0630\u0643\u0631", "\u0628\u06cc\u0631"]),
         ("alarm_set", ["alarm", "\u0645\u0646\u0628\u0647", "\u0632\u06d5\u0646\u06af"]),
         ("lists_add", ["add", "list", "\u0642\u0627\u0626\u0645\u0629", "\u0644\u06cc\u0633\u062a"]),
         ("weather_query", ["weather", "\u0637\u0642\u0633", "\u06a9\u06d5\u0634"])]


def _parse_mock(text):
    low = text.lower()
    for intent, kws in _MOCK:
        if any(k in low for k in kws):
            return intent, {}, 0.55, [intent] + [i for i, _ in _MOCK if i != intent][:2]
    return "general_quirky", {}, 0.40, ["general_quirky", "calendar_set", "lists_add"]


# Out-of-domain guard. v2 dropped 26 intents (all iot_*, play_*, music_*,
# social_*, audio_volume_*), but a 34-way softmax still has to put its mass
# somewhere — so "play some music" comes back as a confident *wrong* intent,
# and the client acts on it. Two cheap signals catch most of that:
#
#   * top-1 probability below MIN_CONF — the model is unsure.
#   * top-1 minus top-2 below MIN_MARGIN — the model is spreading its mass over
#     several labels, which is what out-of-domain input actually looks like. A
#     confident in-domain prediction has a large margin even when top-1 is
#     moderate, so this catches cases the raw threshold misses.
#
# Either one trips → intent is reported as None with low_confidence set. The
# candidates are still returned so the UI's tap-to-correct row keeps working
# (and so a correction can be collected as training data).
_MIN_CONF = float(os.environ.get("INTENT_MIN_CONFIDENCE", "0.35"))
_MIN_MARGIN = float(os.environ.get("INTENT_MIN_MARGIN", "0.10"))

# Intents the app answers in exactly the same way.
#
# The margin check assumes a thin top-1/top-2 gap means the model is unsure what
# the user wants. That is wrong when both candidates lead to the same place:
# "what is Mosul" splits between qa_definition and qa_factoid, and the app looks
# both up on Wikipedia, so asking the user to choose offers them two identical
# outcomes. Measured live, that one query came back suppressed at 0.382.
#
# This mirrors the client's dispatch rather than deriving from it — the two must
# be kept in step, which is why the group is deliberately tiny and only holds
# intents that are genuinely indistinguishable in the UI.
_SAME_ACTION = {
    "qa_factoid": "wiki",
    "qa_definition": "wiki",
}


def _interchangeable(a, b):
    """True when the top two candidates would produce identical behaviour."""
    ga, gb = _SAME_ACTION.get(a), _SAME_ACTION.get(b)
    return ga is not None and ga == gb


@app.post("/parse")
def parse(cmd: Command):
    text = (cmd.text or "").strip()
    if not text:
        return {"intent": None, "slots": {}, "slot_spans": [], "confidence": 0.0,
                "candidates": [], "low_confidence": True, "translated": None,
                "mock": not _M["intent"]}
    if _M["intent"]:
        intent, conf, cands, runner_up = _predict_intent(text)  # any language, direct
        slots, spans = _predict_slots(text)
        # A thin margin only means "unsure" when the candidates differ in what
        # they'd do. When they don't, acting on the top one is right.
        thin = (conf - runner_up) < _MIN_MARGIN and not _interchangeable(
            cands[0] if cands else "", cands[1] if len(cands) > 1 else ""
        )
        low = conf < _MIN_CONF or thin
        return {"intent": None if low else intent, "slots": {} if low else slots,
                "slot_spans": [] if low else spans, "confidence": conf,
                "candidates": cands, "low_confidence": low,
                "translated": None, "mock": False}
    intent, slots, conf, cands = _parse_mock(text)
    return {"intent": intent, "slots": slots, "slot_spans": [], "confidence": conf,
            "candidates": cands, "low_confidence": False,
            "translated": None, "mock": True}


from feeds import router as feeds_router  # noqa: E402
app.include_router(feeds_router)


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------- authentication ----------------
class SignupBody(BaseModel):
    username: str = ""
    email: str = ""
    password: str = ""


class LoginBody(BaseModel):
    login: str = ""        # username OR email
    password: str = ""


class ConsentBody(BaseModel):
    consent: bool = False


class UsernameBody(BaseModel):
    username: str = ""


class PasswordBody(BaseModel):
    current_password: str = ""
    new_password: str = ""


class CollectBody(BaseModel):
    text: str = ""
    lang: str = "auto"
    intent: str | None = None
    confidence: float | None = None
    corrected_intent: str | None = None


class CorrectionBody(BaseModel):
    corrected_intent: str = ""


class StateBody(BaseModel):
    state: dict = {}
    updated_at: str = ""


class FeedbackBody(BaseModel):
    message: str = ""
    rating: int | None = None


def optional_user(authorization: str = Header(default="")):
    """Like auth.current_user but returns None instead of 401 when there's no
    valid token — feedback is accepted from anyone."""
    if authorization.lower().startswith("bearer "):
        uid = auth._decode_token(authorization.split(" ", 1)[1].strip())
        if uid:
            return auth.get_user_by_id(uid)
    return None


@app.post("/auth/signup")
def signup(body: SignupBody, _=Depends(_signup_limit)):
    try:
        user = auth.create_user(body.username, body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"token": auth.create_token(user["id"]), "user": user}


@app.post("/auth/login")
def login(body: LoginBody, _=Depends(_login_limit)):
    # Also cap attempts per account, not just per IP: the IP limit alone lets a
    # distributed attacker keep guessing one password against many accounts,
    # and lets one attacker spread guesses across addresses.
    ratelimit.check(f"login:user:{(body.login or '').strip().lower()}", 10, 900)
    user = auth.authenticate(body.login, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Incorrect username/email or password.")
    return {"token": auth.create_token(user["id"]), "user": user}


@app.get("/auth/me")
def me(user=Depends(auth.current_user)):
    return {"user": user}


@app.patch("/auth/consent")
def consent(body: ConsentBody, user=Depends(auth.current_user)):
    return {"user": auth.set_consent(user["id"], body.consent)}


@app.patch("/auth/username")
def change_username(body: UsernameBody, user=Depends(auth.current_user)):
    try:
        return {"user": auth.change_username(user["id"], body.username)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/auth/password")
def change_password(body: PasswordBody, user=Depends(auth.current_user)):
    try:
        auth.change_password(user["id"], body.current_password, body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True}


@app.post("/collect")
def collect(body: CollectBody, user=Depends(auth.current_user)):
    text = (body.text or "").strip()
    if not text:
        return {"ok": False, "stored": False, "id": None}
    row_id = auth.log_command(
        user["id"], text, lang=body.lang, predicted_intent=body.intent,
        confidence=body.confidence, corrected_intent=body.corrected_intent,
    )
    # The id lets the client attach a correction to this exact row later, so a
    # corrected utterance stays one row instead of two.
    return {"ok": True, "stored": row_id is not None, "id": row_id}


@app.patch("/collect/{command_id}")
def correct_command(command_id: int, body: CorrectionBody,
                    user=Depends(auth.current_user)):
    """Record the user's tap-to-correct on a command they already sent.

    These are the only ground-truth labels the app produces — the model's own
    prediction is not a label — so they matter more than the raw rows.
    """
    intent = (body.corrected_intent or "").strip()
    if not intent:
        raise HTTPException(status_code=400, detail="corrected_intent is required.")
    return {"ok": auth.set_correction(user["id"], command_id, intent)}


# ---------------- cross-device state sync ----------------
# The user's tasks/reminders/shopping live as one JSON blob per account so they
# follow the user to any device. Last-write-wins by the client's `updated_at`.
@app.get("/state")
def get_state(user=Depends(auth.current_user)):
    data, updated_at = auth.get_state(user["id"])
    state = json.loads(data) if data else None
    return {"state": state, "updated_at": updated_at}


@app.put("/state")
def put_state(body: StateBody, user=Depends(auth.current_user)):
    payload = json.dumps(body.state, ensure_ascii=False)
    if len(payload.encode("utf-8")) > 1_000_000:  # ~1 MB safety cap
        raise HTTPException(status_code=413, detail="State too large to sync.")
    # `applied` is False when the server already holds a newer version — the
    # client's write was stale (a retry, or another device got there first) and
    # was ignored rather than allowed to overwrite newer data.
    applied = auth.set_state(user["id"], payload, body.updated_at or "0")
    return {"ok": True, "applied": applied}


# ---------------- sharing ----------------
# A share hands over a *copy*. The recipient's own client merges the payload into
# its own state blob; nothing ever writes into another user's data. That keeps
# one writer per blob, which is what the last-write-wins sync in /state relies on
# — a second writer would silently lose one side's edits.
_share_limit = ratelimit.RateLimit(20, 3600, "share")   # 20 bundles / hour / IP
_MAX_SHARE_ITEMS = 100


class ShareBody(BaseModel):
    kind: str = "tasks"          # tasks | reminders | shopping
    items: list = []


@app.post("/share")
def create_share(body: ShareBody, user=Depends(auth.current_user),
                 _=Depends(_share_limit)):
    items = body.items or []
    if not items:
        raise HTTPException(status_code=400, detail="Nothing to share.")
    if len(items) > _MAX_SHARE_ITEMS:
        raise HTTPException(status_code=413, detail="Too many items to share at once.")
    if body.kind not in ("tasks", "reminders", "shopping"):
        raise HTTPException(status_code=400, detail="Unknown share kind.")
    payload = json.dumps(items, ensure_ascii=False)
    if len(payload.encode("utf-8")) > 200_000:
        raise HTTPException(status_code=413, detail="Shared list is too large.")
    try:
        code = auth.create_share(user["id"], user["username"], body.kind, payload)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"code": code, "expires_days": auth.SHARE_TTL_DAYS}


@app.get("/share/{code}")
def read_share(code: str, user=Depends(auth.current_user)):
    """Preview a shared bundle. Requires a signed-in account — the app needs one
    anyway, and it stops an unauthenticated caller probing codes."""
    ratelimit.check(f"share:read:{user['id']}", 60, 3600)   # blunt anti-guessing cap
    share = auth.get_share(code)
    if share is None:
        raise HTTPException(status_code=404, detail="That code is not valid or has expired.")
    return {
        "code": share["code"],
        "from": share["from"],
        "kind": share["kind"],
        "items": json.loads(share["payload"]),
    }


# ---------------- tester feedback ----------------
@app.post("/feedback")
def submit_feedback(body: FeedbackBody, user=Depends(optional_user),
                    _=Depends(_feedback_limit)):
    msg = (body.message or "").strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Feedback message is empty.")
    rating = body.rating if isinstance(body.rating, int) and 1 <= body.rating <= 5 else None
    ok = auth.add_feedback(
        msg,
        user_id=user["id"] if user else None,
        username=user["username"] if user else None,
        rating=rating,
    )
    return {"ok": ok}


@app.get("/feedback")
def read_feedback(x_admin_key: str = Header(default="")):
    """Admin-only JSON dump, gated by the FEEDBACK_KEY env var. If it isn't set,
    the endpoint stays closed (view feedback directly in the database instead).

    The key goes in the X-Admin-Key header, not the query string: query strings
    are written to Cloud Run's request logs, browser history and any proxy in
    between, so a key passed that way leaks by simply being used. Compared with
    compare_digest so a wrong key can't be recovered from response timing.
    """
    admin = os.environ.get("FEEDBACK_KEY")
    # Compare as bytes: compare_digest raises TypeError on non-ASCII str, which
    # would turn a crafted header into a 500.
    if not admin or not secrets.compare_digest(x_admin_key.encode("utf-8"),
                                               admin.encode("utf-8")):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"feedback": auth.list_feedback()}


from workspace_routes import router as workspace_router  # noqa: E402
app.include_router(workspace_router)


# ---------------- static web build (mobile app exported via `expo export -p web`) ----------------
# Mounted last so it never shadows the API routes above; falls back to index.html
# for any other path so the app's client-side navigation keeps working.
_STATIC_DIR = os.environ.get("STATIC_DIR", os.path.join(HERE, "static"))
if os.path.isdir(_STATIC_DIR):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")
else:
    @app.get("/")
    def root():
        return {"status": "ok", "note": "no static web build found, API only"}
