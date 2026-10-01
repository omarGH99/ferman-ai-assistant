# ml/ — training data, notebooks and evaluation

Everything here is about *making* the models. None of it is needed to run or
deploy the app: `.dockerignore` excludes this folder and `data/`, so the
container never sees them.

Files that live next to this README are scripts and notebooks; the data is in
[../data/](../data/) and measured results are in [results/](results/).

| File | What it is |
|---|---|
| `train_xlmr_intent_v2_runpod.ipynb` | Intent model training (RunPod-oriented). |
| `train_xlmr_slot_v2_runpod.ipynb` | Slot model training. Kept with its cell outputs — they are the record of what the run produced. |
| `eval_models.py` | Scores both deployed models on the held-out test split. Writes into `results/`. |
| `augment_kurdish.py`, `kurmanji_translit.py` | Generate v3: translate English into Sorani and Kurmanji, convert the latter to Arabic script. |
| `trim_glot500.py` | Shrinks the Glot500 model to the four languages served. |
| `export_dataset.py` | Pulls opt-in commands collected from real users out of the database, for the next training round. |
| `results/eval_results_v2.txt` | Measured results for the deployed v2 models, with a v1 comparison and hand-written analysis. |
| `results/eval_results_v1.txt` | Superseded. Describes the v1 models. |
| `results/eval_per_intent_v2.csv`, `results/eval_confusion_v2.csv` | Per-intent precision/recall/F1 (overall and per language) and the full confusion matrix. |

Data files (see [../data/DATASET_CARD.md](../data/DATASET_CARD.md)): `XLMR_dataset_4lang_v2.csv`
(27,445 rows, 34 intents, CC BY 4.0), `XLMR_dataset_4lang_v3.csv` (v2 plus
NLLB-translated Kurdish rows, train only, not yet trained on) and
`dataset_v2_report.txt` (what v2 changed).

## Evaluating the deployed models

```bash
pip install pandas scikit-learn seqeval      # not in requirements.txt — the container doesn't need them
python ml/eval_models.py
```

Defaults to the Hub repos that production uses (`OmarSY11/xlmr-intent-v2`,
`OmarSY11/xlmr-slot-v2`); override with `INTENT_REPO` / `SLOT_REPO` / `EVAL_CSV`.

Results for the deployed pair are in `results/eval_results_v2.txt` (overall intent
accuracy 0.832, macro-F1 0.790; Sorani is the weakest at 0.697, Arabic slot
extraction is unmeasured because the test split has no Arabic slot rows).

### What the per-intent results show

A re-run on 2026-10-01 reproduced the published figures exactly (intent
accuracy 0.8318, macro-F1 0.7900, slot F1 0.7687).

- **`general_quirky` is the weakest intent** (F1 0.62 overall, 0.00 in Sorani).
  It is a catch-all class for chit-chat and odd requests, so it is confused with
  `qa_factoid`, `news_query`, `calendar_query` and `cooking_recipe`. It accounts
  for four of the ten most common confusions.
- **Neighbouring intents blur**: `calendar_set` vs `calendar_query` (22),
  `transport_ticket` vs `transport_query` (17), `takeaway_query` vs
  `takeaway_order` (15), `calendar_set` vs `alarm_set` (15). These are
  semantically close and often differ by a single word.
- **Sorani is weakest where Kurdish training data was thinnest**:
  `calendar_query` F1 0.29, `qa_factoid` 0.33 — the same intents that
  `augment_kurdish.py` targets in v3.

Output of a re-run goes to `results/eval_results_latest.txt`, not `results/eval_results_v2.txt`,
so the hand-written analysis in the latter is never overwritten.

## Collecting more data

Users who turn on data collection in Settings contribute their commands, plus a
correction whenever they tap the right intent on an uncertain reply. Those
corrections are the only ground truth the app produces — the model's own
prediction is not a label.

```bash
python ml/export_dataset.py --db-url "<postgres-url>" --out collected.csv
```

The export separates three things: rows corrected to a real intent (training
labels), rows marked out-of-scope (for tuning the rejection thresholds in
`main.py`), and uncorrected rows (the model's guess, not usable as truth).
