"""Kurmanji Hawar (Latin) -> Kurdish Arabic script.

Why this is needed
------------------
NLLB-200 can translate into Northern Kurdish, but only as `kmr_Latn` -- the
Hawar Latin alphabet used in Turkey and the diaspora. The Badini rows in
XLMR_dataset_4lang_v2.csv are Arabic script, as Badini is written in Iraq. If
we appended Latin-script rows to an Arabic-script class the model would be
learning that Badini looks like two unrelated things, so the MT output has to
be converted before it can be used.

The mapping is mechanical rather than lossy in the forward direction: Hawar was
designed as a phonemic alphabet and each letter has a settled Arabic-script
counterpart. The *reverse* direction is genuinely lossy, which matters for how
this file is tested -- see `roundtrip_report`.

Run it directly to see how well it round-trips against the real Badini data:

    python ml/kurmanji_translit.py
"""

# Hawar letter -> Kurdish Arabic. Order matters for the digraphs, which are
# matched before their single-letter parts.
DIGRAPHS = [
    ("xw", "خو"),
    ("rr", "ڕ"),   # trilled r, written as a distinct letter in Arabic script
    ("ll", "ڵ"),   # velarised l, likewise
]

SINGLE = {
    "a": "ا", "b": "ب", "c": "ج", "ç": "چ", "d": "د",
    "e": "ە", "ê": "ێ", "f": "ف", "g": "گ", "h": "ه",
    "i": "",   "î": "ی", "j": "ژ", "k": "ک", "l": "ل",
    "m": "م", "n": "ن", "o": "ۆ", "p": "پ", "q": "ق",
    "r": "ر", "s": "س", "ş": "ش", "t": "ت", "u": "و",
    "û": "وو", "v": "ڤ", "w": "و", "x": "خ", "y": "ی",
    "z": "ز",
}

# A word starting with a vowel takes a carrier alif-hamza. Without it the
# vowel has nothing to sit on and the word reads wrong.
INITIAL_VOWEL = {
    "a": "ئا", "e": "ئە", "ê": "ئێ", "î": "ئی",
    "o": "ئۆ", "u": "ئو", "û": "ئوو", "i": "ئ",
}

_VOWELS = set("aeêiîouû")


def _word(w: str) -> str:
    """Transliterate one whitespace-delimited token."""
    if not w:
        return w
    # Leave anything that is not Hawar alone: digits, punctuation, and the
    # embedded English words the dataset genuinely contains.
    if not any(c.lower() in SINGLE or c.lower() in "çêîşû" for c in w):
        return w

    low = w.lower()
    out = []
    i = 0
    first = True
    while i < len(low):
        # digraphs first
        hit = None
        for src, dst in DIGRAPHS:
            if low.startswith(src, i):
                hit = (src, dst)
                break
        if hit:
            out.append(hit[1])
            i += len(hit[0])
            first = False
            continue

        ch = low[i]
        if first and ch in _VOWELS:
            out.append(INITIAL_VOWEL[ch])
        elif ch in SINGLE:
            out.append(SINGLE[ch])
        else:
            out.append(ch)  # punctuation, digits, unknown letters
        i += 1
        first = False
    return "".join(out)


def to_arabic(text: str) -> str:
    """Transliterate a Hawar Latin string into Kurdish Arabic script."""
    return " ".join(_word(w) for w in text.split(" "))


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
# The forward direction is what we ship, but we have no Latin-script Badini to
# test it against. So we test the mapping's *self-consistency*: take the real
# Arabic-script Badini rows, walk them backwards into Latin, then forwards
# again, and see how much survives.
#
# This is deliberately a hard test and it will not score 100%. Arabic script
# does not write short `i`, and both `u`/`w` collapse onto و, so the backward
# step throws away information the forward step cannot invent. A high score
# means the mapping is coherent; the residue is the known ambiguity, not a bug.

_BACK = {}
for _lat, _ara in SINGLE.items():
    if _ara and _ara not in _BACK:
        _BACK[_ara] = _lat
for _src, _dst in DIGRAPHS:
    _BACK.setdefault(_dst, _src)


def to_latin(text: str) -> str:
    """Rough Arabic -> Hawar, for testing only. Not shipped."""
    out = []
    for w in text.split(" "):
        s = w
        if s.startswith("ئ"):
            for pre, lat in (("ئوو", "û"), ("ئا", "a"), ("ئە", "e"), ("ئێ", "ê"),
                             ("ئی", "î"), ("ئۆ", "o"), ("ئو", "u")):
                if s.startswith(pre):
                    s = lat + s[len(pre):]
                    break
            else:
                s = s[1:]
        r = []
        i = 0
        while i < len(s):
            if s.startswith("وو", i):
                r.append("û"); i += 2; continue
            # و and ی each carry two sounds. Word-initially they must be the
            # consonants w/y: an initial *vowel* is always written with the
            # carrier ئ, which the branch above has already stripped. Reading
            # them as vowels here is what produced ئوەرگرن for وەرگرن.
            if i == 0 and not w.startswith("ئ") and s[i] in ("و", "ی"):
                r.append("w" if s[i] == "و" else "y"); i += 1; continue
            r.append(_BACK.get(s[i], s[i])); i += 1
        out.append("".join(r))
    return " ".join(out)


def roundtrip_report(n=1500):
    import pandas as pd
    d = pd.read_csv("data/XLMR_dataset_4lang_v2.csv")
    rows = d[d.language == "badini"].utt.dropna().astype(str).head(n).tolist()

    exact = 0
    char_ok = char_tot = 0
    misses = []
    for orig in rows:
        rt = to_arabic(to_latin(orig))
        if rt == orig:
            exact += 1
        else:
            if len(misses) < 5:
                misses.append((orig, rt))
        for a, b in zip(orig, rt):
            char_tot += 1
            char_ok += a == b
        char_tot += abs(len(orig) - len(rt))

    print(f"round-trip over {len(rows):,} real Badini utterances")
    print(f"  exact sentence match : {exact/len(rows):6.1%}")
    print(f"  character agreement  : {char_ok/char_tot:6.1%}")
    print("\n  examples that did not round-trip exactly:")
    for o, r in misses:
        print(f"    was: {o}")
        print(f"    got: {r}")
    print("\n  forward direction on Hawar input (what we actually ship):")
    for s in ["ez diçim malê", "sibê saet sê min hişyar bike", "rojbaş"]:
        print(f"    {s:34} -> {to_arabic(s)}")


if __name__ == "__main__":
    roundtrip_report()
