# -*- coding: utf-8 -*-
"""Evaluate the deployed intent + slot models on the held-out test set.

Points at the v2 models and the v2 dataset — i.e. what is actually deployed.
It previously read the v1 CSV and loaded `xlmr-intent`/`xlmr-slot` from local
folders that no longer exist, so it could not run at all, and the numbers in
eval_results_v1.txt describe models that were replaced.

    python ml/eval_models.py         # pulls the models from the Hugging Face Hub
    INTENT_REPO=... SLOT_REPO=... python ml/eval_models.py

Also writes, into ml/results/, eval_per_intent_v2.csv (precision/recall/F1 per intent, overall and
per language) and eval_confusion_v2.csv (full confusion matrix).

Needs: pandas, scikit-learn, seqeval (beyond requirements.txt).
"""
import os
import re
import pandas as pd
import torch
from transformers import (AutoTokenizer, AutoModelForSequenceClassification,
                          AutoModelForTokenClassification)
from sklearn.metrics import accuracy_score, f1_score, classification_report, confusion_matrix
from seqeval.metrics import precision_score as seq_p, recall_score as seq_r, f1_score as seq_f1

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
os.makedirs(RESULTS, exist_ok=True)
# Resolved against this file, not the shell's cwd, so `python ml/eval_models.py`
# works from the repo root as well as from inside ml/.
df = pd.read_csv(os.environ.get("EVAL_CSV", os.path.join(os.path.dirname(HERE), "data", "XLMR_dataset_4lang_v2.csv")))
test = df[df.partition == "test"].reset_index(drop=True)
out = []

# ---------------- INTENT ----------------
INTENT_REPO = os.environ.get("INTENT_REPO", "OmarSY11/xlmr-intent-v2")
SLOT_REPO = os.environ.get("SLOT_REPO", "OmarSY11/xlmr-slot-v2")

it_tok = AutoTokenizer.from_pretrained(INTENT_REPO)
it = AutoModelForSequenceClassification.from_pretrained(INTENT_REPO).eval()
lab2id = it.config.label2id

def batched(texts, bs=64):
    for i in range(0, len(texts), bs):
        yield texts[i:i+bs]

texts = test.utt.astype(str).tolist()
gold = [lab2id.get(x, -1) for x in test.intent]
preds = []
with torch.no_grad():
    for b in batched(texts):
        enc = it_tok(b, return_tensors="pt", truncation=True, max_length=64, padding=True)
        preds.extend(it(**enc).logits.argmax(-1).tolist())
test = test.assign(pred=preds, gold=gold)
out.append(f"=== INTENT ({INTENT_REPO}) ===")
out.append(f"overall accuracy: {accuracy_score(test.gold, test.pred):.4f}")
out.append(f"overall macro-F1: {f1_score(test.gold, test.pred, average='macro'):.4f}")
for lang in ["en", "ar", "sorani", "badini"]:
    g = test[test.language == lang]
    out.append(f"  {lang:7s} n={len(g):4d} acc={accuracy_score(g.gold, g.pred):.4f} f1={f1_score(g.gold, g.pred, average='macro'):.4f}")

# Per-intent breakdown and confusion matrix, written next to this script.
# The headline accuracy hides which intents fail; these show it.
id2lab = {v: k for k, v in lab2id.items()}
labels = sorted(id2lab)
names = [id2lab[i] for i in labels]
rows = []
for scope, g in [("all", test)] + [(l, test[test.language == l]) for l in ["en", "ar", "sorani", "badini"]]:
    rep = classification_report(g.gold, g.pred, labels=labels, target_names=names,
                                output_dict=True, zero_division=0)
    for n in names:
        r = rep[n]
        rows.append({"scope": scope, "intent": n, "precision": round(r["precision"], 4),
                     "recall": round(r["recall"], 4), "f1": round(r["f1-score"], 4),
                     "support": int(r["support"])})
pd.DataFrame(rows).to_csv(os.path.join(RESULTS, "eval_per_intent_v2.csv"), index=False)
cm = confusion_matrix(test.gold, test.pred, labels=labels)
pd.DataFrame(cm, index=names, columns=names).to_csv(os.path.join(RESULTS, "eval_confusion_v2.csv"))
off = [(cm[i, j], names[i], names[j]) for i in range(len(names)) for j in range(len(names)) if i != j and cm[i, j]]
out.append("\nmost common confusions (count, true -> predicted):")
for c, a, b in sorted(off, reverse=True)[:10]:
    out.append(f"  {c:4d}  {a} -> {b}")

# ---------------- SLOT ----------------
sl_tok = AutoTokenizer.from_pretrained(SLOT_REPO)
sl = AutoModelForTokenClassification.from_pretrained(SLOT_REPO).eval()
id2 = sl.config.id2label
_PAT = re.compile(r"\[([^:\]]+):([^\]]+)\]")

def parse_annot(annot):
    toks, tags, last = [], [], 0
    for m in _PAT.finditer(annot):
        for w in annot[last:m.start()].split():
            toks.append(w); tags.append("O")
        slot = m.group(1).strip()
        for i, w in enumerate(m.group(2).strip().split()):
            toks.append(w); tags.append(("B-" if i == 0 else "I-") + slot)
        last = m.end()
    for w in annot[last:].split():
        toks.append(w); tags.append("O")
    return toks, tags

# Arabic is absent by necessity, not by choice: of 11,097 Arabic rows only 304
# carry slot annotations and every one of them is in the *train* split, so there
# is nothing to score against. That is worth knowing rather than hiding — it
# means production Arabic slot extraction is both barely trained and entirely
# unmeasured. Reported explicitly below instead of just missing from the table.
SLOT_LANGS = ["en", "sorani", "badini"]
slot_test = test[(test.language.isin(SLOT_LANGS)) & (test.annot.notna())]
recs = []
for _, r in slot_test.iterrows():
    toks, tags = parse_annot(r.annot)
    if toks:
        recs.append((r.language, toks, tags))

def predict_tags(tokens):
    enc = sl_tok([tokens], return_tensors="pt", truncation=True, max_length=64, is_split_into_words=True)
    with torch.no_grad():
        ids = sl(**enc).logits.argmax(-1)[0].tolist()
    wids = enc.word_ids(0)
    prev, res = None, []
    for pos, wid in enumerate(wids):
        if wid is None or wid == prev:
            prev = wid; continue
        prev = wid
        res.append(id2[ids[pos]])
    # pad/truncate to len(tokens)
    if len(res) < len(tokens):
        res += ["O"] * (len(tokens) - len(res))
    return res[:len(tokens)]

true_all, pred_all, langs = [], [], []
for lang, toks, tags in recs:
    p = predict_tags(toks)
    true_all.append(tags); pred_all.append(p); langs.append(lang)

out.append(f"\n=== SLOT ({SLOT_REPO}, entity-level seqeval) ===")
out.append(f"overall  P={seq_p(true_all,pred_all):.4f} R={seq_r(true_all,pred_all):.4f} F1={seq_f1(true_all,pred_all):.4f}")
for lang in SLOT_LANGS:
    idx = [i for i, l in enumerate(langs) if l == lang]
    t = [true_all[i] for i in idx]; pr = [pred_all[i] for i in idx]
    out.append(f"  {lang:7s} n={len(idx):4d} P={seq_p(t,pr):.4f} R={seq_r(t,pr):.4f} F1={seq_f1(t,pr):.4f}")
out.append("  ar      n=   0  no Arabic slot rows in the test split (all 304 are in train)")

# Next to this script, not in whatever directory it was launched from.
# Not eval_results_v2.txt: that file carries hand-written analysis a re-run
# would erase. Copy numbers across deliberately.
dest = os.path.join(RESULTS, "eval_results_latest.txt")
open(dest, "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
print(f"\nwritten {dest}")
