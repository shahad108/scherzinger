# Frank — Vision, Page-by-Page Decisions, and Build Workflow

**Audience:** you (Shahad), me (the agent picking up the next round), and anyone walking into Pryzm cold.
**Status of source material:** Persona/VPC v2 (May 2026), Frank_Realignment_Plan.md, frontend-v2/MIGRATION_PLAN.md, current mock JSONs (action-center, margin-cockpit, quotes, forecast, studio, ai), v2-walkthrough screens 01–13.
**Date:** 11 May 2026.

---

## 0.0 Update (11 May 2026, evening) — audited data + backend state

This section was added after walking the actual repo. The §1–§6 strategy below is unchanged; the *calendar* and parts of §2 and §5 are rewritten because the build is further along than the original plan made it sound.

### 0.0.1 Real data we have today (Scherzinger, cleaned and loaded into parquet)

| File                              | Rows  | Date range            | What it carries                                                                                  |
|-----------------------------------|-------|-----------------------|---------------------------------------------------------------------------------------------------|
| `Data/cleaned/invoices_clean.parquet` | 5,565 | 2022-01-10 → 2025-12-17 (4 yrs) | 33 cols: revenue, db1/db2 totals + margins, HK voll/var, material, FEK, FV, DQ flags                |
| `Data/cleaned/quotes_clean.parquet`   | 4,539 | 2022-01-04 → 2025-12-23 (4 yrs) | 27 cols: status, win flag, rejection_code, db2_margin, DQ flags                                     |
| `Data/cleaned/customers.parquet`      | 1,438 | first_seen 2022 → 2025         | id, name, first_seen_date                                                                            |
| `Data/cleaned/products.parquet`       | 1,798 | —                              | article_id, drawing, description, business_unit, commodity_group                                     |

Plus `linkage_report.txt` confirms **89.9% of won quotes are matched to invoices** (1,378 / 1,533). And critically — the linkage report measures **quote-to-invoice margin gap directly**: **median 1.9pp, mean 5.4pp** across 2022–2025. That is exactly Till's VPC pilot claim ("1.9pp gap = ~60k EUR/year leakage") computed on Scherzinger's own data. The +5pp lost-quote line we hang the demo on is real on this dataset.

Gap is also rising year-on-year: 4.2pp (2022) → 5.6pp (2023) → 6.4pp (2024) → 5.3pp (2025). That trend is the demo.

### 0.0.2 Postgres schema and seeds — much further along than I assumed

9 Alembic migrations, ~30 tables. Inventory:

- **Core** (`f83fe085d51c`): customers, invoices, products, quotes, quote_invoice_links, rejection_codes.
- **Forecasting** (`0ce6620ecd10`): backtest_results, commodity_benchmarks, customer_risk_scores, margin_forecasts, monte_carlo_results, product_cost_trends, seasonal_patterns. `margin_forecasts` already stores `prediction_lower`, `prediction_upper`, `training_r2`, `training_mae`, `model_type` — i.e. confidence intervals and per-model accuracy are *already a column*, not a future ask.
- **Auth + shell** (`p2a`, `p3a`): users, roles, user_roles, notifications, panels, reviewers, shell_sections.
- **A/B + audit** (`p12a`, `p17a`): ab_tests (with hypothesis, success_metric, duration_days, sample_size_*, lift_pp, metric_delta, status_reason), ab_test_results, audit_log.
- **Settings** (`p14a`): user_preferences, user_notes, saved_views.
- **Action workflow** (`p16a`): recommendations, recommendation_events, pricing_proposals, report_jobs.

Ingest script `scripts/load_data.py` exists; forecast compute script `scripts/compute_forecasts.py` produces EMA + Linear Trend + Seasonal forecasts with prediction intervals.

### 0.0.3 What the backend actually returns today

`backend/api/v1/screens.py` exposes `/action-center`, `/margin-cockpit`, `/quotes`, `/forecast`, `/studio`, `/studio/workbench/{aid}`, `/studio/comparable/{aid}`, `/shell`. Each is composed by a per-block service that **hits Postgres with a SQL query and falls back to the seed JSON on empty / error.** Per Action Center block:

| Block                | Service file                                  | DB-backed? | Notes                                                              |
|----------------------|-----------------------------------------------|------------|--------------------------------------------------------------------|
| Header               | `action_center/header.py`                     | Yes        | Greeting + week + KPI stats                                        |
| Movable hero         | `action_center/movable_hero.py` (164 lines)   | Yes        | **Heuristic** for "movable": cost moved this period OR running A/B. *Real contracts table is the open gap.* |
| Buckets              | `action_center/buckets.py`                    | Yes        | Same classification as hero                                        |
| Today's decisions    | `action_center/decisions.py` (386 lines)      | Yes        | Ranks from 3 real sources                                          |
| Trust strip          | `action_center/trust.py`                      | Partial    | Reads `forecast_service.get_forecast_accuracy` and `quality_service`. **Per-cluster confidence not in DB yet** — only overall directional accuracy. |
| Lost-quote diff      | `action_center/lost_quote.py`                 | Yes        | Welch t-test via `quote_service.get_price_sensitivity`             |
| SKU pricing table    | `action_center/sku_table.py` (189 lines)      | Yes        | Live join products × invoices                                      |
| Long-tail            | `action_center/long_tail.py`                  | Yes        | Pareto bin A/B/C from real invoices                                |
| Negotiation cockpit  | `action_center/negotiation.py`                | Yes        | `cost_service.get_cost_risers` by commodity                        |
| A/B tracker          | `action_center/abtests_stub.py`               | Yes        | Reads `ab_tests` table directly                                     |
| Rejections ranked    | `action_center/rejections.py`                 | Yes        | Wraps `quote_service.get_rejection_codes`                          |
| Audit                | `action_center/audit_stub.py`                 | Yes        | `audit_service.recent` for user                                     |

That's twelve of thirteen Action Center sections wired to real Postgres queries with seed-fallback safety net. The only thing pretending to be live but isn't, is the **Trust Strip drawer's per-cluster confidence** — and that's exactly the wedge the doc said matters most.

### 0.0.4 What's actually missing (the demo blockers)

Three real gaps, in order of how badly they hurt the demo:

1. **No contracts table / `is_movable` flag.** Movable-hero currently uses the proxy "cost moved this period OR in a running A/B." Honest, but not what Frank/Till want to hear. Either we load a contracts table (ask Scherzinger), or we publicly label the hero "pilot heuristic — based on cost movement, refined once contract data lands." The latter is faster and on-brand.
2. **No `model_registry` / per-cluster confidence / feature_importance table.** The Trust Strip renders aggregate directional accuracy today. The drawer click-through (per-cluster F1 + last_trained + feature_importance bars) is the single most defensible bet for the demo — and it doesn't exist. Building it on real Scherzinger data over 4 years of invoices is genuinely doable with `compute_forecasts.py` extended to write per-cluster metrics into a new `model_registry` table.
3. **No commodity / raw-material index data beyond what `compute_cost_trends` fabricates internally.** The negotiation cockpit renders but the underlying commodity numbers are internal-only. For the annual list-price negotiation story this is fine; for the live "market direction" claim it isn't. Defer or label.

The data we lack (contracts, commodity indices, longer history) are exactly the things the data-onboarding checklist (§4.4) should ask Scherzinger for. Send the checklist this week.

### 0.0.5 Demo-readiness call (2 weeks)

The Action Center is closer to "real on real data" than the original §2 implied. Realistic 2-week target: every block reading live Postgres, Trust Strip with a *real* per-cluster F1 from a new `model_registry` table, brutally honest coverage badges on cards with thin data, and the lost-quote +5pp line confirmed on Scherzinger's own quotes table. Branded report and A/B Slice live wiring stay out of demo scope.

---

## 0. Why this document exists

You wrote: *"if you don't have a path or vision, what should be achieved? What is the end goal?"* — and *"I started making the front end and connected the old back end. So… much more thing I'm missing."*

Two things to settle up front, because they are the source of the self-doubt:

1. **Front-end-first was not the wrong move.** The MIGRATION_PLAN literally says: *"Mocks are the source of truth for shape. Until a real endpoint ships, the JSON files in `frontend-v2/src/data/mocks/*.json` define what the backend must eventually return."* Building Frank's screens against mock JSON is **contract-first design** — exactly how serious teams ship analyst tools. The mock JSON IS the API contract. The back end's job is to produce that shape from real data. You did this in the right order. What's missing is not a re-do — it's the **wiring** and a **ranked plan** for which contract to honor first.
2. **Limited Scherzinger data is a feature in the pilot, not a bug.** Frank's persona explicitly says: *"Model quality before marketing claims. Heterogeneity robustness before aggregate elegance."* Trying to claim "ML signals work everywhere" on thin data destroys his trust forever. The right move is to be honest per page about coverage, and put **model confidence per cluster** in front of every recommendation — that turns the data limitation into Frank's favourite feature.

---

## 1. North star (the one sentence)

> **Pryzm is the analyst cockpit that turns Frank from an Excel-laborer into a defensible pricing scientist — by serving SKU-granular, contract-aware, cluster-confidence-rated recommendations that he can A/B test, audit, and hand to Heiko (Sales) or Till (MD) without rebuilding the slide.**

If a feature can't be traced to that sentence, it's decoration. Cut it or defer it.

### 1.1 Frank's five jobs the cockpit must do well (ranked)

| # | Job (Frank's voice)                                                                                       | Pillar in tool                          | Critical because                       |
|---|------------------------------------------------------------------------------------------------------------|-----------------------------------------|----------------------------------------|
| 1 | *"Tell me which prices to move today — at SKU level — and prove the model is right for this cluster."*    | Action Center + Pricing Studio + Trust  | His #1 emotional job: defendable picks |
| 2 | *"Separate the movable revenue from the contractually locked stuff before you show me a recommendation."*  | Movable-vs-locked filter, everywhere    | Without it every recommendation is noise on locked SKUs |
| 3 | *"Let me A/B test before I commit, and audit every change after."*                                         | A/B tracker + audit trail               | His #1 risk fear: "rolled out broadly, wrong" |
| 4 | *"Prep my annual list-price negotiation — costs, market direction, commodity trends, in one place."*       | Annual List-Price Negotiation Cockpit   | Yearly but career-defining             |
| 5 | *"Generate the report in our corporate design without me copy-pasting for an hour."*                       | Branded report exporter                 | Burns ~½ day every cycle today         |

### 1.2 The wedge (what makes Pryzm different)

Three things together, none alone:

- **Model confidence per cluster, exposed** (not aggregate F1 in a footer). Pricefx/Vendavo/PROS lead with optimisation; Pryzm leads with *"here's how sure I am, here's why."* See Vendavo's own [Explainable AI](https://www.vendavo.com/pricing/explainable-ai-b2b-pricing/) post — they preach it but bury it in implementation; we surface it on the home screen.
- **Movable-vs-locked everywhere**. Contract-aware margin is non-negotiable for industrial distributors. Nobody else makes it a first-class filter on the home screen.
- **Three personas, one truth.** Frank's recommendation, Heiko's deal sheet, Till's board pack — same number, different framing, same audit trail. Eliminates the Sales–Controlling fight Till's VPC mentions twice.

---

## 2. What's already built (so we stop second-guessing)

Frank's v2 frontend covers 7 routes + settings sub-pages + 2 cross-cuts:

| Route             | File / mock                          | Status today                              |
|-------------------|--------------------------------------|--------------------------------------------|
| `/action-center`  | `action-center.json` (28 KB)         | **All 13 Frank sections built** (movable hero, buckets, decisions, trust strip, lost-quote, SKU table, long-tail, negotiation, rejections, audit, A/B tracker). Matches `Frank_Realignment_Plan.md` exactly. |
| `/margin`         | `margin-cockpit.json` (25 KB)        | Health · clusters · waterfall · lost-quote · cost-vs-price · 5 tabs. Built. |
| `/quotes`         | `quotes.json` (30 KB)                | Pipeline · escalations · funnel · guardrails · active · analysis. Built. |
| `/forecasting`    | `forecast.json` (15 KB)              | Hero · clusters · walk-forward · input cost · Pareto · price floor · new product. Built. |
| `/pricing`        | `studio.json` (36 KB)                | Filters · toggles · SKU table · workbench · comparable. Built. |
| `/ai`             | `ai.json` (3 KB)                     | Monday memo + 3 side cards. Light. |
| `/settings/*`     | me, preferences, saved-views, data-quality | Built; mostly static. |
| `/notifications`, `/notes` | notifications.json, notes.json | Built; mock only. |
| Right rail (`/shell`) | `shell.json`                    | Notifications · reviewers · sections. Built. |

**Conclusion:** the surface area is essentially done for Frank. The remaining work is, in priority order, (a) replace mock JSON with real BFF endpoints, (b) add the ML signals the screens already render slots for, (c) tighten copy/trust patterns, (d) add a few specific actions (A/B button, branded export).

---

## 3. Page-by-page decisions for Frank (keep / cut / fix / data / build order)

Below: every Frank-visible page. For each: **purpose**, **what stays**, **what is cut or deferred**, **what is missing**, **data wiring** (which BFF endpoint + which Postgres table / ML signal), and **build order**.

> Legend for build order — **BE** = backend BFF endpoint, **ML** = model signal, **FE** = frontend wiring/change, **COPY** = copy + trust polish.

---

### 3.1 `/action-center` — Frank's home (Analyst Cockpit)

**Purpose.** First screen of Frank's day. Surfaces what's actionable today, with confidence and contract-awareness baked in.

**Keep.** All 13 sections defined in `Frank_Realignment_Plan.md`. They map 1:1 to Frank's VPC: movable hero (→ contract-aware margin), trust strip (→ explainability), lost-quote (→ "argue with Sales"), decisions (→ ranked action), SKU engine table (→ SKU granularity), heterogeneous diagnostics (→ heterogeneity robustness), long-tail (→ B/C products), negotiation cockpit (→ annual prep), A/B tracker (→ test before rollout), rejections (→ "why we lose"), audit (→ basic need), branded report (→ pain reliever).

**Cut / defer.** Nothing on this page. This is Frank's strongest screen.

**Fix.**
- Trust strip drawer is the highest-leverage UX bet — **per-cluster confidence + last_trained + feature_importance** is what wins Frank's trust on first demo. Today it likely shows aggregate numbers; we need the click-through.
- Movable-share % is a "pilot estimate" overlay. Label it that way honestly in the copy — Frank's persona punishes black-box claims.
- A/B Slice button on each decision card must actually post a row to the A/B tracker (today: stub).

**Missing.** A small "data freshness per source" footer on each card. Frank's data-quality job is real; if a card uses 14-day-stale invoice data, he must know.

**Data wiring.**
- BFF `GET /action-center` aggregates: `dashboard_data.annual_summary[2025]` + `price_governance.price_history_with_margin` + `pricing_analysis.price_sensitivity` (lost-quote) + `ml_analytics.churn_prediction` + `ml_analytics.anomaly_detection` + `ml_analytics.data_coverage` + `pricing_analysis.rejection_codes` + `products_detail.declining_fast` + `pricing_analysis.gap_analysis` + `article_customers` + `commodities.json` (negotiation cockpit).
- Movable% derived from `price_governance.price_rules.violations` density (formula owned by ML; expose in drawer).

**Build order.** `BE → ML → FE → COPY`. Concretely:
1. **BE**: ship the `/action-center` BFF endpoint returning today's mock JSON shape but populated from Postgres. *No model changes yet.* (1 week)
2. **ML**: add `cluster_confidence` and `feature_importance` to the churn + sensitivity model outputs so the trust drawer is real. (1 week)
3. **FE**: wire the trust drawer to the new ML fields; wire the A/B Slice button to a `POST /ab-tests` endpoint. (3 days)
4. **COPY**: pilot-estimate labels, freshness footer, "shared with Heiko / Till" tags. (1 day)

---

### 3.2 `/margin` — Margin Cockpit

**Purpose.** Diagnostic, not action. *"Where did the margin go?"* Used by Frank to answer Till's questions and to prep his own recommendations.

**Keep.** Health · clusters · waterfall · lost-quote · cost-vs-price · 5 analysis tabs. The cluster + waterfall combination is exactly Frank's "separate strategic from unintended erosion" gain.

**Cut / defer.** Anything that overlaps with the Action Center's movable hero verbatim — link, don't duplicate. Today there is some duplication of headline numbers.

**Fix.**
- Each cluster row needs **sample size + low-n warning** (Frank's persona literally says: *"applying an aggregate model to rare SKUs without checking confidence per cluster"* is the common mistake).
- Waterfall needs a "movable-only" toggle (otherwise locked SKUs distort the picture).

**Missing.** *Strategic vs. unintended classification* per cluster. This is a Till gain creator but Frank consumes it. Needs an ML label (binary or 3-class) per SKU; absent today.

**Data wiring.**
- BFF `GET /margin-cockpit` from `margin.by_year`, `margin.waterfall`, `pricing_analysis.cluster_margins`, `pricing_analysis.lost_quote_diff`, `cost_vs_price` join.
- New ML signal: `pricing_analysis.cluster_intent_label ∈ {strategic, unintended, unclear}`.

**Build order.** `BE → ML → FE`. ML signal can ship later; FE can stub the field and render "—" until ML is live.

---

### 3.3 `/quotes` — Quotes / Pipeline

**Purpose.** Win-loss patterns, pipeline state, guardrails, rep/SKU/customer drill-downs.

**Keep.** Pipeline, escalations, funnel, guardrails, active-quotes table, analysis tabs. The **lost-quote +5pp / p=0.0006** pattern is the demo killer — front and centre.

**Cut / defer.**
- Sales-rep watchlist block: **belongs to Heiko, not Frank.** Move it out of Frank's quotes page; show only the aggregated rep-pattern table.
- Per-quote commenting: P11 (later persona round). Cut for now.

**Fix.**
- Rejection-code breakdown: surface the "KA — no information" 51.7% as a **data-quality work item**, not just a number. This is Frank's social job: turn it into a Sales feedback loop.
- Active-quotes table needs a "movable contract / locked contract" chip per row (currently absent).

**Missing.** Quote-to-invoice gap chart. This is on Till's value prop too, but Frank reads it weekly to spot drift. Pilot reportedly showed ~1.9pp / 60k EUR/year. Add as a small strip near the briefing.

**Data wiring.**
- BFF `GET /quotes` from `quotes`, `quote_lines`, `invoices`, `customers`, `articles`, `pricing_analysis.rejection_codes`.
- Quote-to-invoice gap: `(quoted_margin − invoiced_margin)` rolled up monthly + 90-day trend.

**Build order.** `BE → COPY → FE`. No new ML needed; this is a pure analytics+BFF page.

---

### 3.4 `/forecasting` — Forecast & Walk-Forward

**Purpose.** *"Is the forecast credible? Where does it break?"* Frank uses this to defend price floors and new-product pricing.

**Keep.** Hero · clusters · walk-forward · input cost · Pareto · price floor · new product.

**Cut / defer.** Anything claiming an absolute MAPE/SMAPE figure without a per-cluster breakdown. Use the per-cluster cards.

**Fix.**
- New-product pricing card: must explicitly show the **comparable cluster** chosen and let Frank override it. Today this is the weakest link for Scherzinger because new-product data is by definition thin.
- Walk-forward chart needs the "actuals vs. predicted, last n months" overlay with error band.

**Missing.** **Confidence intervals**, not point estimates, on every cluster card. This is a one-line addition to the ML output but transforms Frank's trust.

**Data wiring.**
- BFF `GET /forecast` from `forecasting.{entity_id}` + `ml_analytics.forecast_accuracy_per_cluster`.
- ML: extend forecast output with `pi_low`, `pi_high` (e.g. 80% prediction intervals) per cluster.

**Build order.** `ML → BE → FE`. ML changes are small but unblock the UI.

---

### 3.5 `/pricing` — Pricing Studio (workbench)

**Purpose.** Where Frank actually *does the work* — pick an SKU, see catalogue/quoted/recommended/floor/ceiling, compare to a cluster, accept/decline/A-B.

**Keep.** Filters · toggles · SKU table · workbench · comparable view.

**Cut / defer.** Mass-action multi-select. Risky on heterogeneous portfolios; defer until A/B testing is proven.

**Fix.**
- Each recommendation row must carry: cluster confidence %, movable-vs-locked chip, last-trained date, "why" tooltip (top-3 drivers). All four are already in scope per the VPC and the realignment plan but need explicit wiring.
- Comparable-cluster view needs a "this SKU is in a low-n cluster" warning where applicable.

**Missing.** Inline A/B test launcher (currently presumed only on Action Center). Frank lives here, so the launcher must live here too.

**Data wiring.**
- BFF `GET /studio` + per-SKU enrichment `GET /studio/{aid}`.
- ML: `recommended_price`, `floor`, `ceiling`, `cluster_id`, `cluster_confidence`, `top_drivers[3]`, `movable_share`.

**Build order.** `BE → ML → FE`. The biggest contract — get it right once and Action Center reuses 80% of it.

---

### 3.6 `/ai` — AI Briefing (Monday memo)

**Purpose.** *"What does the system want to tell me this Monday?"* Synthesises the week into a narrative + 3 side cards.

**Keep.** Memo + side cards.

**Cut / defer.** Anything claiming to be a "chat with your data" agent. Cut unless we are very confident on the data layer — false answers here destroy Frank's trust faster than anywhere else.

**Fix.** Every claim in the memo gets a citation chip → click → opens the source card on the matching page. No floating numbers.

**Missing.** A **"things I am uncertain about"** section. Frank is rewarded socially for caveats. The AI being honest about gaps is a differentiator vs. PROS/Vendavo.

**Data wiring.**
- BFF `GET /ai` composes memo from `action-center` + `margin-cockpit` + `quotes` outputs and runs them through a small LLM call server-side (or pre-renders weekly).
- No new ML signal; this is a composition + LLM step.

**Build order.** `BE (compose) → FE → COPY`. Lowest priority; this is the page where being wrong hurts most, so ship it last and behind a flag.

---

### 3.7 Settings — Profile · Preferences · Saved Views · Data Quality

**Purpose.** Persona-aware preferences, saved filter sets, and the data-quality dashboard Frank's persona explicitly demands.

**Keep all four.** Data Quality is the most important — it is Frank's basic need ("audit-ready", "explainable").

**Cut.** Nothing.

**Fix.** Data Quality page must list, per source: coverage %, last sync, schema drift warnings, and a "fix it" CTA that opens the relevant Pricing Studio filter.

**Missing.** A **model-card view** ("for each ML model: training date, feature list, F1/MAPE per cluster, known limitations"). This is the single most defensible page Pryzm could ship in 2026. Vendavo and Pricefx are still adding this.

**Data wiring.**
- BFF `GET /data-quality` from `ml_analytics.data_coverage` + per-source `last_sync_at`.
- BFF `GET /model-cards` from `ml_analytics.model_registry` (new table, small).

**Build order.** `BE → FE`. Model cards can ship as a v1.5 add-on but flag it early.

---

### 3.8 `/notifications` and `/notes`

**Purpose.** Cross-cutting inbox + Frank's working scratchpad.

**Keep both.** They are core to Frank's "out of data collection into analysis" desired gain.

**Cut.** Nothing.

**Fix.**
- Notifications need to be **actionable** (one click → "go to the SKU", "open the A/B test", "accept the recommendation"). Today they look like a feed.
- Notes need to attach to entities (SKU, customer, cluster). Free-form notes are a graveyard.

**Missing.** A "share to Till / Heiko" button on each note. Frank's transferrer job — make it one click.

**Data wiring.** BFF `GET /notifications`, `GET /notes`. Postgres tables for both. Trivial.

**Build order.** `BE → FE`. Low priority; do after the analytical pages.

---

## 4. The build workflow you should follow from here

The mistake you think you made — *"I built the FE first"* — is actually the prevailing pattern for contract-first analytics products. What goes wrong is when teams **don't write down which contract to honour next**. So:

### 4.1 The per-page recipe (use this for every page)

1. **Freeze the contract.** Open the mock JSON, decide if its shape is right. If yes, that's now the BFF response schema. Commit it to `openapi/screens.yaml`.
2. **Stand up the BFF endpoint.** Server-side composition only. No ML changes. Returns real data shaped exactly like the mock. Flip `VITE_SCHERZINGER_API` and watch the page render real numbers.
3. **Add the ML signals the contract already names** (`cluster_confidence`, `pi_low/high`, `cluster_intent_label`, `movable_share`). Backfill from existing data; honest "—" where coverage is thin.
4. **Polish the FE.** Drawers, actions (A/B Slice, Accept, Decline, Share), copy, freshness chips.
5. **Verify accuracy & metrics:**
   - **Backtest** every ML signal on rolling 90-day holdout. Publish the result on the Trust Strip — this *is* the metric Frank cares about.
   - **Contract tests** in CI for every BFF endpoint shape (already scaffolded in `tests/contract/`).
   - **Smoke tests** for every page render (already scaffolded in `src/tests/`).
   - **Pilot-data label.** Anywhere you don't have ≥ 60 days of Scherzinger data, label the card "pilot estimate" and link to the Data Quality page.

### 4.2 The sequenced plan (revised — phases not weeks)

With Claude Code accelerating the build, engineer-weeks are no longer the unit. The bottleneck is data depth, ML signal quality, and stakeholder review. So the plan now reads as **phases in dependency order**, not a calendar.

**Phase D (Demo prep, ~10 working days, runs alongside everything).**
The 2-week Scherzinger demo lives here. See §5 (rewritten below) for day-by-day.

**Phase 1 — Action Center fully live, honestly (parallel to Phase D).**
Every block on `/action-center` already reads Postgres with seed fallback. Phase 1 work is: confirm the data is loaded (run `scripts/load_data.py` against the cleaned parquets, verify table counts), patch any block returning seed, ship coverage badges on each card, add the freshness footer.

**Phase 2 — Trust Strip drawer with real per-cluster confidence.**
This is the single highest-leverage feature for Frank's persona and it's not built. Concretely: extend `compute_forecasts.py` to write per-cluster F1/MAPE/n_backtests into a new `model_registry` table; create `/models/cards` endpoint; wire the four trust tiles to drawer click-throughs reading `model_registry`. Until this lands, the wedge is theoretical.

**Phase 3 — Studio (Pricing) BFF with per-SKU recommendation contract.**
`/studio` exists; the contract for `recommended_price`, `floor`, `ceiling`, `cluster_id`, `cluster_confidence`, `top_drivers[3]`, `movable_share` needs to be frozen and the SKU table on `/action-center` must read the same contract. One contract serves both pages.

**Phase 4 — Margin Cockpit polish.**
`/margin-cockpit` is wired; add the movable-only toggle on the waterfall, low-n warnings on cluster cards, and the "strategic vs unintended" classification label (start as a rule; ML class label is Phase 7).

**Phase 5 — Quotes page + quote-to-invoice gap card.**
The linkage report already computes the gap (median 1.9pp). Render it as a small strip near the briefing. Remove Sales-rep watchlist from Frank's view (goes to Heiko's deferred bucket).

**Phase 6 — Forecast page UX on existing prediction intervals.**
`margin_forecasts.prediction_lower/upper` already exist. The frontend needs to *render* them and let Frank pick a comparable cluster for new-product pricing.

**Phase 7 — A/B Slice button live + audit trail end-to-end.**
`ab_tests` and `audit_log` tables exist. Build the `POST /ab-tests` endpoint, the audit write on every Accept/Decline, and the Slice button wiring on Action Center + Studio.

**Phase 8 — Data Quality + Model Cards pages (Settings).**
The defensibility narrative for Till's buying decision. Lists every model in `model_registry` with train date, holdout window, per-cluster metric, known limitations.

**Phase 9 — Branded report exporter.**
PDF generator using `report_jobs` table. Cosmetic to demo but burns half a day of Frank's week today.

**Phase 10 — AI Monday memo with citations.**
LLM composition over the prior screens. Ship last. Behind a flag.

**Phase 11 — Notifications + Notes wiring + share-to-Till/Heiko buttons.**

**Phase 12 — Till + Heiko persona screens (deferred until Frank is solid).**

Dependency picture: Phase 2 unblocks the demo's trust story. Phase 3 unblocks Phases 4–8 (they all read the same SKU contract). Phase 7 unblocks any claim that A/B testing is real. Everything else can run in parallel.

This sequencing answers your three things at once:
- **Near-term build (this week and next):** Phase D in §5 — Action Center on real data + Trust Strip drawer + lost-quote card confirmed on Scherzinger's quotes.
- **Whole Frank scope lock:** §3 of this doc is the lock. Anything not in §3 is out of Frank scope and goes to a backlog file.
- **Client demo readiness:** Phase D + Phases 1–2 done by demo day; the rest can lag.

### 4.3 The accuracy & metrics workflow (this is what was unclear)

A single rule: **every ML signal Frank sees must come with three things: (a) a per-cluster accuracy number, (b) a coverage % for that cluster, (c) a "last trained" date.**

Operationally:
1. Every model writes to `ml_analytics.model_registry` on each train: model name, version, train date, holdout window, per-cluster metric (F1 / MAPE / AUC, whichever applies), feature list, coverage %.
2. The Trust Strip and the Pricing Studio drawer read directly from `model_registry`. No second source of truth.
3. CI gate: a model train job that drops below a configured per-cluster floor (e.g. F1 < 0.7 on top-5 clusters) blocks deploy. Stops silent drift.
4. **Backtest harness in `scripts/backtest/`**: a one-command tool that, given a model + 90-day rolling window, regenerates the per-cluster metric. Run weekly. Output goes to a Slack/email digest *to Frank*, not to engineering.
5. For pages with thin Scherzinger data: an explicit **"coverage" badge** on every card (green ≥ 80%, amber 40–80%, red < 40%). Frank's persona rewards the red badge — it shows you're honest. Hiding it is the failure mode.

### 4.4 Limited-data plan (the one you flagged on the call)

You said: *"the data that we have here is a little bit limited for many things."* Three plays, in order:

1. **Be transparent everywhere.** Coverage badges, "pilot estimate" labels, "low-n cluster — do not auto-act" warnings. Hidden gaps kill trust; shown gaps build it.
2. **Use external proxies where reasonable.** Commodity indices, FX, industry indices, raw-material trends — already on the negotiation cockpit. Backfill the same proxies on margin / forecast cards where internal data is thin. (This is exactly what Vendavo's AI Pricing Assistant launched with in April 2026 — see [Pricefx/Vendavo comparison](https://www.gartner.com/reviews/market/b2b-profit-optimization-software/compare/pricefx-vs-vendavo).)
3. **Run a 6-week data-onboarding sprint with Scherzinger before locking model claims.** Concretely: invoice 36 months, quotes 24 months, customer master with contract flags, commodity index history, raw-material costs. Write this as a deliverable list and put it in `Data/onboarding_checklist.md`. Without this, week 11 above is at risk.

---

## 5. Phase D — what actually lands in the next 2 weeks (for the Scherzinger demo)

Rewritten 11 May 2026 with audited facts: backend services are already DB-backed with seed fallback; data is cleaned and ready to load; the +5pp/1.9pp gap is real on Scherzinger data; the missing pieces are a `model_registry`, contract/locked data, and copy/honesty polish. Solo build, Claude Code-accelerated. Days are working days.

### Day 1 (Mon) — Verify the data is actually in Postgres

Run `docker compose -f docker-compose.dev.yml up --build` then `scripts/load_data.py`. Check row counts in `customers`, `invoices`, `products`, `quotes`, `rejection_codes`, `quote_invoice_links` match the parquet counts (1,438 / 5,565 / 1,798 / 4,539 / N / 1,957). Run `scripts/compute_forecasts.py`, `compute_cost_trends.py`, `compute_seasonal_patterns.py`, `compute_benchmarks.py`, `compute_risk_scores.py` so the ML tables are populated. **Verification:** hit `GET /screens/action-center` against staging; every block returns non-empty live numbers, not seed.

### Day 1–2 — Audit every Action Center block: live vs seed-fallback

For each of the twelve block services, log which path is hit (live SQL vs `ActionCenterBlockError` fallback) on real Scherzinger data. Where a block is falling back, either patch the SQL (most likely a column rename) or accept it and add a coverage badge to that card. **Verification:** a one-page status table — block × live/fallback × why.

### Day 2–3 — The Trust Strip drawer (Phase 2 brought forward for demo)

Create `model_registry` table (model_name, version, trained_at, holdout_window, cluster_id, metric_name, metric_value, n, feature_list_json, notes). Extend `compute_forecasts.py` to write a row per (model, cluster) on each train. Build `GET /models/cards` endpoint. Wire the four trust tiles to a single drawer component that swaps content per-tile, reading per-cluster F1/MAPE + last_trained + feature_importance bars. This is the demo's wow moment. **Verification:** click each of four tiles, four meaningful drawers open, all reading Postgres.

### Day 3–4 — Movable-hero honesty pass

Don't try to load contracts data in 2 weeks. Instead, relabel: hero says "€X.XM movable revenue (pilot heuristic — based on cost movement and active A/B tests; refined once contract data lands)". Add a small "?" tooltip explaining the heuristic. The honesty is the win, not the polish. **Verification:** hero renders real numbers, label reads honest, tooltip works.

### Day 4 — Lost-quote +5pp / 1.9pp gap card confirmed on Scherzinger data

This is the demo's one number that makes Till lean in. Verify `lost_quote.py` Welch t-test runs over real `quotes` table and produces ≥4pp difference with p<0.01. If not, debug. Add a small "median quote-to-invoice gap by year" sparkline (data is already in `linkage_report.txt`'s gap-by-year table — 4.2pp → 5.6pp → 6.4pp → 5.3pp). **Verification:** the card renders the real numbers.

### Day 5 — Coverage badges + freshness footer + sales-rep watchlist move

Per-card data-coverage badge (green/amber/red) reading from a `data_coverage` rollup. "Last sync N ago" footer per card from `last_updated_at` columns where available. Move Sales-rep watchlist out of `/quotes`. **Verification:** every card on `/action-center` has a coverage badge; `/quotes` has no rep watchlist for Frank.

### Day 6 (start of week 2) — Send the data-onboarding checklist to Scherzinger

`Data/onboarding_checklist.md`: 36 months invoices (we have 48, good — confirm), 24 months quotes (have it), contracts table with movable/locked flag per article-customer pair (don't have it), commodity index history (don't have it), raw-material cost history (don't have it). Even if it doesn't come back before the demo, sending it is the credibility move — *"we want to refine the heuristic with your real contract data."*

### Day 6–8 — Demo dry-run rounds

Walk the screen as Frank. Then as Till. Then as Heiko. Every number you can't defend gets a coverage badge or a label change. Re-record every claim against `action-center.json`. The mistake here is polishing visuals; the right move is hardening copy.

### Day 8–10 — Buffer

Buffer is not optional. Demo demos break. Reserve days 8–10 for whichever block surprised you in days 1–7.

### Out of Phase D (i.e. demo it as concept, not as live wiring)

- A/B Slice button live wiring (Phase 7).
- Branded report exporter (Phase 9).
- Studio per-SKU recommendation contract polish (Phase 3 — but the SKU table on Action Center reads it, so just demo what's there).
- AI Monday memo (Phase 10).
- Till + Heiko persona screens.

If those land before demo day, great. If not, the demo still wins on: real movable-hero number, real lost-quote +5pp on Scherzinger, real Trust Strip drawer with per-cluster F1, brutally honest coverage badges, and the gap-by-year story.

---

## 6. Out of scope for Frank (so we stop arguing about it)

- Till's MD overview (P10 in MIGRATION_PLAN).
- Heiko's deal inbox / mobile (P11).
- Sales rep individual coaching surfaces.
- Customer self-service / portal.
- Real-time pricing API for ERP integration (post-pilot).
- Multi-tenant onboarding flow (single-client pilot for now).

These go in `BACKLOG.md`; they do not appear in Frank's screens.

---

## 7. Sources

- **Internal:** `Persona/20260505_PRYZM_Value_Proposition_Canvas_EN.docx`, `Frank_Realignment_Plan.md`, `frontend-v2/MIGRATION_PLAN.md`, `frontend-v2/src/data/mocks/*.json`, v2-walkthrough screens 01–13.
- **External web (May 2026):**
  - [Pricefx vs Vendavo 2026 — Gartner Peer Insights](https://www.gartner.com/reviews/market/b2b-profit-optimization-software/compare/pricefx-vs-vendavo)
  - [Vendavo vs Pricefx 2026 — TrustRadius](https://www.trustradius.com/compare-products/pricefx-vs-vendavo)
  - [Why Explainable AI Matters in B2B Pricing — Vendavo](https://www.vendavo.com/pricing/explainable-ai-b2b-pricing/)
  - [B2B Pricing 2026 Guide — Omnibound](https://www.omnibound.ai/blog/b2b-pricing)
  - [Market Guide for B2B Price Optimization — Gartner / Vendavo PDF](https://www.vendavo.com/wp-content/uploads/2021/01/Market_Guide_for_B2B_735914_ndx.pdf)
