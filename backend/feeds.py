"""Public feed endpoints: Kurdistan24 / Google News headlines, trending news,
"on this day" history and holidays. All sources are keyless and cached;
any upstream failure returns an empty list so the UI shows "unavailable"
instead of breaking. Mounted by main.py via app.include_router(router).
"""
import logging

from fastapi import APIRouter

log = logging.getLogger("ferman")
router = APIRouter()


# ---------------- news (Kurdistan24, server-side to avoid CORS) ----------------
# Kurdistan24 publishes no RSS feed, so we read the "latest" page and pull the
# story links out of it. This is intentionally defensive: any failure returns an
# empty list and the UI shows "news unavailable" rather than breaking.
_NEWS_URL = "https://www.kurdistan24.net/ckb/latest"
_NEWS_BASE = "https://www.kurdistan24.net"
_NEWS_CACHE = {"at": 0.0, "items": []}
_NEWS_TTL = 600          # seconds; be a polite client


def _fetch_news(limit=8):
    import re, time, urllib.request
    now = time.time()
    if _NEWS_CACHE["items"] and now - _NEWS_CACHE["at"] < _NEWS_TTL:
        return _NEWS_CACHE["items"]
    try:
        req = urllib.request.Request(_NEWS_URL, headers={"User-Agent": "Mozilla/5.0 (compatible; FermanAssistant/1.0)"})
        with urllib.request.urlopen(req, timeout=6) as r:
            html = r.read().decode("utf-8", "ignore")
    except Exception as e:
        log.warning("news fetch failed: %s", e)
        return _NEWS_CACHE["items"]          # serve stale rather than nothing
    items, seen = [], set()
    # accept both relative (/ckb/story/...) and absolute (https://...kurdistan24.net/ckb/story/...) hrefs
    pat = r'<a[^>]+href="(?:https?://(?:www\.)?kurdistan24\.net)?(/ckb/story/[^"#?]+)"[^>]*>(.*?)</a>'
    for m in re.finditer(pat, html, re.S):
        href, inner = m.group(1), m.group(2)
        title = re.sub(r"<[^>]+>", " ", inner)
        title = re.sub(r"\s+", " ", title).strip()
        if len(title) < 15 or href in seen:
            continue
        seen.add(href)
        items.append({"title": title, "url": _NEWS_BASE + href})
        if len(items) >= limit:
            break
    if items:
        _NEWS_CACHE.update(at=now, items=items)
    return items or _NEWS_CACHE["items"]


# ---------------- Google News RSS (keyless) ----------------
# Used both for regional news in Arabic/English and for world trending. One
# parser, one cache keyed by feed URL, so adding a language costs nothing.
_RSS_CACHE = {}
_RSS_TTL = 600


def _fetch_rss(url, limit=8):
    import re, time, html as _html, urllib.request
    now = time.time()
    cached = _RSS_CACHE.get(url)
    if cached and cached["items"] and now - cached["at"] < _RSS_TTL:
        return cached["items"]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; FermanAssistant/1.0)"})
        with urllib.request.urlopen(req, timeout=6) as r:      # follows redirects
            xml = r.read().decode("utf-8", "ignore")
    except Exception as e:
        log.warning("rss fetch failed: %s: %s", url, e)
        return cached["items"] if cached else []
    items = []
    for m in re.finditer(r"<item>(.*?)</item>", xml, re.S):
        block = m.group(1)
        tm = re.search(r"<title>(.*?)</title>", block, re.S)
        lm = re.search(r"<link>(.*?)</link>", block, re.S)
        if not tm or not lm:
            continue
        title = re.sub(r"^<!\[CDATA\[|\]\]>$", "", tm.group(1).strip())
        title = _html.unescape(re.sub(r"<[^>]+>", "", title)).strip()
        link = _html.unescape(lm.group(1).strip())
        if len(title) < 12:
            continue
        items.append({"title": title, "url": link})
        if len(items) >= limit:
            break
    if items:
        _RSS_CACHE[url] = {"at": now, "items": items}
    return items or (cached["items"] if cached else [])


# Regional news per UI language. Kurdish keeps the Kurdistan24 scrape (there is
# no Kurdish Google News edition); Arabic and English use Google News scoped to
# Iraq, so "news" means local news in the user's language rather than US wire
# copy. gl/ceid=IQ is what makes it Iraqi rather than generic.
_GNEWS_AR_IQ = "https://news.google.com/rss?hl=ar&gl=IQ&ceid=IQ:ar"
# There is no English *edition* for Iraq — ceid=IQ:en silently falls back to the
# US edition, which made this card identical to Trending. A topic search keeps
# it regional instead.
_GNEWS_EN_IQ = ("https://news.google.com/rss/search?q=Iraq%20OR%20Kurdistan"
                "&hl=en-US&gl=US&ceid=US:en")


@router.get("/news")
def news(lang: str = "ku"):
    """Regional news in the caller's UI language."""
    if lang == "ar":
        items = _fetch_rss(_GNEWS_AR_IQ)
        source = "Google News (Iraq)"
        # Google News occasionally returns an empty Arabic edition; the Kurdish
        # scrape is a better fallback than an empty card.
        if not items:
            items, source = _fetch_news(), "Kurdistan24"
    elif lang == "en":
        items = _fetch_rss(_GNEWS_EN_IQ)
        source = "Google News (Iraq)"
        if not items:
            items, source = _fetch_news(), "Kurdistan24"
    else:
        items, source = _fetch_news(), "Kurdistan24"
    return {"source": source, "items": items, "ok": bool(items)}


# ---------------- trending world news ----------------
_TRENDING_URL = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en"


@router.get("/trending")
def trending():
    items = _fetch_rss(_TRENDING_URL)
    return {"source": "Google News", "items": items, "ok": bool(items)}


# ---------------- on this day in history (muffinlabs, keyless) ----------------
_HISTORY_CACHE = {"day": "", "items": []}


def _fetch_history(limit=6):
    import json as _json, urllib.request, datetime as _dt
    today = _dt.date.today().isoformat()
    if _HISTORY_CACHE["items"] and _HISTORY_CACHE["day"] == today:
        return _HISTORY_CACHE["items"]
    try:
        req = urllib.request.Request("https://history.muffinlabs.com/date",
                                     headers={"User-Agent": "Mozilla/5.0 (compatible; FermanAssistant/1.0)"})
        with urllib.request.urlopen(req, timeout=6) as r:
            d = _json.loads(r.read().decode("utf-8", "ignore"))
    except Exception as e:
        log.warning("history fetch failed: %s", e)
        return _HISTORY_CACHE["items"]
    events = d.get("data", {}).get("Events", [])
    items = [{"year": str(e.get("year", "")), "text": (e.get("text") or "").strip()}
             for e in events if e.get("text")]
    # spread the picks across the day's events for variety
    if len(items) > limit:
        step = max(1, len(items) // limit)
        items = items[::step][:limit]
    if items:
        _HISTORY_CACHE.update(day=today, items=items)
    return items


@router.get("/onthisday")
def onthisday():
    items = _fetch_history()
    return {"items": items, "ok": bool(items)}


# ---------------- holidays (Nager.Date + Aladhan, both keyless) ----------------
# Two sources merged: Iraq's civil holidays (fixed Gregorian dates, including
# Nowruz) and the Islamic calendar (lunar, so the Gregorian date moves yearly).
#
# Aladhan's feed is deliberately filtered. It carries ~78 entries per Hijri year,
# most of them Naqshbandi Sufi commemorations ("Urs of Shaykh…") that are
# specific to one tradition. Iraq is religiously mixed — Shia majority, Sunni,
# Christians, Yazidis, Kurds observing Nowruz — so the widget shows only widely
# observed dates rather than one tradition's full calendar.
_HOLIDAY_CACHE = {"day": "", "items": []}

# API name fragment -> stable key the client translates (falls back to the
# English name when a key has no translation).
_ISLAMIC_KEYS = [
    ("1st Day of Ramadan", "ramadan"),
    ("Lailat-ul-Qadr", "qadr"),
    ("Eid-ul-Fitr", "eid_fitr"),
    ("Arafa", "arafa"),
    ("Eid-ul-Adha", "eid_adha"),
    ("Ashura", "ashura"),
    ("Mawlid", "mawlid"),
    ("Lailat-ul-Miraj", "miraj"),
]
_NATIONAL_KEYS = {
    "New Year's Day": "new_year", "Army Day": "army_day", "Nowruz": "nowruz",
    "Labour Day": "labour_day", "National Day": "national_day",
    "Victory Day": "victory_day", "Christmas Day": "christmas",
}


def _get_json(url, timeout=8):
    import json as _json, urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; FermanAssistant/1.0)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return _json.loads(r.read().decode("utf-8", "ignore"))


def _islamic_holidays(hijri_year):
    """Curated Islamic holidays for one Hijri year as (iso_date, key, name)."""
    out = []
    try:
        d = _get_json(f"https://api.aladhan.com/v1/islamicHolidaysByHijriYear/{hijri_year}")
    except Exception as e:
        log.warning("islamic holidays fetch failed: %s", e)
        return out
    for entry in d.get("data", []):
        greg = entry.get("gregorian", {}).get("date", "")      # DD-MM-YYYY
        hijri_day = entry.get("hijri", {}).get("day", "")
        if not greg:
            continue
        dd, mm, yyyy = greg.split("-")
        iso = f"{yyyy}-{mm}-{dd}"
        for raw in entry.get("hijri", {}).get("holidays", []):
            for frag, key in _ISLAMIC_KEYS:
                if frag.lower() not in raw.lower():
                    continue
                # Laylat al-Qadr is sought across the odd nights of the last ten
                # days, so the feed lists it five times. Keep the 27th, which is
                # the night actually observed, instead of five near-identical rows.
                if key == "qadr" and str(hijri_day) != "27":
                    continue
                out.append((iso, key, frag))
                break
    return out


def _national_holidays(year):
    out = []
    try:
        for h in _get_json(f"https://date.nager.at/api/v3/PublicHolidays/{year}/IQ"):
            name = h.get("name") or ""
            out.append((h.get("date", ""), _NATIONAL_KEYS.get(name, ""), name))
    except Exception as e:
        log.warning("national holidays fetch failed: %s", e)
    return out


def _fetch_holidays(limit=6):
    import datetime as _dt
    today = _dt.date.today()
    if _HOLIDAY_CACHE["items"] and _HOLIDAY_CACHE["day"] == today.isoformat():
        return _HOLIDAY_CACHE["items"]

    # Hijri years run ~354 days, so a Gregorian year spans two of them. This
    # approximation is only used to pick which years to fetch; the dates
    # themselves come from the API.
    hy = int((today.year - 622) * 33 / 32)
    rows = []
    for y in (today.year, today.year + 1):
        rows += _national_holidays(y)
    for y in (hy, hy + 1):
        rows += _islamic_holidays(y)

    seen, items = set(), []
    for iso, key, name in sorted(rows):
        if not iso or iso < today.isoformat():
            continue                      # only what is still ahead
        if (iso, name) in seen:
            continue                      # the feed repeats entries
        seen.add((iso, name))
        items.append({"date": iso, "key": key, "name": name})
        if len(items) >= limit:
            break
    if items:
        _HOLIDAY_CACHE.update(day=today.isoformat(), items=items)
    return items


@router.get("/holidays")
def holidays():
    items = _fetch_holidays()
    return {"items": items, "ok": bool(items)}
