"""Tests for the bits of the backend that are easy to get silently wrong.

Run from backend/:  python test_app.py        (or: pytest test_app.py)

The slot tests drive main._predict_slots with the *real* XLM-R tokenizer and a
stub model, so they exercise the actual sub-word/offset alignment rather than a
simplified stand-in. That alignment is where the original bug lived.
"""
import os
import sys

os.environ.setdefault("AUTH_DB", os.path.join(os.environ.get("TEMP", "/tmp"), "ferman_test.db"))
if os.path.exists(os.environ["AUTH_DB"]):
    os.remove(os.environ["AUTH_DB"])

import torch
from transformers import AutoTokenizer
from fastapi.testclient import TestClient

import main

LABELS = ["O", "B-date", "I-date", "B-time", "I-time", "B-title", "I-title"]
_L2I = {lab: i for i, lab in enumerate(LABELS)}


class _StubSlotModel:
    """Returns whatever tag sequence the test asked for, as one-hot logits."""

    class config:
        id2label = dict(enumerate(LABELS))

    def __init__(self, tag_fn):
        self.tag_fn = tag_fn

    def __call__(self, **enc):
        ids = self.tag_fn(enc)
        logits = torch.zeros(1, len(ids), len(LABELS))
        for pos, tid in enumerate(ids):
            logits[0, pos, tid] = 10.0
        return type("Out", (), {"logits": logits})()


def _tag_from_entities(tok, text, entities):
    """Build a per-token tag sequence marking `entities` [(start, end, label)],
    using B- on an entity's first token and I- on the rest."""
    def tag_fn(enc):
        offsets = _offsets(tok, text)
        ids = []
        for start, end in offsets:
            if start == end:
                ids.append(_L2I["O"])
                continue
            hit = next(((s, e, lab) for s, e, lab in entities if start >= s and end <= e), None)
            if hit is None:
                ids.append(_L2I["O"])
            else:
                s, _, lab = hit
                ids.append(_L2I[("B-" if start == s else "I-") + lab])
        return ids
    return tag_fn


def _offsets(tok, text):
    enc = tok(text, return_tensors="pt", truncation=True, max_length=64,
              return_offsets_mapping=True)
    return enc["offset_mapping"][0].tolist()


def _run(tok, text, entities):
    main._M["slot"] = True
    main._M["torch"] = torch
    main._M["sl_tok"] = tok
    main._M["sl"] = _StubSlotModel(_tag_from_entities(tok, text, entities))
    return main._predict_slots(text)


def test_slots(tok):
    # 1. Two separate spans of the same type must stay separate. The old
    #    decoder dropped the B-/I- prefix and joined them into "Monday Friday".
    text = "remind me Monday about the report on Friday"
    ents = [(text.index("Monday"), text.index("Monday") + 6, "date"),
            (text.index("Friday"), text.index("Friday") + 6, "date")]
    slots, spans = _run(tok, text, ents)
    assert slots["date"] == "Monday", slots
    assert [s["value"] for s in spans] == ["Monday", "Friday"], spans
    print("  ok  two same-type spans stay separate ->", [s["value"] for s in spans])

    # 2. Punctuation-attached tokens. text.split() and the tokenizer disagree
    #    here, which is what silently pulled the wrong word before.
    text = "set an alarm for 7:30, please"
    ents = [(text.index("7:30"), text.index("7:30") + 4, "time")]
    slots, _ = _run(tok, text, ents)
    assert slots["time"] == "7:30", slots
    print("  ok  punctuation-adjacent span ->", repr(slots["time"]))

    # 3. Arabic, where sub-word splits are dense and punctuation attaches.
    text = "ذكرني غدا الساعة الثامنة، من فضلك"
    start = text.index("الساعة الثامنة")
    ents = [(start, start + len("الساعة الثامنة"), "time")]
    slots, _ = _run(tok, text, ents)
    assert slots["time"] == "الساعة الثامنة", repr(slots["time"])
    print("  ok  arabic multi-word span ->", repr(slots["time"]))

    # 4. Kurdish (Sorani).
    text = "بیرم بخەوە سبەینێ کاتژمێر ٩"
    start = text.index("سبەینێ")
    ents = [(start, start + len("سبەینێ"), "date")]
    slots, _ = _run(tok, text, ents)
    assert slots["date"] == "سبەینێ", repr(slots["date"])
    print("  ok  kurdish span ->", repr(slots["date"]))

    # 5. Adjacent spans of different types must not bleed into each other.
    text = "meeting Monday 9am"
    ents = [(8, 14, "date"), (15, 18, "time")]
    slots, _ = _run(tok, text, ents)
    assert slots == {"date": "Monday", "time": "9am"}, slots
    print("  ok  adjacent different types ->", slots)

    # 6. No entities at all.
    slots, spans = _run(tok, "hello there", [])
    assert slots == {} and spans == []
    print("  ok  empty prediction")


def test_confidence_floor():
    """Low top-1, or a thin top-1/top-2 margin, must suppress the intent."""
    main._M["intent"] = True
    main._M["slot"] = False

    def stub(conf, runner):
        return lambda text: ("calendar_set", conf, ["calendar_set", "alarm_set", "lists_query"], runner)

    orig = main._predict_intent
    try:
        main._predict_intent = stub(0.92, 0.03)
        r = main.parse(main.Command(text="remind me tomorrow"))
        assert r["intent"] == "calendar_set" and not r["low_confidence"], r
        print("  ok  confident prediction passes through")

        main._predict_intent = stub(0.20, 0.15)          # below MIN_CONF
        r = main.parse(main.Command(text="play some music"))
        assert r["intent"] is None and r["low_confidence"], r
        assert r["candidates"], "candidates must survive for tap-to-correct"
        print("  ok  low top-1 suppressed, candidates kept")

        main._predict_intent = stub(0.44, 0.40)          # thin margin
        r = main.parse(main.Command(text="turn on the lights"))
        assert r["intent"] is None and r["low_confidence"], r
        print("  ok  thin top1/top2 margin suppressed")

        # A thin margin between two intents the app answers identically is not
        # uncertainty about what the user wants — "what is Mosul" split between
        # qa_definition and qa_factoid and was suppressed at 0.382 live, asking
        # the user to choose between two Wikipedia lookups.
        main._predict_intent = lambda text: (
            "qa_definition", 0.382, ["qa_definition", "qa_factoid", "cooking_query"], 0.35
        )
        r = main.parse(main.Command(text="what is Mosul"))
        assert r["intent"] == "qa_definition" and not r["low_confidence"], r
        print("  ok  interchangeable candidates skip the margin check")

        main._predict_intent = lambda text: (
            "calendar_set", 0.382, ["calendar_set", "lists_query", "qa_factoid"], 0.35
        )
        r = main.parse(main.Command(text="something ambiguous"))
        assert r["intent"] is None and r["low_confidence"], r
        print("  ok  ...but different actions still ask")
    finally:
        main._predict_intent = orig
        main._M["intent"] = False


def test_state_and_limits():
    c = TestClient(main.app)
    r = c.post("/auth/signup", json={"username": "t_state", "password": "secret1"})
    assert r.status_code == 200, r.text
    H = {"Authorization": f"Bearer {r.json()['token']}"}

    assert c.put("/state", json={"state": {"v": "new"}, "updated_at": "100"},
                 headers=H).json()["applied"] is True
    assert c.put("/state", json={"state": {"v": "old"}, "updated_at": "50"},
                 headers=H).json()["applied"] is False
    assert c.get("/state", headers=H).json()["state"] == {"v": "new"}
    # "9" < "100" numerically but > lexically — the guard must compare numbers.
    assert c.put("/state", json={"state": {"v": "x"}, "updated_at": "9"},
                 headers=H).json()["applied"] is False
    print("  ok  stale state writes rejected, newer accepted")

    codes = [c.post("/auth/login", json={"login": "t_state", "password": "no"}).status_code
             for _ in range(13)]
    assert codes[:10] == [401] * 10 and codes[10:] == [429] * 3, codes
    print("  ok  login rate limit trips after 10 attempts")


def test_collection_loop():
    """Consent gating, and that a correction updates the row rather than adding
    a second copy of the same utterance."""
    import auth as authmod
    c = TestClient(main.app)
    r = c.post("/auth/signup", json={"username": "t_collect", "password": "secret1"})
    H = {"Authorization": f"Bearer {r.json()['token']}"}

    # No consent yet -> nothing stored, and no id to correct against.
    body = {"text": "play some music", "lang": "auto", "intent": None, "confidence": 0.2}
    r = c.post("/collect", json=body).status_code
    assert r == 401, r  # unauthenticated is rejected outright
    out = c.post("/collect", json=body, headers=H).json()
    assert out["stored"] is False and out["id"] is None, out
    print("  ok  nothing collected without consent")

    c.patch("/auth/consent", json={"consent": True}, headers=H)
    out = c.post("/collect", json=body, headers=H).json()
    assert out["stored"] is True and isinstance(out["id"], int), out
    cid = out["id"]
    print("  ok  consent on -> row stored, id returned")

    assert c.patch(f"/collect/{cid}", json={"corrected_intent": "play_music"},
                   headers=H).json()["ok"] is True
    rows = _commands(authmod)
    assert len(rows) == 1, f"correction must update, not insert: {rows}"
    assert rows[0]["corrected_intent"] == "play_music", rows
    assert rows[0]["predicted_intent"] is None, rows
    print("  ok  correction updates the same row (1 row, labelled)")

    # A second account must not be able to relabel the first account's data.
    r2 = c.post("/auth/signup", json={"username": "t_other", "password": "secret1"})
    H2 = {"Authorization": f"Bearer {r2.json()['token']}"}
    assert c.patch(f"/collect/{cid}", json={"corrected_intent": "hacked"},
                   headers=H2).json()["ok"] is False
    assert _commands(authmod)[0]["corrected_intent"] == "play_music"
    print("  ok  another user cannot relabel someone else's row")

    assert c.patch(f"/collect/{cid}", json={"corrected_intent": ""},
                   headers=H).status_code == 400
    print("  ok  empty correction rejected")

    # "None of these" -> the out-of-scope sentinel.
    out = c.post("/collect", json={"text": "turn on the lights", "lang": "auto",
                                   "intent": None, "confidence": 0.3},
                 headers=H).json()
    assert c.patch(f"/collect/{out['id']}", json={"corrected_intent": "__none__"},
                   headers=H).json()["ok"] is True
    print("  ok  out-of-scope sentinel stored")


def test_export_separates_oos():
    """__none__ must never reach gold_intent, or a retrain would learn it as a
    class named '__none__'."""
    import csv as _csv
    # export_dataset lives in ml/ — training tooling, deliberately outside the
    # container's file set — so it isn't importable from the repo root by default.
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ml"))
    import export_dataset
    rows = [
        {"text": "remind me monday", "lang": "en", "predicted_intent": "calendar_set",
         "confidence": 0.9, "corrected_intent": None, "created_at": "t1"},
        {"text": "play some music", "lang": "en", "predicted_intent": "lists_createoradd",
         "confidence": 0.4, "corrected_intent": "__none__", "created_at": "t2"},
        {"text": "wake me at 7", "lang": "en", "predicted_intent": "calendar_set",
         "confidence": 0.5, "corrected_intent": "alarm_set", "created_at": "t3"},
    ]
    out = os.path.join(os.environ.get("TEMP", "/tmp"), "ferman_export_test.csv")
    export_dataset.export(rows, out)
    with open(out, encoding="utf-8") as f:
        got = list(_csv.DictReader(f))

    assert got[0]["gold_intent"] == "calendar_set" and got[0]["out_of_scope"] == "false"
    assert got[1]["gold_intent"] == "" and got[1]["out_of_scope"] == "true", got[1]
    assert got[2]["gold_intent"] == "alarm_set" and got[2]["out_of_scope"] == "false"
    assert all(r["gold_intent"] != "__none__" for r in got)
    print("  ok  __none__ excluded from gold_intent, flagged out_of_scope")


def _commands(authmod):
    with authmod._db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT predicted_intent, corrected_intent FROM commands ORDER BY id"
        ).fetchall()]


def test_holidays_curation():
    """The Aladhan feed carries ~78 entries a year, mostly one tradition's Sufi
    commemorations, and repeats each holiday. Guard the filtering."""
    import datetime as dt
    c = TestClient(main.app)
    d = c.get("/holidays").json()
    assert d["ok"] and d["items"], d
    items = d["items"]
    today = dt.date.today().isoformat()

    assert all(i["date"] >= today for i in items), "past holidays leaked in"
    assert [i["date"] for i in items] == sorted(i["date"] for i in items), "not sorted"
    pairs = [(i["date"], i["name"]) for i in items]
    assert len(pairs) == len(set(pairs)), f"duplicates: {pairs}"
    assert not any("urs" in i["name"].lower() for i in items), "sect-specific entries leaked"
    assert sum(1 for i in items if i["key"] == "qadr") <= 1, "Laylat al-Qadr listed more than once"
    print(f"  ok  {len(items)} holidays, deduped/curated/future-only")
    for i in items[:3]:
        print(f"        {i['date']}  {i['name']}")


def test_news_language():
    """Kurdish, Arabic and English must be genuinely different feeds — the
    English one previously fell back to the US edition, duplicating Trending."""
    c = TestClient(main.app)
    feeds = {}
    for lang in ("ku", "ar", "en"):
        d = c.get(f"/news?lang={lang}").json()
        assert d["ok"] and d["items"], (lang, d)
        feeds[lang] = {i["title"] for i in d["items"]}
    trending = {i["title"] for i in c.get("/trending").json()["items"]}
    assert not (feeds["ku"] & feeds["ar"]), "ku and ar returned the same feed"
    overlap = len(feeds["en"] & trending)
    assert overlap < len(feeds["en"]) / 2, f"en news is just trending ({overlap} shared)"
    print(f"  ok  ku/ar/en feeds distinct; en vs trending overlap {overlap}/{len(feeds['en'])}")


def test_sharing():
    """A share is a copy handed over — it must never touch the recipient's state
    blob, since last-write-wins sync assumes one writer per blob."""
    c = TestClient(main.app)
    a = c.post("/auth/signup", json={"username": "t_azad", "password": "secret1"}).json()
    b = c.post("/auth/signup", json={"username": "t_lana", "password": "secret1"}).json()
    HA = {"Authorization": f"Bearer {a['token']}"}
    HB = {"Authorization": f"Bearer {b['token']}"}

    # Lana has her own state first; sharing must leave it untouched.
    c.put("/state", json={"state": {"events": [{"title": "hers"}]}, "updated_at": "500"}, headers=HB)

    items = [{"title": "Unlock the shop", "time": "7:00", "date": "2026-08-01"},
             {"title": "Count the register", "time": "", "date": None}]
    r = c.post("/share", json={"kind": "tasks", "items": items}, headers=HA).json()
    code = r["code"]
    assert len(code) == 6 and code.isupper(), r
    assert not set(code) & set("01OIL"), f"ambiguous characters in code: {code}"
    print(f"  ok  share created: {code} (expires in {r['expires_days']}d)")

    got = c.get(f"/share/{code}", headers=HB).json()
    assert got["from"] == "t_azad" and len(got["items"]) == 2, got
    assert got["items"][0]["title"] == "Unlock the shop"
    print("  ok  recipient can read it, sender attributed")

    # The crucial property: nothing was written into Lana's state.
    assert c.get("/state", headers=HB).json()["state"] == {"events": [{"title": "hers"}]}
    print("  ok  recipient's own state untouched by the share")

    # Lower-case entry should still resolve; unknown codes must 404.
    assert c.get(f"/share/{code.lower()}", headers=HB).status_code == 200
    assert c.get("/share/ZZZZZZ", headers=HB).status_code == 404
    assert c.post("/share", json={"kind": "tasks", "items": []}, headers=HA).status_code == 400
    assert c.post("/share", json={"kind": "nope", "items": items}, headers=HA).status_code == 400
    assert c.get(f"/share/{code}").status_code == 401  # unauthenticated cannot probe
    print("  ok  case-insensitive, bad code 404s, empty/unknown kind 400s, anon 401s")


def test_workspaces_and_diwan():
    """Membership gates every workspace endpoint, invite codes reuse the same
    mechanism as list sharing, and serial numbers run per (workspace,
    direction) the way a real Diwan keeps separate Wared/Sader books."""
    # Users are created via auth.create_user directly, not /auth/signup — the
    # signup rate limit (5/hour) is a single process-wide bucket shared by every
    # test in this file, and the earlier tests already spend that budget. Going
    # through auth.py's own functions tests membership/Diwan logic without
    # depending on how many signups the rest of the suite happens to use.
    import auth as authmod
    c = TestClient(main.app)
    owner_u = authmod.create_user("t_owner", None, "secret1")
    other_u = authmod.create_user("t_other2", None, "secret1")
    HO = {"Authorization": f"Bearer {authmod.create_token(owner_u['id'])}"}
    HX = {"Authorization": f"Bearer {authmod.create_token(other_u['id'])}"}

    w = c.post("/workspaces", json={"name": "Al-Rasheed Trading"}, headers=HO).json()["workspace"]
    assert w["role"] == "owner", w
    assert c.post("/workspaces", json={"name": "x"}, headers=HO).status_code == 400  # too short
    print("  ok  workspace created, owner role set, short name rejected")

    # A non-member can't see or touch it.
    assert c.get(f"/workspaces/{w['id']}/diwan", headers=HX).status_code == 403
    assert c.post(f"/workspaces/{w['id']}/diwan",
                  json={"direction": "incoming", "entity_name": "x"}, headers=HX).status_code == 403
    print("  ok  non-member gets 403 on both read and write")

    # Invite reuses the share mechanism: a 6-char code, same alphabet.
    code = c.post("/workspaces/invite", json={"workspace_id": w["id"]}, headers=HO).json()["code"]
    assert len(code) == 6 and not set(code) & set("01OIL"), code
    joined = c.post("/workspaces/join", json={"code": code}, headers=HX).json()["workspace"]
    assert joined["role"] == "member", joined
    # Idempotent: joining again doesn't error or duplicate membership.
    assert c.post("/workspaces/join", json={"code": code}, headers=HX).status_code == 200
    assert len(c.get("/workspaces", headers=HX).json()["workspaces"]) == 1
    print("  ok  invite code joins the workspace, re-joining is a no-op")

    # A random code must not leak into "workspace" kind, and a list-share code
    # must not double as a workspace invite.
    assert c.post("/workspaces/join", json={"code": "ZZZZZZ"}, headers=HX).status_code == 404
    list_code = c.post("/share", json={"kind": "tasks", "items": [{"title": "x"}]},
                       headers=HO).json()["code"]
    assert c.post("/workspaces/join", json={"code": list_code}, headers=HX).status_code == 404
    print("  ok  bad code and cross-kind code both rejected")

    # Now the member can write. Serial numbers run 1, 2, ... per direction.
    e1 = c.post(f"/workspaces/{w['id']}/diwan",
               json={"direction": "incoming", "entity_name": "Ministry of Trade",
                     "subject": "Import permit", "department": "Logistics"},
               headers=HX).json()["entry"]
    e2 = c.post(f"/workspaces/{w['id']}/diwan",
               json={"direction": "incoming", "entity_name": "Karim Hardware"},
               headers=HX).json()["entry"]
    o1 = c.post(f"/workspaces/{w['id']}/diwan",
               json={"direction": "outgoing", "entity_name": "Karim Hardware"},
               headers=HX).json()["entry"]
    assert e1["serial_number"] == 1 and e2["serial_number"] == 2, (e1, e2)
    assert o1["serial_number"] == 1, o1  # separate sequence for outgoing
    print("  ok  serial numbers run per (workspace, direction)")

    # A malformed direction is rejected before it reaches the serial counter.
    assert c.post(f"/workspaces/{w['id']}/diwan",
                  json={"direction": "sideways", "entity_name": "x"},
                  headers=HX).status_code == 400
    print("  ok  invalid direction rejected")

    # Before any reply exists, e1 is unreplied like everything else.
    assert c.get(f"/workspaces/{w['id']}/diwan/{e1['id']}", headers=HO).json()["entry"]["replied"] is False

    # Reply linking, scoped to the same workspace. Creating the reply must
    # mark the parent replied on its own -- that's the whole point of the
    # link, not a second manual step someone has to remember.
    reply = c.post(f"/workspaces/{w['id']}/diwan",
                   json={"direction": "outgoing", "entity_name": "Ministry of Trade",
                         "subject": "Re: import permit", "reply_to_id": e1["id"]},
                   headers=HO).json()["entry"]
    assert reply["reply_to_id"] == e1["id"], reply
    parent_after = c.get(f"/workspaces/{w['id']}/diwan/{e1['id']}", headers=HO).json()["entry"]
    assert parent_after["replied"] is True, parent_after
    print("  ok  creating a reply automatically marks the original replied")

    assert c.post(f"/workspaces/{w['id']}/diwan",
                  json={"direction": "outgoing", "entity_name": "x", "reply_to_id": 99999},
                  headers=HO).status_code == 400
    print("  ok  reply_to_id links entries, unknown id rejected")

    # Manual mark-replied still works too, for a reply logged outside the
    # link (e.g. a phone call) -- tested on e2, which nothing has touched yet.
    r = c.patch(f"/workspaces/{w['id']}/diwan/{e2['id']}", json={"replied": True}, headers=HO)
    assert r.json()["entry"]["replied"] is True, r.json()
    assert c.patch(f"/workspaces/{w['id']}/diwan/99999", json={"replied": True},
                  headers=HO).status_code == 404

    incoming = c.get(f"/workspaces/{w['id']}/diwan?direction=incoming", headers=HO).json()["entries"]
    assert {e["id"] for e in incoming} == {e1["id"], e2["id"]}, incoming
    logistics = c.get(f"/workspaces/{w['id']}/diwan?department=Logistics", headers=HO).json()["entries"]
    assert [e["id"] for e in logistics] == [e1["id"]], logistics
    print("  ok  manual mark-replied, direction filter, department filter all correct")

    # Editing: only the fields sent change; everything else is left alone.
    edited = c.patch(f"/workspaces/{w['id']}/diwan/{e2['id']}",
                     json={"subject": "Corrected subject"}, headers=HO).json()["entry"]
    assert edited["subject"] == "Corrected subject" and edited["entity_name"] == "Karim Hardware", edited
    assert c.patch(f"/workspaces/{w['id']}/diwan/{e2['id']}",
                   json={"entity_name": ""}, headers=HO).status_code == 400
    assert c.patch(f"/workspaces/{w['id']}/diwan/99999",
                   json={"subject": "x"}, headers=HO).status_code == 404
    print("  ok  partial edit changes only the given field, empty entity_name rejected, unknown id 404s")

    # Attachments are a URL reference, settable at create time and editable
    # afterward like any other field.
    attached = c.post(f"/workspaces/{w['id']}/diwan",
                      json={"direction": "incoming", "entity_name": "Al-Furat Supplies",
                            "attachment_url": "https://files.example.com/permit.pdf"},
                      headers=HO).json()["entry"]
    assert attached["attachment_url"] == "https://files.example.com/permit.pdf", attached
    relinked = c.patch(f"/workspaces/{w['id']}/diwan/{e2['id']}",
                       json={"attachment_url": "https://files.example.com/scan2.pdf"},
                       headers=HO).json()["entry"]
    assert relinked["attachment_url"] == "https://files.example.com/scan2.pdf", relinked
    print("  ok  attachment_url settable at create and editable afterward")

    # Search: case-insensitive substring match against entity_name.
    found = c.get(f"/workspaces/{w['id']}/diwan?q=furat", headers=HO).json()["entries"]
    assert [e["id"] for e in found] == [attached["id"]], found
    none = c.get(f"/workspaces/{w['id']}/diwan?q=nonexistent", headers=HO).json()["entries"]
    assert none == [], none
    print("  ok  search matches entity_name case-insensitively")

    # CSV export: membership-gated, correct content type, every entry present
    # regardless of any list filter, ignoring whatever filter this request
    # itself doesn't pass (export always returns the whole register). HX
    # joined the workspace earlier in this test, so a fresh outsider is
    # needed here rather than reusing it.
    outsider_u = authmod.create_user("t_outsider3", None, "secret1")
    HX2 = {"Authorization": f"Bearer {authmod.create_token(outsider_u['id'])}"}
    assert c.get(f"/workspaces/{w['id']}/diwan/export", headers=HX2).status_code == 403
    exported = c.get(f"/workspaces/{w['id']}/diwan/export", headers=HO)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert "attachment" in exported.headers["content-disposition"]
    import csv as _csv, io as _io
    rows = list(_csv.DictReader(_io.StringIO(exported.text)))
    assert len(rows) == len(c.get(f"/workspaces/{w['id']}/diwan", headers=HO).json()["entries"])
    assert any(r["entity_name"] == "Al-Furat Supplies" for r in rows), rows
    print("  ok  CSV export membership-gated, correct headers, includes every entry")


def test_debt_ledger():
    """Membership gating, currency/direction validation, amount must be a
    positive number, and settling stamps settled_at (unsettling clears it)."""
    import auth as authmod
    c = TestClient(main.app)
    owner_u = authmod.create_user("t_debt_owner", None, "secret1")
    member_u = authmod.create_user("t_debt_member", None, "secret1")
    outsider_u = authmod.create_user("t_debt_outsider", None, "secret1")
    HO = {"Authorization": f"Bearer {authmod.create_token(owner_u['id'])}"}
    HM = {"Authorization": f"Bearer {authmod.create_token(member_u['id'])}"}
    HX = {"Authorization": f"Bearer {authmod.create_token(outsider_u['id'])}"}

    w = c.post("/workspaces", json={"name": "Karim Hardware"}, headers=HO).json()["workspace"]
    code = c.post("/workspaces/invite", json={"workspace_id": w["id"]}, headers=HO).json()["code"]
    c.post("/workspaces/join", json={"code": code}, headers=HM)

    assert c.get(f"/workspaces/{w['id']}/debt", headers=HX).status_code == 403
    assert c.post(f"/workspaces/{w['id']}/debt",
                  json={"party_name": "x", "direction": "they_owe_us", "amount": 10, "currency": "USD"},
                  headers=HX).status_code == 403
    print("  ok  non-member gets 403 on both read and write")

    e1 = c.post(f"/workspaces/{w['id']}/debt",
               json={"party_name": "Ministry of Trade", "direction": "they_owe_us",
                     "amount": 450, "currency": "USD", "party_phone": "+9647701234567",
                     "due_date": "2026-09-15"},
               headers=HO).json()["entry"]
    assert e1["due_date"] == "2026-09-15", e1
    e2 = c.post(f"/workspaces/{w['id']}/debt",
               json={"party_name": "Al-Noor Legal", "direction": "we_owe_them",
                     "amount": 1250000, "currency": "IQD"},
               headers=HM).json()["entry"]
    assert e1["currency"] == "USD" and e1["settled"] is False, e1
    assert e2["direction"] == "we_owe_them", e2
    print("  ok  entries created in the currency actually promised, unsettled by default")

    for bad in [
        {"party_name": "x", "direction": "sideways", "amount": 10, "currency": "USD"},
        {"party_name": "x", "direction": "they_owe_us", "amount": 10, "currency": "EUR"},
        {"party_name": "x", "direction": "they_owe_us", "amount": 0, "currency": "USD"},
        {"party_name": "x", "direction": "they_owe_us", "amount": -5, "currency": "USD"},
        {"party_name": "", "direction": "they_owe_us", "amount": 10, "currency": "USD"},
    ]:
        assert c.post(f"/workspaces/{w['id']}/debt", json=bad, headers=HO).status_code == 400, bad
    print("  ok  bad direction, bad currency, non-positive amount, empty party all rejected")

    they_owe = c.get(f"/workspaces/{w['id']}/debt?direction=they_owe_us", headers=HO).json()["entries"]
    assert [e["id"] for e in they_owe] == [e1["id"]], they_owe

    settled = c.patch(f"/workspaces/{w['id']}/debt/{e1['id']}", json={"settled": True}, headers=HM).json()["entry"]
    assert settled["settled"] is True and settled["settled_at"], settled
    unsettled_view = c.get(f"/workspaces/{w['id']}/debt?settled=false", headers=HO).json()["entries"]
    assert [e["id"] for e in unsettled_view] == [e2["id"]], unsettled_view
    reopened = c.patch(f"/workspaces/{w['id']}/debt/{e1['id']}", json={"settled": False}, headers=HO).json()["entry"]
    assert reopened["settled"] is False and reopened["settled_at"] is None, reopened
    assert c.patch(f"/workspaces/{w['id']}/debt/99999", json={"settled": True}, headers=HO).status_code == 404
    print("  ok  settle/unsettle correct, settled_at stamped and cleared, filter by settled works")

    # Editing: amount/currency re-validated the same way create validates
    # them, but only when actually supplied.
    edited = c.patch(f"/workspaces/{w['id']}/debt/{e2['id']}",
                     json={"amount": 999, "note": "revised"}, headers=HM).json()["entry"]
    assert edited["amount"] == 999 and edited["currency"] == "IQD" and edited["note"] == "revised", edited
    assert c.patch(f"/workspaces/{w['id']}/debt/{e2['id']}",
                   json={"currency": "EUR"}, headers=HO).status_code == 400
    assert c.patch(f"/workspaces/{w['id']}/debt/{e2['id']}",
                   json={"amount": -5}, headers=HO).status_code == 400
    assert c.patch(f"/workspaces/{w['id']}/debt/99999",
                   json={"note": "x"}, headers=HO).status_code == 404
    print("  ok  partial edit re-validates amount/currency only when supplied, unknown id 404s")

    due_edited = c.patch(f"/workspaces/{w['id']}/debt/{e2['id']}",
                         json={"due_date": "2026-11-01"}, headers=HO).json()["entry"]
    assert due_edited["due_date"] == "2026-11-01", due_edited
    print("  ok  due_date settable at create and editable afterward")

    found = c.get(f"/workspaces/{w['id']}/debt?q=ministry", headers=HO).json()["entries"]
    assert [e["id"] for e in found] == [e1["id"]], found
    print("  ok  search matches party_name case-insensitively")

    assert c.get(f"/workspaces/{w['id']}/debt/export", headers=HX).status_code == 403
    exported = c.get(f"/workspaces/{w['id']}/debt/export", headers=HO)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    import csv as _csv, io as _io
    rows = list(_csv.DictReader(_io.StringIO(exported.text)))
    assert len(rows) == len(c.get(f"/workspaces/{w['id']}/debt", headers=HO).json()["entries"])
    assert any(r["party_name"] == "Ministry of Trade" for r in rows), rows
    print("  ok  CSV export membership-gated, correct headers, includes every entry")


def test_shared_tasks():
    """Membership gating, assignee must be a member of the same workspace,
    the assignee and done filters, and ordering (undated tasks last)."""
    import auth as authmod
    c = TestClient(main.app)
    owner_u = authmod.create_user("t_task_owner", None, "secret1")
    member_u = authmod.create_user("t_task_member", None, "secret1")
    outsider_u = authmod.create_user("t_task_outsider", None, "secret1")
    HO = {"Authorization": f"Bearer {authmod.create_token(owner_u['id'])}"}
    HM = {"Authorization": f"Bearer {authmod.create_token(member_u['id'])}"}
    HX = {"Authorization": f"Bearer {authmod.create_token(outsider_u['id'])}"}

    w = c.post("/workspaces", json={"name": "Al-Rasheed Ops"}, headers=HO).json()["workspace"]
    code = c.post("/workspaces/invite", json={"workspace_id": w["id"]}, headers=HO).json()["code"]
    c.post("/workspaces/join", json={"code": code}, headers=HM)

    members = c.get(f"/workspaces/{w['id']}/members", headers=HO).json()["members"]
    assert {m["username"] for m in members} == {"t_task_owner", "t_task_member"}, members
    assert c.get(f"/workspaces/{w['id']}/members", headers=HX).status_code == 403
    print("  ok  member list correct, closed to non-members")

    assert c.get(f"/workspaces/{w['id']}/tasks", headers=HX).status_code == 403
    assert c.post(f"/workspaces/{w['id']}/tasks", json={"title": "x"}, headers=HX).status_code == 403
    print("  ok  non-member gets 403 on both read and write")

    t1 = c.post(f"/workspaces/{w['id']}/tasks",
               json={"title": "Send Q3 invoices", "assignee_user_id": member_u["id"], "due_date": "2026-09-01"},
               headers=HO).json()["task"]
    t2 = c.post(f"/workspaces/{w['id']}/tasks",
               json={"title": "Review contract draft", "assignee_user_id": owner_u["id"], "due_date": "2026-08-20"},
               headers=HM).json()["task"]
    t3 = c.post(f"/workspaces/{w['id']}/tasks", json={"title": "No due date, unassigned"}, headers=HO).json()["task"]
    print("  ok  tasks created, one unassigned")

    assert c.post(f"/workspaces/{w['id']}/tasks",
                  json={"title": "x", "assignee_user_id": outsider_u["id"]},
                  headers=HO).status_code == 400
    print("  ok  assigning to a non-member is rejected")

    all_tasks = c.get(f"/workspaces/{w['id']}/tasks", headers=HO).json()["tasks"]
    assert [t["id"] for t in all_tasks] == [t2["id"], t1["id"], t3["id"]], all_tasks
    print("  ok  ordered by due date, undated tasks last")

    mine = c.get(f"/workspaces/{w['id']}/tasks?assignee_user_id={member_u['id']}", headers=HO).json()["tasks"]
    assert [t["id"] for t in mine] == [t1["id"]], mine

    done = c.patch(f"/workspaces/{w['id']}/tasks/{t1['id']}", json={"done": True}, headers=HM).json()["task"]
    assert done["done"] is True, done
    open_tasks = c.get(f"/workspaces/{w['id']}/tasks?done=false", headers=HO).json()["tasks"]
    assert {t["id"] for t in open_tasks} == {t2["id"], t3["id"]}, open_tasks
    assert c.patch(f"/workspaces/{w['id']}/tasks/99999", json={"done": True}, headers=HO).status_code == 404
    print("  ok  assignee filter, mark-done, done filter, unknown id 404s")

    # Editing: title/due_date change independently, and assignee_user_id has
    # to distinguish "not sent" (leave alone) from "sent as null" (unassign)
    # -- a bare Optional field can't tell those apart, so this exercises the
    # model_fields_set check in the route, not just the happy path.
    retitled = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                       json={"title": "Renamed, still unassigned"}, headers=HO).json()["task"]
    assert retitled["title"] == "Renamed, still unassigned" and retitled["assignee_user_id"] is None, retitled

    reassigned = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                         json={"assignee_user_id": member_u["id"]}, headers=HO).json()["task"]
    assert reassigned["assignee_user_id"] == member_u["id"], reassigned
    # Omitting the field on the next PATCH must leave that assignment alone.
    untouched = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                        json={"due_date": "2026-10-01"}, headers=HO).json()["task"]
    assert untouched["assignee_user_id"] == member_u["id"] and untouched["due_date"] == "2026-10-01", untouched
    # Sending it explicitly as null clears it back to unassigned.
    cleared = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                      json={"assignee_user_id": None}, headers=HO).json()["task"]
    assert cleared["assignee_user_id"] is None, cleared

    assert c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                   json={"assignee_user_id": outsider_u["id"]}, headers=HO).status_code == 400
    assert c.patch(f"/workspaces/{w['id']}/tasks/99999", json={"title": "x"}, headers=HO).status_code == 404
    print("  ok  edit distinguishes omitted/reassigned/cleared assignee, non-member assignee rejected")

    # Status: defaults to todo, moves through the four stages, and stays in
    # sync with the older done column either direction.
    assert t3["status"] == "todo", t3
    in_review = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                        json={"status": "review"}, headers=HO).json()["task"]
    assert in_review["status"] == "review" and in_review["done"] is False, in_review
    finished = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                       json={"status": "done"}, headers=HO).json()["task"]
    assert finished["status"] == "done" and finished["done"] is True, finished
    # The old done=True/False path still works and now also drives status.
    reopened_via_done = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                                json={"done": False}, headers=HO).json()["task"]
    assert reopened_via_done["status"] == "todo" and reopened_via_done["done"] is False, reopened_via_done
    assert c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}",
                   json={"status": "sideways"}, headers=HO).status_code == 400
    created_in_progress = c.post(f"/workspaces/{w['id']}/tasks",
                                 json={"title": "Straight to in progress", "status": "in_progress"},
                                 headers=HO).json()["task"]
    assert created_in_progress["status"] == "in_progress" and created_in_progress["done"] is False, created_in_progress
    assert c.post(f"/workspaces/{w['id']}/tasks",
                  json={"title": "x", "status": "bogus"}, headers=HO).status_code == 400
    print("  ok  status moves through all four stages, stays in sync with done, bad status rejected")

    # Comments: membership-gated, 404 on an unknown task, ordered oldest first.
    assert c.get(f"/workspaces/{w['id']}/tasks/{t3['id']}/comments", headers=HX).status_code == 403
    assert c.post(f"/workspaces/{w['id']}/tasks/{t3['id']}/comments",
                  json={"body": "x"}, headers=HX).status_code == 403
    print("  ok  non-member gets 403 on both read and write")

    c1 = c.post(f"/workspaces/{w['id']}/tasks/{t3['id']}/comments",
               json={"body": "Started on this"}, headers=HO).json()["comment"]
    c2 = c.post(f"/workspaces/{w['id']}/tasks/{t3['id']}/comments",
               json={"body": "Almost done"}, headers=HM).json()["comment"]
    assert c1["author_username"] == "t_task_owner" and c2["author_username"] == "t_task_member", (c1, c2)
    comments = c.get(f"/workspaces/{w['id']}/tasks/{t3['id']}/comments", headers=HO).json()["comments"]
    assert [x["id"] for x in comments] == [c1["id"], c2["id"]], comments
    print("  ok  comments created with author attribution, listed oldest first")

    assert c.post(f"/workspaces/{w['id']}/tasks/{t3['id']}/comments",
                  json={"body": "  "}, headers=HO).status_code == 400
    assert c.post(f"/workspaces/{w['id']}/tasks/99999/comments",
                  json={"body": "x"}, headers=HO).status_code == 404
    assert c.get(f"/workspaces/{w['id']}/tasks/99999/comments", headers=HO).status_code == 404
    print("  ok  empty body rejected, unknown task 404s on both read and write")

    # Attachments: same URL-reference field as Diwan, settable at create and
    # editable afterward.
    with_attachment = c.post(f"/workspaces/{w['id']}/tasks",
                             json={"title": "Reviewed contract", "attachment_url": "https://files.example.com/c.pdf"},
                             headers=HO).json()["task"]
    assert with_attachment["attachment_url"] == "https://files.example.com/c.pdf", with_attachment
    relinked_task = c.patch(f"/workspaces/{w['id']}/tasks/{with_attachment['id']}",
                            json={"attachment_url": "https://files.example.com/c2.pdf"},
                            headers=HO).json()["task"]
    assert relinked_task["attachment_url"] == "https://files.example.com/c2.pdf", relinked_task
    print("  ok  attachment_url settable at create and editable afterward")

    # Search and status filter on the list endpoint.
    found_tasks = c.get(f"/workspaces/{w['id']}/tasks?q=reviewed", headers=HO).json()["tasks"]
    assert [t["id"] for t in found_tasks] == [with_attachment["id"]], found_tasks
    review_status = c.get(f"/workspaces/{w['id']}/tasks?status=todo", headers=HO).json()["tasks"]
    assert with_attachment["id"] in [t["id"] for t in review_status], review_status
    print("  ok  search matches title, status filter narrows the list")

    # CSV export: membership-gated, correct headers, assignee resolved to a
    # username rather than a bare id, includes every task regardless of any
    # list filter.
    assert c.get(f"/workspaces/{w['id']}/tasks/export", headers=HX).status_code == 403
    exported = c.get(f"/workspaces/{w['id']}/tasks/export", headers=HO)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    import csv as _csv, io as _io
    rows = list(_csv.DictReader(_io.StringIO(exported.text)))
    assert len(rows) == len(c.get(f"/workspaces/{w['id']}/tasks", headers=HO).json()["tasks"])
    t1_row = next(r for r in rows if r["title"] == "Send Q3 invoices")
    assert t1_row["assignee"] == "t_task_member", t1_row
    unassigned_row = next(r for r in rows if r["title"] == "Reviewed contract")
    assert unassigned_row["assignee"] == "", unassigned_row
    print("  ok  CSV export membership-gated, resolves assignee to username, includes every task")

    # Checklist: membership-gated, 404 on an unknown task, ordered by
    # creation, partial edit (title-only, done-only), and delete.
    assert c.get(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist", headers=HX).status_code == 403
    assert c.post(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist",
                  json={"title": "x"}, headers=HX).status_code == 403
    print("  ok  non-member gets 403 on both read and write")

    i1 = c.post(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist",
               json={"title": "Draft the memo"}, headers=HO).json()["item"]
    i2 = c.post(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist",
               json={"title": "Get sign-off"}, headers=HM).json()["item"]
    assert i1["done"] is False and i2["done"] is False, (i1, i2)
    items = c.get(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist", headers=HO).json()["items"]
    assert [x["id"] for x in items] == [i1["id"], i2["id"]], items
    print("  ok  items created undone, listed in creation order")

    assert c.post(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist",
                  json={"title": "   "}, headers=HO).status_code == 400
    assert c.post(f"/workspaces/{w['id']}/tasks/99999/checklist",
                  json={"title": "x"}, headers=HO).status_code == 404
    print("  ok  empty title rejected, unknown task 404s")

    checked = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist/{i1['id']}",
                      json={"done": True}, headers=HM).json()["item"]
    assert checked["done"] is True and checked["title"] == "Draft the memo", checked
    retitled = c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist/{i2['id']}",
                       json={"title": "Get legal sign-off"}, headers=HO).json()["item"]
    assert retitled["title"] == "Get legal sign-off" and retitled["done"] is False, retitled
    assert c.patch(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist/99999",
                   json={"done": True}, headers=HO).status_code == 404
    print("  ok  partial edit changes only the given field, unknown item 404s")

    assert c.delete(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist/{i1['id']}", headers=HX).status_code == 403
    assert c.delete(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist/{i1['id']}", headers=HO).status_code == 200
    assert c.delete(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist/{i1['id']}", headers=HO).status_code == 404
    remaining = c.get(f"/workspaces/{w['id']}/tasks/{t3['id']}/checklist", headers=HO).json()["items"]
    assert [x["id"] for x in remaining] == [i2["id"]], remaining
    print("  ok  delete removes the item, non-member rejected, already-deleted 404s")


def test_approval_requests():
    """Single-step approvals: only the assigned approver may decide, only
    while still pending, and amount/currency must arrive as a pair."""
    import auth as authmod
    c = TestClient(main.app)
    requester_u = authmod.create_user("t_appr_requester", None, "secret1")
    approver_u = authmod.create_user("t_appr_approver", None, "secret1")
    bystander_u = authmod.create_user("t_appr_bystander", None, "secret1")
    outsider_u = authmod.create_user("t_appr_outsider", None, "secret1")
    HR = {"Authorization": f"Bearer {authmod.create_token(requester_u['id'])}"}
    HA = {"Authorization": f"Bearer {authmod.create_token(approver_u['id'])}"}
    HB = {"Authorization": f"Bearer {authmod.create_token(bystander_u['id'])}"}
    HX = {"Authorization": f"Bearer {authmod.create_token(outsider_u['id'])}"}

    w = c.post("/workspaces", json={"name": "Al-Rasheed Finance"}, headers=HR).json()["workspace"]
    for h in (HA, HB):
        code = c.post("/workspaces/invite", json={"workspace_id": w["id"]}, headers=HR).json()["code"]
        c.post("/workspaces/join", json={"code": code}, headers=h)

    assert c.get(f"/workspaces/{w['id']}/approvals", headers=HX).status_code == 403
    assert c.post(f"/workspaces/{w['id']}/approvals",
                  json={"title": "x", "approver_user_id": approver_u["id"]}, headers=HX).status_code == 403
    print("  ok  non-member gets 403 on both read and write")

    assert c.post(f"/workspaces/{w['id']}/approvals",
                  json={"title": "x", "approver_user_id": outsider_u["id"]}, headers=HR).status_code == 400
    print("  ok  approver must be a member of this workspace")

    for bad in [
        {"title": "x", "approver_user_id": approver_u["id"], "amount": 100},                    # no currency
        {"title": "x", "approver_user_id": approver_u["id"], "currency": "USD"},                 # no amount
        {"title": "x", "approver_user_id": approver_u["id"], "amount": 0, "currency": "USD"},
        {"title": "x", "approver_user_id": approver_u["id"], "amount": 50, "currency": "EUR"},
        {"title": "", "approver_user_id": approver_u["id"]},
    ]:
        assert c.post(f"/workspaces/{w['id']}/approvals", json=bad, headers=HR).status_code == 400, bad
    print("  ok  amount/currency must pair, non-positive/bad-currency/empty-title all rejected")

    req = c.post(f"/workspaces/{w['id']}/approvals",
                 json={"title": "Office supplies", "approver_user_id": approver_u["id"],
                       "amount": 250, "currency": "USD"},
                 headers=HR).json()["request"]
    assert req["status"] == "pending" and req["decided_at"] is None, req
    print("  ok  request created, pending, undecided")

    # The requester and an uninvolved member both get 403 -- only the assigned
    # approver may decide.
    assert c.patch(f"/workspaces/{w['id']}/approvals/{req['id']}", json={"approve": True}, headers=HR).status_code == 403
    assert c.patch(f"/workspaces/{w['id']}/approvals/{req['id']}", json={"approve": True}, headers=HB).status_code == 403
    print("  ok  only the assigned approver may decide -- not the requester, not a bystander")

    decided = c.patch(f"/workspaces/{w['id']}/approvals/{req['id']}",
                      json={"approve": True, "note": "looks fine"}, headers=HA).json()["request"]
    assert decided["status"] == "approved" and decided["decision_note"] == "looks fine" and decided["decided_at"], decided
    print("  ok  approver's decision recorded with note and timestamp")

    # A second decision on the same request is rejected, not silently applied.
    assert c.patch(f"/workspaces/{w['id']}/approvals/{req['id']}", json={"approve": False}, headers=HA).status_code == 400
    still_approved = c.get(f"/workspaces/{w['id']}/approvals/{req['id']}", headers=HR).json()["request"]
    assert still_approved["status"] == "approved", still_approved
    assert c.patch(f"/workspaces/{w['id']}/approvals/99999", json={"approve": True}, headers=HA).status_code == 404
    print("  ok  already-decided request can't be re-decided, unknown id 404s")

    # Cancel: only the requester may withdraw their own request, and only
    # while it's still pending -- mirrors the decide permission checks, just
    # with the roles swapped (requester instead of approver).
    req2 = c.post(f"/workspaces/{w['id']}/approvals",
                  json={"title": "Second request", "approver_user_id": approver_u["id"]},
                  headers=HR).json()["request"]
    assert c.patch(f"/workspaces/{w['id']}/approvals/{req2['id']}",
                   json={"cancel": True}, headers=HA).status_code == 403  # the approver, not the requester
    assert c.patch(f"/workspaces/{w['id']}/approvals/{req2['id']}",
                   json={"cancel": True}, headers=HB).status_code == 403  # a bystander
    cancelled = c.patch(f"/workspaces/{w['id']}/approvals/{req2['id']}",
                        json={"cancel": True}, headers=HR).json()["request"]
    assert cancelled["status"] == "cancelled" and cancelled["decided_at"], cancelled
    # A cancelled request can't then be decided, or cancelled again.
    assert c.patch(f"/workspaces/{w['id']}/approvals/{req2['id']}",
                   json={"approve": True}, headers=HA).status_code == 400
    assert c.patch(f"/workspaces/{w['id']}/approvals/{req2['id']}",
                   json={"cancel": True}, headers=HR).status_code == 400
    print("  ok  only the requester may cancel, only while pending, cancelled is terminal")


def test_activity_log():
    """Creation and completion events land in the activity feed with
    structured detail, not a pre-rendered sentence -- the frontend has to be
    able to translate it, so kind + a small json blob is the whole contract."""
    import auth as authmod
    c = TestClient(main.app)
    owner_u = authmod.create_user("t_activity_owner", None, "secret1")
    member_u = authmod.create_user("t_activity_member", None, "secret1")
    outsider_u = authmod.create_user("t_activity_outsider", None, "secret1")
    HO = {"Authorization": f"Bearer {authmod.create_token(owner_u['id'])}"}
    HM = {"Authorization": f"Bearer {authmod.create_token(member_u['id'])}"}
    HX = {"Authorization": f"Bearer {authmod.create_token(outsider_u['id'])}"}

    w = c.post("/workspaces", json={"name": "Al-Rasheed Activity"}, headers=HO).json()["workspace"]
    code = c.post("/workspaces/invite", json={"workspace_id": w["id"]}, headers=HO).json()["code"]
    c.post("/workspaces/join", json={"code": code}, headers=HM)

    assert c.get(f"/workspaces/{w['id']}/activity", headers=HX).status_code == 403
    print("  ok  non-member gets 403")

    e1 = c.post(f"/workspaces/{w['id']}/diwan",
               json={"direction": "incoming", "entity_name": "Ministry of Trade"},
               headers=HO).json()["entry"]
    debt = c.post(f"/workspaces/{w['id']}/debt",
                  json={"party_name": "Karim Hardware", "direction": "they_owe_us",
                        "amount": 100, "currency": "USD"},
                  headers=HO).json()["entry"]
    task = c.post(f"/workspaces/{w['id']}/tasks", json={"title": "File the permit"}, headers=HO).json()["task"]
    req = c.post(f"/workspaces/{w['id']}/approvals",
                 json={"title": "Office supplies", "approver_user_id": member_u["id"]},
                 headers=HO).json()["request"]

    kinds = [a["kind"] for a in c.get(f"/workspaces/{w['id']}/activity", headers=HO).json()["activity"]]
    assert kinds.count("diwan_created") == 1
    assert kinds.count("debt_created") == 1
    assert kinds.count("task_created") == 1
    assert kinds.count("approval_created") == 1
    print("  ok  create events logged for diwan, debt, tasks, approvals")

    c.patch(f"/workspaces/{w['id']}/diwan/{e1['id']}", json={"replied": True}, headers=HO)
    c.patch(f"/workspaces/{w['id']}/debt/{debt['id']}", json={"settled": True}, headers=HO)
    c.patch(f"/workspaces/{w['id']}/tasks/{task['id']}", json={"status": "done"}, headers=HO)
    c.post(f"/workspaces/{w['id']}/tasks/{task['id']}/comments", json={"body": "done"}, headers=HO)
    c.patch(f"/workspaces/{w['id']}/approvals/{req['id']}", json={"approve": True}, headers=HM)

    activity = c.get(f"/workspaces/{w['id']}/activity", headers=HO).json()["activity"]
    kinds = [a["kind"] for a in activity]
    assert "diwan_replied" in kinds and "debt_settled" in kinds
    assert "task_completed" in kinds and "approval_decided" in kinds
    assert "task_commented" in kinds, kinds
    print("  ok  completion events (replied/settled/status/decided) and comments logged too")

    replied_entry = next(a for a in activity if a["kind"] == "diwan_replied")
    assert replied_entry["detail"]["entity_name"] == "Ministry of Trade", replied_entry
    decided_entry = next(a for a in activity if a["kind"] == "approval_decided")
    assert decided_entry["detail"]["status"] == "approved" and decided_entry["actor_user_id"] == member_u["id"], decided_entry
    print("  ok  detail is structured (not a pre-rendered sentence), actor attributed correctly")

    # Newest first, and limit is respected.
    assert activity[0]["id"] > activity[-1]["id"], activity
    limited = c.get(f"/workspaces/{w['id']}/activity?limit=2", headers=HO).json()["activity"]
    assert len(limited) == 2, limited
    print("  ok  newest first, limit respected")


def test_notifications():
    """In-app notifications: assigned/commented-on/decided-for events reach
    the right person, never the actor who caused them, and each user can
    only ever see and mark read their own."""
    import auth as authmod
    c = TestClient(main.app)
    owner_u = authmod.create_user("t_notif_owner", None, "secret1")
    member_u = authmod.create_user("t_notif_member", None, "secret1")
    outsider_u = authmod.create_user("t_notif_outsider", None, "secret1")
    HO = {"Authorization": f"Bearer {authmod.create_token(owner_u['id'])}"}
    HM = {"Authorization": f"Bearer {authmod.create_token(member_u['id'])}"}
    HX = {"Authorization": f"Bearer {authmod.create_token(outsider_u['id'])}"}

    w = c.post("/workspaces", json={"name": "Al-Rasheed Notify"}, headers=HO).json()["workspace"]
    code = c.post("/workspaces/invite", json={"workspace_id": w["id"]}, headers=HO).json()["code"]
    c.post("/workspaces/join", json={"code": code}, headers=HM)

    assert c.get(f"/workspaces/{w['id']}/notifications", headers=HX).status_code == 403
    print("  ok  non-member gets 403")

    # Assigning a task to someone else on create notifies them; assigning to
    # yourself does not.
    task = c.post(f"/workspaces/{w['id']}/tasks",
                  json={"title": "Draft the memo", "assignee_user_id": member_u["id"]},
                  headers=HO).json()["task"]
    c.post(f"/workspaces/{w['id']}/tasks", json={"title": "My own task", "assignee_user_id": owner_u["id"]},
          headers=HO)
    notifs = c.get(f"/workspaces/{w['id']}/notifications", headers=HM).json()
    assert notifs["unread_count"] == 1, notifs
    assert notifs["notifications"][0]["kind"] == "task_assigned", notifs
    assert notifs["notifications"][0]["detail"]["title"] == "Draft the memo", notifs
    owner_notifs = c.get(f"/workspaces/{w['id']}/notifications", headers=HO).json()
    assert owner_notifs["unread_count"] == 0, owner_notifs
    print("  ok  assigning to someone else notifies them, self-assignment doesn't")

    # Reassigning to a third member also notifies; a comment notifies both
    # the assignee and the creator, but never the commenter themselves.
    task2 = c.post(f"/workspaces/{w['id']}/tasks", json={"title": "Second task"}, headers=HO).json()["task"]
    c.patch(f"/workspaces/{w['id']}/tasks/{task2['id']}", json={"assignee_user_id": member_u["id"]}, headers=HO)
    c.post(f"/workspaces/{w['id']}/tasks/{task['id']}/comments", json={"body": "Any update?"}, headers=HO)
    member_notifs = c.get(f"/workspaces/{w['id']}/notifications", headers=HM).json()
    kinds = [n["kind"] for n in member_notifs["notifications"]]
    assert kinds.count("task_assigned") == 2 and kinds.count("task_commented") == 1, kinds
    # The owner commented, so the owner shouldn't be notified of their own comment.
    owner_notifs2 = c.get(f"/workspaces/{w['id']}/notifications", headers=HO).json()
    assert "task_commented" not in [n["kind"] for n in owner_notifs2["notifications"]], owner_notifs2
    print("  ok  reassignment notifies, comments notify assignee+creator but never the commenter")

    # Approval requested notifies the approver; a decision notifies the
    # requester, never the approver who made it.
    req = c.post(f"/workspaces/{w['id']}/approvals",
                 json={"title": "Office chairs", "approver_user_id": member_u["id"]},
                 headers=HO).json()["request"]
    member_notifs2 = c.get(f"/workspaces/{w['id']}/notifications", headers=HM).json()
    assert "approval_requested" in [n["kind"] for n in member_notifs2["notifications"]], member_notifs2
    c.patch(f"/workspaces/{w['id']}/approvals/{req['id']}", json={"approve": True}, headers=HM)
    owner_notifs3 = c.get(f"/workspaces/{w['id']}/notifications", headers=HO).json()
    decided = [n for n in owner_notifs3["notifications"] if n["kind"] == "approval_decided"]
    assert len(decided) == 1 and decided[0]["detail"]["status"] == "approved", owner_notifs3
    assert "approval_decided" not in [n["kind"] for n in c.get(f"/workspaces/{w['id']}/notifications", headers=HM).json()["notifications"]], "approver shouldn't be notified of their own decision"
    print("  ok  approval request notifies approver, decision notifies requester only")

    # Mark one read, then mark the rest; a user can't mark another user's
    # notification.
    before_read = c.get(f"/workspaces/{w['id']}/notifications", headers=HM).json()
    first_id = before_read["notifications"][0]["id"]
    assert c.post(f"/workspaces/{w['id']}/notifications/{first_id}/read", headers=HO).status_code == 404
    assert c.post(f"/workspaces/{w['id']}/notifications/{first_id}/read", headers=HM).status_code == 200
    after_one = c.get(f"/workspaces/{w['id']}/notifications", headers=HM).json()
    assert after_one["unread_count"] == before_read["unread_count"] - 1, after_one
    c.post(f"/workspaces/{w['id']}/notifications/read_all", headers=HM)
    all_read = c.get(f"/workspaces/{w['id']}/notifications", headers=HM).json()
    assert all_read["unread_count"] == 0, all_read
    assert c.get(f"/workspaces/{w['id']}/notifications?unread_only=true", headers=HM).json()["notifications"] == []
    print("  ok  mark-one and mark-all-read work, cross-user marking rejected")


def test_feedback_admin():
    """The dump must be closed by default, header-gated when a key is set, and
    must not 500 on a non-ASCII header."""
    c = TestClient(main.app)
    os.environ.pop("FEEDBACK_KEY", None)
    assert c.get("/feedback").status_code == 403
    print("  ok  closed when FEEDBACK_KEY unset")

    os.environ["FEEDBACK_KEY"] = "s3cret-key"
    assert c.get("/feedback").status_code == 403
    assert c.get("/feedback", headers={"X-Admin-Key": "wrong"}).status_code == 403
    # Starlette decodes header bytes as latin-1, so bytes 0x80-0xFF arrive as a
    # non-ASCII str. secrets.compare_digest raises TypeError on those, which
    # would turn a crafted header into a 500 — must be a plain 403.
    assert c.get("/feedback", headers={b"X-Admin-Key": b"\xff\xfe"}).status_code == 403
    r = c.get("/feedback", headers={"X-Admin-Key": "s3cret-key"})
    assert r.status_code == 200 and "feedback" in r.json(), r.text
    print("  ok  header key accepted, wrong/non-ascii rejected without 500")
    os.environ.pop("FEEDBACK_KEY", None)


if __name__ == "__main__":
    print("slot decoding:")
    test_slots(AutoTokenizer.from_pretrained("xlm-roberta-base"))
    print("confidence floor:")
    test_confidence_floor()
    print("state sync + rate limits:")
    test_state_and_limits()
    print("collection loop:")
    test_collection_loop()
    print("export:")
    test_export_separates_oos()
    print("holidays:")
    test_holidays_curation()
    print("news by language:")
    test_news_language()
    print("sharing:")
    test_sharing()
    print("workspaces + diwan:")
    test_workspaces_and_diwan()
    print("debt ledger:")
    test_debt_ledger()
    print("shared tasks:")
    test_shared_tasks()
    print("approval requests:")
    test_approval_requests()
    print("activity log:")
    test_activity_log()
    print("notifications:")
    test_notifications()
    print("feedback admin auth:")
    test_feedback_admin()
    print("\nall passed")
    sys.exit(0)
