# Scherzinger / Pryzm migration repo

Monorepo containing the new `frontend-v2/` (TypeScript / React 19 / Vite),
the `scherzinger-platform/` FastAPI backend, source data, persona docs, and
the docs that tie everything together.

**Current product vision** → [`docs/Frank_Vision_and_Workflow.md`](./docs/Frank_Vision_and_Workflow.md)
**End-to-end verification** → [`VERIFICATION_REPORT.md`](./VERIFICATION_REPORT.md)
**Docs index** → [`docs/README.md`](./docs/README.md)

## Layout

| Path | Purpose |
|---|---|
| `frontend-v2/` | React 19 + Vite app — Frank, Till, Heiko surfaces all live. |
| `scherzinger-platform/` | FastAPI + Postgres backend (BFF screens layer + actions). |
| `frontend/` | Legacy React app on the original demo server. Untouched by the migration. |
| `Data/` | Source spreadsheets ingested into Postgres. |
| `Persona/` | Value-Proposition Canvas docs for Till / Frank / Heiko. |
| `docs/` | Living documentation (vision, demo, verification, mockups) + `archive/` for historical plans/reports. |
| `reference/` | Vendor / external PDFs / DOCX / XLSX — verbatim source material, not living docs. |
| `docker-compose.dev.yml` | Local dev stack (Postgres + FastAPI + Vite). |
| `.github/workflows/ci.yml` | Lint, typecheck, unit + contract tests on every PR. |

## Quick start (local dev stack)

```bash
docker compose -f docker-compose.dev.yml up --build
```

After bring-up:

- Postgres → `localhost:5432` (`pryzm` / `pryzm_dev`)
- API → <http://localhost:8000> (`/docs`, `/health`)
- Frontend → <http://localhost:5173>

The frontend is launched with `VITE_ALLOW_MOCK_FALLBACK=1`, so any BFF
endpoint not yet implemented in Phase 1+ falls back to the bundled mock for
that path.

Tear down:

```bash
docker compose -f docker-compose.dev.yml down -v
```

## Running pieces standalone

```bash
# Frontend only
cd frontend-v2
npm install && npm run dev

# Backend only
cd scherzinger-platform
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn backend.main:app --reload
```

## Where to start

- New to the migration? Read `frontend-v2/MIGRATION_PLAN.md` end-to-end.
- Picking up a feature? See `frontend-v2/CONTRIBUTING.md`.
- Working on the BFF? See `scherzinger-platform/openapi/screens.yaml` and
  `scherzinger-platform/tests/contract/`.
