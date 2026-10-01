# Deploying Ferman

The backend is a single container that serves the API **and** the web build
(`backend/static/`) on one port. It runs on any host that can run a Docker image with
~4 GB RAM (both models loaded) — Render, Fly.io, Railway, a VPS, Cloud Run, etc.

It needs:

- **A Postgres database** (optional but recommended) so accounts and collected
  data survive restarts. [Neon](https://neon.tech) has a free tier. Without
  `DATABASE_URL` the app falls back to a local SQLite file, which is lost when
  the container is replaced.
- **The models**, pulled from the Hugging Face Hub at startup
  (`OmarSY11/xlmr-intent-v2`, `OmarSY11/xlmr-slot-v2`). The repos must be public
  or you must provide a Hub token. Keeping them out of the image keeps it small.
  If neither is available the app runs on a small keyword parser.

## Build and run with Docker

```bash
docker build -t ferman .

docker run -p 7860:7860 \
  -e AUTH_SECRET="$(python -c 'import secrets;print(secrets.token_hex(32))')" \
  -e INTENT_REPO=OmarSY11/xlmr-intent-v2 \
  -e SLOT_REPO=OmarSY11/xlmr-slot-v2 \
  -e DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
  ferman
```

Open http://localhost:7860, and check `GET /health` returns `{"status":"ok"}`.
The container listens on `$PORT` (default `7860`), so platforms that inject
`PORT` work without changes.

## Web build

`backend/static/` is generated, not committed:

```bash
cd mobile && npm install && npx expo export -p web --output-dir ../backend/static
```

Do this before `docker build` if you want the web UI served by the container.

## Environment variables

See [.env.example](../.env.example) for the full list.

| Variable | Required | Purpose |
|---|---|---|
| `AUTH_SECRET` | **yes in production** | Signs login tokens. The app refuses to start in production (`DATABASE_URL` or `K_SERVICE` set) if this is missing or still the dev default. |
| `DATABASE_URL` | recommended | Postgres. Unset = local SQLite. |
| `INTENT_REPO` / `SLOT_REPO` | yes for real models | Hugging Face model repos. |
| `ALLOWED_ORIGINS` | no | Comma-separated origins allowed cross-origin. Production default is same-origin only; set it only if a native build calls the deployed URL. |
| `INTENT_MIN_CONFIDENCE` | no | Default `0.35`. Below this top-1 probability the intent is `null`. |
| `INTENT_MIN_MARGIN` | no | Default `0.10`. Minimum top-1 minus top-2 gap; catches out-of-domain input that the raw threshold lets through. |
| `FEEDBACK_KEY` | no | Enables `GET /feedback`. Send it in the `X-Admin-Key` header, not the query string. |

Rotating `AUTH_SECRET` invalidates every existing login token.

## Native builds

Native apps have no origin, so they need an absolute backend URL. Set
`EXPO_PUBLIC_API_BASE_URL` in `mobile/eas.json` (replace `YOUR-BACKEND-URL`)
and add that origin to `ALLOWED_ORIGINS` if needed. See [mobile/BUILD.md](../mobile/BUILD.md).

## Notes

- **Cold starts:** on scale-to-zero hosts the first request after idle waits
  ~15–30 s while the models load.
- **Retraining:** see [ml/README.md](../ml/README.md).
- **Exporting collected data:**
  `python ml/export_dataset.py --db-url "<postgres-url>" --out collected.csv`
  (no `--db-url` = local `app.db`).
