"""Fill the starved Kurdish intents by translating the English rows.

The problem this solves
-----------------------
Kurdish is not uniformly thin, it is lopsided. Seven intents were translated
properly (weather_query has 384 Sorani rows, news_query 370) and the rest were
given a token ~20 each regardless of how much English existed:

    calendar_set     806 en -> 19 sorani
    calendar_query   566 en -> 20
    qa_factoid       541 en -> 20

That is why Sorani sits at 0.6973 accuracy while English is at 0.8869, and why
macro-F1 (0.79) trails accuracy (0.83): the starved intents drag the average
down. Filling them is a targeted job of a few thousand rows, not a full
re-translation.

How it works
------------
NLLB-200 translates English -> ckb_Arab (Sorani) and -> kmr_Latn (Kurmanji),
the latter transliterated into Arabic script by `kurmanji_translit`, because
Badini is written in Arabic script in Iraq.

NLLB is good but not clean. Measured over 120 utterances from these very
intents:

  * 4% carried a stray Arabic heh plus a space where Kurdish wants a joined ae
    ("ئه گه ر" for "ئەگەر"). Fixed mechanically below; the ه:ە ratio afterwards
    matches the real data.
  * 18% of commands and questions came back as flat statements after a round
    trip. "remind me at one pm" -> "I remember at 1pm" is a destroyed label.
  * numbers survived 88% of the time. "add weekly one p.m. call to calendar"
    became "a weekly dinner invitation to the newspaper".

So everything is generated twice: forward into Kurdish, then back into English.
Rows whose back-translation has drifted too far from the source are dropped
rather than shipped. Slots get the same treatment -- each value is translated
separately and must be findable in the translated sentence, or the row keeps
its intent label and loses its annotation. Intent data is still worth having;
a wrong span is not.

Usage
-----
    python ml/augment_kurdish.py                  # writes data/XLMR_dataset_4lang_v3.csv
    python ml/augment_kurdish.py --target 150     # rows per starved intent per dialect
    python ml/augment_kurdish.py --dry-run        # plan only, no model load

Resumable: translations are cached to ml/.mt_cache.jsonl, so an interrupted run
picks up where it stopped instead of paying for the same sentences twice.
"""
import argparse
import json
import os
import re
import sys
import time

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kurmanji_translit import to_arabic  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")
SRC_CSV = os.path.join(DATA, "XLMR_dataset_4lang_v2.csv")
OUT_CSV = os.path.join(DATA, "XLMR_dataset_4lang_v3.csv")
CACHE = os.path.join(HERE, ".mt_cache.jsonl")
MODEL = "facebook/nllb-200-distilled-600M"

SLOT_RE = re.compile(r"\[([^:\]]+):([^\]]+)\]")

# A lone ه followed by a space between two Arabic-script letters is NLLB's
# broken spelling of a joined ە. Applied repeatedly because "ئه گه ر" needs two
# passes.
_HEH = re.compile(r"(?<=[؀-ۿ])ه (?=[؀-ۿ])")

# Does the utterance still read as a command or a question after the round
# trip? A statement means the intent label no longer describes the sentence.
_IMPERATIVE = re.compile(
    r"^(remind|set|add|create|make|tell|show|find|send|book|play|check|cancel|"
    r"delete|remove|put|give|open|start|stop|turn|order|what|when|where|who|"
    r"how|why|which|is|are|do|does|did|can|could|would|will|should)\b", re.I)

_WORD = re.compile(r"[a-z0-9]+")


def fix_orthography(s: str) -> str:
    prev = None
    while prev != s:
        prev = s
        s = _HEH.sub("ە", s)
    return s


def similarity(a: str, b: str) -> float:
    """Token F1 between the source and its back-translation."""
    ta, tb = set(_WORD.findall(a.lower())), set(_WORD.findall(b.lower()))
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    if not inter:
        return 0.0
    p, r = inter / len(tb), inter / len(ta)
    return 2 * p * r / (p + r)


def parse_slots(annot: str):
    """[('time', 'nine am'), ...] in order of appearance."""
    return [(m.group(1).strip(), m.group(2).strip()) for m in SLOT_RE.finditer(annot or "")]


def build_annot(sentence: str, pairs):
    """Re-insert [slot : value] spans into a translated sentence.

    Returns None if any value cannot be found, which is the signal to keep the
    row for intent training but not for slot training. Matching is done longest
    value first so a short value that happens to be a substring of a longer one
    cannot steal its span.
    """
    if not pairs:
        return sentence
    out = sentence
    spans = []
    for name, val in sorted(pairs, key=lambda p: -len(p[1])):
        if not val:
            return None
        idx = out.find(val)
        if idx < 0:
            return None
        # Guard against re-annotating inside a span we already marked.
        if any(s <= idx < e for s, e in spans):
            return None
        spans.append((idx, idx + len(val)))
        out = out[:idx] + f"[{name} : {val}]" + out[idx + len(val):]
        shift = len(f"[{name} : ]")
        spans = [(s + shift, e + shift) if s > idx else (s, e) for s, e in spans]
    return out


# ---------------------------------------------------------------------------


class Translator:
    def __init__(self, model_name=MODEL):
        import torch
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        self.torch = torch
        print(f"loading {model_name} ...", flush=True)
        self.tok = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name).eval()
        self.cache = {}
        if os.path.exists(CACHE):
            with open(CACHE, encoding="utf-8") as f:
                for line in f:
                    try:
                        r = json.loads(line)
                        self.cache[(r["s"], r["src"], r["tgt"])] = r["t"]
                    except Exception:
                        pass
            print(f"  cache: {len(self.cache):,} previous translations", flush=True)
        self.fh = open(CACHE, "a", encoding="utf-8")

    def __call__(self, texts, src, tgt, beams=4, bs=16, label=""):
        todo = [t for t in dict.fromkeys(texts) if (t, src, tgt) not in self.cache]
        if todo:
            t0 = time.time()
            self.tok.src_lang = src
            bos = self.tok.convert_tokens_to_ids(tgt)
            for i in range(0, len(todo), bs):
                batch = todo[i:i + bs]
                enc = self.tok(batch, return_tensors="pt", padding=True,
                               truncation=True, max_length=96)
                with self.torch.no_grad():
                    gen = self.model.generate(**enc, forced_bos_token_id=bos,
                                              max_new_tokens=72, num_beams=beams)
                for s, t in zip(batch, self.tok.batch_decode(gen, skip_special_tokens=True)):
                    self.cache[(s, src, tgt)] = t
                    self.fh.write(json.dumps({"s": s, "src": src, "tgt": tgt, "t": t},
                                             ensure_ascii=False) + "\n")
                self.fh.flush()
                done = min(i + bs, len(todo))
                el = time.time() - t0
                eta = (len(todo) - done) / max(done / el, 1e-9)
                print(f"  [{label} {src}->{tgt}] {done:,}/{len(todo):,} "
                      f"({done/len(todo):.0%})  eta {eta/60:.0f}m", flush=True)
        return [self.cache[(t, src, tgt)] for t in texts]


def plan(df, target):
    """Which intents need filling, and how many English rows to draw."""
    tr = df[df.partition == "train"]
    ku = tr[tr.language == "sorani"].intent.value_counts()
    en = tr[tr.language == "en"]
    rows = []
    for intent in sorted(df.intent.unique()):
        have = int(ku.get(intent, 0))
        if have >= target:
            continue
        pool = en[en.intent == intent]
        want = min(target - have, len(pool))
        if want > 0:
            rows.append((intent, have, want, len(pool)))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=150,
                    help="rows per intent per dialect to aim for")
    ap.add_argument("--min-sim", type=float, default=0.45,
                    help="drop rows whose back-translation similarity is below this")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default=OUT_CSV)
    args = ap.parse_args()

    df = pd.read_csv(SRC_CSV)
    todo = plan(df, args.target)
    total = sum(w for _, _, w, _ in todo)

    print(f"{'intent':28} {'have':>5} {'add':>5} {'en pool':>8}")
    for intent, have, want, pool in todo:
        print(f"  {intent:26} {have:>5} {want:>5} {pool:>8}")
    print(f"\n{len(todo)} intents, {total:,} English rows -> {total*2:,} Kurdish rows")
    print(f"translations: ~{total*2:,} forward + ~{total*2:,} back-check")
    if args.dry_run:
        return

    # Draw the English source rows, preferring annotated ones so the slot model
    # benefits too, and de-duplicating so we do not translate the same sentence
    # into the training set twice.
    tr_en = df[(df.partition == "train") & (df.language == "en")]
    picks = []
    for intent, _, want, _ in todo:
        pool = tr_en[tr_en.intent == intent].copy()
        pool["has_slots"] = pool.annot.fillna("").str.contains(r"\[", regex=True)
        pool = pool.sort_values("has_slots", ascending=False).drop_duplicates("utt")
        picks.append(pool.head(want))
    src = pd.concat(picks).reset_index(drop=True)
    print(f"\ndrew {len(src):,} unique English rows")

    mt = Translator()
    utts = src.utt.astype(str).tolist()

    # Every distinct slot value, translated on its own so it can be located in
    # the translated sentence afterwards.
    values = sorted({v for a in src.annot.fillna("") for _, v in parse_slots(a)})
    print(f"{len(values):,} distinct slot values to translate\n")

    out_rows = []
    stats = {}
    for lang, code in (("sorani", "ckb_Arab"), ("badini", "kmr_Latn")):
        print(f"=== {lang} ({code}) ===", flush=True)
        tgt_utts = mt(utts, "eng_Latn", code, beams=4, label=lang)
        tgt_vals = mt(values, "eng_Latn", code, beams=4, label=f"{lang} slots") if values else []
        vmap = dict(zip(values, tgt_vals))

        # Back-translate for quality control. Greedy is fine here: we are
        # measuring drift, not producing text anyone will read.
        back = mt(tgt_utts, code, "eng_Latn", beams=1, label=f"{lang} back")

        kept = dropped_sim = dropped_form = slots_ok = slots_lost = 0
        for i, row in src.iterrows():
            sent = tgt_utts[i]
            if lang == "badini":
                sent = to_arabic(sent)
            sent = fix_orthography(sent)

            sim = similarity(row.utt, back[i])
            if sim < args.min_sim:
                dropped_sim += 1
                continue
            # A command that came back as a statement no longer matches its label.
            if _IMPERATIVE.match(str(row.utt).strip()) and not _IMPERATIVE.match(back[i].strip()):
                dropped_form += 1
                continue

            pairs = parse_slots(row.annot if pd.notna(row.annot) else "")
            tp = []
            for name, val in pairs:
                tv = vmap.get(val, "")
                if lang == "badini":
                    tv = to_arabic(tv)
                tp.append((name, fix_orthography(tv)))
            annot = build_annot(sent, tp)
            if annot is None:
                slots_lost += 1
                annot = sent  # keep for intent training, no spans
            elif pairs:
                slots_ok += 1

            out_rows.append({"language": lang, "partition": "train",
                             "intent": row.intent, "utt": sent, "annot": annot})
            kept += 1

        stats[lang] = (kept, dropped_sim, dropped_form, slots_ok, slots_lost)
        print(f"  kept {kept:,} / {len(src):,}  "
              f"(dropped {dropped_sim:,} on drift, {dropped_form:,} on lost command form)")
        print(f"  slots re-aligned {slots_ok:,}, lost {slots_lost:,}\n", flush=True)

    new = pd.DataFrame(out_rows)
    merged = pd.concat([df, new], ignore_index=True)
    merged.to_csv(args.out, index=False, encoding="utf-8")

    print("=" * 60)
    print(f"wrote {args.out}")
    print(f"  added {len(new):,} rows  ({len(df):,} -> {len(merged):,})")
    print("\nnew per-language train totals:")
    t = merged[merged.partition == "train"].language.value_counts()
    for l in ["en", "ar", "sorani", "badini"]:
        before = len(df[(df.partition == "train") & (df.language == l)])
        print(f"  {l:8} {before:>6,} -> {t.get(l,0):>6,}")


if __name__ == "__main__":
    main()
