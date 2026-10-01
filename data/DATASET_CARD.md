# Dataset card — XLMR_dataset_4lang

Intent classification and slot filling data for voice/text assistant commands
in **English, Arabic, Sorani Kurdish and Badini Kurdish** (Arabic script).

## Files

| File | Rows | Notes |
|---|---:|---|
| `XLMR_dataset_4lang_v2.csv` | 27,445 | Cleaned release. Trained and evaluated the deployed v2 models. |
| `XLMR_dataset_4lang_v3.csv` | 31,829 | v2 plus machine-translated Kurdish rows (see below). **No model has been trained or evaluated on v3 yet.** |

Columns: `language` (`en`/`ar`/`sorani`/`badini`), `partition`
(`train`/`validation`/`test`), `intent`, `utt` (the utterance), `annot` (the
utterance with inline slots, `[slot : value]`; empty when there are no slot
annotations).

## Composition (v2)

| Language | train | validation | test | rows with slot annotation |
|---|---:|---:|---:|---:|
| English | 7,753 | 1,390 | 1,954 | 11,097 |
| Arabic | 7,753 | 1,390 | 1,954 | 304 |
| Sorani | 2,065 | 191 | 370 | 2,626 |
| Badini | 2,064 | 191 | 370 | 2,625 |

34 intents across alarms, calendar, lists, news, weather, QA, email, transport,
takeaway, recommendations, cooking, date/time and general chat. Per-intent
counts are in `dataset_v2_report.txt`, which also records the 26 intents and
15,096 rows dropped from v1 and why.

## How it was built

- **Source:** the English and Arabic rows (and the intent label set, slot syntax
  and train/validation/test split) come from **MASSIVE** (FitzGerald et al.,
  2022; Amazon; CC BY 4.0). This dataset is a **modified derivative**: intents
  out of scope for this app (smart-home, music, volume) were removed, junk rows
  dropped and spelling fixed (see `dataset_v2_report.txt`).
- **Sorani and Badini are not in MASSIVE.** They were added by the author using
  machine translation of the English rows. This applies to the Kurdish rows in
  v2 as well as v3. The author, a native Badini speaker and a non-native Sorani
  speaker, informally reviewed the Sorani and Badini rows and judged them good.
  This is **not** an independent verification: there was no second annotator,
  no agreement measurement, and the Sorani review was by a non-native speaker.
- **v3 augmentation** (`ml/augment_kurdish.py`): Kurdish intents were very
  unevenly covered (e.g. `calendar_set` had 806 English rows but 19 Sorani).
  v3 adds more NLLB-200 translations (`facebook/nllb-200-distilled-600M`):
  English → Sorani (`ckb_Arab`) and English → Kurmanji (`kmr_Latn`), the latter
  transliterated into Arabic script by `ml/kurmanji_translit.py` to stand in for
  Badini. Translations are round-tripped back to English and dropped if they
  drift too far; slot values must be found in the translated sentence or the
  row keeps its intent label without annotation. Added rows are only in `train`
  (+2,249 Badini, +2,135 Sorani); validation and test are unchanged from v2.

## Known limitations

- **Machine-translated Kurdish** has only an informal review by its author
  (native Badini, non-native Sorani); a native Sorani speaker has not checked
  it. It may contain
  unnatural phrasing, and the Kurmanji→Arabic-script conversion is a stand-in
  for real Badini, not a native-speaker rendering. There is no marker column
  distinguishing translated from original rows; they are the rows in v3 that
  are not in v2.
- **Small Kurdish evaluation sets:** 370 test rows per dialect (vs 1,954 for
  English/Arabic), so Kurdish scores have wide confidence intervals.
- **Arabic slots are essentially absent:** 304 annotated rows, all in train,
  none in test. Arabic slot extraction cannot be evaluated with this data.
- **Class imbalance:** intents range from 24 (`cooking_query`) to 2,497
  (`weather_query`) rows, and the Kurdish distribution is more skewed than
  English.
- Dialect coverage: Sorani and Badini only. Other varieties (Kurmanji in Latin
  script, Gorani, Iraqi Arabic dialect variation beyond what the Arabic rows
  contain) are not covered.
- Text is not personal data, but data collected from app users (via
  `ml/export_dataset.py`) is opt-in and is **not** included in these files; neither CSV contains any user-collected data.

## Baseline results

Measured on the v2 test split (see [`ml/results/eval_results_v2.txt`](../ml/results/eval_results_v2.txt)):

| Language | Intent accuracy | Intent macro-F1 | Slot F1 |
|---|---:|---:|---:|
| English | 0.887 | 0.847 | 0.816 |
| Arabic | 0.823 | 0.761 | n/a |
| Badini | 0.719 | 0.682 | 0.623 |
| Sorani | 0.697 | 0.647 | 0.643 |

## License and citation

CC BY 4.0, matching MASSIVE's license. **If you use this dataset you must also
credit MASSIVE.** Changes from the original are described above.

```bibtex
@misc{fitzgerald2022massive,
  title  = {MASSIVE: A 1M-Example Multilingual Natural Language Understanding
            Dataset with 51 Typologically-Diverse Languages},
  author = {FitzGerald, Jack and others},
  year   = {2022},
  eprint = {2204.08582},
  archivePrefix = {arXiv}
}
```

Please also cite this repository (see the root README).
