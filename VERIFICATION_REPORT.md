# Pryzm × Scherzinger — End-to-End Verification Report

**Date:** 2026-05-12
**Branch:** `demo-phase45`
**Pinned commit:** `81aa9a3` (Batch 23 fixes) on top of `fb9337c` (Batch 22 Bedrock Frankfurt)
**Stack under test:** FastAPI backend in Docker (`scherzinger_new-api-1`) + host-side Vite dev server (`pnpm dev` on port 5174) + Postgres in Docker (`scherzinger_new-postgres-1`)
**Method:** Live Playwright walk across every shipped surface, both as Frank (analyst) and the other two persona accounts (Till / MD, Heiko / Sales). One screenshot per surface saved to [`docs/verification-screens/`](./docs/verification-screens/). Every interaction logged in a TaskCreate task with status transitions.

---

## TL;DR

**13 surfaces walked, 13 PASS, 3 critical bugs fixed inline, 2 cosmetic notes for backlog.**

The full audit-trail chain — Frank clicks Share → Till sees the share in MD Overview → Frank's outbound Note carries the matching hash — was verified by round-tripping the audit hash **`1f93bb5801c0…`** across three separate UI surfaces.

| # | Surface | Result | Evidence |
|---|---|---|---|
| 1 | Login + Shell (top bar, side rail, right rail) | ✅ PASS | top-bar logo, search, persona tabs (Till/Heiko disabled for Frank by design), language, profile; left rail 7 menu items; right rail notifications + notes |
| 2 | Action Center | ✅ PASS | 12 blocks live: header, movable hero (€1.32M, 33 movable SKUs), waterfall, **5** decision cards each with Accept/Reject/Slice/Share, trust strip 4/4 live (80% / 1.01pp / 1,728 / 99.0%), lost-quote, SKU table, long-tail, A/B tracker, rejections, audit, branded report |
| 3 | Margin Cockpit | ✅ PASS | "Where the 3.9pp gap came from" waterfall with Movable-only toggle + classification pills (Mixed/Unintended), lost-quote differential, input cost vs price |
| 4 | Quotes & Guardrails | ✅ PASS | pipeline, funnel, **quote→invoice gap card** (Batch 12) rendering median/mean/n, active/analysis blocks |
| 5 | Forecasting | ✅ PASS | hero with **P50/P80/P95 bands** (Batch 13), per-cluster lens (BKAES/BKAGG/BKAIZ/SOPU), walk-forward, input cost, pareto, price floor, new product (24 SVG charts) |
| 6 | Pricing Studio | ✅ PASS | Article 200832-E workbench with floor + comparable picker |
| 7 | AI Briefing | ✅ PASS | Monday Briefing with 3 paragraphs, **4 article + 6 customer + 3 cluster citation chips**, 8 Sources rows |
| 8 | Reports (Phase 9) | ✅ PASS | Generate button → Print PDF + Regenerate appear after generation |
| 9 | Share to Till | ✅ PASS | Drawer with Till/Heiko radio cards, receipt panel returns audit_hash `1f93bb5801c09cf9`, notification_id, deep-link `/action-center?focus=rec-cost_riser:205345-A` |
| 10 | Till MD Overview | ✅ PASS | 4 drafts / 2 shared with me KPI, approval queue (4 rows), **share from Frank present**, **audit hash matches** P10 |
| 11 | Heiko Deal Inbox | ✅ PASS | quote→invoice gap KPI 1.9pp, lost-quote tile 1.9pp / 5.4pp / n=1,949 |
| 12 | Settings · Model Cards | ✅ PASS | "Show all 21" / "Show all 18" toggles → top-5 default + expand path |
| 13 | Notifications + Notes | ✅ PASS | Frank's outbound Note carries `audit_hash: 1f93bb5801c09cf9` + deep-link — matches the receipt and the MD overview |

---

## Pre-flight setup

The compose stack was already running but Vite inside the `frontend-v2` container chose port 5174 internally while the compose port mapping was `5173:5173` — nothing reached the host. The frontend container was stopped and a host-side `pnpm dev` was started on 5174, fed by an updated `frontend-v2/.env.local`:

```bash
VITE_SCHERZINGER_API=http://localhost:8000/api/v1   # was 127.0.0.1 → cookies cross-origin
```

The cookie origin had to match because the browser treats `localhost` and `127.0.0.1` as distinct origins for cookie scope.

---

## Critical bugs found and fixed inline

### Bug #1 — CORS allow-list too narrow (login broken end-to-end)

**Symptom:** From Playwright, posting `/auth/login` from `http://localhost:5174` returned no `Access-Control-Allow-Origin`. The browser blocked the preflight; Frank could not log in.

**Root cause:** `docker-compose.dev.yml` set `CORS_ORIGINS: "http://localhost:5173"` — single value, wrong port.

**Fix (commit `81aa9a3`):**
```yaml
CORS_ORIGINS: "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5174,http://127.0.0.1:5173"
```
Recreated the API container so `settings.cors_origins_list` picked it up.

**Verified:** preflight returns the allow-list; Frank login → cookie set → all subsequent `/api/v1/*` requests succeed.

---

### Bug #2 — Frank's role missing `act.share_decision` permission

**Symptom:** Click `↗ Share` on any Action Center decision card → nothing happens. No drawer, no toast. Console clean.

**Root cause:** Batch 18 added the `share_decision` action kind in the backend and the `ShareDecisionForm` in the frontend, *but never updated `scripts/seed_auth.py` to grant the new permission to the analyst role*. `DecisionCards.handleShare` calls `onAction({ requiredPermission: 'act.share_decision' })`; the permission gate swallowed the click silently.

**Fix (commit `81aa9a3`, file `scherzinger-platform/scripts/seed_auth.py`):**
```python
ROLES["analyst"]["permissions"] += ["act.share_decision"]
ROLES["admin"]["permissions"]   += ["act.share_decision"]
```
Re-seeded inside the running API container: `python -m scripts.seed_auth` → "Seeded 4 roles and 3 users."

**Verified:** Frank's `/auth/login` response now includes `act.share_decision`. Clicking Share opens the drawer with Till/Heiko radio cards (`data-testid=recipient-till` and `recipient-heiko`). Submitting to Till returns the audit-trail receipt with hash `1f93bb5801c09cf9`.

The file was force-added (`git add -f`) because the outer repo's `.gitignore` blocks the `scherzinger-platform/` tree by default; without that flag the fix would only live on disk.

---

### Bug #3 — Drawer fires Radix a11y error (`DialogContent` requires `DialogTitle`)

**Symptom:** Every time any drawer opened (share, A/B setup, snooze, partial-accept, queue-renewal), the console logged:
```
DialogContent requires a DialogTitle for the component to be accessible for screen reader users.
```

**Root cause:** `components/ui/Drawer.tsx` wraps `RadixDialog.Content` directly with `motion.aside`, never rendering a `Dialog.Title`. Forms inside the drawer have a visible `<h2>` heading but Radix's a11y check looks specifically for the `DialogTitle` primitive.

**Fix (commit `81aa9a3`):**
- `Drawer.tsx` now accepts a `title?: string` prop (defaults to `"Dialog"`) and renders a `sr-only` `Dialog.Title` inside `Dialog.Content` so screen readers announce the action and Radix stops complaining.
- `ActionFeedback.tsx` forwards `drawer?.title` (the drawer's visible label set by the caller) into the new prop, so the announcement matches the visible heading — e.g. "Share decision", "Start A/B test", "Partial accept".

**Verified:** No more a11y error in Playwright's console; 105/105 vitest + 38/38 backend contract tests still pass.

---

## Cosmetic / known-design backlog (not fixed inline)

### Note #1 — Direct URL navigation to non-default routes redirects to Frank's default

Hard-navigating to `/quotes`, `/margin`, `/forecasting`, `/md/overview`, `/settings/model-cards` (instead of clicking the side rail) lands on `/action-center` for Frank. This is the `personaRoutes` default-landing guard in `router.tsx` — each persona has a default route and the router enforces it on entry when the current path doesn't match the persona prefix. Side-rail clicks work flawlessly.

This is by design (each persona logs in to *their* landing), but it makes Playwright tests and bookmarks brittle. Two options for a future polish:
- Loosen the guard so direct hits to a permitted route stay.
- Show a "Switch to Till to view MD pages" CTA when a non-Till user hits `/md/*`.

### Note #2 — Recharts width(-1) warning

`recharts` logs `The width(-1) and height(-1) of chart should be greater than 0` six times during initial mount on Margin Cockpit (one per cluster mini-chart). Cosmetic — charts render correctly after one tick. Fix would be a `min-h-[N]` on the chart container so the SSR/initial render has a positive box.

---

## End-to-end audit-trail chain (the headline test)

This is the single most important behavioral guarantee in the demo: when Frank shares a decision, the same audit hash must appear in **three places**, and the deep-link must work.

| Step | Surface | Hash seen | Source |
|---|---|---|---|
| 1. Frank clicks Share on `cost_riser:205345-A` | Action Center → Share drawer | — | n/a |
| 2. Submit to Till | Receipt panel inside drawer | **`1f93bb5801c09cf9`** | `share-audit-hash` testid |
| 3. Till logs in, lands at `/md/overview` | Recent audit chain | **`1f93bb5801c0`** (first 12) | First `font-mono` row |
| 4. Till's "Shared with me" list | Share row | "Frank Keller shared: Article 205345-A unit cost +43.8% — pass-through pending" | matches drawer subtitle |
| 5. Frank logs back in, opens `/notes` | Sender note body | `audit_hash: 1f93bb5801c09cf9` + `link: /action-center?focus=rec-cost_riser:205345-A` | full hash in note body |

The hash is identical at every step (`1f93bb5801c09cf9` truncates to `1f93bb5801c0` for display). The notification id `64064d56-32a9-4513-8a51-d8404df168c7` written into Till's notification table is the same one the drawer's receipt panel shows.

---

## Architectural connectivity (what depends on what)

```
┌────────────────────────────────────────────────────────────────────┐
│  Frank logs in (seed_auth roles: analyst → permissions[12])        │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ Cookie-bound session
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  /screens/* fan-out                                                │
│  ├─ action-center → 12 blocks, model_registry (Phase 8) drives     │
│  │                  trust strip; falls back to legacy aggregate    │
│  │                  if registry missing (Batch 20 fix)             │
│  ├─ margin-cockpit → waterfall, classification (Batch 11), lost-Q  │
│  ├─ quotes → pipeline + gap card (Batch 12: median 1.9pp, n=1,949) │
│  ├─ forecast → P50/P80/P95 bands (Batch 13)                        │
│  ├─ studio → per-SKU recommendation contract                        │
│  └─ ai → memo with citations (Batch 17), provider=template|llm     │
│         |bedrock (Batches 21-22, EU-Frankfurt default)             │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  /actions endpoints                                                │
│  ├─ accept_recommendation → audit_log entry                        │
│  ├─ start_ab_test → ab_tests row + audit                          │
│  ├─ generate_report → report_jobs row + branded HTML artifact     │
│  └─ share_decision (Batch 18)                                      │
│       ├── Notification row (recipient: till|heiko, external_id    │
│       │    LIKE 'share:%')                                         │
│       ├── Note row (Frank's sender record with audit_hash in body) │
│       └── audit_log entry (kind=share_decision, hash chain)        │
└──────────────────────────┬─────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────────┐
│  Till's /md/overview reads:                                        │
│    - pricing_proposals (pending_approval, draft) → KPIs + queue   │
│    - Notification WHERE external_id LIKE 'share:%' → shares list   │
│    - audit_log last 10 rows → audit chain with hash prefixes      │
│                                                                    │
│  Heiko's /deal/inbox reads:                                        │
│    - Same shares filter for recipient=heiko                        │
│    - quote_invoice_links → lost-quote 1.9pp / 5.4pp / n=1,949     │
│    - recent recommendations → negotiation context                  │
└────────────────────────────────────────────────────────────────────┘
```

Every read uses the same ETag-aware GET. Every write goes through `actions.py` which hashes the audit-log chain. Frontend reads are mock-fallback-capable for offline demos but in this verification all data was live Postgres.

---

## Test suite state at end of verification

- **Frontend** (`frontend-v2`): `pnpm exec vitest run` → 34 files, **105 tests pass**, 0 fail
- **Backend** (`scherzinger-platform`): `pytest tests/contract/{test_auth,test_action_center,test_persona_overview,test_ai_briefing}.py -q` → **38 pass**, 0 fail (including the 3 Bedrock fallback tests from Batches 21–22 and the Till+Heiko persona overview tests from Batch 19)
- **TypeScript**: `pnpm exec tsc --noEmit` → clean

---

## What's running, where

| Component | Where | Port | Last restart |
|---|---|---|---|
| Postgres | docker (`scherzinger_new-postgres-1`) | 5432 | 2 hours pre-verification (volume-persisted data) |
| API (FastAPI + uvicorn `--reload`) | docker (`scherzinger_new-api-1`) | 8000 | Force-recreated during verification (Batch 23 fix #1) |
| Frontend (Vite) | host (`pnpm dev`) | 5174 | Started host-side after compose mapping mismatch |

To resume the demo from scratch in the morning:
```bash
# from repo root
docker compose -f docker-compose.dev.yml up -d
docker stop scherzinger_new-frontend-1   # let host vite own 5174
cd frontend-v2 && pnpm dev               # serves on http://localhost:5174
```

Login credentials (seeded):
- Frank Keller (analyst) — `frank@scherzinger.de` / `frank-demo-2026` → lands on `/action-center`
- Till Hoffmann (MD) — `till@scherzinger.de` / `till-demo-2026` → lands on `/md/overview`
- Heiko Müller (sales) — `heiko@scherzinger.de` / `heiko-demo-2026` → lands on `/deal/inbox`

To switch the AI memo to Bedrock-Frankfurt mid-demo:
```bash
docker exec scherzinger_new-api-1 sh -c 'export BRIEFING_PROVIDER=bedrock && export AWS_ACCESS_KEY_ID=… && export AWS_SECRET_ACCESS_KEY=…'
docker restart scherzinger_new-api-1
# defaults: eu-central-1 + eu.anthropic.claude-haiku-4-5-20251001-v1:0
```

---

## Verdict

**Demo-ready.** Every shipped surface renders live data, the share workflow round-trips audit hashes end-to-end across three personas, and the three critical bugs surfaced during the walk are fixed and committed. Two cosmetic items (direct-URL persona guard, recharts width warning) are tracked for the next polish pass but neither blocks a client demo.

— Generated 2026-05-12 02:35 CET
