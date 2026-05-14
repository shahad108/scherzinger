---
name: frank-forecasting-v2-2
status: ready
created: 2026-05-14
branch: forecast-redesign-v2
supersedes: extends 2026-05-14-frank-forecasting-v2.1.md (does not replace)
---

# Frank's Forecasting v2.2 — Implementation Plan (remaining work)

> **For agentic workers (Claude Code):** Steps use checkbox (`- [ ]`) syntax. Work
> phase by phase, top to bottom. Each phase ends with a typecheck/test gate and a
> `git add -A && git commit && git push`. Phases A–C are corrective (finish what
> v2.1 started); D–I are net-new add-ons; J is the agreed restructuring. Phases
> are mostly independent — see the dependency note in each.

## Context & how this plan was built

v2.1 (the six high-priority items + three quick wins from the pricing-analyst
review) is **already committed** on `forecast-redesign-v2`. This plan covers
only what is *not yet done*. It was produced by auditing the live codebase
against the v2.1 plan/spec and the full reviewer analysis (including the
"lower-priority" and "cut/downplay" sections).

### Audit summary — state of every item in the analysis

| Item | State | Where |
|---|---|---|
| HeroForecast fan chart, OverrideLog, FVA guardrail, WalkForward, TornadoCard, PVMWaterfall, Methodology/lineage | ✅ Shipped (v2 / pre-v2.1) | `features/forecasting/components/` |
| PlanTrackingStrip | ⚠️ Component + composer exist & wired, **but composer is fed empty data** (`actuals_by_month={}`, `pvm_attribution=None`) | `PlanTrackingStrip.tsx`, `services/forecast/plan_tracking.py`, `composer.py:222` |
| PocketWaterfallCard | ⚠️ Component + composer exist & wired, **but `build_pocket_waterfall()` called with no args** → renders safe defaults only | `PocketWaterfallCard.tsx`, `pocket_waterfall.py`, `composer.py:232` |
| BiasCard | ⚠️ Component + composer exist & wired, **but `build_bias(cluster_errors={})`** → renders empty | `BiasCard.tsx`, `bias.py`, `composer.py:237` |
| NextCycleMovesStrip | ⚠️ Component + composer exist & wired, **but `build_next_moves(cluster_signals={})`** → renders empty; **and the `forecast:action-intent` event it fires has no listener** | `NextCycleMovesStrip.tsx`, `next_moves.py`, `composer.py:242` |
| Pipeline-implied P50 lane | ⚠️ HeroForecast line + composer exist & wired, **but `build_pipeline_p50(open_quotes=[])`** → no line renders | `HeroForecast.tsx`, `pipeline_p50.py`, `composer.py:247` |
| Scenario presets, traffic-light freshness chip, Drivers reorder + diagnostics toggle | ✅ Shipped (v2.1 p4/p6) | `ScenarioLibrary.tsx`, `PageHead.tsx`, `index.tsx` |
| FilterScopeBadge / filter-propagation guarantee | ⚠️ Primitive exists, **used in zero cards** — v2.1 Phase 5 never ran | `FilterScopeBadge.tsx` only |
| WinLossDriverCard (PA/PR rejection lens) | ❌ Not started | — (data source exists: `services/action_center/rejections.py`, `quote_service.get_rejection_codes`) |
| List-price erosion projection | ❌ Not started | — (`PriceFloor.tsx` has historical floor only) |
| At-Risk Revenue tier-stacked bar | ❌ Not started | — (`ParetoLayer.tsx` has per-row only) |
| FVA override drill-down | ❌ Not started | — (`OverrideLog.tsx` shows verdict, no breakdown) |
| Annotation / comment layer | ❌ Not started | — (can reuse `forecast-overrides.json` persistence pattern) |
| Briefing persona toggle (Manuel mode / German) | ❌ Not started | — (`BriefingButton.tsx` has recipient select only) |
| Cut/downplay: PerCustomerTab, ScenarioCompareView | ❌ Not started — included as full tasks per decision | `PerCustomerTab.tsx`, `ScenarioCompareView.tsx` |

**Net:** five v2.1 cards are scaffolded but **starved of real data** (Phase A);
the prescriptive bridge is **not wired to Action Center** (Phase B); the filter
guarantee was **never enforced** (Phase C); six features are **net-new** (D–I);
the restructuring is **agreed** (J).

### Tech stack / conventions

React 19 + Vite 7 + Tailwind 4 + Recharts + TanStack Query + react-router;
FastAPI + Pydantic. New BFF fields are attached optionally to `ForecastShell`;
React components render only when their field is present (graceful degradation).
All changes stay behind `?layout=v2` (already default). Phase-commit + push per
`MEMORY.md` `feedback_phase_commits`. Backend tests: `.venv/bin/pytest` from
`scherzinger-platform/`. Frontend gate: `npx tsc --noEmit && npm test` from
`frontend-v2/`.

### Pre-flight

- [ ] `cd /Users/dharmendersingh/Documents/Scherzinger_new && git checkout forecast-redesign-v2 && git pull --rebase`
- [ ] Confirm HEAD ≥ `c29ba46` (last v2.1 commit).
- [ ] `cd frontend-v2 && npm install` and `cd ../scherzinger-platform && .venv/bin/pip install -r requirements*.txt` if needed; confirm `npx tsc --noEmit` and `.venv/bin/pytest -q` are green before starting.

---

## Phase A — Feed real data into the v2.1 composers

**Why:** PlanTrackingStrip, PocketWaterfallCard, BiasCard, NextCycleMovesStrip and
the pipeline-P50 lane all render today, but on empty inputs — so Frank (and the
Manuel demo) sees placeholders. This phase replaces the `={}` / `=[]` stubs in
`composer.py` with real queries. **No new components.** Depends on nothing.

**Files:** `scherzinger-platform/backend/services/forecast/composer.py`, plus
small helper additions to each composer module and `real_hero.py` /
`real_backtest.py` / `quote_to_revenue.py` for data extraction. Tests under
`scherzinger-platform/tests/services/` and `tests/contract/`.

### Task A.1 — Plan-tracking actuals + PVM attribution
- [ ] In `composer.py`, add a helper `_actuals_by_month(db, mode, cluster)` that reuses the invoice query already in `real_hero.py` to return `{ "YYYY-MM": float }` for the current FY. Extract the shared query into `real_hero.py` if it is currently inline.
- [ ] Compute `pvm_attribution` from the already-built `payload["pvm"]` bars (price/volume/mix/cost) — map the existing PVM bar values into the `PlanVarianceAttribution` shape.
- [ ] Replace `composer.py:222` call: pass real `actuals_by_month` and `pvm_attribution`.
- [ ] Update `tests/services/test_plan_tracking.py`: add a case asserting `recentMonthAttribution` is populated and `cumulativeGapEur` matches the seeded `plan.json` vs. a fixture actuals map.

### Task A.2 — Pocket waterfall from invoice + quote ledgers
- [ ] In `pocket_waterfall.py`, add a `build_pocket_waterfall_from_db(db, *, cluster=None)` that joins the invoice ledger and quote ledger (same sources `real_pareto.py` and `quote_to_revenue.py` use) by article+customer+month to derive `list → quoted → booked → invoiced → db2` step values, and per-cluster net-price lists for the histogram bands.
- [ ] Keep the existing arg-driven `build_pocket_waterfall(...)` as the pure/testable core; the `_from_db` variant just gathers inputs and delegates.
- [ ] Replace `composer.py:232` to call the `_from_db` variant with the active `cluster`. Guard with the existing try/except.
- [ ] Extend `tests/services/test_pocket_waterfall.py` with a DB-fixture test (use the existing test DB session pattern) asserting step monotonicity and ≥1 per-cluster band.

### Task A.3 — Bias from the real backtest
- [ ] In `composer.py`, add `_per_cluster_signed_errors(walk_forward)` that reads the per-cluster residuals already produced by `real_backtest.py` (`build_walk_forward`) and returns `{ cluster: [signed errors] }`. If `real_backtest` only exposes MAPE, extend it to also return signed errors per cluster (small additive change — do not break its existing return shape).
- [ ] Replace `composer.py:237`: `build_bias(cluster_errors=_per_cluster_signed_errors(walk_forward))`.
- [ ] Update `tests/services/test_bias.py` and the walk-forward test to cover the new signed-error output.

### Task A.4 — Next moves from real signals
- [ ] In `composer.py`, add `_next_move_signals(payload)` that mines already-composed blocks: `costDecomposition` (cost crossing list price), `priceFloor` rows (SKUs below floor + their forecast €), `pareto` rows (concentration / decline), and the lost-quote rejection data (see `services/action_center/rejections.py`). Produce the `cluster_signals` dict `build_next_moves` expects, including an `intent_kind`/`intent_context` that maps to a real Action Center `FormDrawerKind` (see Phase B).
- [ ] Replace `composer.py:242`: `build_next_moves(cluster_signals=_next_move_signals(payload))`.
- [ ] Extend `tests/services/test_next_moves.py` with a test feeding a realistic signals dict and asserting ranked, capped, intent-stamped output.

### Task A.5 — Pipeline P50 from the open-quote book
- [ ] In `composer.py`, add `_open_quotes_payload(db, cluster)` that pulls open quotes (close_month, value, win_prob or tier) from the same quote ledger `quote_to_revenue.py` reads.
- [ ] Replace `composer.py:247`: `build_pipeline_p50(open_quotes=_open_quotes_payload(db, cluster))`.
- [ ] Add a methodology footnote when `win_prob` was defaulted from tier (per v2.1 spec "Open decisions").
- [ ] Extend `tests/services/test_pipeline_p50.py` with a DB-fixture test; assert ≥1 `series` point gains `pipelineP50` in the contract test.

### Task A.6 — Contract test + gate
- [ ] In `tests/contract/`, extend the `/screens/forecast` test to assert `planTracking.points[].actual` is non-null for past months, `pocketWaterfall.perCluster` non-empty, `bias.rows` non-empty, `nextMoves` non-empty, and at least one `hero.series` point has `pipelineP50`.
- [ ] Gate: `cd scherzinger-platform && .venv/bin/pytest tests/services tests/contract -q` green.
- [ ] Commit: `feat(forecast/v2.2/pA): feed real data into v2.1 composers (plan/pocket/bias/next-moves/pipeline)` + push.

---

## Phase B — Wire NextCycleMovesStrip → Action Center

**Why:** `NextCycleMovesStrip` fires a `forecast:action-intent` window event with
**no listener**. The prescriptive bridge is cosmetic until the existing
`useUiAction` / `ActionDrawerHost` plumbing handles it. Depends on Phase A.4
(so the strip has real moves) but can be built in parallel.

**Files:** `frontend-v2/src/features/forecasting/components/NextCycleMovesStrip.tsx`,
`frontend-v2/src/features/forecasting/index.tsx` (or a new
`hooks/useForecastActionIntent.ts`), `frontend-v2/src/types/forecast.ts`
(`NextMove.actionIntent` shape), `frontend-v2/src/types/uiActions.ts` (reference only).

### Task B.1 — Map `NextMove.actionIntent` to a real `ActionIntent`
- [ ] Read `types/uiActions.ts` (`ActionIntent`, `FormDrawerKind`, `ActionDrawerContext`) and `data/api/useActions.ts`.
- [ ] Decide the mapping: each `NextMove.actionIntent.kind` must resolve to a valid `FormDrawerKind` (likely `queue_renewal` or `partial_accept`) with a populated `ActionDrawerContext` (`cluster`, `articleId`, `headline`, `sourceScreen: 'forecasting'`, `sourceKind: 'next-cycle-move'`). Update `next_moves.py` + `types/forecast.ts` if the field shape needs to change.

### Task B.2 — Subscribe and dispatch
- [ ] Create `hooks/useForecastActionIntent.ts`: a hook that, on mount, registers a `forecast:action-intent` listener, translates the payload via the B.1 mapping, and calls `useUiAction()(intent)` so `ActionDrawerHost` opens. Clean up the listener on unmount.
- [ ] Mount the hook once in `ForecastingPage` (`index.tsx`).
- [ ] Alternatively, refactor `NextCycleMovesStrip` to call `useUiAction()` directly (cleaner — removes the loose window event). Pick one; prefer the direct call unless the window event is needed by other surfaces.

### Task B.3 — Tests + gate
- [ ] Unit test: clicking "Open" on a move card dispatches the mapped `ActionIntent` (mock `useUiAction`).
- [ ] Update the existing `forecasting-v2-1.spec.ts` Playwright test "next-cycle move card dispatches ActionIntent" so it actually asserts `ActionDrawerHost` opens with the right title.
- [ ] Gate: `cd frontend-v2 && npx tsc --noEmit && npm test -- NextCycleMovesStrip`. Commit `feat(forecast/v2.2/pB): wire NextCycleMovesStrip to Action Center dispatch` + push.

---

## Phase C — Filter-propagation guarantee (v2.1 Phase 5, finally)

**Why:** Manuel's filter-consistency feedback. `FilterScopeBadge` exists but is
used nowhere. Every card must either honor `tier/family/cluster/scenario` or
declare itself unfiltered. Independent of A/B.

**Files:** the ten diagnostic cards listed below + `index.tsx` to thread
`data.filterScope` through. The badge primitive (`FilterScopeBadge.tsx`) is done.

### Task C.1 — Audit each card's filter behavior
- [ ] For each of `MarginTrajectoryCard`, `CostDecompositionCard`, `SeasonalOverlayCard`, `CommodityTrajectoriesCard`, `InputCostTrajectory`, `QuoteToRevenueBridge`, `WalkForward`, `CalibrationCard`, `TornadoCard`, `DistributionGrid`: open the file and the matching BFF composer; determine whether the data already varies with `tier/family/cluster`. Record honors-filter = yes/no in a short comment block.

### Task C.2 — Add the badge to cards that don't honor the filter
- [ ] Add an optional `filterScope?: FilterScope` prop to each non-honoring card; render `<FilterScopeBadge unfiltered scope={filterScope} />` in the card header.
- [ ] For cards that *do* honor the filter, optionally render `<FilterScopeBadge scope={filterScope} />` (the muted "scope: …" variant) for consistency.
- [ ] In `index.tsx` (`AggregateViewV2`), pass `data.filterScope` into every card touched.

### Task C.3 — Tests + gate
- [ ] One test per modified card: "renders unfiltered badge when filterScope is active and the card cannot honor it".
- [ ] Gate: `npx tsc --noEmit && npm test`. Commit `feat(forecast/v2.2/pC): filter-scope badges on cards that don't honor tier/family/cluster` + push.

---

## Phase D — WinLossDriverCard (PA/PR rejection-code lens)

**Why:** Reviewer: competitor-pricing signal is the biggest unmet need in B2B
manufacturing pricing, and the internal signal already exists (PA = competitor
cheaper, PR = price-too-high rejections). Independent.

**Files:** `scherzinger-platform/backend/services/forecast/win_loss.py` [NEW] +
test; `composer.py` (attach `winLoss`); `frontend-v2/src/types/forecast.ts`
(`WinLossPanel` type + `ForecastShell.winLoss?`);
`frontend-v2/src/features/forecasting/components/WinLossDriverCard.tsx` [NEW] +
test; `index.tsx` (mount inside Drivers accordion).

### Task D.1 — Backend composer
- [ ] Create `win_loss.py`: `build_win_loss(db, *, cluster=None, window_days=90)` reusing `quote_service.get_rejection_codes` / `services/action_center/rejections.py`. Return: per-cluster `% of quotes lost to PA` (and PR) over the last 90 days, plus a 12-month monthly sparkline series per cluster.
- [ ] Attach to `composer.py` as `payload["winLoss"]`, guarded; honor the active `cluster` filter.
- [ ] Test `tests/services/test_win_loss.py`: percentage math, window filter, sparkline length = 12.

### Task D.2 — Frontend
- [ ] Add `WinLossPanel` type to `forecast.ts` and `winLoss?: WinLossPanel` to `ForecastShell`.
- [ ] Create `WinLossDriverCard.tsx`: per-cluster row — PA% / PR% with a 12-month Recharts sparkline; tone red when PA% rising. Render only when `data.winLoss` present. Accept `filterScope` and show the badge (Phase C contract).
- [ ] Mount in `index.tsx` inside the Drivers accordion, in the always-visible group (after `BiasCard`).
- [ ] Test `WinLossDriverCard.test.tsx`: row count, sparkline render, empty-state returns null.

### Task D.3 — Gate
- [ ] `pytest` + `tsc --noEmit && npm test`. Commit `feat(forecast/v2.2/pD): WinLossDriverCard — PA/PR rejection-code lens` + push.

---

## Phase E — List-price erosion projection

**Why:** Reviewer: the forecasting page should *project* erosion (when does each
cluster cross its floor at the current cost trajectory + price-update cadence),
not just show the historical floor. Independent.

**Files:** `scherzinger-platform/backend/services/forecast/erosion_projection.py`
[NEW] + test; `composer.py`; `forecast.ts` (`ErosionProjection` type +
`ForecastShell.erosionProjection?`);
`frontend-v2/src/features/forecasting/components/ErosionProjectionCard.tsx` [NEW]
+ test; `index.tsx` (mount inside "Renewals & new product" accordion).

### Task E.1 — Backend composer
- [ ] Create `erosion_projection.py`: `build_erosion_projection(...)` — for each cluster, project list price vs. cost trajectory forward (reuse `cost_decomposition.py` / `commodity_trajectories.py` slopes and `real_price_floor.py` floors) and compute the month each cluster's effective price crosses its cost floor. Also expose the client's actual price-update cadence vs. a monthly benchmark (per the SAP guidance the reviewer cited).
- [ ] Attach as `payload["erosionProjection"]`, guarded, cluster-aware.
- [ ] Test `tests/services/test_erosion_projection.py`: cross-month math, cadence gap.

### Task E.2 — Frontend
- [ ] Add `ErosionProjection` type + `ForecastShell.erosionProjection?`.
- [ ] Create `ErosionProjectionCard.tsx`: per-cluster projected price-vs-floor lines with a "crosses floor: 2026-MM" marker; a cadence chip ("updates every 9mo · benchmark monthly"). `filterScope`-aware.
- [ ] Mount in the "Renewals & new product" accordion in `index.tsx`, after `PriceFloor`.
- [ ] Test `ErosionProjectionCard.test.tsx`.

### Task E.3 — Gate
- [ ] `pytest` + `tsc --noEmit && npm test`. Commit `feat(forecast/v2.2/pE): list-price erosion projection card` + push.

---

## Phase F — At-Risk Revenue tier-stacked bar

**Why:** Reviewer: "the one chart that goes straight into a board deck." Pareto
is per-row today; add an aggregate stacked bar of next-12mo forecast by tier
(A/B/C/D) with the at-risk portion shaded from `pChurn4Q` + decline risk.
Independent. Data already exists (`pareto`, `customers`/`pChurn4Q`).

**Files:** `composer.py` (new `atRiskRevenue` field, computed from existing
`pareto` + customer-risk data — likely no new service file needed, but add
`at_risk_revenue.py` if the aggregation is non-trivial); `forecast.ts`
(`AtRiskRevenue` type); `frontend-v2/src/features/forecasting/components/AtRiskRevenueBar.tsx`
[NEW] + test; `index.tsx` (mount at the top of `ParetoLayer`'s section, or
inside `ParetoLayer.tsx` itself).

### Task F.1 — Backend
- [ ] Add `build_at_risk_revenue(...)` (in `at_risk_revenue.py` or inline in `composer.py`): per tier, total next-12mo forecast € and the at-risk € share = forecast × `max(pChurn4Q, pDecline4Q)`. Attach `payload["atRiskRevenue"]`, guarded.
- [ ] Test: per-tier totals, at-risk share bounded 0–total.

### Task F.2 — Frontend
- [ ] Add `AtRiskRevenue` type + `ForecastShell.atRiskRevenue?`.
- [ ] Create `AtRiskRevenueBar.tsx`: a single stacked Recharts bar per tier (solid = safe, shaded = at-risk), legend, total caption. Render only when present.
- [ ] Mount above the `ParetoLayer` tables in `index.tsx`.
- [ ] Test `AtRiskRevenueBar.test.tsx`.

### Task F.3 — Gate
- [ ] `pytest` + `tsc --noEmit && npm test`. Commit `feat(forecast/v2.2/pF): At-Risk Revenue tier-stacked bar` + push.

---

## Phase G — FVA override drill-down

**Why:** Reviewer: the FVA verdict ("helping/neutral/hurting") needs a
second-order audit Frank can defend to finance — "14 overrides entered, 9
improved MAPE, 5 worsened, net FVA Δ +1.8pp." Independent. Builds on the
existing override store.

**Files:** `scherzinger-platform/backend/services/forecast/overrides.py` (add an
aggregation function) or a new `fva_drilldown.py` + test;
`scherzinger-platform/backend/api/v1/forecast_overrides.py` (new
`GET /forecast/overrides/fva-summary` endpoint) — **or** attach the summary onto
`ForecastShell` via `composer.py`; `frontend-v2/src/data/api/useForecastOverrides.ts`
(new hook if a separate endpoint); `frontend-v2/src/features/forecasting/components/OverrideLog.tsx`
(add the drill-down summary header) + test.

### Task G.1 — Backend aggregation
- [ ] Add `summarize_fva(period?)` to `overrides.py`: counts entered / improved (`fvaDelta > 0`) / worsened (`fvaDelta < 0`) / neutral, and the net FVA Δ, for the current quarter.
- [ ] Expose it — prefer attaching `payload["fvaSummary"]` in `composer.py` (no new endpoint, no new hook). Add to `forecast.ts` as `ForecastShell.fvaSummary?`.
- [ ] Test the aggregation: bucketing by `fvaDelta` sign, net sum, period filter.

### Task G.2 — Frontend
- [ ] In `OverrideLog.tsx`, render a summary strip above the audit table when `data.fvaSummary` is present: "This quarter: 14 entered · 9 improved · 5 worsened · net FVA Δ +1.8pp", tone-colored.
- [ ] Pass `fvaSummary` from `index.tsx` (currently `OverrideLog` takes no props — add an optional prop).
- [ ] Update `OverrideLog.test.tsx`.

### Task G.3 — Gate
- [ ] `pytest` + `tsc --noEmit && npm test`. Commit `feat(forecast/v2.2/pG): FVA override drill-down summary` + push.

---

## Phase H — Annotation / comment layer

**Why:** Reviewer: pricing analysts work in team cycles; right-click a
month/cluster to drop a note that travels with the forecast snapshot. Reduces
offline "what was this assumption?" email. Independent. Reuses the
`forecast-overrides.json` persistence pattern.

**Files:** `scherzinger-platform/backend/data/forecast-annotations.json` [NEW
seed]; `scherzinger-platform/backend/services/forecast/annotations.py` [NEW] +
test; `scherzinger-platform/backend/api/v1/forecast_annotations.py` [NEW router]
+ test; `frontend-v2/src/data/api/useForecastAnnotations.ts` [NEW CRUD hook];
`frontend-v2/src/features/forecasting/components/AnnotationPopover.tsx` [NEW] +
test; `HeroForecast.tsx` and `ClusterLens.tsx` (right-click / context affordance);
`AnnotationPin` glyph on the chart.

### Task H.1 — Backend CRUD
- [ ] Mirror `forecast_overrides.py` exactly: JSON store, thread-lock, `require_auth`. Annotation record: `{ id, target: {kind: 'month'|'cluster', value}, body, author, createdAt }`.
- [ ] Router `forecast_annotations.py` mounted at `/api/v1/forecast/annotations` — GET list (filterable by target), POST, DELETE.
- [ ] Tests: CRUD + concurrent-write + auth, copying the override test file.

### Task H.2 — Frontend
- [ ] `useForecastAnnotations.ts`: `useForecastAnnotations({target?})`, `useCreateAnnotation()`, `useDeleteAnnotation()` — TanStack Query, same shape as `useForecastOverrides.ts`.
- [ ] `AnnotationPopover.tsx`: small popover with a textarea + save/delete; opened by right-click (`onContextMenu`, `preventDefault`) on a HeroForecast month or a ClusterLens card.
- [ ] Render an annotation pin glyph on annotated months in `HeroForecast` (similar to the existing override-diamond `Scatter`).
- [ ] Tests for the popover + hook.

### Task H.3 — Gate
- [ ] `pytest` + `tsc --noEmit && npm test`. Commit `feat(forecast/v2.2/pH): forecast annotation/comment layer` + push.

---

## Phase I — Briefing persona toggle (Manuel mode / German)

**Why:** Reviewer + Manuel feedback theme #4 (language/audit). `BriefingButton`
has a recipient select only; add a persona toggle ("For Manuel — BU lead, 1
page" vs "Analyst review — full memo") tied to a German-language option.
Independent.

**Files:** `frontend-v2/src/features/forecasting/components/BriefingButton.tsx`;
`scherzinger-platform/backend/services/forecast/briefing.py` (prompt-pack
branching); the briefing endpoint contract test.

### Task I.1 — Frontend toggle
- [ ] In `BriefingButton.tsx`, add two `Field`s: `Persona` (`manuel_1pager` | `analyst_memo`, default `analyst_memo`) and `Language` (`de` | `en`, default `de` when persona = `manuel_1pager`).
- [ ] Include `persona` and `language` in the `postJson('/forecast/briefing', …)` body and the `mockResolve` shape.

### Task I.2 — Backend prompt pack
- [ ] In `briefing.py`, branch the LLM prompt on `persona`: `manuel_1pager` → terse one-page BU-lead summary; `analyst_memo` → full memo. Branch output language on `language`.
- [ ] Update the briefing contract/service test to cover both personas + both languages.

### Task I.3 — Gate
- [ ] `pytest` + `tsc --noEmit && npm test -- BriefingButton`. Commit `feat(forecast/v2.2/pI): briefing persona toggle (Manuel mode + German)` + push.

---

## Phase J — Restructuring (cut/downplay items)

**Why:** Reviewer flagged `PerCustomerTab` and `ScenarioCompareView` as competing
for attention. Per decision, these are full tasks. **Do this phase last** — it
touches `index.tsx` heavily and is easiest to land after A–I are stable. Run the
two tasks sequentially.

### Task J.1 — Fold PerCustomerTab into a customer-focused drill-in
- [ ] Remove the top-level `customers` tab from the tablist in `index.tsx` (the `role="tablist"` block) — the page becomes single-view "Aggregate & clusters".
- [ ] Make `PerCustomerTab`'s content reachable as a **deep-link target from `ParetoLayer` customer rows**: clicking a customer row routes to a customer detail view (reuse `PerCustomerTab`'s existing drill-in modal, or render it as a panel filtered to that customer).
- [ ] Keep the churn AUC-ROC 0.93 badge and `pChurn4Q`/`pDecline4Q` data surfaced in that drill-in.
- [ ] Update `forecasting-*.spec.ts` Playwright + any tab tests; remove `?tab=customers` handling or redirect it.
- [ ] Commit `refactor(forecast/v2.2/pJ): fold PerCustomerTab into ParetoLayer customer drill-in` + push.

### Task J.2 — Remove ScenarioCompareView
- [ ] Remove the `<ScenarioCompareView />` mount from `index.tsx` and delete `ScenarioCompareView.tsx` + its test (it was v2.1 wishlist #2, not used in real demos; scenario *presets* shipped instead).
- [ ] Grep for any remaining imports/refs (`ScenarioCompareView`, `scenario-compare`) and clean them up.
- [ ] Update affected tests/snapshots.
- [ ] Commit `refactor(forecast/v2.2/pJ): remove unused ScenarioCompareView` + push.

> If you later decide to *keep* ScenarioCompareView, skip J.2 — it is isolated.

---

## Phase K — Verification, baselines, review

**Files:** `frontend-v2/tests/e2e/` specs + snapshots; full test suites.

### Task K.1 — Playwright + visual baselines
- [ ] Extend `frontend-v2/tests/e2e/forecasting-v2-1.spec.ts` (or add `forecasting-v2-2.spec.ts`): assert WinLossDriverCard, ErosionProjectionCard, AtRiskRevenueBar render; FVA summary strip visible; annotation popover opens on right-click; briefing persona toggle present; single-view tablist (no customers tab).
- [ ] Add the new `ForecastShell` fields (`winLoss`, `erosionProjection`, `atRiskRevenue`, `fvaSummary`) to the e2e mock fixtures (`tests/e2e/_helpers/`).
- [ ] Refresh visual baselines: `npx playwright test forecasting-visual.spec.ts --update-snapshots`; commit the PNGs.

### Task K.2 — Full gates
- [ ] `cd scherzinger-platform && .venv/bin/pytest tests/services tests/api tests/contract -q` — green.
- [ ] `cd frontend-v2 && npx tsc --noEmit && npm test` — green.
- [ ] `cd frontend-v2 && npx playwright test --reporter=list` — green.

### Task K.3 — Independent review
- [ ] Dispatch a code-review pass over `git diff c29ba46..HEAD`. Focus: new BFF endpoint input validation (annotations router), accessibility of new interactive surfaces (WinLoss sparkline, annotation right-click — needs a keyboard path, NextCycleMovesStrip horizontal scroller), filter-scope plumbing correctness, type safety, test-coverage gaps.
- [ ] Triage: 🔴 must-fix now · 🟡 should-fix unless major rework · 🟢 follow-up. One commit per fix: `fix(forecast/v2.2/pK): <finding>`.
- [ ] Re-run all gates. Green → open PR.

### Task K.4 — Docs
- [ ] Update `docs/frontend-forecasting-page.md` to reflect: real-data composers, the new cards (WinLoss, Erosion, At-Risk, FVA summary, annotations), the persona toggle, and the removed `customers` tab / `ScenarioCompareView`.

---

## Dependency map

| Phase | Depends on | Can run parallel with |
|---|---|---|
| A — real composer data | — | C, H, I |
| B — Action Center wiring | A.4 (real moves) | C, D, E, F, G, H, I |
| C — filter badges | — | A, B, D, E, F, G, H, I |
| D — WinLossDriverCard | — | everything except shared `composer.py` merge |
| E — erosion projection | — | everything except shared `composer.py` merge |
| F — At-Risk Revenue bar | — | everything except shared `composer.py` merge |
| G — FVA drill-down | — | everything except shared `composer.py` merge |
| H — annotation layer | — | everything |
| I — briefing persona | — | everything |
| J — restructuring | A–I stable (touches `index.tsx`) | — (run last) |
| K — verification | A–J | — |

> **`composer.py` merge note:** Phases A, D, E, F, G all append fields to the same
> payload dict. If running in parallel, expect merge conflicts in `composer.py` —
> resolve by keeping every guarded `try/except` block. Consider doing A first,
> then D–G sequentially against the updated file.

## Out of scope (explicit follow-ups, unchanged from v2.1)

- Real ML retrain pipeline on `forecast:retrain-requested`.
- `fvaDelta` from a real backtest cycle (still a heuristic stub) — note Phase G consumes whatever `fvaDelta` currently is; its accuracy improves for free when the real cycle lands.
- JSON store → analytics warehouse table for `forecast-overrides.json`, `plan.json`, and the new `forecast-annotations.json`.
- Delete `AggregateViewV1` once Frank signs off on V2.
- Pricing-studio + margin-cockpit filter-propagation fixes (separate plan; reuse the `FilterScopeBadge` primitive).
