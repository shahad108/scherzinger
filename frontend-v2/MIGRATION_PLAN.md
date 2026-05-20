# Frontend-v2 ↔ Backend Migration Plan

**Repository:** `/Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2`
**Backend:** `/Users/dharmendersingh/Documents/Scherzinger_new/scherzinger-platform`
**Personas:** `/Users/dharmendersingh/Documents/Scherzinger_new/Persona`
**Source data:** `/Users/dharmendersingh/Documents/Scherzinger_new/Data`
**Author audience:** Claude (code agent) — every section is written so an LLM can pick up a task without further context.
**Last revised:** May 2026

---

## 0. How to read this plan

1. The plan is **phase-ordered**. Phases are ordered so each one only depends on phases above it. Inside a phase, tasks are numbered `P{phase}.T{task}`. Each task lists prerequisites, deliverables, files touched, and verification.
2. The plan is **screen-aware**. Section 12 ("Per-screen migration playbooks") repeats one section per screen with the exact field-by-field wiring. When working on a screen, read its playbook section first, then the relevant phase tasks.
3. **No source code is included anywhere.** The plan describes contracts, endpoint shapes, semantics, and acceptance criteria. The implementer (Claude) is responsible for translating each task into code consistent with the stack already in `frontend-v2`.
4. **Mocks are the source of truth for shape.** Until a real endpoint ships, the JSON files in `frontend-v2/src/data/mocks/*.json` define what the backend must eventually return. Backend work does NOT change the shape; it produces the same shape from real data.
5. The plan assumes the **Frank persona screens are visually finished** (they are). The work is wiring data and adding persona/auth/RBAC plumbing, not redesigning UI.

---

## 1. Executive summary (read this first, then skip)

The new frontend (`frontend-v2`) is a TypeScript / React 19 / Vite / TanStack Query / Zustand / Tailwind 4 application. Six routes are wired (`/action-center`, `/margin`, `/quotes`, `/forecasting`, `/pricing`, `/ai`) plus a Shell with a left Sidebar (nav + persona-aware user card) and a right RightRail (notifications, reviewers, sections). All data is loaded today through one client function — `apiFetch(path)` in `src/lib/api/client.ts` — which reads JSON files from `src/data/mocks/` whenever the env variable `VITE_SCHERZINGER_API` is unset. When that env variable IS set, the same function performs `fetch(`${VITE_SCHERZINGER_API}${path}`, { credentials: 'include' })`. **This is the migration seam.** The entire migration boils down to producing real HTTP endpoints whose JSON bodies match the existing mocks — then setting `VITE_SCHERZINGER_API`.

The existing backend (`scherzinger-platform`) is a FastAPI service with Postgres. It already exposes granular analytics endpoints (e.g. `/api/v1/margins/by-year`, `/api/v1/quotes/win-rate-by-customer`, `/api/v1/forecasts/{entity}/{id}`). It does NOT yet expose the **screen-level aggregator endpoints** the new frontend expects (`/action-center`, `/margin-cockpit`, `/quotes`, `/forecast`, `/studio`, `/ai`, `/shell`, `/action-cards`). The bulk of the work on the backend side is therefore building a thin **BFF layer** ("Backend-for-Frontend") that composes the existing services into the screen shells the frontend already renders.

The frontend has three personas — Frank (Pricing Analyst), Till (MD), Heiko (Sales) — but only Frank's pages are implemented. Till and Heiko's PersonaSwitcher buttons currently send the user out to the old `/demo/#?persona=` URL. The plan addresses this: Till and Heiko's screens are forks/extensions of Frank's existing screens with persona-specific filters, copy, and action sets. The plan also adds auth, persistence of analyst actions (Accept / Decline / A-B test), an audit-trail store, a real notifications/reviewers feed, and a settings page.

A reasonable engineering team can complete this migration in **15 phases over ~10–14 calendar weeks** (rough order; not a Gantt chart). The plan is sized so each phase ends in a demoable, deployable state.

---

## 2. Current state inventory

### 2.1 Frontend-v2 inventory

#### 2.1.1 Routes (`src/app/router.tsx`)

| Route | Component | Mock file | Hook | Notes |
|---|---|---|---|---|
| `/` | Redirect → `/action-center` | — | — | Default entry. |
| `/action-center` | `features/action-center/index.tsx` | `action-center.json` | `useActionCenter` → `/action-center` | Frank's home (analyst cockpit). |
| `/forecasting` | `features/forecasting/index.tsx` | `forecast.json` | `useForecast` → `/forecast` | 12-month walk-forward, clusters, pareto. |
| `/pricing` | `features/pricing-studio/index.tsx` | `studio.json` | `useStudio` → `/studio` | SKU pricing workbench; client enriches via `data/api/studio-workbench.ts`. |
| `/margin` | `features/margin-cockpit/index.tsx` | `margin-cockpit.json` | `useMarginCockpit` → `/margin-cockpit` | Diagnostics, waterfall, lost-quote, cost-vs-price, 5-tab analysis. |
| `/quotes` | `features/quotes/index.tsx` | `quotes.json` | `useQuotes` → `/quotes` | Pipeline, escalations, funnel, guardrails, active-quotes table, rep/sku/customer tabs. |
| `/ai` | `features/ai-briefing/index.tsx` | `ai.json` | `useAi` → `/ai` | Monday memo + 3 side cards. |
| `/settings` | **MISSING** | — | — | Linked from Sidebar but no page exists. |

Additional cross-cutting hooks:

| Hook | Endpoint | Purpose |
|---|---|---|
| `useShell` | `/shell` | Right-rail data: notifications, reviewers, sections. |
| `useActionCards` | `/action-cards` | Currently unused by any rendered page; legacy from action-card list view. Decide in P12.T6 whether to remove or repurpose. |

#### 2.1.2 Layout / Shell

`src/app/layout/`:

- **`Shell.tsx`** — wraps `<TopBar/>`, `<Sidebar/>`, `<Outlet/>`, `<RightRail/>`. Reads collapse flags from `useUiStore` (zustand+persist).
- **`TopBar.tsx`** — logo, search (`TopBarSearch.tsx`), Add-person pill, Notifications pill, More icon, `<PersonaSwitcher/>`, language pill (static), date pill, Create CTA. Most are static placeholders.
- **`Sidebar.tsx`** — primary nav (6 items + Settings), divider, `<SidebarDeptList/>`, `<SidebarDataStatus/>`, `<SidebarUserCard/>`. Currently the user card is hard-coded "Frank Keller / frank@scherzinger.de".
- **`SidebarDataStatus.tsx`** — static "Data fresh · Last sync 8 min ago" + "My saved views" placeholder.
- **`PersonaSwitcher.tsx`** — three tabs: `frank` (in-app), `till` (external `/demo/#?persona=md`), `heiko` (external `/demo/#?persona=sr`). Frank is the only one served by frontend-v2 today.
- **`RightRail.tsx`** — reads `useShell()`. Renders notifications card, assigned reviewers, sections list. The "See all notifications", "Notes", "Add" buttons are non-functional today.

#### 2.1.3 State / providers

- **`Providers.tsx`** — `QueryClient` (staleTime 30s, retry 1), `<TooltipProvider/>`, sets `<html lang="de">`. i18n is initialised on import.
- **`stores/personaStore.ts`** — `persona: 'frank' | 'till' | 'heiko'` persisted under key `pryzm-v2-persona`.
- **`stores/uiStore.ts`** — `density`, `sidebarCollapsed`, `rightRailCollapsed`, persisted under key `pryzm-v2-ui`.
- **`hooks/useDensity.ts`** — toggles a class/data attribute based on `uiStore.density`.

#### 2.1.4 Types (`src/types/`)

- `index.ts` — Persona, Density, Severity, Tone, KpiData, ActionCard, **all** Action Center and Margin Cockpit shapes (aggregated as `ActionCenterData` and `MarginCockpitData`).
- `ai.ts` — `AiShell` (header, memo, sideCards[], crossLinks[]).
- `forecast.ts` — `ForecastShell` (header, hero, clusters, walkForward, inputCost, pareto, priceFloor, newProduct).
- `quotes.ts` — `QuotesShell` (header, briefing, pipeline, changed, escalations, funnel, guardrails, active, analysis, crossLinks).
- `studio.ts` — `StudioShell` (header, filters, toggles, skus[], defaultAid, workbench, comparable, crossLinks); `WorkbenchPatch` drives the per-SKU enrichment in `data/api/studio-workbench.ts`.
- `shell.ts` — `ShellRailData`.

#### 2.1.5 Data plumbing

- **`lib/api/client.ts`** — single `apiFetch<T>(path)`; mock-vs-API switch is `!import.meta.env.VITE_SCHERZINGER_API`. Mock keys are produced by stripping the leading slash and replacing remaining slashes with hyphens (`/action-center` → `action-center.json`, `/margin-cockpit` → `margin-cockpit.json`).
- **`lib/api/queryKeys.ts`** — typed query-key factory `qk` (only some hooks use it; others inline their keys).
- React Query options across hooks: `staleTime: 60_000`. None of them use `select`/`enabled`/`refetchInterval` today — change as needed in later phases.

#### 2.1.6 i18n status

- `i18n/de.json` and `i18n/en.json` only contain the **nav labels** and a few common strings.
- Page bodies are hard-coded in mock JSON, mostly German with mixed English. The mock memos contain raw HTML strings rendered via `dangerouslySetInnerHTML`. Treat them as already-translated server output for Phase 1; full i18n is deferred to Phase 13.

#### 2.1.7 Tests

`src/tests/` covers `Shell`, `Sidebar`, `RightRail`, `TopBar`, parts of `margin-cockpit`, and a `smoke.test.tsx`. Each phase below references which tests must continue to pass and which new tests must be added.

### 2.2 Backend inventory

#### 2.2.1 Tech & layout

FastAPI 0.109 + SQLAlchemy 2.0 + Postgres (psycopg2). Layout under `scherzinger-platform/backend/`:

- `main.py` — FastAPI app, CORS `*`, mounts ten v1 routers.
- `database.py` — engine + `get_db()` dependency.
- `config.py` — env config (DATABASE_URL etc.).
- `api/v1/` — `stats`, `margins`, `quotes`, `quality`, `forecasts`, `risk`, `costs`, `benchmarks`, `simulations`, `dashboard`.
- `services/` — pure SQL services, one per analytical area.
- `schemas/` — pydantic models for forecasts, margins, quotes, quality, risk.
- `models/` — SQLAlchemy ORM (customers, products, invoices, quotes, quote_invoice_links, rejection_codes, plus phase-2 models: forecast, monte_carlo, seasonal, benchmark, risk_score, backtest, cost_trend, linkage).
- `tests/` — pytest suite (data integrity, margin/quote/forecast/risk services, API smoke, monte carlo, backtests, seasonal, costs, benchmarks).

#### 2.2.2 Existing endpoints

| Group | Path | Returns |
|---|---|---|
| stats | `GET /api/v1/stats` | counts + date_range. |
| margins | `GET /api/v1/margins/summary` | totals, db1/db2 weighted/avg. |
| margins | `GET /api/v1/margins/by-year` | per-year aggregates. |
| margins | `GET /api/v1/margins/by-customer` | top-N revenue + db2. |
| margins | `GET /api/v1/margins/by-product` | top-N + commodity_group. |
| margins | `GET /api/v1/margins/by-commodity-group` | per-WG. |
| margins | `GET /api/v1/margins/gap-analysis` | quoted vs actual margin per year. |
| margins | `GET /api/v1/margins/catalog-vs-quoted` | counts + revenue. |
| margins | `GET /api/v1/margins/trend?granularity=monthly\|quarterly` | trend rows. |
| quotes | `GET /api/v1/quotes/summary` | aggregate. |
| quotes | `GET /api/v1/quotes/win-rate-by-{year,deal-size,customer}` | tables. |
| quotes | `GET /api/v1/quotes/rejection-codes` | rejection codes by revenue lost. |
| quotes | `GET /api/v1/quotes/price-sensitivity` | won vs lost margin distribution. |
| quotes | `GET /api/v1/quotes/conversion-timing` | days quote→invoice. |
| forecasts | `GET /api/v1/forecasts/accuracy` and `/accuracy/{model_type}` | mape/rmse panels. |
| forecasts | `GET /api/v1/forecasts/{entity_type}/{entity_id}` | per-entity forecast horizon. |
| forecasts | `GET /api/v1/forecasts/{entity_type}/{entity_id}/compare` | model comparison. |
| risk | `GET /api/v1/risk/{scores,scores/{cust},distribution}` | churn / risk model. |
| costs | `GET /api/v1/costs/{trends,risers,seasonal}` | input cost. |
| benchmarks | `GET /api/v1/benchmarks{,/{group},/compare/{type}/{id}}` | cluster benchmarks. |
| data-quality | `GET /api/v1/data-quality/{summary,issues,completeness}` | DQ panels. |
| simulations | `GET /api/v1/simulations/{entity_type}/{entity_id}` | monte carlo runs. |
| dashboard | `GET /api/v1/dashboard/summary` | composite for OLD frontend. |

**None of the existing endpoints match the frontend-v2 paths.** Frontend-v2 expects `/action-center`, `/margin-cockpit`, `/quotes`, `/forecast`, `/studio`, `/ai`, `/shell`, `/action-cards` — all of which are screen-shaped composites. Building those is the BFF work in Phase 1.

#### 2.2.3 Database schema (existing)

`customers`, `products`, `invoices`, `quotes`, `quote_invoice_links`, `rejection_codes` plus phase-2 tables (forecasts, backtests, risk_scores, benchmarks, monte_carlo, seasonal, cost_trend, linkage). German→English column dictionary is in `scherzinger-platform/docs/data_dictionary.md`. Margins are stored as decimals (0.709 = 70.9 %).

Supabase chat schema (`/Users/dharmendersingh/Documents/Scherzinger_new/supabase_schema.sql`) defines `chat_conversations`, `chat_messages`, `login_sessions`, `user_activity`. It is NOT integrated into the Postgres backend. Decide in Phase 2 whether to keep two stores or fold it into the main DB.

### 2.3 Persona inventory (`Persona/20260505_PRYZM_Value_Proposition_Canvas_EN.docx`)

| Persona | Role | Use-case pillar | Default screen | Posture | Frequency |
|---|---|---|---|---|---|
| **Till** | Managing Director / CFO | **Margin Radar** | Board-level summary, monthly/quarterly views, ROI, GDPR | Buyer + sponsor; signs the cheque | weekly–quarterly |
| **Frank** | Pricing Analyst / Head of Controlling | **Predictive Portfolio Pricing** | Analyst Cockpit (`/action-center`) | Power user; recommends up to Till, sideways to Heiko | daily–weekly |
| **Heiko** | Head of Sales / KAM | **Deal Empowerment** | Mobile deal calculator + lost-deal analytics | Field user; veto on adoption | daily |

Key persona-driven UI contracts (the plan references these by ID later):

- **TILL-1** Audit-readiness on every metric, hash-signed exports.
- **TILL-2** "Strategic vs unintended" classification on every margin tile.
- **TILL-3** GDPR / EU-hosted hygiene (header chip + settings page).
- **TILL-4** ROI-in-euros tile and quarterly board-pack export.
- **FRANK-1** Cluster confidence on every recommendation; per-cluster, not aggregate.
- **FRANK-2** Movable-vs-locked split on every revenue/leakage figure.
- **FRANK-3** A/B test workflow as first-class feature.
- **FRANK-4** Audit trail + author on every change.
- **FRANK-5** Long-tail (B/C) coverage; relevance filter "hide locked".
- **HEIKO-1** Mobile-first responsive layouts (≤ 414 px).
- **HEIKO-2** Deal calculator < 30-second TTI from cold.
- **HEIKO-3** Negotiation arguments + commission preview per quote.
- **HEIKO-4** Lost-deal analytics with reasons, not flags.
- **HEIKO-5** Recommendation, not directive — Heiko always decides.

### 2.4 Source data inventory

`/Users/dharmendersingh/Documents/Scherzinger_new/Data/`:

- `Deckungsbeitragsliste_2.xlsx` — invoice/contribution-margin extract (5 565 rows). Already loaded into Postgres `invoices`.
- `Angebotsstatistik_3.xlsx` — quote statistics (4 539 rows after dedup). Loaded into `quotes`.
- `Quotation code interpretation (Angebotsstatistik).xlsx` — 15 rejection-code rows. Loaded into `rejection_codes`.
- Per-SKU spec docs (e.g. `Electric Gear Pump - 200940.docx`) — used only for demo / qualitative content. Not loaded into DB. Optional source for Pricing Studio "spec sheet" tile in a later phase.

`/Users/dharmendersingh/Documents/Scherzinger_new/scherzinger-platform/scripts/`:

- `load_data.py`, `clean_data.py`, `link_quotes_invoices.py`, `compute_*.py`, `run_phase2.py`, `run_backtests.py`, `run_monte_carlo.py`, `start.sh` — keep these as the data pipeline.

---

## 3. Target state (definition of done)

When the migration is complete:

1. Setting `VITE_SCHERZINGER_API=https://api.<env>.pryzm.de/api/v1` and removing the bundled mocks produces a fully functional frontend-v2.
2. `apiFetch` continues to be the **only** transport used by feature code. No component fetches directly.
3. All six existing screens render server-driven data for Frank, persona-aware data for Till and Heiko, with full loading and error handling.
4. The PersonaSwitcher cycles three personas **inside** frontend-v2 — no external `/demo/` redirects.
5. Every action a persona can take (Accept, Decline, Counter, A/B-test, Approve at floor, Forward, etc.) is persisted in `audit_log` and visible in the Audit Trail block on Action Center.
6. Authentication is in place; the Sidebar user card and permissions reflect the logged-in user (Frank, Till, or Heiko-style sales rep).
7. RBAC: Frank cannot approve at MD-level; Till sees Frank/Heiko outputs with read+approve only; Heiko cannot edit guardrails; Sales reps see only their own quotes.
8. The right-rail Notifications, Reviewers, and Sections widgets display real data tied to the user.
9. Every endpoint has an OpenAPI definition and a contract test against the canonical mock JSON.
10. End-to-end tests exist for: login, route navigation per persona, Accept→Audit, A-B test create, briefing PDF generation, cross-link round-trip.
11. Observability: every request carries a `x-pryzm-trace-id`; backend emits structured JSON logs; frontend ships errors to Sentry (or equivalent).
12. CI runs unit + contract + smoke E2E on every PR; production deploys are blue/green with a 30-second readiness gate.

---

## 4. Cross-cutting architecture decisions

The following decisions apply to every screen and most endpoints. Read them once.

### 4.1 BFF pattern

Frontend-v2 expects **screen-shaped composites** (`/action-center`, `/margin-cockpit`, …). The existing backend exposes **analytical primitives** (`/margins/by-year`, `/forecasts/{type}/{id}`, …). The plan introduces a thin **BFF layer** in the existing FastAPI app:

- New router prefix `/api/v1/screens/` (e.g. `GET /api/v1/screens/action-center`).
- Each screen endpoint composes calls to existing services (`margin_service`, `quote_service`, `forecast_service`, …) and shapes them into the `*Data`/`*Shell` types from `frontend-v2/src/types`.
- Composites read query params: `persona`, `week`, `period`, `cluster`, `family`, `tier`, `customer_id`, `article_id`, `lang` (de|en), `density`. Defaults match Frank's mocks.
- Setting `VITE_SCHERZINGER_API=https://…/api/v1/screens` makes `apiFetch('/action-center')` resolve to `https://…/api/v1/screens/action-center`. No frontend route changes required.
- All composites must respect `ETag` and `Last-Modified` so React Query 304s are cheap.

### 4.2 Persona / role / RBAC model

Three layers:

1. **Identity** — server-issued JWT; `sub`, `email`, `name`, `roles[]`, `dept`, `ui_persona`. Persona is a UI variant, not a role.
2. **Roles** — `analyst`, `md`, `sales`, `admin`. Each role grants a set of `permissions` (see 4.2.1). Multi-role users are allowed (e.g. an analyst-admin).
3. **UI persona** — `frank | till | heiko`. Default UI persona is derived from primary role: `analyst→frank`, `md→till`, `sales→heiko`. Users with multi-role permissions (e.g. controller + MD) may override via PersonaSwitcher; switching persona never elevates permissions.

#### 4.2.1 Permission matrix (initial)

| Permission | analyst (Frank) | md (Till) | sales (Heiko) | admin |
|---|---|---|---|---|
| `view.margin_cockpit` | ✓ | ✓ | partial — own customers | ✓ |
| `view.quotes` | ✓ | ✓ | own quotes only | ✓ |
| `view.forecast` | ✓ | ✓ | own customers | ✓ |
| `view.studio` | ✓ | read-only | — | ✓ |
| `view.ai_briefing` | ✓ | ✓ | — | ✓ |
| `view.action_center` | ✓ | ✓ | own queue | ✓ |
| `act.accept_recommendation` | ✓ | ✓ | — | ✓ |
| `act.start_ab_test` | ✓ | — | — | ✓ |
| `act.approve_md_authority` | — | ✓ | — | ✓ |
| `act.edit_guardrails` | propose only | ✓ | — | ✓ |
| `act.export_branded_pdf` | ✓ | ✓ | own quotes | ✓ |
| `view.audit_trail` | ✓ | ✓ | own changes | ✓ |
| `admin.users` | — | — | — | ✓ |

The frontend reads `roles` and `permissions` from `/api/v1/me` on bootstrap and stores them in a new `useAuthStore`. UI elements that gate on a permission MUST use a `<RequirePermission name="…"/>` helper rather than checking the persona.

### 4.3 Auth flow

- Email/password sign-in via existing controller IdP (or Supabase Auth as an interim). Issue a 60-min access token + 30-day refresh token, both as `HttpOnly; Secure; SameSite=Lax` cookies.
- `apiFetch` already sends `credentials: 'include'`. Add `X-CSRF` double-submit token for POSTs (Phase 2).
- Public path: `/login`. Private layout: everything else, behind a `<RequireAuth/>` wrapper inside `Shell`.
- Logout: server-side cookie clear + `useQueryClient().clear()`.
- Until Phase 2 is shipped, frontend reads a build-time fixture `VITE_DEFAULT_USER` (frank|till|heiko) to fake login for demos.

### 4.4 Error / loading / empty states

Every screen shell follows the **same triad**:

- **Loading** — render a screen-specific skeleton (the section bones — heading bars, chart frames, table outlines). No spinners on full pages. Skeletons live in each feature folder under `components/skeletons/`.
- **Error** — top-level `<MessageStrip tone="error">` describing the section that failed. The page must NOT collapse to a single error banner. Each independent block (e.g. WaterfallCard vs LostQuoteDifferential) has its own `<ErrorBoundary/>`.
- **Empty / partial** — when an endpoint returns `null` or `404`, render the block with placeholder copy: "No data for this filter — try widening cluster scope" + a "Open data quality" link to `/settings/data-quality`. Empty is not error.

### 4.5 Caching & invalidation

- React Query: `staleTime: 60_000` for read-only screens (already set). 5-min `cacheTime`. `refetchOnWindowFocus: false`.
- On any mutation (`POST /actions/...`), invalidate the query key for the screen the mutation originated from AND `[ 'audit-trail' ]` AND `[ 'shell' ]` (so the right-rail notification updates).
- Query key conventions live in `lib/api/queryKeys.ts`. Phase 1.T2 expands this file.

### 4.6 Audit trail

Every state-changing call (Accept, Decline, A/B start, Counter, Approve, Edit guardrail, Export PDF, Forward to MD, Push to Heiko) MUST go through `POST /api/v1/actions/{kind}` and produce a row in `audit_log`. The schema (Phase 12.T1) is:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK. |
| `actor_user_id` | UUID | FK users. |
| `actor_persona` | text | snapshot of UI persona. |
| `action_kind` | text | e.g. `accept_recommendation`, `ab_test_start`. |
| `target_type` | text | `sku`, `quote`, `customer`, `cluster`, `briefing`. |
| `target_id` | text | natural key. |
| `before_state` | jsonb | snapshot. |
| `after_state` | jsonb | snapshot. |
| `delta_pp` | numeric | optional human-readable delta. |
| `audit_hash` | text | sha256 of (actor, kind, target, after, ts) — short hex shown in UI. |
| `created_at` | timestamptz | server time. |

The Action Center "Audit trail (last 30 days)" block reads from `GET /api/v1/audit/recent?since=30d&actor=…`.

### 4.7 i18n & localisation

- Frontend uses `react-i18next`. Today only nav strings are localised. Server payloads carry already-translated user-facing copy (the German memo HTML inside mocks). Phase 13 introduces a `?lang=` query parameter that backend honours; until then, server returns whatever copy the mocks contained.
- All dates are rendered via `date-fns` with locale `de`.
- All numbers go through `lib/format.ts` (`fmt.eur`, `fmt.pct`, `fmt.num`, `fmt.signedPct`). Backend never sends pre-formatted numbers in machine-readable fields; only narrative HTML may contain pre-formatted numbers.

### 4.8 Observability

- Request id: backend generates `x-pryzm-trace-id` if absent; logs include it.
- Frontend instruments React Query with `onError` → Sentry; routes get `<RoutePerf/>` web-vitals reporter.
- Backend emits Prometheus metrics on each screen endpoint (`pryzm_screen_latency_seconds{screen="action-center"}`).

### 4.9 Versioning

- Frontend pins `VITE_API_VERSION=v1`. Once baked into prod, no breaking changes are made within `v1`. Additions are non-breaking by definition.
- When a breaking change is required, ship `v2` side-by-side; frontend cuts over per-screen.

### 4.10 Feature flags

Use Unleash-style flags from `/api/v1/me` payload (`features: ['ab_test', 'till_overview', 'heiko_mobile']`). Flags gate Phase 10–14 work so unfinished personas don't leak to all users.

### 4.11 Mock fallback during partial deploy

Until ALL screen endpoints are live, set `VITE_SCHERZINGER_API` only when ALL endpoints are real, OR introduce a per-path fallback in `apiFetch` (Phase 0.T3): on API 404 / 503 the function falls back to the bundled mock. This lets a single screen ship to prod while others remain on mocks.

---

## 5. PHASE PLAN OVERVIEW

| Phase | Theme | Outcome |
|---|---|---|
| **0** | Pre-flight + scaffold | Repo conventions, env, mock fallback, OpenAPI scaffold. |
| **1** | BFF skeleton | All screen endpoints exist as 200-returning stubs that pass the contract check. |
| **2** | Auth + RBAC + Persona | Login, JWT, `/me`, RBAC matrix enforced; in-app persona switching. |
| **3** | Shell rail real data | `/shell`, notifications/reviewers/sections persisted. |
| **4** | Action Center wired | `/action-center` returns real Frank data. |
| **5** | Margin Cockpit wired | `/margin-cockpit` real. |
| **6** | Quotes & Guardrails wired | `/quotes` real. |
| **7** | Forecasting wired | `/forecast` real. |
| **8** | Pricing Studio wired | `/studio` real; workbench engine moved server-side. |
| **9** | AI Briefing wired | `/ai` real. |
| **10** | Till persona screens | MD overview, monthly briefing, board pack. |
| **11** | Heiko persona screens | Deal calculator, mobile layouts, lost-deal analytics. |
| **12** | Action persistence + Audit | All buttons persist; A/B test backend; audit trail. |
| **13** | Full i18n | de/en parity for body content; `?lang=` round-trip. |
| **14** | Settings + saved views + DQ | Settings page, saved views, data-quality dashboard. |
| **15** | Hardening, deploy, observability, accessibility | A11y pass, perf budget, blue/green deploy, runbooks. |

The remaining sections describe each phase in full task detail.

---

## 6. PHASE 0 — Pre-flight & scaffolding

### Goals

Get the repo, env, and CI ready so all later phases ship cleanly.

### Tasks

**P0.T1 — Establish repo conventions.**
- Adopt commit prefixes `feat(area):`, `fix(area):`, `chore(area):`. Areas: `shell`, `action-center`, `margin`, `quotes`, `forecast`, `studio`, `ai`, `auth`, `bff`, `infra`, `i18n`, `tests`.
- Write `frontend-v2/CONTRIBUTING.md` documenting the migration plan (this file), test policy, screenshot regression policy.
- Add `frontend-v2/CHANGELOG.md` and start tagging from `v0.2.0`.

**P0.T2 — Document env contract.**
- Create `.env.example` in `frontend-v2/` with: `VITE_SCHERZINGER_API`, `VITE_API_VERSION`, `VITE_DEFAULT_USER`, `VITE_SENTRY_DSN`, `VITE_FEATURE_FLAGS_URL`.
- Create `.env.example` in `scherzinger-platform/` updates: keep `DATABASE_URL`, add `JWT_SECRET`, `JWT_TTL_SECONDS`, `REFRESH_TTL_DAYS`, `CORS_ORIGINS`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SENTRY_DSN`.
- Document each env var in `scherzinger-platform/docs/env.md` and `frontend-v2/docs/env.md`.

**P0.T3 — Per-path mock fallback in `apiFetch`.**
- Modify `src/lib/api/client.ts` so that when `VITE_SCHERZINGER_API` is set AND a request returns network error / 404 / 503 with `x-pryzm-mock-allowed: 1`, the function falls back to the bundled mock for that path. This MUST be gated by `VITE_ALLOW_MOCK_FALLBACK` so production accidentally falling back is impossible.
- Acceptance: setting `VITE_SCHERZINGER_API=https://api.local/api/v1/screens` while only `/shell` is implemented still renders Frank's screens.

**P0.T4 — OpenAPI scaffold.**
- Add `scherzinger-platform/openapi/screens.yaml` with stubs of each screen endpoint and `components/schemas/` for every type from `frontend-v2/src/types`. Source of truth for the schemas: the existing TS interfaces — translated to JSON-schema form. (Phase 1.T1 generates Pydantic models from this.)
- Acceptance: `redocly lint screens.yaml` passes; CI runs it.

**P0.T5 — Contract-test harness.**
- Add `scherzinger-platform/tests/contract/` directory.
- Each test loads a frontend mock JSON, hits the corresponding endpoint, validates the response against the same JSON-schema and asserts the same top-level keys exist with non-null values.
- For Phase 1, the assertion is "endpoint returns the canonical mock payload byte-for-byte". By Phase 9, the assertion is "endpoint returns a payload that validates against the schema and is equal to the mock for the seed dataset".

**P0.T6 — CI pipeline updates.**
- GitHub Actions or equivalent: matrix `{frontend-v2, scherzinger-platform}`. Steps per matrix entry: install, lint, typecheck, unit, build (frontend), pytest + alembic check + openapi lint (backend), contract suite. Block PRs on failure. Cache npm and pip wheels.

**P0.T7 — Pre-commit hooks.**
- Add husky + lint-staged on frontend (eslint --fix, prettier --write, vitest --bail on touched files).
- Add `pre-commit` framework on backend: black, isort, ruff, mypy, openapi lint.

**P0.T8 — Local dev compose.**
- Add `docker-compose.dev.yml` at repo root: postgres 16, the FastAPI service mounting `scherzinger-platform`, and a `frontend-v2` service running `vite --host`. Document `docker compose up dev` in root README.

**Verification at end of Phase 0**
- `docker compose up dev` brings up an unauthenticated dev stack; visiting `http://localhost:5173/action-center` still shows Frank's mocks; the FastAPI `/health` returns 200.
- CI passes on a no-op PR.

---

## 7. PHASE 1 — BFF skeleton (every screen endpoint exists)

### Goals

Ship eight HTTP endpoints that each return the **canonical mock JSON** byte-for-byte. This unblocks every later phase by giving them a real network seam to evolve.

### Endpoint list (all under `/api/v1/screens` unless stated)

| Endpoint | Phase that fills it with real data | Mock seed file |
|---|---|---|
| `GET /shell` | 3 | `shell.json` |
| `GET /action-center` | 4 | `action-center.json` |
| `GET /action-cards` | 12 | `action-cards.json` |
| `GET /margin-cockpit` | 5 | `margin-cockpit.json` |
| `GET /quotes` | 6 | `quotes.json` |
| `GET /forecast` | 7 | `forecast.json` |
| `GET /studio` | 8 | `studio.json` |
| `GET /ai` | 9 | `ai.json` |

### Tasks

**P1.T1 — Generate Pydantic models from OpenAPI.**
Use `datamodel-code-generator` (or write by hand) to produce Pydantic models in `backend/schemas/screens/{shell,action_center,margin_cockpit,quotes,forecast,studio,ai}.py`. These mirror the TS interfaces. Add unit tests that load the mock JSON and assert it parses cleanly.

**P1.T2 — Stub router.**
Create `backend/api/v1/screens.py` with a router of prefix `/screens`. Each endpoint reads its seed from `backend/seeds/<name>.json` (copy of the frontend mock at this time) and returns it. Include the response model on each endpoint so OpenAPI is correct.

**P1.T3 — Mount router in `main.py`.**
Add `app.include_router(screens.router, prefix="/api/v1", tags=["screens"])`. Do NOT remove existing routers.

**P1.T4 — CORS for frontend-v2.**
Replace wildcard CORS with allow-list `["http://localhost:5173", "https://app.<env>.pryzm.de"]`. Allow `credentials: true`. Allow `GET, POST, PATCH, DELETE`. Allow headers `content-type, x-csrf, x-pryzm-trace-id`.

**P1.T5 — Add `/api/v1/me` stub.**
Returns `{ id, name, email, roles, permissions, ui_persona, features }`. For now, returns Frank-as-default whenever no auth is present. Phase 2 fills the real auth.

**P1.T6 — `apiFetch` content-type handling.**
On `import.meta.env.VITE_SCHERZINGER_API`-backed requests, expect `content-type: application/json`. Add a typed throw on non-JSON responses. Strip BOM if present.

**P1.T7 — Update query keys & hooks for real-mode optionality.**
- Expand `lib/api/queryKeys.ts` to a fully typed factory with one entry per screen, accepting query params (`week`, `period`, `cluster`, `customer_id`, etc.). All hooks must read from this factory.
- Hooks add `enabled` checks for required parameters (`useStudio({ aid })` etc.) where applicable.

**P1.T8 — Frontend env switch verified.**
With `VITE_SCHERZINGER_API=http://localhost:8000/api/v1/screens` set in `.env.local`, every screen renders identically to mock-mode. Capture before/after screenshots, attach to PR.

**P1.T9 — Contract tests.**
For each of the 8 endpoints, a pytest verifies: status 200, payload deep-equals seed JSON, response validates against Pydantic, ETag header present. CI runs them.

**P1.T10 — `/api/v1/screens/version`.**
Returns `{ version: "1.0.0", backend_commit, schema_hash }`. Frontend logs this to console on bootstrap; mismatched schema hashes show a banner "App needs to refresh".

**Verification at end of Phase 1**
- All Phase 1 endpoints return mock byte-equal responses behind real HTTP.
- Frontend with `VITE_SCHERZINGER_API` set renders unchanged.
- All Phase 0 + Phase 1 tests pass.

---

## 8. PHASE 2 — Auth, RBAC, Persona

### Goals

Real users can log in. Permissions gate UI. Persona switching happens fully inside frontend-v2.

### Tasks

**P2.T1 — Backend `users`, `roles`, `user_roles` tables.**
- `users(id uuid pk, email citext unique, name text, password_hash text, ui_persona_default text, dept text, created_at, updated_at, disabled bool)`.
- `roles(id text pk, label text, permissions text[])`.
- `user_roles(user_id, role_id, primary_key (user_id, role_id))`.
- Seeds:
  - `analyst` permissions per matrix in §4.2.1.
  - `md`, `sales`, `admin` similarly.
- Three demo users: Frank Keller (analyst, frank), Till Hoffmann (md, till), Heiko Müller (sales, heiko).

**P2.T2 — Auth endpoints.**
- `POST /api/v1/auth/login` — body `{ email, password }`. Sets HttpOnly cookies `pryzm_at` and `pryzm_rt`. Returns `/me` payload.
- `POST /api/v1/auth/refresh` — rotates tokens.
- `POST /api/v1/auth/logout` — clears cookies, revokes refresh.
- `GET /api/v1/me` — returns current user; 401 when no cookie.
- All auth routes must rate-limit (10/min/IP).

**P2.T3 — JWT verification middleware.**
- Reads `pryzm_at`, attaches `request.state.user` (id, roles, permissions, persona).
- All `/api/v1/screens/*` endpoints require auth except `/screens/version`.

**P2.T4 — CSRF.**
- On mutating routes, require header `x-csrf` to equal cookie `pryzm_csrf`. Issue fresh CSRF on login and refresh.

**P2.T5 — Frontend `/login` route.**
- New `features/auth/Login.tsx` with email/password form (react-hook-form + zod). On success, prefetch `/me` and redirect to last-visited route or `/action-center`.
- Add `<RequireAuth/>` boundary on `Shell.tsx`. Redirect unauthenticated users to `/login`.

**P2.T6 — `useAuthStore` + `useMe` hook.**
- Zustand store (NOT persisted) with `{ user, permissions, isLoading, logout() }`.
- `useMe()` hook wrapping React Query for `/me` with `staleTime: 5min`. Sets the store on success.

**P2.T7 — `<RequirePermission/>` component.**
- Children render only when permission is granted; otherwise null. Provide `fallback` prop for explanatory copy.
- Refactor static UI to use it: e.g. PersonaSwitcher's "Till" button is hidden when user has no `view.action_center` MD permission.

**P2.T8 — In-app PersonaSwitcher refactor.**
- Remove the external `/demo/#?persona=` redirects. All three personas are local routes inside frontend-v2. Switching writes both `personaStore` AND a server-side preference (`PATCH /api/v1/me/preferences`).
- A user without permission to a persona sees that persona disabled (with tooltip "Requires MD role").
- The Sidebar user card now reads from `useMe()` rather than hard-coded "Frank Keller".

**P2.T9 — Per-persona route map.**
Add a `personaRoutes` map in `app/router.tsx`:

| Persona | Default landing | Route prefix |
|---|---|---|
| frank | `/action-center` | `/` |
| till | `/md/overview` | `/md` (Phase 10) |
| heiko | `/deal/inbox` | `/deal` (Phase 11) |

When a user switches persona, navigate to that persona's default landing.

**P2.T10 — Telemetry.**
On login, emit `analytics.identify(user.id)` and `analytics.track('login', { persona })`. On persona switch, emit `track('persona_switched', { from, to })`.

**P2.T11 — Contract tests.**
Add tests verifying:
- 401 without auth on `/screens/*`.
- 403 when persona/role lacks permission (e.g. sales hitting `/screens/studio`).
- Login/refresh/logout round-trip on Postgres.

**Verification at end of Phase 2**
- Three demo users sign in, see only their permitted screens.
- Persona switching never leaves frontend-v2.
- Sidebar user card shows the logged-in user's name and email.

---

## 9. PHASE 3 — Shell rail (right rail real data)

### Goals

Replace the static-mock Shell payload with a live, user-scoped feed.

The endpoint is small but is exercised on every page; do this before the heavier screens so we have a known-good live integration to model against.

### Tasks

**P3.T1 — Backend tables.**
- `notifications(id uuid pk, user_id, tone text, title text, sub text, unread bool, link text, created_at)`.
- `reviewers(id uuid pk, panel_id, initials, bg color, user_id nullable, created_at)`.
- `panels(id uuid pk, label, owner_user_id, created_at)`.
- `sections(id uuid pk, user_id, title, sub, href, sort_order)`.

**P3.T2 — Endpoints.**
- `GET /api/v1/screens/shell` — returns `ShellRailData` filtered to user.
- `POST /api/v1/notifications/{id}/read` — marks read.
- `GET /api/v1/notifications` — list with `?cursor=` pagination.
- `POST /api/v1/sections` and `PATCH /api/v1/sections/{id}` and `DELETE /api/v1/sections/{id}` — manage saved sections.
- `GET /api/v1/panels/{id}/reviewers` — returns reviewers for a panel.

**P3.T3 — Notification producers.**
A Postgres notification is created whenever:
- An A/B test crosses day-N (Phase 12).
- A guardrail change is applied (Phase 6).
- A new high-impact decision is generated (Phase 4).
- A briefing PDF is generated (Phase 9).
- A persona-elevation request is sent (Phase 10).

Emit via a single helper `notify(user_id, tone, title, sub, link)` callable from any service.

**P3.T4 — Frontend hook updates.**
- `useShell` already exists; add `useMarkNotificationRead`, `useAddSection`, `usePatchSection`, `useDeleteSection`. Mutations invalidate `['shell']`.

**P3.T5 — RightRail interactions.**
- Make notification rows click-able: open the linked entity in a side drawer when `tone === 'info'`, navigate when `tone === 'warn'`, dismiss on `tone === 'ok'`.
- "See all notifications" → `/notifications` route with paginated list (Phase 14 expands).
- "Notes" button — open a Notes drawer (text-only journal scoped to user; Phase 14).
- Reviewers panel "↗" — open `/panels/{id}` modal listing the panel's members; "Add" requires `admin.users` perm.
- Section "+ Add" — modal to add a section with `title`, `sub`, `href`. Validate href is internal route.

**P3.T6 — Tests.**
Existing `tests/shell/RightRail.test.tsx` continues to pass with msw (mock service worker) returning real-shape payloads. Add `tests/shell/notification.test.tsx` covering read-marking and pagination.

**Verification at end of Phase 3**
- A pretend producer creates a notification → it appears in RightRail within next React-Query refetch.
- Marking read updates the unread dot.
- Sections can be added and reordered (drag is Phase 14, but add/edit/delete works).

---

## 10. PHASE 4 — Action Center wired (Frank's home)

This is the largest single screen in the app and Frank's daily landing page. The work covers 13 sub-blocks, each wired to a real source.

### 10.1 Block-to-source mapping

The mock JSON `action-center.json` has these top-level keys; each maps to existing services + new derivations.

| Top-level key | Sub-blocks | Backend source |
|---|---|---|
| `header` | greeting, week, dateRange, stats | `users.name`, current ISO week, server clock; counts from `stats` service. |
| `movableHero` | value, totalRevenue, movablePct, skusInScope, lockedValue, spark | New view `v_movable_revenue` derived from `price_governance.price_rules` + `price_history_with_margin` (see P4.T2). 14-week sparkline = revenue per ISO week of last 14 weeks. |
| `buckets` | movable, locked, ab-test, long-tail bucket cards | Aggregations of `v_movable_revenue` grouped by status. |
| `decisions` | 3 decision cards | Decision Engine output (P4.T6). Backed by an ML pipeline whose interim implementation is rules + XGBoost score + cluster confidence. |
| `trust` | 4 trust tiles (churn F1, forecast error, anomalies, coverage) | `risk_service`, `forecast_service.accuracy`, anomaly counts (P4.T8), `data_quality_service`. |
| `lostQuote` | won/lost differential card | `quote_service.get_price_sensitivity`. |
| `skuTable` | SKU pricing engine table | New view `v_sku_pricing_engine` (P4.T9). |
| `longTail` | tiles + mix bars | New view `v_long_tail_coverage` (P4.T10). |
| `negotiation` | discount-gap, commodity moves, summary | `quote_service` + `cost_service.get_cost_trends`. |
| `rejections` | rejection codes ranked | `quote_service.get_rejection_codes`. |
| `audit` | last 30 days | `audit_service.recent` (Phase 12 wiring; placeholder stub here). |
| `abTests` | A/B test tracker | `ab_test_service` (Phase 12 wiring; placeholder stub here). |

### 10.2 Tasks

**P4.T1 — Build `/screens/action-center` composer.**
- Reads query params `?week=`, `?cluster=`, `?customer_id=`, `?lang=`, `?persona=`.
- Composes a single response by parallel-calling the helpers below.
- Use `asyncio.gather` (FastAPI is async) for parallel fan-out.
- Cache response per (user, week, cluster) for 60 s in memory; invalidate on any audit-write event.

**P4.T2 — Movable-revenue derivation.**
- Create migration `alembic` revision `phase4_movable_revenue`:
  - Materialised view `v_movable_revenue (article_id, customer_id, period, revenue, is_movable bool, locked_until date, cluster_code, conf_pct)`.
  - Movable definition: SKU is locked when `frame_contract_end > current_date + interval '60 days'`. Otherwise movable.
- Service `analyst_home_service.movable_hero(week, cluster)` → `MovableHero` Pydantic model.
- Sparkline = 14 most recent ISO-week movable totals.

**P4.T3 — Bucket cards.**
- Movable bucket: SKU count + commodity-group leaders + revenue.
- Locked bucket: SKU count + earliest renewal date + locked revenue.
- A/B-test bucket: count of running tests + average days-in-flight (Phase 12 will provide; for now stub from `ab_test_service.list(running=true)`).
- Long-tail bucket: SKUs with revenue < 10 000 EUR YTD, count + total revenue.
- Each card carries an avatar list of "active reviewers on this bucket" (panel members from `panels`).

**P4.T4 — Trust strip.**
- Tile: Churn model F1 — read latest from `model_runs` table (created in Phase 7 if not earlier; for Phase 4 stub from `risk_service.distribution`).
- Tile: Forecast error LTM — `forecast_service.accuracy` for `model_type='walk_forward'`, last 12 months MAPE.
- Tile: Anomalies caught — `quality_service.anomaly_count_last_30d` (new function; counts records flagged via `dq_any_issue` whose flag_date is within 30 d).
- Tile: Data coverage — `data_quality_service.completeness` weighted average across invoice / quote / customer / product.
- Each tile carries a `drawer_payload` dict the frontend opens in a side drawer (feature_importance bars, per-month errors, anomaly split, per-source coverage). Phase 4 ships with a flat structure already in mock; Phase 12 enriches.

**P4.T5 — Lost-quote differential card.**
- Source: `quote_service.get_price_sensitivity`.
- Compute `wonAvg`, `lostAvg`, `differential = lostAvg - wonAvg`, `pValue` via Welch's t-test on `won_margin_distribution` vs `lost_margin_distribution`.
- Implication string is computed server-side from a small template based on differential sign and significance threshold.

**P4.T6 — Decisions feed (Frank's "Today's analyst decisions").**
- Decision sources, ranked by impact:
  1. SKUs in `v_sku_pricing_engine` with `actual_margin_gap_pp <= -10pp` AND `is_movable=true`.
  2. Customers with churn risk score > 0.7 AND ARR > 100 k EUR (from `risk_scores`).
  3. Open guardrail breaches (Phase 6 source).
  4. Cluster shifts > 1 pp WoW (`benchmark_service`).
  5. Anomaly clusters from quality service.
- Top 3 by `impact_eur` are returned.
- Each decision carries: `cluster.confidence`, `contract: 'movable'|'locked'|'abtest'`, `recommendation`, `timeMinutes`, primary CTA copy ("Accept Implement") and secondary CTA ("🧪 Slice as A/B test").
- The decision id is stable across refetches so React Query keys remain valid.

**P4.T7 — SKU pricing engine table.**
- New view `v_sku_pricing_engine` joining `products_detail.declining_fast`, `pricing_analysis.gap_analysis`, `article_customers`. Columns shown: article, description, commodity, cluster_conf, margin_delta (catalog vs quoted), status (movable/locked/abtest), actionLabel.
- Sort: cluster confidence desc, then margin gap asc.
- Filter: respects `?hide_locked=true` (default off, set by Frank's relevance toggle).
- Returns up to 50 rows; pagination via `?cursor=` for the deeper table view in Phase 14.

**P4.T8 — Long-tail coverage strip.**
- Tiles from `products_detail.kpis.top10_concentration_pct`, A/B/C SKU counts, model-covered vs uncovered.
- Mix bars: 3 segments (covered / partial / uncovered) with palette tones from the existing TS type.

**P4.T9 — Negotiation cockpit (collapsible).**
- Discount gap: weighted average discount pp on Frank's portfolio LTM.
- Commodity moves: top 4 commodity-group cost moves from `cost_service.get_cost_trends` ordered by abs(delta).
- Summary lines: 2–3 templated bullets ("Steel up 3.4 % LTM, plastics flat, copper down 1.1 %, …"). Templates live in `services/copy_templates.py`.

**P4.T10 — Rejection codes ranked.**
- From `quote_service.get_rejection_codes`. The 5 highest revenue-lost codes. Rank, code, sub-text from `rejection_codes.description_en`, lost revenue, share.
- Special handling for `KA "No information"`: tag as `dq=true` so the UI flags it.

**P4.T11 — Audit + AB test tracker (stubs in Phase 4).**
Return mock-equivalent data; Phase 12 fills with real audit/ab-test sources.

**P4.T12 — Frontend wiring.**
- `useActionCenter` already exists; add params support `(filters: { week?, cluster?, hide_locked? })` while keeping existing usage `useActionCenter()` working.
- `features/action-center/index.tsx` does not change — components stay; only their data origin changes. Verify each child component handles loading/empty independently (P4.T13).

**P4.T13 — Component-level loading/empty.**
For every block (`PageHead`, `MovableHero`, `BucketGrid`, `DecisionCards`, `TrustStrip`, `LostQuoteCard`, `SkuTable`, `LongTailCoverage`, `NegotiationCockpit`, `AbTestList`, `RejectionList`, `AuditTrail`, `ReportCard`):
- Add a skeleton variant in `components/skeletons/<Block>.skeleton.tsx`.
- When parent suspends (during refetch), fall back to skeleton.
- When the block's data is null/empty, render an in-block empty state with copy from `components/empty/<Block>.empty.tsx`.

**P4.T14 — Cross-link integrity.**
The mock includes "→ Open in Studio" / "→ Cluster forecast" / "→ Approvals" cross-links. Verify each `jumpTo` is a valid route in `frontend-v2/src/app/router.tsx`. Add unit test that asserts every cross-link in the response payload resolves to a known route.

**P4.T15 — Persona variants.**
Action Center renders for Till and Heiko in later phases; for Phase 4 only Frank's payload is implemented. Stub Till/Heiko by returning a 404 with a body explaining "Till/Heiko Action Center coming in Phase 10/11" until those phases ship.

**P4.T16 — Smoke test.**
Vitest: render `<ActionCenterPage/>` with msw replaying the canonical mock; assert headings of every block render, no skeletons remain, no error strips.

**Verification at end of Phase 4**
- Frank logging in lands on `/action-center` and sees the same layout as before, but every cell is fed by the live BFF.
- Toggling a filter (week, hide-locked) refetches and the UI updates without flicker.
- Switching to Till persona shows a "coming soon" banner. Switching to Heiko same.

---

## 11. PHASE 5 — Margin Cockpit wired

### 11.1 Block-to-source mapping (`margin-cockpit.json` keys)

| Key | Source |
|---|---|
| `header` | persona, current period, audit tag from `audit_service.last_hash`, filter values. |
| `briefing` | LLM-drafted memo (provider abstracted via `briefing_service`) using last week's margin deltas, top movers, lost-quote stats. Audit hash from same. |
| `health` | 4 cells: Score (composite ring 0-100), Actual margin pp (LTM), Below plan pp (delta), Closable bp (estimate). Sources: `margin_service.summary`, `margin_service.gap_analysis`, `risk_service` for closable estimate. |
| `clusters` | Per-cluster chip array from `benchmark_service.get_benchmarks` with conf %; "low-n" warning when sample n < 30. |
| `shifted` | Top movers WoW from `margin_service.trend(granularity=weekly)` + `cost_service.get_cost_trends`. |
| `waterfall` | Margin bridge (target → mix → discount → cost → rebate → erosion → actual) constructed from `margin_service.gap_analysis` and per-bucket service helpers. |
| `lostQuote` | Same source as Action Center §P4.T5 — share via service. |
| `costVsPrice` | 24-month indexed series from `cost_service.get_cost_trends` and `margin_service.trend`. Pass-through %, recovery EUR. |
| `tabs.cross` | Cross-customer SKU comparisons; new view `v_cross_customer` (P5.T3). |
| `tabs.leak` | SKU leakage with quoted vs actual gap; from `gap_analysis`. |
| `tabs.seg` | Segment sub-panes (family/tier/size/region); from `margin_service.by_*`. |
| `tabs.erode` | 12-month-old prices vs current cost; from `pricing_studio_service`. |
| `tabs.cust` | Customer trend rows; from `margin_service.by_customer` + `risk_service`. |
| `crossLinks` | Static map. |

### 11.2 Tasks

**P5.T1 — Endpoint composer.**
`GET /api/v1/screens/margin-cockpit?cluster=&family=&tier=&period=&customer_id=&lang=`. Parallel-compose the above. ETag includes the last `audit_hash`.

**P5.T2 — Briefing service.**
- `briefing_service.draft_memo(scope='margin')` — input is a structured snapshot, output is HTML paragraphs + signature + audit hash.
- Provider abstraction: `briefing_provider.openai|anthropic|template` switchable via env. Phase 5 ships with the **template** provider (deterministic, no LLM); LLM provider is a Phase 9 / 13 enhancement.
- Memo paragraphs MUST contain `<b>`, `<code>`, `<span style="color:…">` sparingly. Sanitised server-side using `bleach` to a strict allow-list before insertion.

**P5.T3 — Cross-customer view.**
- View `v_cross_customer` joining invoices grouped by article and the top-2 customers by revenue, exposing both prices and the spread %. Highlights when spread > 25 % AND cluster_conf > 70 %.

**P5.T4 — SKU leakage (`tabs.leak`).**
- For SKUs in invoices linked to quotes via `quote_invoice_links`, compute `quoted_margin - actual_margin` per article weighted by volume LTM. Sort desc by `opportunity_eur = avg_volume * gap_pp / 100`.

**P5.T5 — Segment sub-panes.**
Four sub-panes:
- `family` — group by `commodity_group`.
- `tier` — group by ABC tier (added column from `customer_tier_service`, Phase 5 introduces it).
- `size` — bucket customers by ARR (XS<50k, S<200k, M<1M, L<5M, XL≥5M).
- `region` — group by ISO region from customer master.
Each sub-pane carries a `storyHtml` (templated narrative) and an optional `caveatHtml` (e.g. "BKAGG region n=11 — low-n").

**P5.T6 — Erosion (`tabs.erode`).**
A row per SKU whose price has not moved in `> 12` months while cost has shifted by ≥ 5 %. Cluster confidence tone, `lastUpdateMonths`, `costChange`, `listChange`, `effectiveErosion`, `marginCompression`, `authorHash`. Each row is "actionable" when erosion > 3 pp; non-action rows show "healthy · no action".

**P5.T7 — Customer trend (`tabs.cust`).**
Top 25 customers by YTD revenue with their margin trend (last 6 months). Status: `action` (margin trend < -5 pp), `watch` (-5 to -2), `healthy` (-2 or better). Primary action links to a Studio fan-out view (Phase 8).

**P5.T8 — Tab-jump cross-links.**
The frontend uses `onTabJump(tab, segTab?)` to navigate between blocks. The backend response provides `jumpTo: { kind: 'tab', tab, segTab? }` objects in `shifted` and `waterfall` blocks. Verify the contract test asserts every `jumpTo.tab` is one of `cross | leak | seg | erode | cust` and every `segTab` is one of `family | tier | size | region`.

**P5.T9 — Briefing toggle.**
The briefing memo is open/close locally (frontend state). When opened, the frontend fires `track('briefing_opened', { screen: 'margin' })`. The backend never opens/closes — it always returns the memo body.

**P5.T10 — Component-level loading/empty.**
Each block has a skeleton + empty (same pattern as P4.T13).

**P5.T11 — Persona variants.**
- Frank — sees full payload.
- Till — sees same blocks but with `audit_tag` always shown, briefing tone shifted ("board-ready"), and `abuse_filter` removing operational noise (e.g. SKU leakage detail collapses to summary unless expanded). Phase 10 implements.
- Heiko — sees only `tabs.cust` and a customer-scoped briefing. Phase 11 implements.
For Phase 5 only Frank.

**P5.T12 — Smoke + unit tests.**
- Existing `tests/margin-cockpit/*` tests pass with msw replaying the canonical mock.
- Add unit test for waterfall ordering (target before actual; loss buckets in fixed order: mix → discount → cost → rebate → erosion).

**Verification at end of Phase 5**
- `/margin` renders byte-identical visual to mock-mode while sourced from live data.
- Tab jumps continue to work; segment sub-pane switching scrolls smoothly.

---

## 12. PHASE 6 — Quotes & Guardrails wired

### 12.1 Block mapping (`quotes.json` keys)

| Key | Source |
|---|---|
| `header` | persona, current week, count of active quotes, count of needing approval today. |
| `briefing` | `briefing_service.draft_memo(scope='quotes')`. |
| `pipeline` | 4 counters: Routed today, Active quotes (with R/A/G mini-counters), Need approval today, Won/Lost rolling LTM. |
| `changed` | "What changed since Monday" — diff between two snapshots of `quotes_active_view`. |
| `escalations` | Quotes with margin breach + concentration analysis. |
| `funnel` | Quote stages + aging cells. |
| `guardrails` | Threshold cards for guardrails. |
| `active` | Active quote table + bulk actions. |
| `analysis.rep / sku / cust` | LTM rep/SKU/customer breakdowns. |
| `crossLinks` | static. |

### 12.2 Tasks

**P6.T1 — Composer endpoint.**
`GET /api/v1/screens/quotes?week=&rep=&customer_id=&family=&tier=&lang=`. Composes from the helpers below.

**P6.T2 — Active quotes view.**
- New view `v_quote_active` joining `quotes` (status_code 4 = won, 5 = lost, others = active or expired) with the latest cost data per article and the latest guardrail floor per family. Computes `floor_reference`, `margin`, `age_days`, `guardrail_status`, `rag` (R if margin < -3 pp, A if -3 to 0 pp, G if 0+).

**P6.T3 — Escalations.**
- Pick top-N quotes from `v_quote_active` with `margin_breach_pp ≥ 3` AND `customer_tier in ('A','B')`. Provide `authority` flag (own-authority threshold from `users.authority_pp`); `'you'` when delta ≤ user's threshold, `'md'` otherwise.
- `concentration_html` — narrative built from `escalations.groupby(rep_id).count()` template.
- Bulk-recommendation — sum of leakage avoided.

**P6.T4 — Funnel & aging.**
- Funnel steps: New, Routed, Active, Approved, Sent, Won, Lost. Counts and detail (eg "€2.61M total") from `quote_service`.
- Aging cells: <7d fresh, 7-14d, 14-30d, >30d stale. Tone follows count thresholds.

**P6.T5 — Guardrails.**
- Backed by `guardrails(id, family, threshold_pp, active, last_raised_at, last_raised_by, sku_count)` table. Phase 6 introduces it.
- Reads list of guardrails for the user's allowed families.
- The "Edit" button creates a `guardrail_change_request` (must be approved by a user with `act.edit_guardrails`).

**P6.T6 — Active quotes table + bulk actions.**
- Bulk actions: Approve all green, Counter all amber, Decline all red, Hold all. Each action is a POST to `/api/v1/actions/quote_bulk` with the selected quote ids.
- Row-level expand returns evidence HTML + meta line; when row's `rowActionTarget = 'escalation'`, clicking scrolls to the corresponding escalation card via `onJumpToEscalation(rank)` (already wired client-side).

**P6.T7 — Analysis tabs.**
- `rep` — sales reps over LTM with breach count, breach rate, leakage EUR, trend, status (repeat/coach/ok). Trend computed by comparing last 90d vs previous 90d.
- `sku` — top SKUs by breach. Insight HTML templates: "Discounting wins +Xpp · review" / "tighten +1pp".
- `cust` — top customers by avg discount and concession behaviour.
Each tab carries an `infoPanelHtml` and a `tabFooterText` and an optional `jumpLink` (for analytics drill-downs).

**P6.T8 — Action endpoints.**
- `POST /api/v1/actions/quote/approve` body `{ quote_id, position, price?, note? }`.
- `POST /api/v1/actions/quote/counter` body `{ quote_id, counter_price, expiry_days }`.
- `POST /api/v1/actions/quote/decline` body `{ quote_id, reason_code }`.
- `POST /api/v1/actions/quote/hold` body `{ quote_id, until_date }`.
- `POST /api/v1/actions/quote_bulk` body `{ ids: [...], action }`.
- `POST /api/v1/actions/guardrail/edit_request` body `{ id, new_threshold, justification }`.
All write to `audit_log` and emit notifications via `notify(...)`.

**P6.T9 — Cross-links to escalations & analysis.**
The mock has `analysis.rep.jumpLink` and per-row escalation jumps. The contract test asserts each `jumpLink.to` is internal.

**P6.T10 — Persona variants.**
- Frank — full quote view.
- Till — sees pipeline, escalations (read-only with override-approve), guardrail change history; bulk actions hidden. Phase 10.
- Heiko — sees own quotes only (`v_quote_active where rep_id = me`); deal-calculator quick actions; analysis.rep limited to own row. Phase 11.

**P6.T11 — Tests.**
- Vitest: render quotes page with msw → assert pipeline counters, escalations rank order.
- Pytest: contract on canonical mock; action endpoints round-trip with audit_log assertion.

**Verification at end of Phase 6**
- Frank can approve a quote at floor, see RightRail notification, refresh and see it gone from "needs approval".

---

## 13. PHASE 7 — Forecasting wired

### 13.1 Block mapping (`forecast.json` keys)

| Key | Source |
|---|---|
| `header` | mode (revenue/margin/volume), filters, last update timestamp. |
| `hero` | 12-month walk-forward chart (primary line + low/high envelope + actuals); top movers; movable/locked split; "why band moves" explanations. |
| `clusters` | Cluster cards with LTM vs forecast vs band vs confidence. |
| `walkForward` | Walk-forward MAPE panel (model accuracy strip + KPIs). |
| `inputCost` | Input cost tiles + stress test. |
| `pareto.customer / .sku` | Concentrated risk view at customer / SKU level. |
| `priceFloor` | Floor adherence rows. |
| `newProduct` | New SKU forecasts (no history). |

### 13.2 Tasks

**P7.T1 — Composer endpoint.**
`GET /api/v1/screens/forecast?mode=&horizon=12&tier=&family=&cluster=&lang=`. Composes from `forecast_service` + `cost_service` + `benchmark_service` + `pricing_studio_service`.

**P7.T2 — Walk-forward materialisation.**
- Job `compute_forecasts.py` populates `forecasts(entity_type, entity_id, horizon_month, primary, low, high, actual_known, model_version)`. Runs daily.
- For Phase 7, ensure the script writes a forecast for `entity_type='global'`, `entity_id='ALL'` covering 12 months.

**P7.T3 — Cluster cards.**
- For each cluster code (BKAES, BKAGG, BKAIZ, SOPU…), compute LTM, forecast, band, confidence. Confidence ≥ 70 % → tone `status`; 50–70 → `amber`; < 50 → `red`. The `bandText` is templated from low/high.

**P7.T4 — Walk-forward MAPE panel.**
- 12 months of monthly MAPE points + target line + KPIs (MAPE LTM, hit rate within ±5 %, hit rate within ±10 %).

**P7.T5 — Input cost trajectory.**
- 4 commodity tiles (Steel, Aluminum, Copper, Plastics) — values from `cost_service.get_cost_trends(top=4)` ordered by their YoY delta.
- Stress test: Monte-Carlo summary from `simulation_service` with a central scenario "what happens to portfolio margin if a +X% cost shock hits family Y?".

**P7.T6 — Pareto layer.**
- Customer Pareto: top 80 % of revenue. Each row provides booked%, forecast, band, trend, vp_volume, vp_price, conf, renewal date, optional drill (SKU mix).
- SKU Pareto: top 80 % of revenue. Each row provides ltmVolume, forecastVolume, band, margin, conf, topCustomer, primary flag.

**P7.T7 — Price floor adherence.**
- Per-customer-per-article, latest accepted price vs floor. `headroom` = floor - current_price; tone pos when negative (price above floor), neg otherwise. `belowFloor` boolean drives the row tint.

**P7.T8 — New product forecasts.**
- For SKUs with `is_new=true` (less than 6 months of data), run the comparable-cluster-anchor model. Returns 3–4 cards with primary action "Open in Studio", secondary "Add to A/B queue".

**P7.T9 — Persona variants.**
- Frank — full payload.
- Till — same hero but blocks past Pareto collapse to summaries; new-product cards hidden by default. Phase 10.
- Heiko — only customer Pareto for own customers + price-floor table. Phase 11.

**P7.T10 — Tests.**
- Vitest: render forecasting page with msw → assert chart renders 12 months and has actuals where months are past.
- Pytest: `forecast_service.accuracy` assertion stable across the seed dataset.

**Verification at end of Phase 7**
- Forecast page reflects today's seed forecasts; flipping mode (Revenue / Margin / Volume) refetches with the right axis labels.

---

## 14. PHASE 8 — Pricing Studio wired

### 14.1 What's special about Studio

Studio has the most logic on the client today: `data/api/studio-workbench.ts` derives a per-SKU workbench from a `WorkbenchPatch` mock object. Phase 8 moves that derivation server-side so it can use real cluster benchmarks, real customer fan-out, and real cost composition.

### 14.2 Block mapping (`studio.json` keys)

| Key | Source |
|---|---|
| `header` | persona, count of flagged SKUs, top cluster. |
| `filters` / `toggles` | static, but the active filter is read from query string. |
| `skus[]` | `v_sku_pricing_engine` filtered by `flag in (floor, stale, cost, frame)`; up to 50 rows. |
| `defaultAid` | Frank's "today's hottest SKU" — from Decision Engine. |
| `workbench` | Per-SKU full workbench (hero, options, fanout, cost, history, decision, memo). Server-derived (P8.T2). |
| `comparable` | Per-SKU comparable-cluster panel for new SKUs only. |
| `crossLinks` | static. |
| `footerNote` | timestamp + dataset source. |

### 14.3 Tasks

**P8.T1 — Endpoint shape.**
- `GET /api/v1/screens/studio?aid=&filter=&hide_locked=&lang=` — composes the shell.
- `GET /api/v1/screens/studio/workbench/{aid}` — returns the per-SKU `WorkbenchData` only. The frontend lazily fetches this when the user picks a different SKU, instead of preloading every SKU's workbench.
- `GET /api/v1/screens/studio/comparable/{aid}` — comparable-cluster panel; only valid for `isNew=true` SKUs.

**P8.T2 — Server-side workbench derivation.**
Move `studio-workbench.ts` logic to `services/workbench_service.py`:
- `build_options(unit_cost, current_price, target_margin, annual_units, customer_count, cluster_id)` → hold/floor/market/A-B options.
- `build_fanout(unit_cost, target_margin, current_price, annual_units, cluster_id, top_n=6)` → fan-out rows from real customers, weighted by share, with per-customer churn risk from `risk_scores`.
- `build_cost(unit_cost, components, target_margin, cluster_id)` → cost composition + 4-year trajectory from `cost_trend`.
- `build_decision(...)` and `build_memo(...)` — produce DecisionData and MemoData. Memo template lives in `services/copy_templates/memo_pricing.py`.
- The frontend keeps `data/api/studio-workbench.ts` ONLY as a fallback when running in mock mode (Phase 0 fallback). When `VITE_SCHERZINGER_API` is set, the file does nothing.

**P8.T3 — SKU picker semantics.**
- The list endpoint never includes per-SKU workbench data. The frontend's `useStudio()` hook splits into:
  - `useStudioShell()` — list, filters, toggles.
  - `useStudioWorkbench(aid)` — per-SKU workbench; cached per aid.
- This change is backwards-compatible because the existing component reads `selectedSku.workbench`. The hook updates the SKU list entries by setting `workbench` from the per-aid query when it lands.

**P8.T4 — Comparable panel for new SKUs.**
- Only when `selectedSku.isNew`. Returns 3 tiles (cluster median, target, suggested) plus a list of similar-SKU lines and an "open in Studio" jump.

**P8.T5 — Decision footer endpoint.**
- `POST /api/v1/actions/studio/accept` body `{ aid, option, effective_date, notify: { sales, customers, escalate, abTest } }`. Writes `audit_log`, optionally schedules an A/B test (Phase 12).

**P8.T6 — Persona variants.**
- Frank — full Studio.
- Till — read-only Studio with "Approve" button on Frank's pending proposals.
- Heiko — Studio is hidden (no `view.studio` perm); attempting to navigate redirects to `/deal/inbox`.

**P8.T7 — Tests.**
- Vitest: render Studio with msw → switching SKU triggers exactly one workbench fetch; A/B option toggle changes fan price and recomputes recovery.
- Pytest: workbench_service determinism test (same input → same output).

**Verification at end of Phase 8**
- Frank can pick a SKU, see real cluster fan-out, accept at floor, observe a new audit-trail row in Action Center within 2 s.

---

## 15. PHASE 9 — AI Briefing wired

### 15.1 Block mapping (`ai.json` keys)

| Key | Source |
|---|---|
| `header.subStats` | "06:02 CET Generated", "5,565 invoices · 4,605 quotes Sources". The timestamp is the run time of the briefing job; counts come from `stats`. |
| `memo` | Drafted by `briefing_service.draft_memo(scope='monday_briefing')`. Always uses the LLM provider when available, falls back to template. |
| `sideCards[3]` | Three structured cards: `changed`, `selfCorrection`, `voice`. Sources: a daily diff job (changed), a recent retraction log (selfCorrection), an LLM-generated narrative (voice). |
| `crossLinks` | static. |

### 15.2 Tasks

**P9.T1 — Composer endpoint.**
`GET /api/v1/screens/ai?week=&persona=&lang=`. Returns `AiShell`.

**P9.T2 — Briefing job.**
- A nightly cron (or a manual trigger on `POST /api/v1/jobs/briefing/run`) that produces the Monday briefing for next week.
- The job writes to `briefings(week, persona, body_html, signature, audit_hash, generated_at)`; the endpoint reads the latest matching row.

**P9.T3 — Provider abstraction.**
- `briefing_provider.template` (deterministic) and `briefing_provider.llm` (Anthropic / OpenAI). Switch via `BRIEFING_PROVIDER` env var.
- The LLM provider is given a structured snapshot (KPIs, deltas, lost-quote facts, top movers) and a strict template; it returns paragraphs and a one-line signature. Output is sanitised by `bleach`.

**P9.T4 — Side-card sources.**
- `changed` — pulled from a `briefing_diffs` table that compares last week's snapshot vs this week's.
- `selfCorrection` — a recent retraction (e.g. "we revised our cluster confidence on BKAES by +6 pp"). Pulled from `model_runs`.
- `voice` — a paragraph in "Pryzm voice" generated by the same LLM.

**P9.T5 — Header actions.**
- `Forward to MD` → POST `/api/v1/actions/briefing/forward` (target: Till's queue, generates a notification).
- `Save as PDF` → POST `/api/v1/actions/briefing/pdf` (returns a presigned URL for the branded PDF).
- `Email weekly` → POST `/api/v1/actions/briefing/email` (subscribes user; backend job mails on Monday).

**P9.T6 — Persona variants.**
- Frank — full.
- Till — different memo voice ("CFO summary"), different cross-links, no `selfCorrection` card.
- Heiko — single-card view (own customers) — Phase 11.

**P9.T7 — Tests.**
- Vitest: render → memo HTML present, side cards render right tone palette.
- Pytest: contract on canonical mock; `briefing_service` determinism with template provider.

**Verification at end of Phase 9**
- The briefing lands in `briefings` weekly; `/ai` page renders the freshest one.

---

## 16. PHASE 10 — Till persona screens

### Goals

Till gets first-class navigation inside frontend-v2 (no external `/demo/`).

### 16.1 New routes

| Route | Source | Purpose |
|---|---|---|
| `/md/overview` | new screen | Strategic margin radar overview. |
| `/md/monthly` | new screen | Monthly close + budget vs actual. |
| `/md/board` | new screen | Quarterly board pack. |
| `/md/lens-hoffmann` | new screen | "Hoffmann lens" pre-built strategic comparison. |

The five core screens (`/action-center`, `/margin`, `/quotes`, `/forecasting`, `/ai`) also render for Till with persona-specific filters.

### 16.2 Tasks

**P10.T1 — Backend per-persona payloads.**
Each `/screens/*` composer adds a `persona` query parameter; when `persona=till`:
- Action Center collapses operational SKU detail; emphasises strategic vs unintended classification (TILL-2) and ROI in EUR (TILL-4).
- Margin Cockpit shows ALL clusters even those Frank has filtered.
- Forecast collapses Pareto to summaries; expand on click.

**P10.T2 — `/md/overview`.**
- Five tiles: Margin (LTM, prior, plan), Quote-to-invoice gap (pp), Churn risk (revenue exposure), Sales adherence to recommendations (%, trend), ROI (EUR saved YTD, attribution split).
- Cross-link strip mirroring Frank's but with MD entry points.
- Right-rail shows MD-specific notifications (board prep due, supervisory questions queue).

**P10.T3 — `/md/monthly`.**
- Budget vs actual chart per WG.
- Predictive next-cycle proposals (computed from `forecast_service`; presented as a table the MD can mark "accepted" or "skip").

**P10.T4 — `/md/board`.**
- One-click branded PDF builder. The page's contents become the source for the PDF (server-side render). Preview iframe + "Download PDF" button.

**P10.T5 — `/md/lens-hoffmann`.**
- Strategic comparison lens; pre-canned filter set. Internally it's an Action Center page with a fixed set of filters and a different copy block.

**P10.T6 — RBAC.**
- Routes under `/md/*` require `view.action_center` MD-level permission (set on `md` role).
- Till's PersonaSwitcher button works for users with that perm; otherwise hidden.

**P10.T7 — Smoke tests.**
- Login as Till → land on `/md/overview` → all tiles populate within 2 s.
- Switching to Frank works (if user has both).

**Verification at end of Phase 10**
- Till can navigate the five core screens AND the four MD-specific screens entirely inside frontend-v2.

---

## 17. PHASE 11 — Heiko persona screens (mobile-first)

### Goals

Heiko's day is mobile + speed. New routes are mobile-first; desktop is a graceful enhancement.

### 17.1 New routes

| Route | Purpose |
|---|---|
| `/deal/inbox` | List of open deals + lost-deal feed + churn-risk customers. |
| `/deal/calculator/:quoteId?` | Mobile deal calculator (HEIKO-1, HEIKO-2). |
| `/deal/lost` | Lost-deal analytics with reasons (HEIKO-4). |
| `/deal/customer/:customerId` | Customer 360 in one screen (margin, churn, history, last visit). |

### 17.2 Tasks

**P11.T1 — Mobile-first layout primitives.**
- New `<MobileShell/>` for `/deal/*` routes that swaps the desktop `Shell` (sidebar + right rail) for a bottom-nav layout on viewports < 760 px.
- Persistent search bar fixed at top, pull-to-refresh on lists.

**P11.T2 — Deal calculator.**
- Inputs: customer, article, quantity, target close-date. Outputs: recommended price, optimal counter, commission preview, churn risk, market-anchor narrative (HEIKO-3).
- Calls `POST /api/v1/deal/recommend` with the inputs. Response from `workbench_service` (re-uses Studio building blocks but persona-trimmed for Sales-relevant fields only).
- Time to first paint must be ≤ 2 s on 4G; first interactive ≤ 30 s from cold (HEIKO-2). Lighthouse mobile score ≥ 90.

**P11.T3 — Inbox.**
- Three sections: Open deals (own quotes from `v_quote_active where rep_id = me`), Lost feed (recent lost quotes with one-line reason), Churn watch (customers with risk > 0.6 in own portfolio).

**P11.T4 — Lost-deal analytics.**
- Endpoint `/screens/lost-deals?rep=&since=` returning a feed of lost quotes with reasons (rejection_codes lookup), commodities, concession history.
- "Add learning" button writes to `deal_lessons(quote_id, learning_text, created_at)` — visible later for the rep (HEIKO-4).

**P11.T5 — Customer 360.**
- One screen showing: customer info, margin trend, churn score, last visit, top SKUs, lost-deal history, "Open new quote" CTA.

**P11.T6 — RBAC.**
- All `/deal/*` routes require `view.action_center` for own scope. Sales reps cannot see other reps' deals.

**P11.T7 — Heiko persona overlays on the core 6 screens.**
- Quotes screen filters to own quotes by default; analysis.rep collapses to own row; bulk actions disabled.
- Forecast collapses to own customers' Pareto + price floor.
- Studio is hidden.
- Margin Cockpit: only `tabs.cust` for own customers.
- AI Briefing renders own customer focus.
- Action Center: own queue only.

**P11.T8 — Tests.**
- Vitest: mobile-shell snapshot at 414 px viewport.
- E2E: Heiko logs in, taps a customer, calculates an offer, the offer appears in Frank's Action Center decisions queue with the correct evidence chain.

**Verification at end of Phase 11**
- All three personas operate fully inside frontend-v2.

---

## 18. PHASE 12 — Action persistence + Audit + A/B testing

### Goals

Every button on every screen actually does something durable.

### Tasks

**P12.T1 — Audit log table & service.**
- Schema as in §4.6.
- Helper `audit_service.record(actor, kind, target, before, after, delta)` callable from every action endpoint.
- Read APIs: `GET /api/v1/audit?since=30d&actor=`, paginated.

**P12.T2 — Action endpoints (consolidate).**
- The Phase 4–9 work scattered action endpoints under `/actions/*`. Consolidate into a flat `/api/v1/actions/{kind}` POST + idempotency keys.
- Idempotency key = `x-pryzm-idempotency-key` header; same key + same body → same response, replaying audit row.
- Kinds: `accept_recommendation`, `decline_recommendation`, `partial_accept`, `start_ab_test`, `stop_ab_test`, `quote_approve`, `quote_counter`, `quote_decline`, `quote_hold`, `quote_bulk`, `studio_accept`, `briefing_forward`, `briefing_pdf`, `briefing_email`, `guardrail_edit_request`, `guardrail_apply`, `forecast_override`, `notification_read`, `section_save`, `section_remove`.

**P12.T3 — A/B test backend.**
- Tables: `ab_tests(id uuid pk, aid, slice_pct, start_date, end_date, control_price, treatment_price, status text, created_by, audit_hash)`, `ab_test_results(test_id, period, control_margin, treatment_margin, control_volume, treatment_volume, p_value)`.
- Daily job updates results.
- Frontend Action Center "AbTestList" reads from `/api/v1/ab-tests?status=running`.

**P12.T4 — Frontend mutation hooks.**
- `useAcceptDecision()`, `useStartAbTest()`, `useApproveQuote()`, etc. Each is a thin wrapper around `apiPost` with an idempotency key derived from the target id + action kind.
- On success: invalidate the originating screen's query, `['shell']`, `['audit', 'recent']`.

**P12.T5 — Optimistic UI.**
- Where the UI shows immediate feedback (e.g. accepting a decision card removes it), use React Query's optimistic-update pattern. Roll back on error and surface a `<MessageStrip tone="error">`.

**P12.T6 — Action Cards screen decision.**
- The `useActionCards` hook (`/action-cards`) is currently unused. Decide:
  - Remove it (and its mock + types) — preferred unless we need a list view.
  - Or repurpose into a dedicated `/queue` route showing the user's open recommendations.
- Default decision: **remove**. Track via P14 settings task if a user-requested feature later.

**P12.T7 — Audit Trail block on Action Center.**
- The `audit` block in `action-center.json` becomes live data. Last 30 days, scoped to actor + the user's portfolio.

**P12.T8 — Tests.**
- Pytest: idempotency replay; same key returns same audit row id.
- Vitest: optimistic accept → API 500 rolls back UI.

**Verification at end of Phase 12**
- Accept a decision in Action Center → row appears in Audit Trail block within next refetch.
- Replay the same idempotency key → no duplicate audit row.

---

## 19. PHASE 13 — Full i18n (de/en parity)

### Goals

Every user-visible string is translatable; backend supports `?lang=`.

### Tasks

**P13.T1 — Audit string locations.**
- Run `grep`-based audit across `frontend-v2/src` for hard-coded German/English strings; produce `docs/i18n_audit.md` with file/line for each.
- All static UI strings move to `i18n/{de,en}.json` under stable keys.

**P13.T2 — Server-side translation.**
- Each composer endpoint accepts `?lang=de|en`. Backend stores body content (briefings, side cards, narratives) as keyed templates rendered per-language at request time.
- The mock JSON is the de version; en versions are added in `backend/seeds_en/`.

**P13.T3 — i18n provider.**
- Frontend writes `lang` cookie reflecting `i18next.language`. `apiFetch` adds `?lang=...` to every request from the cookie.

**P13.T4 — Date / number locale.**
- `date-fns` locale switches with i18next.language. `lib/format.ts` already uses `de-DE`; add an `en-GB` variant.

**P13.T5 — Tests.**
- Vitest with `i18n.changeLanguage('en')` → all nav strings switch; fetched payload english variant.

**Verification at end of Phase 13**
- Toggling language pill in TopBar instantly re-renders nav; subsequent fetches return English bodies.

---

## 20. PHASE 14 — Settings + saved views + DQ dashboard

### 20.1 New routes

| Route | Purpose |
|---|---|
| `/settings/profile` | Name, email, password, language, density, default persona. |
| `/settings/preferences` | Notification preferences, briefing email cadence. |
| `/settings/saved-views` | List + edit saved filter sets (used in Action Center / Margin / Studio). |
| `/settings/data-quality` | `quality_service` panels + GDPR audit log access. |
| `/settings/users` (admin only) | User & role management. |
| `/notifications` | Full pager-style notifications list. |
| `/notes` | Per-user notes journal. |

### 20.2 Tasks

**P14.T1 — Settings shell.**
- Reuses `<Shell/>` but with a left-side settings nav inside `<Outlet/>`.

**P14.T2 — Profile + preferences.**
- `GET/PATCH /api/v1/me` returns/updates profile; `GET/PATCH /api/v1/me/preferences` for the rest.

**P14.T3 — Saved views.**
- Table `saved_views(id, user_id, screen, filters_jsonb, label, is_default)`.
- Endpoint `GET /api/v1/saved-views?screen=` + CRUD.
- Action Center / Margin / Studio show a "Saved views" pill in their header that reads from this list. The Sidebar `SidebarDataStatus` "My saved views" promo block becomes live.

**P14.T4 — Data-quality dashboard.**
- Renders `quality_service.get_quality_summary` + per-source coverage + last-load timestamps.

**P14.T5 — Notifications page.**
- Same data as RightRail's notifications card, paginated.

**P14.T6 — Notes journal.**
- Per-user notes; create/edit/delete; search.

**P14.T7 — Admin user management.**
- Only for `admin.users` permission. Lists users + roles; can invite, disable, reset password.

**P14.T8 — Sidebar wiring.**
- `SidebarUserCard` "logout" button calls `/auth/logout` and redirects to `/login`.
- `SidebarDataStatus` reads real "Last sync" from `/api/v1/data-quality/summary.last_load_at` and "My saved views" count from `/saved-views?screen=*`.

**Verification at end of Phase 14**
- A logged-in user opens `/settings/profile`, changes language to en, the language pill in TopBar updates, and the next page fetch returns English content (depends on Phase 13).

---

## 21. PHASE 15 — Hardening: a11y, perf, deploy, observability

### Goals

Production-readiness gates.

### Tasks

**P15.T1 — Accessibility audit.**
- Run `@axe-core/react` against every screen. Track violations in `docs/a11y.md`.
- Targets: no Critical or Serious violations; aim for 100 % AA on contrast/focus order.
- Add keyboard-only walkthrough script for each screen.

**P15.T2 — Perf budget.**
- Per-screen size budgets (frontend bundle): Action Center ≤ 220 KB gz, Margin ≤ 250 KB gz, Quotes ≤ 220 KB, Studio ≤ 230 KB, Forecast ≤ 200 KB, AI ≤ 120 KB.
- Per-endpoint latency budgets: composer p95 ≤ 600 ms warm, ≤ 1.2 s cold.
- Tooling: vite-bundle-visualizer, k6 for backend, Lighthouse CI in PRs.

**P15.T3 — Sentry / error reporting.**
- Frontend: capture queries failing 2+ retries; tag with persona, route, query_key.
- Backend: capture 5xx and 4xx≥401; tag with user_id, route, screen.

**P15.T4 — Tracing.**
- `x-pryzm-trace-id` propagated through frontend → backend → Postgres (via comment annotations). Datadog or OTLP exporter.

**P15.T5 — Deploy pipeline.**
- Blue/green for backend (FastAPI behind nginx). Frontend is static; deploy to CDN (Cloudfront / Cloudflare). Health gate: 30 s probe success + traffic shift in 10 % steps.

**P15.T6 — Runbooks.**
- One-pager runbooks for: cold start, partial endpoint outage, mock-fallback toggling, briefing job failure, audit-log gap.

**P15.T7 — Final mock retirement.**
- Once every endpoint is real and stable for 2 weeks, set `VITE_ALLOW_MOCK_FALLBACK=false` in production. Mock files remain in dev only.

**Verification at end of Phase 15**
- Lighthouse mobile score ≥ 90 on Heiko's deal calculator; desktop ≥ 95 on every other screen.
- p95 endpoint latency under budget on staging load test.

---

## 22. PER-SCREEN MIGRATION PLAYBOOKS

The phase plan above is "the order to do things in". The playbooks below are "the per-screen reference". When you sit down to wire one screen, find its playbook here, treat it like a checklist.

Each playbook has six standard sections:
1. **Surface** — every component that renders this screen.
2. **Data shape** — the canonical payload's top-level keys.
3. **Backend contract** — endpoint, query params, semantics, latency budget.
4. **Field mapping** — every leaf field, its source, its formatting rule.
5. **States** — loading skeleton, empty, error, partial.
6. **Persona variants** — Frank / Till / Heiko deltas.

---

### 22.1 Action Center (`/action-center`)

#### 22.1.1 Surface

- `features/action-center/index.tsx` (data fetch + composition).
- Children: `PageHead`, `MovableHero`, `BucketGrid`, `DecisionCards`, `TrustStrip`, `LostQuoteCard`, `SkuTable`, `LongTailCoverage`, `NegotiationCockpit`, `AbTestList`, `RejectionList`, `AuditTrail`, `ReportCard`.
- Layout container: max-width 1400 px, padded 32 / 24.
- Hook: `useActionCenter` → `apiFetch('/action-center')`.

#### 22.1.2 Data shape

`ActionCenterData` (see `src/types/index.ts`): `header`, `movableHero`, `buckets`, `decisions`, `trust`, `lostQuote`, `skuTable`, `longTail`, `negotiation`, `rejections`, `audit`, `abTests`.

#### 22.1.3 Backend contract

- Endpoint: `GET /api/v1/screens/action-center`.
- Params: `week` (ISO), `cluster`, `customer_id`, `hide_locked`, `lang`, `persona`. All optional.
- Cache: 60 s in-memory per (user, week, cluster). ETag includes audit hash.
- Latency budget: p95 600 ms warm.

#### 22.1.4 Field mapping (selected)

| Field | Source | Formatting rule |
|---|---|---|
| `header.greeting` | `users.name` | "Good morning, {firstname}." (de: "Guten Morgen, {firstname}.") |
| `header.week` | server clock | ISO week number prefixed "Week ". |
| `header.dateRange` | server clock | `start − end` in `MMM d` format. |
| `header.stats[*]` | `stats` service | Comma-formatted thousands. |
| `movableHero.value` | `analyst_home_service.movable_hero.value` | `fmt.eur` server-side; never client-formatted. |
| `movableHero.delta` | `movable_hero.delta_wow` | "+/-" + percent + " vs Wk N-1". |
| `movableHero.deltaDirection` | derived from sign | up/down/flat. |
| `movableHero.totalRevenue` | from `v_movable_revenue` | EUR formatted. |
| `movableHero.movablePct` | `movable_eur / total_eur * 100` | integer %. |
| `movableHero.skusInScope` | distinct article count where movable | integer. |
| `movableHero.spark[]` | last 14 ISO weeks of movable revenue | numeric, in EUR (not formatted; the chart formats). |
| `buckets[]` | bucket service | each item: id, title, subtitle, tags[], avatars[], cta. |
| `decisions[]` | Decision Engine top-3 by impact | `rank` left-padded ("1.", "2.", "3."), `severity` from impact mapping. |
| `decisions[].cluster.confidence` | `benchmark_service.confidence(cluster_id)` | integer. |
| `decisions[].cluster.n` | benchmark sample size | integer. |
| `decisions[].contract` | derived from `frame_contract_end` | `'movable' \| 'locked' \| 'abtest'`. |
| `decisions[].cta` / `primaryCta` / `secondaryCta` | copy templates | de/en, persona-specific. |
| `trust[]` | per tile (see P4.T4) | always 4 tiles. |
| `lostQuote` | `quote_service.price_sensitivity` | integers + p-value. |
| `skuTable[]` | `v_sku_pricing_engine` | up to 50; cluster confidence integer; status string. |
| `longTail` | `v_long_tail_coverage` | tiles + mix bars. |
| `negotiation.commodities[]` | `cost_service.get_cost_trends(top=4)` | one row per commodity; sign in delta string. |
| `rejections[]` | `quote_service.rejection_codes` | top 5 by lost revenue. |
| `audit[]` | `audit_service.recent` | last 10. |
| `abTests[]` | `ab_test_service.list(status='running')` | up to 5. |

#### 22.1.5 States

- **Loading** — full-screen skeleton with section bones; animation 1.5 s pulse.
- **Empty per-block** — "No data for this filter" copy with link to `/settings/saved-views`.
- **Error** — top message strip; failed block also shows in-place error message + "Try again" button.

#### 22.1.6 Persona variants

| Persona | Differences |
|---|---|
| Frank | Default. All blocks. |
| Till | `negotiation` and `skuTable` collapse to summary by default. `decisions` reframed for board narrative. `report` action emphasises "Send to board pack". |
| Heiko | Only `decisions` (own scope), `lostQuote`, `negotiation` (mobile copy), and `audit` (own actions). Layout switches to mobile-shell when viewport < 760 px. |

---

### 22.2 Margin Cockpit (`/margin`)

#### 22.2.1 Surface

- `features/margin-cockpit/index.tsx`.
- Children: `MarginPageHead`, `BriefingMemo` (toggleable), `MarginHealthStrip`, `ClusterMiniRow`, `ShiftedStrip`, `WaterfallCard`, `LostQuoteDifferential`, `CostVsPriceCard`, `MarginTabs` (5 sub-tabs: cross / leak / seg / erode / cust), `CrossLinks`.
- Layout: full-bleed (`pz-fullbleed` body class on mount).
- Hook: `useMarginCockpit` → `apiFetch('/margin-cockpit')`.

#### 22.2.2 Data shape

`MarginCockpitData` (see `src/types/index.ts`).

#### 22.2.3 Backend contract

- Endpoint: `GET /api/v1/screens/margin-cockpit`.
- Params: `cluster`, `family`, `tier`, `period`, `customer_id`, `lang`, `persona`.
- Cache: 60 s; ETag includes the latest `audit_hash` so a re-priced SKU invalidates.
- Latency budget: p95 800 ms warm.

#### 22.2.4 Field mapping (selected)

| Field | Source |
|---|---|
| `header.crumbTrail` | persona + screen name. |
| `header.title` | "Margin Intelligence". |
| `header.subPills[]` | static (`Predictive Portfolio Pricing`, `Diagnostics`). |
| `header.subStats[]` | "refreshed today / LTM" + counts from `stats`. |
| `header.auditTag` | "Audit-ready · hash-signed". |
| `header.filters[]` | active filter values from query params. |
| `briefing` | `briefing_service.draft_memo(scope='margin')`. |
| `health[*]` | per `MarginHealthCell`: score = composite ring 0–100; actual = LTM weighted; belowPlan = target − actual; closable = `risk_service.estimate_closable_bp`. |
| `clusters[]` | per cluster code: margin %, target, conf %, tone (green/amber/red), warning if low-n. |
| `shifted` | top WoW movers from `margin_service.trend(weekly)`; net line is sum. |
| `waterfall.buckets[]` | fixed order target → mix → discount → cost → rebate → erosion → actual. |
| `waterfall.movableLocked` | `movable_locked_split_service`. |
| `lostQuote` | shared with Action Center. |
| `costVsPrice.series[]` | 24 months of indexed cost vs price (Apr 2024 = 100). |
| `tabs.cross.rows[]` | `v_cross_customer`. |
| `tabs.leak.rows[]` | `v_sku_leakage`. |
| `tabs.seg.subPanes[]` | family / tier / size / region — see P5.T5. |
| `tabs.erode.rows[]` | `v_erosion`. |
| `tabs.cust.rows[]` | `customer_trend_service`. |
| `crossLinks[]` | static map. |

#### 22.2.5 States

- Loading — page skeleton with each block bone.
- Per-block error — render only that block in error mode; rest of page renders.
- Tab fetching — cached per (tab, segTab); first-load shows tab skeleton.

#### 22.2.6 Persona variants

- Frank — default.
- Till — same blocks; briefing voice "board-ready"; tab `leak` collapses to summary; export pill always shown.
- Heiko — only `tabs.cust` for own customers; others hidden; `briefing` voice emphasises customer impact.

---

### 22.3 Quotes & Guardrails (`/quotes`)

#### 22.3.1 Surface

- `features/quotes/index.tsx`.
- Children: `PageHead`, `BriefingMemo`, `PipelineStrip`, `ChangedStrip`, `EscalationsSection`, `FunnelSection`, `GuardrailsSection`, `ActiveQuotesTable`, `AnalysisSection` (3 tabs: rep / sku / cust), `CrossLinks`.
- Layout: full-bleed.
- Hook: `useQuotes` → `apiFetch('/quotes')`.

#### 22.3.2 Data shape

`QuotesShell` (see `src/types/quotes.ts`).

#### 22.3.3 Backend contract

- Endpoint: `GET /api/v1/screens/quotes`.
- Params: `week`, `rep`, `customer_id`, `family`, `tier`, `lang`, `persona`.
- Cache: 30 s (re-evaluates every 2 min per the page subPill — but cache shorter so user-visible refresh is responsive).
- Latency budget: p95 700 ms warm.

#### 22.3.4 Field mapping (selected)

| Field | Source |
|---|---|
| `header.subStats` | "Routed Mon 06:00", "47 active quotes", "4 need approval". |
| `briefing` | `briefing_service.draft_memo(scope='quotes')`. |
| `pipeline[]` | 4 counters (Routed today, Active quotes with R/A/G mini, Need approval today, Won/Lost LTM). |
| `changed.rows[]` | snapshot diff vs Monday. |
| `escalations.cards[]` | top quotes with `margin_breach_pp ≥ 3` AND tier in A/B; bulk recommendation across them. |
| `funnel.funnel[]` + `aging[]` | quote stages + age bucket counts. |
| `guardrails.cards[]` | from `guardrails` table. |
| `active.rows[]` | `v_quote_active`; row action target `'escalation'` jumps to escalation card. |
| `analysis.rep.rows[]` | rep performance LTM. |
| `analysis.sku.rows[]` | SKU breach LTM. |
| `analysis.cust.rows[]` | customer concession LTM. |
| `crossLinks[]` | static. |

#### 22.3.5 States

- Loading — page skeleton.
- Pipeline live indicator (`live: true`) — pulsing dot kept even during refresh.
- Active quotes table empty — "No active quotes — your pipeline is dry" copy with CTA "Open lost analytics".

#### 22.3.6 Persona variants

- Frank — default.
- Till — read-only; bulk actions disabled; guardrail change history surfaced; escalations annotated with "MD authority required".
- Heiko — own quotes only; analysis.rep limited to self; deal-calculator pill in page head as primary CTA.

---

### 22.4 Forecasting (`/forecasting`)

#### 22.4.1 Surface

- `features/forecasting/index.tsx`.
- Children: `PageHead`, `HeroForecast`, `ClusterLens`, `WalkForward`, `InputCostTrajectory`, `ParetoLayer`, `PriceFloor`, `NewProductForecast`, `CrossLinkStrip`.
- Layout: max-width 1400 px.
- Hook: `useForecast` → `apiFetch('/forecast')`.

#### 22.4.2 Data shape

`ForecastShell` (see `src/types/forecast.ts`).

#### 22.4.3 Backend contract

- Endpoint: `GET /api/v1/screens/forecast`.
- Params: `mode` (revenue|margin|volume), `horizon=12`, `tier`, `family`, `cluster`, `lang`, `persona`.
- Cache: 60 s.
- Latency budget: p95 700 ms warm.

#### 22.4.4 Field mapping (selected)

| Field | Source |
|---|---|
| `hero.series[]` | `forecasts(entity_type='global')` for next 12 months; `actual` only when month is past. |
| `hero.movers[]` | top contributors (positive and negative); from `forecast_drivers`. |
| `hero.movableLockedSplit` | shared with Action Center. |
| `hero.whyBandMoves` | drivers explaining envelope. |
| `clusters[]` | per-cluster forecast vs LTM with conf. |
| `walkForward.series[]` | last 12 months MAPE. |
| `walkForward.kpis[]` | LTM MAPE, hit-rate ±5 %, hit-rate ±10 %. |
| `inputCost.tiles[]` | 4 commodity tiles. |
| `inputCost.stress` | central scenario from `simulation_service`. |
| `pareto.customer.rows[]` | top 80 % revenue customers. |
| `pareto.sku.rows[]` | top 80 % revenue SKUs. |
| `priceFloor[]` | per-customer-per-article floor adherence. |
| `newProduct.cards[]` | comparable-cluster proposals for new SKUs. |

#### 22.4.5 States

- Loading — chart and table skeletons.
- Mode switching — refetches with the same query key plus new mode.

#### 22.4.6 Persona variants

- Frank — default.
- Till — Pareto rows collapse to summary; new-product cards hidden by default.
- Heiko — own customers only.

---

### 22.5 Pricing Studio (`/pricing`)

#### 22.5.1 Surface

- `features/pricing-studio/index.tsx`.
- Children: `PageHead`, `SkuPicker`, `WorkbenchHero`, `PriceOptions`, `CustomerFanout`, `CostHistory`, `ComparablePanel` (only for new SKUs), `DecisionFooter`, `RationaleMemo`, `CrossLinks`.
- Layout: full-bleed; CSS grid `ws-grid`.
- Hooks: `useStudioShell` (list) + `useStudioWorkbench(aid)` (per-SKU) — see Phase 8 split.

#### 22.5.2 Data shape

`StudioShell` (see `src/types/studio.ts`); per-SKU `WorkbenchData`.

#### 22.5.3 Backend contract

- Endpoints:
  - `GET /api/v1/screens/studio` — list, default aid, default workbench, comparable.
  - `GET /api/v1/screens/studio/workbench/{aid}` — per-SKU workbench.
  - `GET /api/v1/screens/studio/comparable/{aid}` — comparable panel for new SKUs.
- Params: `filter` (all|floor|stale|cost|frame), `hide_locked`, `lang`, `persona`.
- Latency budgets: list ≤ 700 ms; workbench ≤ 600 ms; comparable ≤ 400 ms.

#### 22.5.4 Field mapping (selected)

| Field | Source |
|---|---|
| `skus[].aid` / `description` / `cluster` / `clusterChip` | `v_sku_pricing_engine`. |
| `skus[].flag` | `'floor'\|'stale'\|'cost'\|'frame'\|'all'`; derived from per-SKU rules. |
| `defaultAid` | Frank's "today's hottest SKU" from Decision Engine. |
| `workbench.hero` | composed in `workbench_service`. |
| `workbench.options.{hold,floor,market,abtest}` | per-option calculation per P8.T2. |
| `workbench.fanout.rows[]` | up to 6 customers from `customer_set` for the SKU's cluster. |
| `workbench.cost.components[]` | material/labor/outsourcing/overhead percentages from `cost_composition_service`. |
| `workbench.cost.trajectory` | 4-yr trajectory. |
| `workbench.history[]` | from `audit_log` filtered to actions on this SKU. |
| `workbench.decision` | decision summary; effective_date defaults to first of next month + 30 d. |
| `workbench.memo` | `briefing_service.draft_memo(scope='studio_sku')`. |
| `comparable` | only present for new SKUs. |

#### 22.5.5 States

- Loading — list skeleton + workbench bones; comparable hidden until needed.
- Empty list — "No SKUs match this filter" + reset filters CTA.
- Error per workbench — show in-place error in the workbench; SKU list still navigable.

#### 22.5.6 Persona variants

- Frank — default; can accept.
- Till — read-only; "Approve" on Frank's pending proposals.
- Heiko — hidden screen.

---

### 22.6 AI Briefing (`/ai`)

#### 22.6.1 Surface

- `features/ai-briefing/index.tsx`.
- Children: header, memo, 3 side cards (`changed`, `selfCorrection`, `voice`), cross-links.
- Layout: full-bleed.
- Hook: `useAi` → `apiFetch('/ai')`.

#### 22.6.2 Data shape

`AiShell` (see `src/types/ai.ts`).

#### 22.6.3 Backend contract

- Endpoint: `GET /api/v1/screens/ai`.
- Params: `week`, `persona`, `lang`.
- Cache: 5 min (briefings change at most weekly).
- Latency budget: p95 500 ms warm.

#### 22.6.4 Field mapping (selected)

| Field | Source |
|---|---|
| `header.subStats[]` | generation timestamp + sources count. |
| `header.actions[]` | Forward / PDF / Email — primary "Email weekly". |
| `memo.title` | "Monday Briefing — {persona role} — Week of {week_start}" |
| `memo.fromLine` | "From: Pryzm · To: {user.name} · Generated {ts}" |
| `memo.paragraphs[]` | provider-rendered HTML, sanitised. |
| `memo.signature` | "— Pryzm, in the voice of …" persona-specific. |
| `sideCards[3]` | one of `changed | selfCorrection | voice` each. |
| `crossLinks[]` | static map. |

#### 22.6.5 States

- Loading — memo skeleton (3 paragraph bones) + 3 card skeletons.
- Error — message strip; memo + cards each show "retry" buttons.

#### 22.6.6 Persona variants

- Frank — full.
- Till — different memo voice ("CFO summary"); no `selfCorrection` card.
- Heiko — single-card view (own customers); Phase 11.

---

### 22.7 Shell rail (RightRail) — cross-screen

#### 22.7.1 Surface

- `app/layout/RightRail.tsx`.
- Hook: `useShell` → `apiFetch('/shell')`.

#### 22.7.2 Data shape

`ShellRailData` (`src/types/shell.ts`): `notifications[]`, `reviewers{panelLabel, people[], extraCount}`, `sections[]`.

#### 22.7.3 Backend contract

- Endpoint: `GET /api/v1/screens/shell`.
- Params: none.
- Cache: 30 s.
- Latency budget: p95 200 ms warm.

#### 22.7.4 Field mapping

| Field | Source |
|---|---|
| `notifications[]` | top 3 unread + most-recent read; tone mapped from event class. |
| `reviewers.panelLabel` | user's primary panel (`Cross-functional pricing panel` for Frank). |
| `reviewers.people[]` | up to 5 panel members; `bg` = stable colour from `panels`. |
| `reviewers.extraCount` | members above 5. |
| `sections[]` | user's saved sections + 3 system sections (Action Center, Margin, Quotes) marked active when matching current route. |

#### 22.7.5 States

- Loading — `aria-busy="true"` empty rail.
- Empty notifications — "All clear" copy.
- Empty reviewers — "Assign reviewers" CTA (admin only).

---

### 22.8 Sidebar — cross-screen

The Sidebar is purely client-side today (nav routes + persona-aware user card + saved-views promo + data-status promo).

#### Tasks specific to Sidebar across phases

- Phase 2: SidebarUserCard reads from `useMe()`.
- Phase 3: SidebarDataStatus "Last sync" reads from `data-quality/summary.last_load_at`.
- Phase 14: SidebarDataStatus "My saved views" reads from `/saved-views?screen=*`.
- Phase 15: focus-order audit + keyboard navigation pass.

---

### 22.9 TopBar — cross-screen

Mostly cosmetic today (logo, search, language pill, date, Create CTA). Wiring tasks:

- Phase 1: `TopBarSearch` becomes a typeahead hitting `/api/v1/search?q=` (Phase 14 fully implements).
- Phase 2: PersonaSwitcher works in-app (no external redirects).
- Phase 13: language pill toggles i18n.
- Phase 15: a11y audit; ensure search has the proper landmark.

---

## 23. ENDPOINT REGISTRY (single page reference)

| # | Method | Path | Phase | Body / Params | Returns |
|---|---|---|---|---|---|
| 1 | GET | `/api/v1/screens/version` | 1 | — | `{version, schema_hash, backend_commit}` |
| 2 | GET | `/api/v1/screens/shell` | 3 | — | `ShellRailData` |
| 3 | GET | `/api/v1/screens/action-center` | 4 | `?week, ?cluster, ?customer_id, ?hide_locked, ?lang, ?persona` | `ActionCenterData` |
| 4 | GET | `/api/v1/screens/margin-cockpit` | 5 | `?cluster, ?family, ?tier, ?period, ?customer_id, ?lang, ?persona` | `MarginCockpitData` |
| 5 | GET | `/api/v1/screens/quotes` | 6 | `?week, ?rep, ?customer_id, ?family, ?tier, ?lang, ?persona` | `QuotesShell` |
| 6 | GET | `/api/v1/screens/forecast` | 7 | `?mode, ?horizon, ?tier, ?family, ?cluster, ?lang, ?persona` | `ForecastShell` |
| 7 | GET | `/api/v1/screens/studio` | 8 | `?filter, ?hide_locked, ?lang, ?persona` | `StudioShell` minus per-SKU workbench |
| 8 | GET | `/api/v1/screens/studio/workbench/{aid}` | 8 | — | `WorkbenchData` |
| 9 | GET | `/api/v1/screens/studio/comparable/{aid}` | 8 | — | `ComparablePanel` |
| 10 | GET | `/api/v1/screens/ai` | 9 | `?week, ?persona, ?lang` | `AiShell` |
| 11 | GET | `/api/v1/screens/lost-deals` | 11 | `?rep, ?since` | feed |
| 12 | POST | `/api/v1/auth/login` | 2 | `{email, password}` | sets cookies; returns `Me` |
| 13 | POST | `/api/v1/auth/refresh` | 2 | — | sets new cookies |
| 14 | POST | `/api/v1/auth/logout` | 2 | — | clears cookies |
| 15 | GET | `/api/v1/me` | 2 | — | `{id, name, email, roles, permissions, ui_persona, features}` |
| 16 | PATCH | `/api/v1/me` | 14 | profile fields | updated `Me` |
| 17 | PATCH | `/api/v1/me/preferences` | 14 | preferences | `{ok}` |
| 18 | GET | `/api/v1/notifications` | 3, 14 | `?cursor` | paginated |
| 19 | POST | `/api/v1/notifications/{id}/read` | 3 | — | `{ok}` |
| 20 | GET | `/api/v1/sections` | 3 | — | sections |
| 21 | POST | `/api/v1/sections` | 3 | section body | created |
| 22 | PATCH | `/api/v1/sections/{id}` | 3 | section body | updated |
| 23 | DELETE | `/api/v1/sections/{id}` | 3 | — | `{ok}` |
| 24 | POST | `/api/v1/actions/{kind}` | 12 | varies | `{ok, audit_id, audit_hash}` |
| 25 | GET | `/api/v1/audit` | 12 | `?since, ?actor, ?cursor` | paginated |
| 26 | GET | `/api/v1/ab-tests` | 12 | `?status` | tests |
| 27 | POST | `/api/v1/jobs/briefing/run` | 9 | `{week, persona}` | `{job_id}` |
| 28 | GET | `/api/v1/saved-views` | 14 | `?screen` | views |
| 29 | POST | `/api/v1/saved-views` | 14 | view body | created |
| 30 | PATCH | `/api/v1/saved-views/{id}` | 14 | view body | updated |
| 31 | DELETE | `/api/v1/saved-views/{id}` | 14 | — | `{ok}` |
| 32 | GET | `/api/v1/search` | 14 | `?q` | typeahead suggestions |
| 33 | POST | `/api/v1/deal/recommend` | 11 | `{customer, article, qty, target_date}` | recommendation |

All write-endpoints carry `x-pryzm-idempotency-key` and write to `audit_log`.

---

## 24. DATA SOURCING — what each frontend block ultimately reads

This table is the inverse of the field-mapping tables: by source, which screen blocks consume it.

| Source / table / view | Consumed by |
|---|---|
| `users`, `user_roles`, `roles` | `/me`, Sidebar, PersonaSwitcher, RBAC. |
| `notifications`, `panels`, `reviewers`, `sections` | RightRail. |
| `saved_views` | SidebarDataStatus, screen page-heads. |
| `invoices` (existing) | `margin_service.*`, `cost_service.*`, `forecast_service.*`. |
| `quotes` (existing) | `quote_service.*`, escalations, funnel, analysis tabs. |
| `quote_invoice_links` (existing) | gap analysis, leakage, lost-quote differential. |
| `rejection_codes` (existing) | rejection rank block on Action Center. |
| `forecasts` | hero, walk-forward, clusters, pareto. |
| `risk_scores` | trust strip, churn watch, decisions, customer trend. |
| `cost_trends` | input cost tiles, cost vs price, commodity moves. |
| `benchmarks` | cluster confidence, comparable panel. |
| `monte_carlo` | input-cost stress test. |
| `seasonal` | input-cost trajectory tooltip notes. |
| `backtests` | walk-forward kpis. |
| `data_quality_*` views | trust strip, settings/data-quality, KA "no information" callout. |
| `audit_log` | Action Center audit trail, Studio history, Quote escalations evidence chain. |
| `ab_tests`, `ab_test_results` | Action Center A/B tracker, Decision Engine cluster confidence boosts. |
| `briefings`, `briefing_diffs` | AI Briefing memo + side cards. |
| `guardrails`, `guardrail_change_requests` | Quotes guardrails. |
| `v_movable_revenue` (NEW Phase 4) | Action Center movableHero, buckets, decisions. |
| `v_sku_pricing_engine` (NEW Phase 4) | Action Center skuTable, Studio list, Decision Engine. |
| `v_long_tail_coverage` (NEW Phase 4) | Action Center longTail. |
| `v_quote_active` (NEW Phase 6) | Quotes active table, escalations. |
| `v_cross_customer` (NEW Phase 5) | Margin tabs.cross. |
| `v_sku_leakage` (NEW Phase 5) | Margin tabs.leak. |
| `v_erosion` (NEW Phase 5) | Margin tabs.erode. |
| `v_customer_trend` (NEW Phase 5) | Margin tabs.cust. |

---

## 25. NEW DATABASE OBJECTS (initial proposed schema)

A consolidated list. Each object is owned by exactly one phase; later phases may add columns but not own.

| Object | Phase | Purpose |
|---|---|---|
| Table `users` | 2 | Identity. |
| Table `roles` | 2 | RBAC roles. |
| Table `user_roles` | 2 | M2M. |
| Table `notifications` | 3 | Right-rail. |
| Table `panels` | 3 | Reviewer panels. |
| Table `reviewers` | 3 | Panel members. |
| Table `sections` | 3 | Saved sections. |
| Table `audit_log` | 12 | All write actions. |
| Table `ab_tests` | 12 | A/B tests. |
| Table `ab_test_results` | 12 | A/B daily numbers. |
| Table `guardrails` | 6 | Threshold cards. |
| Table `guardrail_change_requests` | 6 | Pending edits. |
| Table `briefings` | 9 | Generated briefings. |
| Table `briefing_diffs` | 9 | Week-over-week diffs. |
| Table `saved_views` | 14 | User filter sets. |
| Table `deal_lessons` | 11 | Heiko's learnings. |
| Materialised view `v_movable_revenue` | 4 | — |
| Materialised view `v_sku_pricing_engine` | 4 | — |
| Materialised view `v_long_tail_coverage` | 4 | — |
| Materialised view `v_quote_active` | 6 | — |
| Materialised view `v_cross_customer` | 5 | — |
| Materialised view `v_sku_leakage` | 5 | — |
| Materialised view `v_erosion` | 5 | — |
| Materialised view `v_customer_trend` | 5 | — |

All views are refreshed concurrently every 5 min (cron).

---

## 26. TESTING POLICY

### 26.1 Unit tests (frontend)

- Vitest + React Testing Library + jsdom.
- Each feature page has a smoke test (renders without error using msw + canonical mock).
- Each interactive component (e.g. `MarginTabs`, `LostQuoteDifferential`, `BucketGrid`) has a behaviour test for state transitions.
- Mutation hooks have an optimistic-rollback test.

### 26.2 Contract tests (backend ↔ mocks)

For each composer endpoint:
1. Boot FastAPI in-process with the seed DB.
2. Hit the endpoint.
3. Validate against the Pydantic model.
4. Assert deep-equality with the canonical mock JSON when the seed dataset matches the mock dataset.

When a screen is wired with real data and divergence from the mock is unavoidable, replace the mock with the new canonical seed and re-baseline.

### 26.3 E2E tests (Playwright)

Per persona, one E2E flow:

- **Frank**: login → land on Action Center → accept a decision → audit trail shows the new row → export PDF.
- **Till**: login → MD overview → drill to margin cockpit → forward briefing to inbox.
- **Heiko**: mobile login → calculator → submit recommendation → appear in Frank's queue.

### 26.4 Load tests (k6)

Each composer at 10 RPS for 60 s; assert p95 within budget.

### 26.5 Visual regression

Per-screen Playwright screenshot at 1440 × 900 and 414 × 900 (mobile shell only). Saved under `tests/visual/`. Diff threshold 0.2 %.

---

## 27. ROLLOUT / CUTOVER

1. Ship Phases 0–1 to staging behind `VITE_SCHERZINGER_API`. Mocks remain. Internal smoke pass.
2. Ship Phases 2–3 behind a feature flag. Demo users only.
3. From Phase 4, screens cut over individually. The `apiFetch` per-path fallback (P0.T3) lets `/action-center` go live while `/margin` still uses mocks.
4. After every screen is live for 2 weeks at p95 budget, ship Phase 15.T7 (mock retirement).
5. Production cut: blue/green for backend; static hosting cache-bust for frontend.

---

## 28. RISKS & MITIGATIONS

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backend BFF latency exceeds budget on Margin Cockpit | M | H | Phase 5 includes parallel fan-out and a `?heavy=true` flag for first paint to skip slowest blocks. |
| LLM provider outage breaks AI Briefing | L | M | Template provider fallback (Phase 9.T3); cached previous briefing served. |
| Audit hash collision on rapid double-click | L | L | Idempotency keys in P12.T2. |
| Permission misconfiguration leaks Heiko-private data to other reps | L | H | Permission tests in CI for every endpoint; row-level filtering enforced server-side, never client-side. |
| Mocks drift from real responses | M | M | Contract tests (P0.T5) re-run on every PR; failure blocks merge. |
| Phase order slips (e.g. RBAC after a screen ships) | M | H | Phase 2 is hard prerequisite for Phases 4–14; do not ship a screen broadly without Phase 2 in prod. |
| Persona-switching elevates permissions | L | H | Permissions read from `/me` only; persona is UI hint and never grants access. |
| Mobile Heiko load time > 2 s | M | H | Code-split by route; `/deal/*` ships as a separate chunk; preload on first interaction. |
| Briefing copy generates accidental PII | L | H | LLM provider receives only aggregated snapshots — no PII in prompt; output sanitised by `bleach`; copy templates reviewed. |

---

## 29. APPENDIX A — FILE-BY-FILE TOUCH LIST

This is the literal list of files the implementer is expected to add or modify across all phases. Use it as a directory map.

### Frontend (`/Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2/src`)

**Add**
- `app/router.tsx` — extend with `/login`, `/md/*`, `/deal/*`, `/settings/*`, `/notifications`, `/notes`.
- `app/layout/MobileShell.tsx`.
- `features/auth/Login.tsx`.
- `features/md/Overview.tsx`, `Monthly.tsx`, `Board.tsx`, `LensHoffmann.tsx`.
- `features/deal/Inbox.tsx`, `Calculator.tsx`, `Lost.tsx`, `Customer360.tsx`.
- `features/settings/Profile.tsx`, `Preferences.tsx`, `SavedViews.tsx`, `DataQuality.tsx`, `Users.tsx`.
- `features/notifications/Page.tsx`.
- `features/notes/Page.tsx`.
- `components/auth/RequireAuth.tsx`, `RequirePermission.tsx`.
- `components/skeletons/<one-per-block>.tsx`.
- `components/empty/<one-per-block>.tsx`.
- `data/api/useMe.ts`, `useNotifications.ts`, `useSections.ts`, `useAuditTrail.ts`, `useAbTests.ts`, `useGuardrails.ts`, `useSavedViews.ts`, `useDealRecommend.ts`, `useStudioWorkbench.ts`, `useStudioComparable.ts`, `useStudioShell.ts` (split from `useStudio`).
- `data/api/mutations/` — one file per mutation (acceptDecision, startAbTest, approveQuote, etc.).
- `stores/authStore.ts`.
- `lib/api/idempotency.ts`.
- `lib/i18n/keys.ts` (string key constants).
- Tests: per-feature smoke + behaviour tests; visual regression baselines.

**Modify**
- `lib/api/client.ts` — add per-path fallback (P0.T3); add CSRF for mutations (P2.T4).
- `lib/api/queryKeys.ts` — expand factory.
- `app/providers.tsx` — wrap with `<AuthProvider/>` (or via `useMe()` boot).
- `app/layout/PersonaSwitcher.tsx` — drop external redirects; gate by permissions.
- `app/layout/SidebarUserCard.tsx` — read from `useMe()`.
- `app/layout/SidebarDataStatus.tsx` — live data.
- `app/layout/RightRail.tsx` — interactivity (read, sections CRUD, panels modal).
- `app/layout/TopBar.tsx` — language pill toggles i18n; PersonaSwitcher in-app.
- `app/layout/TopBarSearch.tsx` — connect to `/search`.
- `data/api/useStudio.ts` — split into shell + workbench hooks.
- `data/api/studio-workbench.ts` — keep as mock fallback only.
- `i18n/de.json`, `i18n/en.json` — expand.
- `tests/*` — keep all passing; add new per-phase.

### Backend (`/Users/dharmendersingh/Documents/Scherzinger_new/scherzinger-platform`)

**Add**
- `backend/api/v1/screens.py` — composers (Phase 1).
- `backend/api/v1/auth.py` — login/refresh/logout/me (Phase 2).
- `backend/api/v1/actions.py` — all `/actions/{kind}` (Phase 12).
- `backend/api/v1/audit.py` — audit trail (Phase 12).
- `backend/api/v1/ab_tests.py` — A/B test list/get (Phase 12).
- `backend/api/v1/notifications.py`, `sections.py`, `panels.py` — right-rail (Phase 3).
- `backend/api/v1/guardrails.py` — quotes guardrails (Phase 6).
- `backend/api/v1/saved_views.py` — settings (Phase 14).
- `backend/api/v1/search.py` — typeahead (Phase 14).
- `backend/api/v1/jobs.py` — briefing run (Phase 9).
- `backend/api/v1/deal.py` — Heiko's deal recommend (Phase 11).
- `backend/services/analyst_home_service.py` — Phase 4.
- `backend/services/workbench_service.py` — Phase 8.
- `backend/services/audit_service.py` — Phase 12.
- `backend/services/briefing_service.py` (+ providers) — Phase 5/9.
- `backend/services/notification_service.py` — Phase 3.
- `backend/services/ab_test_service.py` — Phase 12.
- `backend/services/customer_trend_service.py` — Phase 5.
- `backend/services/movable_locked_split_service.py` — Phase 4/5.
- `backend/services/copy_templates/` — narrative templates per scope.
- `backend/schemas/screens/{shell,action_center,margin_cockpit,quotes,forecast,studio,ai}.py` — Phase 1.
- `backend/schemas/auth.py`, `actions.py`, `audit.py`, `ab_tests.py`, etc. — per phase.
- `backend/migrations/alembic/versions/xxx_*.py` — one per new table/view.
- `backend/openapi/screens.yaml` — Phase 0.
- `backend/seeds/` — initial seed JSONs mirroring frontend mocks (Phase 1).
- `backend/seeds_en/` — English variants (Phase 13).
- `backend/tests/contract/` — contract suite (Phase 0).
- `backend/tests/test_auth.py`, `test_actions.py`, `test_audit.py`, etc.

**Modify**
- `backend/main.py` — mount new routers; tighten CORS; add JWT middleware.
- `backend/config.py` — new env vars.
- `backend/database.py` — add `get_user_db` dependency (RBAC).
- Existing services as needed (no signature breakage).

---

## 30. APPENDIX B — DAY-ONE CHECKLIST FOR THE IMPLEMENTER

When picking up this plan, work in this exact order on day one:

1. Read this file end to end.
2. Skim `frontend-v2/src/types` to internalise the shapes.
3. Open one mock JSON next to its type — confirm the parser would accept it.
4. Open `scherzinger-platform/backend/api/v1/margins.py` and one matching service file — confirm you can read the existing pattern.
5. Read the persona doc (`Persona/20260505_PRYZM_Value_Proposition_Canvas_EN.docx`) sections for Frank, Till, Heiko (they are short).
6. Read `Frank_Realignment_Plan.md` (it's the historical brief that produced the current Action Center).
7. Run `frontend-v2`'s `pnpm dev` (or `npm run dev`) and click every screen — confirm everything loads from mocks today.
8. Pick **Phase 0** and ship it before any data work. The plan is intolerant of skipping Phase 0/1 — the rest depends on the mock fallback and BFF skeleton.

---

## 31. APPENDIX C — DEFINITION-OF-DONE PER PHASE (one-liners)

| Phase | One-line DoD |
|---|---|
| 0 | `docker compose up dev` works; CI green on no-op PR. |
| 1 | All 8 screen endpoints return mock-equal payloads behind real HTTP. |
| 2 | Frank, Till, Heiko users sign in and see only permitted UI. |
| 3 | RightRail drives off real notifications/panels/sections; clicking a notification updates state. |
| 4 | `/action-center` renders entirely from BFF; per-block loading + empty states intact. |
| 5 | `/margin` renders from BFF; tab jumps preserve scroll position. |
| 6 | `/quotes` renders from BFF; Approve/Counter/Decline writes audit row. |
| 7 | `/forecasting` renders from BFF; mode switches refetch correctly. |
| 8 | `/pricing` lazy-fetches per-SKU workbench from BFF; comparable panel only for new SKUs. |
| 9 | `/ai` renders briefings from `briefings` table; provider fallback works. |
| 10 | Till has a fully functional set of 5 + 4 routes inside frontend-v2. |
| 11 | Heiko has a mobile-first deal flow inside frontend-v2; lighthouse mobile ≥ 90. |
| 12 | Every action button persists; A/B test backend live; idempotent. |
| 13 | de/en parity for body content; `?lang=` round-trips. |
| 14 | Settings, saved views, DQ dashboard live; sidebar promos go live. |
| 15 | A11y AA on every screen; perf budgets met; blue/green deploy in production. |

---

**End of plan.** This document is the canonical migration brief. When ambiguities arise, prefer the canonical mock JSON shape; when ambiguities remain, ask the product owner before introducing a contract change.
