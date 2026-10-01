"""Export opt-in collected commands to a CSV for review / retraining.

Reads the ``commands`` table written by auth.py (only rows for users who
consented ever exist there) and writes a CSV. User IDs are intentionally
dropped — the export is for model training, not for identifying people.

Works against either backend, matching auth.py:

    python ml/export_dataset.py                       # local SQLite app.db
    python ml/export_dataset.py --db-url "postgresql://...neon.tech/neondb?sslmode=require"
    DATABASE_URL=postgresql://... python ml/export_dataset.py # same thing

    python ml/export_dataset.py --out data.csv --db app.db    # explicit paths

Production runs on Neon (Postgres), so ``--db-url`` is the one that reaches the
data testers actually generated; the SQLite path only ever sees local dev.

The ``gold_intent`` column is the best available label: the user's correction
when they tapped to fix the prediction, otherwise the model's prediction. Rows
where ``corrected_intent`` is set are the only real ground truth here — the
model's own output is not a label — so they are counted separately at the end.

Out-of-scope rows
-----------------
When a tester taps "None of these", the app writes the sentinel ``__none__``
(``NONE_INTENT`` in the client) — the command is outside the 34 intents
entirely, e.g. the 26 dropped in v2. Those rows get ``out_of_scope=true`` and a
**blank** ``gold_intent``, so a training script that reads ``gold_intent`` can
never accidentally learn a class literally named ``__none__``.

They are deliberately not a training class. "Everything else" is unboundedly
diverse and would arrive with far too few examples to compete with classes
holding hundreds or thousands, so it would simply never be predicted. Their
value is measurement: they tell you how often the model confidently accepts
something it should have rejected, which is what lets INTENT_MIN_CONFIDENCE and
INTENT_MIN_MARGIN in main.py be tuned against real data rather than guessed.
Revisit making it a real class once there are a few hundred varied examples.
"""
import os
import csv
import argparse

HERE = os.path.dirname(os.path.abspath(__file__))
# The local dev database lives in backend/ (auth.py defaults to backend/app.db);
# the CSV it writes goes in data/ with the rest of the training data.
ROOT = os.path.join(os.path.dirname(HERE), "backend")

COLUMNS = ["text", "lang", "predicted_intent", "confidence", "corrected_intent",
           "created_at"]
QUERY = f"SELECT {', '.join(COLUMNS)} FROM commands ORDER BY id"


def fetch_sqlite(db_path):
    import sqlite3
    if not os.path.exists(db_path):
        raise SystemExit(f"Database not found: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(QUERY).fetchall()]
    finally:
        conn.close()


def fetch_postgres(db_url):
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        raise SystemExit("psycopg is required for --db-url. Try: pip install 'psycopg[binary]'")
    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        return conn.execute(QUERY).fetchall()


NONE_INTENT = "__none__"     # keep in sync with mobile/src/utils/constants.ts


def export(rows, out_path):
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(COLUMNS[:5] + ["gold_intent", "out_of_scope", "created_at"])
        for r in rows:
            oos = r["corrected_intent"] == NONE_INTENT
            # Blank rather than the sentinel: a training script filtering on
            # gold_intent then skips these by default instead of inventing a
            # class from them.
            gold = "" if oos else (r["corrected_intent"] or r["predicted_intent"])
            writer.writerow([r["text"], r["lang"], r["predicted_intent"],
                             r["confidence"], r["corrected_intent"], gold,
                             "true" if oos else "false", r["created_at"]])

    corrections = sum(1 for r in rows if r["corrected_intent"])
    oos_rows = sum(1 for r in rows if r["corrected_intent"] == NONE_INTENT)
    labelled = corrections - oos_rows
    print(f"Exported {len(rows)} commands to {out_path}")
    print(f"  {labelled} corrected to a real intent (ground-truth training labels)")
    print(f"  {oos_rows} marked out-of-scope (for tuning the rejection thresholds)")
    if rows and not corrections:
        print("  NOTE: no corrections at all — every label here is just the model's\n"
              "  own guess, which cannot be trained on without manual review.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("AUTH_DB", os.path.join(ROOT, "app.db")),
                    help="SQLite file (ignored when --db-url/DATABASE_URL is set)")
    ap.add_argument("--db-url", default=os.environ.get("DATABASE_URL", ""),
                    help="Postgres connection string, e.g. the Neon URL")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(HERE), "data", "collected_commands.csv"))
    args = ap.parse_args()

    if args.db_url.startswith("postgres"):
        print("Reading from Postgres…")
        rows = fetch_postgres(args.db_url)
    else:
        print(f"Reading from SQLite: {args.db}")
        rows = fetch_sqlite(args.db)
    export(rows, args.out)
