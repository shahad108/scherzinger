# Pryzm × Scherzinger — Documentation

## Layout

| Path | What lives here |
|---|---|
| [`Frank_Vision_and_Workflow.md`](./Frank_Vision_and_Workflow.md) | Canonical product vision and the phase plan (§4.2) that Batches 1–22 executed against. The source of truth for **what** Pryzm builds for Frank. |
| [`PRODUCT_END_GOAL_AND_ROADMAP.md`](./PRODUCT_END_GOAL_AND_ROADMAP.md) | Product compass: final end-state, screen hierarchy, current-vs-missing gaps, locked future features, and roadmap from MVP to full product. |
| [`Demo_Claims_Defense.md`](./Demo_Claims_Defense.md) | Per-claim defensibility brief — every demo statement and the data row / formula behind it. |
| [`Investor_Demo_Script_7min.md`](./Investor_Demo_Script_7min.md) | The seven-minute walkthrough script (Encourage Ventures and similar). |
| [`mockups/`](./mockups/) | Standalone HTML mockups. `Pryzm_Dashboard_Mockup_Frank.html` is the canonical 2026 design reference; the older `Pryzm_Dashboard_Mockup.html` is kept for diffs. |
| [`verification-screens/`](./verification-screens/) | Full-page screenshots captured during the most recent end-to-end Playwright walk. Referenced by [`../VERIFICATION_REPORT.md`](../VERIFICATION_REPORT.md). |
| [`superpowers/`](./superpowers/) | Skill plans and specs that drove some of the larger phases. |
| [`archive/`](./archive/) | Historical artefacts kept for traceability but no longer load-bearing for the build. See breakdown below. |

## Archive index

Anything we touched once and superseded ends up in `docs/archive/`. **Read** these for context; **don't** treat them as current.

- [`archive/plans/`](./archive/plans/) — pre-vision phase plans (`AI_INSIGHTS_PLAN.md`, `FORECASTING_PLAN.md`, `phase_{1,2,3}_implementation_plan.md`, …). Superseded by `Frank_Vision_and_Workflow.md`.
- [`archive/reports/`](./archive/reports/) — older audit / health reports (`DASHBOARD_AUDIT_REPORT.md`). Superseded by `VERIFICATION_REPORT.md`.
- [`archive/analysis/`](./archive/analysis/) — competitor + deep-dive analyses captured during scoping.
- [`archive/mockups/`](./archive/mockups/) — old mockup-generation prompts.

## Where the rest lives

- **App code** — `frontend-v2/` (current React), `frontend/` (legacy demo build), `scherzinger-platform/` (FastAPI backend + Alembic + tests + seeds).
- **Data** — `Data/` (raw Scherzinger drops), `Persona/` (persona research artefacts).
- **Reference docs** — `reference/` at repo root holds the original vendor PDFs / DOCX / XLSX / TEX. They're verbatim source material, not living docs, so they sit outside `docs/`.
- **Secrets** — `*.pem` keys at repo root. Never commit additions; the existing ones are demo-only credentials.
- **Infra** — `docker-compose.dev.yml`, `supabase_schema.sql`.

## How to find the *current* answer to anything

| Question | Source |
|---|---|
| What did we just verify works? | [`../VERIFICATION_REPORT.md`](../VERIFICATION_REPORT.md) |
| What was the plan for phase N? | `Frank_Vision_and_Workflow.md` §4.2 |
| How is the audit-trail wired? | `VERIFICATION_REPORT.md` "Architectural connectivity" diagram |
| What credentials should I use? | `VERIFICATION_REPORT.md` "What's running, where" section |
| What's a demo claim grounded in? | `Demo_Claims_Defense.md` |
| What does the seven-minute demo cover? | `Investor_Demo_Script_7min.md` |
