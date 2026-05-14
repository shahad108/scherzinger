# Frontend Forecasting Page — Reference

> Last updated: 2026-05-15. Mirrors the state of `forecast-redesign-v2` branch after the v2.2 cycle (HEAD ≥ `9ae2d24`).
>
> Source of truth lives in `frontend-v2/src/features/forecasting/`. This document indexes every component the page can render, in render order, with data sources and interactions.

## What v2.2 shipped

- **Real-data composers** (Phase A): `planTracking`, `pocketWaterfall`, `bias`, `nextMoves`, `pipelineP50` are now backed by live DB queries in `scherzinger-platform/backend/services/forecast/` (previously placeholder fixtures).
- **NextCycleMovesStrip → Action Center** (Phase B): clicking "Open" routes through `useUiAction()` → `mapForecastActionIntent()` → `ActionDrawerHost`, replacing the no-op window event. Strip now exposes `role="region"` + `aria-label` + tabIndex so the horizontal scroller is keyboard-reachable.
- **Filter-scope badges** (Phase C): 10 cards that don't honor `tier`/`family`/`cluster` filters now render a `FilterScopeBadge` indicating unfiltered status: `MarginTrajectoryCard`, `CostDecompositionCard`, `SeasonalOverlayCard`, `CommodityTrajectoriesCard`, `InputCostTrajectory`, `QuoteToRevenueBridge`, `WalkForward`, `CalibrationCard`, `TornadoCard`, `DistributionGrid`.
- **New diagnostic cards**:
  - **`WinLossDriverCard`** (Phase D, in Drivers accordion after `BiasCard`) — PA/PR rejection-code lens by cluster + trailing-12mo sparkline (`role="img"` + a11y label).
  - **`ErosionProjectionCard`** (Phase E, in Renewals accordion after `PriceFloor`) — list-price vs cost-floor projection per cluster + crossover/safe/cadence chips.
  - **`AtRiskRevenueBar`** (Phase F, above `ParetoLayer`) — tier-stacked at-risk revenue with 4 tier rows.
  - **FVA summary strip** (Phase G, inside `OverrideLog` accordion above the audit table) — quarterly FVA tally with tone-colored border.
- **Annotation layer** (Phase H): right-click any HeroForecast month or ClusterLens card opens `AnnotationPopover`. Keyboard fallback: `+ Add note` button below the hero chart (`aria-label="Add note for YYYY-MM"`). Backed by `/api/v1/forecast/annotations` (GET/POST/DELETE) and `services/forecast/annotations.py` JSON store.
- **Briefing persona toggle** (Phase I): `BriefingButton` modal now exposes Persona (`analyst_memo` / `manuel_1pager`) and Language (`en` / `de`) selects. Picking `manuel_1pager` auto-flips language to `de` until the user touches it.
- **Restructuring** (Phase J): the standalone "Per customer" tab is gone. ParetoLayer customer rows now set `?customer=<id>`, which the page shell uses to mount `CustomerForecastDetail` as a drill-in drawer. `ScenarioCompareView` removed.

## 1. Entry point

| File | Role |
|---|---|
| `frontend-v2/src/features/forecasting/index.tsx` | Page shell. Reads URL params, fetches data via `useForecast`, dispatches to `AggregateView` (V1 or V2) or `PerCustomerTab`. |

### URL parameters (read by `ForecastingPage`)

| Param | Default | Effect |
|---|---|---|
| `mode` | `revenue` | One of `revenue` · `margin` · `volume`. Drives the entire shell — chart units, KPI tiles, axes. |
| `horizon` | `12` | Forecast horizon months (3 / 6 / 12). |
| `tab` | `aggregate` | **v2.2: deprecated.** The forecasting page is now a single view — `?tab=customers` is silently stripped at navigation time. Customer drill-in is reached via `?customer=<id>` instead. |
| `customer` | — | **v2.2** — opens `CustomerForecastDetail` drawer for the given customer id. Set by `ParetoLayer` row clicks (`data-testid="pareto-customer-detail-<id>"`). |
| `scenario_id` | — | When set, BFF re-runs the composer with the scenario perturbation; `ScenarioActiveBanner` appears. |
| `tier` | — | Filter pill (`A`/`B`/`C`/`D`). Plumbed into the BFF query. |
| `family` | — | Product-family filter. Plumbed into the BFF query. |
| `cluster` | — | Cluster filter (e.g. `BKAES`). Plumbed into the BFF query AND tagged on any override created from the chart. |
| `show_all` | `0` | If `1`, ParetoLayer renders all tiers (else top tiers only). |
| `layout` | (v2) | `v1` shows the legacy aggregate. **Default is v2.** |
| `queue` | — | Deep-link trigger; if `queue=renewals` (or `price_floor`), the page opens the "Renewals & new product" accordion and smooth-scrolls to it. |
| `article` | — | Highlights the named article inside `PriceFloor`. |
| `source` | — | Renders the "Back" pill in the deep-link banner, sending the user back to e.g. `/action-center`. |

### Data source

- Hook: `useForecast({ mode, horizon, scenario_id, tier, family, cluster })` in `frontend-v2/src/data/api/useForecast.ts`.
- Endpoint: BFF `/screens/forecast` (FastAPI `screens` router, composes real-data services under `scherzinger-platform/backend/services/forecast/`).
- Returns a `ForecastShell` (see `frontend-v2/src/types/forecast.ts:642`).

### Page-shell render order (above the body)

```
PageHead
└─ greeting · sub-pill · filter pills (tier/family/cluster) · "Updated" timestamp
MarketDirectionStrip                    (when data.marketDirection)
BriefingButton                          (top-right of the strip)
Deep-link banner                        (when queue || article)
ScenarioLibrary                         (single mount — Phase 8 dedup)
ScenarioActiveBanner                    (when scenarioId param is set)
ModeToggle                              (revenue/margin/volume + horizon)
AggregateView (V1 or V2)                ← single view in v2.2 (no tablist)
CrossLinkStrip                          (footer)
CustomerForecastDetail                  (when ?customer=<id> is set — drill-in drawer)
```

> v2.2 removed `ScenarioCompareView` (unused) and the "Per customer" tab (now a drill-in via `?customer=<id>` from `ParetoLayer`).

---

## 2. Aggregate body — V2 layout (default)

Source: `AggregateViewV2` in `index.tsx:267`. Renders only when `?layout=v1` is **absent**.

### Top → bottom

| # | Component | Source file | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **HeroKPIStrip** | `components/HeroKPIStrip.tsx` | Four tiles: Forecast (next 12mo) · Variance vs plan · MAPE (trailing 6mo) · FVA verdict (helping / neutral / hurting + n overrides). Mode-aware units (`M €`/`K €`/`%`/`u`). | Read-only. Values derived from `data.hero.forecast12moTotal` if present, else summed from `series.slice(-12)`. |
| 2 | **HeroForecast** | `components/HeroForecast.tsx` | Two-band fan chart per Hyndman fpp3 — 80% darker (rose-deep, 0.18 opacity) + 95% lighter (0.06 opacity). Default window: 6 months history + 12 months forecast, with a "Now" reference line at the history/forecast boundary. Override points show as rose-deep diamond glyphs (custom Recharts `Scatter` polygon). Below the chart: movers (3 chips), movable/locked split, "Why band moves" rationale. | **Show full history / Trim history** toggle. **Click any month** on the P50 line → opens `ActualEntryPanel` (only when `enableActualEntry` is true, which V2 sets). Cluster prop threads through so overrides are tagged. Tooltip shows P50 + bands + "Click to enter actual →" hint. |
| 3 | **PVMWaterfall** | `components/PVMWaterfall.tsx` (V2 only) | Price · Volume · Mix · Churn · FX delta explanation as a Recharts waterfall (BarChart with stacked-range bars). Each factor colored: price=green, volume=blue, mix=purple, churn=rose, fx=amber, other=slate. Header shows period label + net change total. | Read-only. Renders only when `data.pvm` is populated by BFF (today: BFF placeholder; mocks omit). |
| 4 | **TopSKUsForecastTable** | `components/TopSKUsForecastTable.tsx` (V2 only) | Top 10 SKUs by forecast revenue. Columns: SKU · Cluster · LTM · Forecast · Δ% (color-coded) · Reason · Last override · Action. Sortable on numeric columns; filter input by SKU/cluster substring. | **Sort** by clicking column headers. **Filter** via search box. **Open** action button calls `onOpenSku` (not wired in this page; reserved for SKU drilldown). |
| 5 | **ClusterLens** | `components/ClusterLens.tsx` | 4 cluster cards (BKAES · BKAGG · BKAIZ · MBDIV / SOPU). Each card shows LTM revenue, 12mo forecast, ±band, per-cluster MAPE badge (from real `real_backtest.py`), tone tint (status/amber/red). | **Click a card** → sets `?cluster=` URL param, narrowing all downstream sections. |
| 6 | **ScenarioActiveBanner** | `components/ScenarioActiveBanner.tsx` | One-line banner shown only when `?scenario_id=` is set. Names the active scenario + "X% revenue impact". | Click "Clear" → removes `scenario_id` from URL. |
| 7 | **Accordion: "Drivers & accuracy"** | `components/Accordion.tsx` wraps the cards below | Collapsed by default. Houses all the diagnostic/explanatory cards. | Click header to expand. Listens for `accordion:open` window events for deep-link auto-open. |
| 7a | TornadoCard | `components/TornadoCard.tsx` | Input-sensitivity tornado: horizontal bars showing how each driver moves the forecast (Steel price, Volume mix, FX, etc.). Number of bars from `tornado.bars`. Per-bar MAPE-by-cluster chip. | **Click a bar** → opens `DistributionDrawer` with the full Monte Carlo distribution for that driver. |
| 7b | DistributionGrid | `components/DistributionGrid.tsx` | Per-entity Monte Carlo distribution cards (one per cluster). Each card shows p5/median/p95 range bar + sparkline + headline simulated value. n_simulations badge. | "Show all" toggle to expand from preview-mode to full grid. |
| 7c | CalibrationCard | `components/CalibrationCard.tsx` | Per-cluster backtest accuracy (was "CI calibration"). 4 rows of MBDIV ±σ bands, real per-cluster directional accuracy + MAPE. | Read-only. |
| 7c′ | **BiasCard** (v2.1) | `components/BiasCard.tsx` | Per-cluster tracking-signal table (CME/MAD, hit rate, trailing-6mo direction). | Read-only. |
| 7c″ | **WinLossDriverCard** (v2.2 Phase D) | `components/WinLossDriverCard.tsx` | PA/PR rejection-code lens — per-cluster lost-quote breakdown over the trailing 90d, plus a PA/PR sparkline per row. Selectors: `data-testid="win-loss-card"`, `win-loss-row[data-cluster]`, `win-loss-pa`, `win-loss-pr`, `win-loss-sparkline` (role="img"). Source: BFF `winLoss` field, composed from `services/forecast/win_loss.py`. | Read-only. |
| 7d | WalkForward | `components/WalkForward.tsx` | Per-cluster MAPE backtest bar chart. Trained 2022-01 → 2025-09, holdout test. Target reference line. | Read-only. |
| 7e | MarginTrajectoryCard | `components/MarginTrajectoryCard.tsx` | Quarterly DB2 margin with 4-quarter WMA projection + floor band. | Read-only. |
| 7f | CostDecompositionCard | `components/CostDecompositionCard.tsx` | Cost structure breakdown (multi-line over time) + insights list. | Read-only. |
| 7g | SeasonalOverlayCard | `components/SeasonalOverlayCard.tsx` | Seasonal indices vs current-month actual. | Read-only. |
| 7h | CommodityTrajectoriesCard | `components/CommodityTrajectoriesCard.tsx` | Per-commodity-group quarterly margin multi-line (Steel S355, Alloys, Copper, etc.) + per-commodity slope chips. | Read-only. |
| 7i | InputCostTrajectory | `components/InputCostTrajectory.tsx` | Commodity tiles (price · pass-through %) + central-estimate stress scenario. | Read-only. |
| 7j | QuoteToRevenueBridge | `components/QuoteToRevenueBridge.tsx` | Quote-to-revenue funnel: trailing 30/60/90mo cumulative. Tabbed by closing-horizon. | Tab switching between horizons. |
| 8 | **Accordion: "Renewals & new product"** | `components/Accordion.tsx` (id=`block-renewals`) | Collapsed by default. Houses contract-edge artifacts. | Header expands. Auto-opens when deep-linked via `?queue=renewals`. |
| 8a | PriceFloor | `components/PriceFloor.tsx` | Top 10 renewal articles per cluster/tier. Columns: Tier · Customer · Article · Current price · Floor · Headroom · Movable share · Cluster · Next. CSV export. Highlights the article from `?article=`. | "Queue" / "Edit" row actions. CSV download. |
| 8a′ | **ErosionProjectionCard** (v2.2 Phase E) | `components/ErosionProjectionCard.tsx` | List-price vs cost-floor projection per cluster over the next 12 months. Per-row chips: crossover-month (when list crosses floor), safe (when projection holds), and update-cadence. Selectors: `data-testid="erosion-projection-card"`, `erosion-row[data-cluster]`, `erosion-chart`, `erosion-crossover-chip`, `erosion-safe-chip`, `erosion-cadence-chip`. Source: BFF `erosionProjection`, composed from `services/forecast/erosion_projection.py`. | Read-only. |
| 8b | NewProductForecast | `components/NewProductForecast.tsx` | Cluster-anchor recommendation cards (similarity score, sample size) + 12mo projection area chart. | "Pick this anchor" picker per card. |
| 8c | **AtRiskRevenueBar** (v2.2 Phase F) | `components/AtRiskRevenueBar.tsx` | Tier-stacked at-risk-vs-safe revenue bar with one legend row per tier (A/B/C/D), each showing customer count + at-risk share. Selectors: `data-testid="at-risk-revenue-card"`, `at-risk-revenue-subtitle`, `at-risk-revenue-chart`, `at-risk-tier-row[data-tier]`. Source: BFF `atRiskRevenue`, composed from `services/forecast/at_risk_revenue.py`. | Read-only. |
| 9 | **ParetoLayer** | `components/ParetoLayer.tsx` | Customer & SKU tables: LTM revenue · % booked · 12mo forecast · YoY · trend (volume/price split) · renewal due · confidence. Top tier by default; `?show_all=1` expands. **v2.2:** Customer-id buttons (`data-testid="pareto-customer-detail-<id>"`) set `?customer=<id>` to open the `CustomerForecastDetail` drawer (drilled-in from the former PerCustomerTab). | Per-row actions: "Open Studio" or "Queue". Tier tabs at top. Customer-id button opens drill-in drawer. |
| 10 | **OverrideLog** | `components/OverrideLog.tsx` (V2 only) | `Accordion` collapsed by default. **v2.2 Phase G:** Above the audit table, an FVA summary strip (`data-testid="override-fva-summary"[data-tone]`) shows this quarter's entered / improved / worsened counts + net FVA Δpp with a tone-colored border (pos/neg/flat). The audit table columns: Month · Mode · Actual · Adj % · Source · Reason · Author · FVA Δ · Delete. Empty state directs the user to click the hero chart. Renders an error block with Retry when `useForecastOverrides` fails. | **Delete** per row (each row owns its own `useDeleteOverride` mutation, so pending-state is per-row). **Retry** button on fetch error. |
| 11 | **AssumptionsFooter** | `components/AssumptionsFooter.tsx` | Compact one-line-per-assumption strip — "Data-through · 2026-04-30" etc. | Read-only. |
| 12 | **MethodologyPanel** | `components/MethodologyPanel.tsx` | Collapsible deep-dive: model lineage, sources, assumptions, accuracy metrics. | Click header to expand. |

---

## 3. Aggregate body — V1 layout (legacy, rollback path)

Source: `AggregateViewV1` in `index.tsx:228`. Renders only when `?layout=v1` is explicitly set. Same components as V2 but in the original ungrouped, forecast-buried order:

```
TornadoCard
DistributionGrid
QuoteToRevenueBridge
MarginTrajectoryCard
CostDecompositionCard
SeasonalOverlayCard
CommodityTrajectoriesCard
CalibrationCard
HeroForecast                  ← buried at slot 9 (why we built V2)
ClusterLens
WalkForward
InputCostTrajectory
ParetoLayer
PriceFloor                    (inside #block-renewals)
NewProductForecast
AssumptionsFooter
MethodologyPanel
```

V1 does **not** mount `HeroKPIStrip`, `PVMWaterfall`, `TopSKUsForecastTable`, `OverrideLog`, or `Accordion` wrappers. The V1 HeroForecast call omits `enableActualEntry`, so click-to-edit is disabled.

V1 will be deleted after Frank signs off on V2 in production.

---

## 4. Customer drill-in (v2.2)

Source: `CustomerForecastDetail` exported from `components/PerCustomerTab.tsx`. Renders when `?customer=<id>` is set; the page shell mounts it as a side drawer (`data-testid="customer-detail"`).

- Triggered by `ParetoLayer` customer-id buttons (`data-testid="pareto-customer-detail-<id>"`).
- "Top customers at decline risk" plus single-customer summary — sorted by joint risk `max(P(churn 4Q), P(major decline))`.
- Risk-tier chip per row (`components/RiskTierChip.tsx`).
- Data: `useForecastCustomers` hook; `pChurn4Q` / `pDecline4Q` fields. AUC-ROC 0.93 badge advertised on the page.
- Closing the drawer strips `?customer` from the URL.
- The standalone "Per customer" tab was removed in v2.2 Phase J — `?tab=customers` is silently stripped at navigation time.

---

## 4a. Annotation layer (v2.2 Phase H)

Source: `components/AnnotationPopover.tsx` + `data/api/useForecastAnnotations.ts` + backend `api/v1/forecast_annotations.py` (service `services/forecast/annotations.py`, JSON store `data/forecast-annotations.json`).

- **Discoverable path**: right-click any month on `HeroForecast` (chart container has `onContextMenu`). Right-click any `ClusterLens` card.
- **Keyboard fallback**: below the hero chart, the `+ Add note` button (`data-testid="hero-add-annotation"`, `aria-label="Add note for YYYY-MM"`) opens the same popover for the most-recently-hovered month. Disabled until a month has been hovered.
- **Popover** (`data-testid="annotation-popover"`, `role="dialog"`): lists existing annotations for the target, lets the user add a new one, and supports delete. Escape closes.
- **Endpoints**: `GET /api/v1/forecast/annotations[?target_kind=&target_value=]`, `POST` (auth required, author stamped from JWT), `DELETE /:id` (auth required).
- **Out of scope**: per-author ownership enforcement on delete (single-tenant demo).

---

## 4b. Briefing persona toggle (v2.2 Phase I)

Source: `components/BriefingButton.tsx`. The briefing modal now exposes:

- `data-testid="briefing-persona"` — select with `analyst_memo` (default — full analyst memo) or `manuel_1pager` (short BU-lead one-pager).
- `data-testid="briefing-language"` — select with `en` (default) or `de`.
- Picking `manuel_1pager` auto-flips language to `de` until the user manually picks one.
- Endpoint: `POST /api/v1/forecast/briefing` (model: `BriefingRequest` with `Literal["manuel_1pager","analyst_memo"]` persona + `Literal["de","en"]` language).
- Receipt shows queued job id + a download link (`data-testid="briefing-download-link"`) once available.

---

## 5. Override entry flow (V2 only)

### `ActualEntryPanel`

Source: `components/ActualEntryPanel.tsx`. Opened by clicking any month on `HeroForecast` (when `enableActualEntry` is true).

- **Form factor**: fixed-position right side panel, 420px wide, full screen height, slides in over the chart (chart stays visible).
- **Accessibility**: `role="dialog"`, `aria-modal="true"`, Tab/Shift-Tab focus trap inside the panel, ESC closes, focus restored to the previously focused element on unmount.
- **Header**: Month + active cluster + close X.
- **Read-only model block**: P50 + 80% band range + 95% band range.
- **Inputs**:
    - `Actual (€)` — numeric, autofocused. `data-testid="actual-input"`.
    - `Source` — select: Manual reconciliation (default) / ERP feed / Contracted / Other.
    - `Confidence` — segmented control: Low / Medium / High (default Medium).
    - `Reason` — textarea, minimum 10 chars enforced. Counter shown.
- **FVA guardrail** (`hooks/useFVAGuardrail.ts`): when `|adjustmentPct| < 0.05`, shows an amber-tinted warning citing Fildes & Goodwin (2007) — *"Small overrides typically harm accuracy..."*. `data-testid="fva-warning"`.
- **Impact preview**: live "Adjustment: ±X% vs model P50" line.
- **CTA row**: Save actual / Save & retrain now / Cancel.
- **On save**:
    1. POSTs to `/api/v1/forecast/overrides` via `useCreateOverride` (TanStack mutation).
    2. Panel auto-closes after ~400ms.
    3. Chart's `useForecastOverrides` query invalidates → diamond glyph appears on the chart.
    4. `OverrideLog` query invalidates → new row appears.
    5. If "Save & retrain now": also dispatches `window` event `forecast:retrain-requested` (no backend retrain wired yet — follow-up).
- **On error**: panel stays open, inline `data-testid="actual-entry-error"` alert, user can retry without retyping.

### `useFVAGuardrail`

Source: `hooks/useFVAGuardrail.ts`. Threshold: `FVA_THRESHOLD = 0.05`. Per Fildes & De Baets 2024 (Forecast Value Added in Demand Planning).

### Override CRUD hooks

Source: `data/api/useForecastOverrides.ts`. TanStack Query.

- `useForecastOverrides({ month?, cluster? })` — GET list.
- `useCreateOverride()` — POST.
- `useUpdateOverride()` — PATCH.
- `useDeleteOverride()` — DELETE.

Backend: FastAPI router `scherzinger-platform/backend/api/v1/forecast_overrides.py` mounted at `/api/v1/forecast/overrides`, service `scherzinger-platform/backend/services/forecast/overrides.py`, JSON store at `scherzinger-platform/backend/data/forecast-overrides.json`. Auth-gated via `require_auth → AuthContext`; thread-locked for safe concurrent writes. `fvaDelta` populated by a heuristic stub (`_score_fva`) until the backtest cycle ingests overrides.

---

## 6. Other components on the page

| Component | File | Where it appears | Purpose |
|---|---|---|---|
| **PageHead** | `components/PageHead.tsx` | Top of page | Greeting · sub-pill · filter pills (tier/family/cluster, click-to-toggle URL params) · "Updated" timestamp from methodology |
| **MarketDirectionStrip** | `components/MarketDirectionStrip.tsx` | Below PageHead | Horizontal strip of curated market tiles (e.g., "Steel S355 +4.2%"). Click → opens `MarketTileDrawer`. |
| **BriefingButton** | `components/BriefingButton.tsx` | Top-right under MarketDirectionStrip | "Generate forecast briefing" button → modal with LLM-parsed natural-language briefing exportable as PDF/text. |
| **ModeToggle** | `components/ModeToggle.tsx` | Below scenario rows | Revenue/Margin/Volume mode + 3/6/12mo horizon dropdown. Writes to URL. |
| **ScenarioLibrary** | `components/ScenarioLibrary.tsx` | After ModeToggle | Saved-scenarios picker strip. "Create", "Apply", "Edit" actions. Opens `ScenarioBuilder` drawer. |
| **ScenarioBuilder** | `components/ScenarioBuilder.tsx` | Right-side drawer | Scenario creation form: name + driver multipliers + horizon. |
| **CustomerForecastDetail** | `components/PerCustomerTab.tsx` | Drawer when `?customer=<id>` | v2.2 drill-in from `ParetoLayer` (formerly the "Per customer" tab). |
| **AnnotationPopover** | `components/AnnotationPopover.tsx` | Popover on right-click of HeroForecast / ClusterLens, or keyboard fallback | v2.2 — comment / note layer; `role="dialog"`. |
| **PlanTrackingStrip** | `components/PlanTrackingStrip.tsx` | Above the hero strip | v2.1 — plan vs actual + cumulative gap (now real-data backed by `composer.py` plan-tracking). |
| **PocketWaterfallCard** | `components/PocketWaterfallCard.tsx` | In the diagnostics accordion | v2.1 — list → quoted → booked → invoiced → DB2 leakage waterfall (real-data). |
| **NextCycleMovesStrip** | `components/NextCycleMovesStrip.tsx` | Below the hero | v2.1 / v2.2 Phase B — 3-5 ranked moves; "Open" routes through `useUiAction()` → `ActionDrawerHost`. Scroller exposed via `role="region"` + tabIndex. |
| **BiasCard** | `components/BiasCard.tsx` | Drivers accordion | v2.1 — tracking-signal table (real-data). |
| **WinLossDriverCard** | `components/WinLossDriverCard.tsx` | Drivers accordion | v2.2 — PA/PR rejection lens. |
| **ErosionProjectionCard** | `components/ErosionProjectionCard.tsx` | Renewals accordion | v2.2 — list-price erosion projection. |
| **AtRiskRevenueBar** | `components/AtRiskRevenueBar.tsx` | Above ParetoLayer | v2.2 — tier-stacked at-risk revenue. |
| **FilterScopeBadge** | `components/FilterScopeBadge.tsx` | Header of 10+ cards (Phase C) | v2.2 — chip noting whether the card honors the active `tier`/`family`/`cluster` filter. |
| **CrossLinkStrip** | `components/CrossLinkStrip.tsx` | Footer | Links out to Action Center, Margin Cockpit, Quotes. |
| **ThresholdAlertButton** | `components/ThresholdAlertButton.tsx` | Used inside specific cards | "Notify me when X crosses Y" — sets a server-side alert (wishlist #5). |
| **AccuracyBadge** | `components/AccuracyBadge.tsx` | Used inside cards (ClusterLens, etc.) | Reusable accuracy chip (MAPE / AUC / calibration hit rate). Tone: status/amber/red. |
| **RiskTierChip** | `components/RiskTierChip.tsx` | Inside PerCustomerTab rows | Shared risk-tier badge (A/B/C/D + joint-risk tone). |
| **DistributionDrawer** | `components/DistributionDrawer.tsx` | Opened from TornadoCard | Right-side drawer with the full Monte Carlo distribution histogram for a driver. |
| **LineageDrawer** | `components/LineageDrawer.tsx` | Opened from MethodologyPanel | Shows full sources / SQL / model lineage for a value. |
| **MarketTileDrawer** | `components/MarketTileDrawer.tsx` | Opened from MarketDirectionStrip tile click | Drawer with series detail when a market tile is clicked (wishlist #3). |
| **ForecastSkeleton** | `components/ForecastSkeleton.tsx` | Rendered while `isLoading` | Page-level loading skeleton with shimmer blocks. |
| **Accordion** | `frontend-v2/src/components/Accordion.tsx` (shared) | Drivers, Renewals, OverrideLog | Reusable disclosure: title + optional badge + content. Supports controlled `open` prop, `onOpenChange`, plus a `window` event API (`accordion:open` with `{ id }` payload) so deep-links can pop it open before scrolling. |
| **metricFormat** | `components/metricFormat.ts` | Shared util | Formatters for €/%/units across the page. |

---

## 7. Tests covering this page

| Layer | Location | Count |
|---|---|---|
| **Vitest unit** | `frontend-v2/src/features/forecasting/components/*.test.tsx`, `hooks/*.test.ts`, `src/tests/forecasting/*` | 269 tests across 64 files (full repo as of v2.2). New v2.2 unit tests: `WinLossDriverCard.test.tsx`, `ErosionProjectionCard.test.tsx`, `AtRiskRevenueBar.test.tsx`, `AnnotationPopover.test.tsx`, `BriefingButton.test.tsx`, `NextCycleMovesStrip.test.tsx`, `BiasCard.test.tsx`, `PocketWaterfallCard.test.tsx`. |
| **Playwright E2E** | `frontend-v2/tests/e2e/forecasting-actual-entry.spec.ts`, `forecasting-v2-1.spec.ts`, `forecasting-v2-2.spec.ts` | 10 specs total. v2.1 (NextCycleMovesStrip → Action Center drawer round-trip, 3 specs). v2.2 (WinLoss, Erosion, AtRisk, FVA strip, AnnotationPopover keyboard fallback, briefing persona toggle, single-view tablist + customer drill-in, 7 specs). |
| **Playwright visual** | `frontend-v2/tests/e2e/forecasting-visual.spec.ts` | 2 — first-viewport baseline + panel-open baseline. PNG snapshots in `forecasting-visual.spec.ts-snapshots/`. |
| **Pytest (overrides API)** | `scherzinger-platform/tests/services/test_overrides.py`, `tests/api/test_forecast_overrides.py` | 23 — service CRUD, concurrent writes (20 threads), auth, 404 on unknown delete, FVA scoring bands, client-`author`-ignored. |
| **Pytest (v2.2 services)** | `tests/services/test_win_loss.py`, `test_erosion_projection.py`, `test_at_risk_revenue.py`, `test_annotations.py`, `test_fva_summary.py`, `test_pocket_waterfall.py`, `test_plan_tracking.py`, `test_pipeline_p50.py`, `test_next_moves.py`, `test_bias.py` | Service-layer coverage for every new composer / data feed. |
| **Pytest (v2.2 API)** | `tests/api/test_forecast_annotations.py` | 6 — POST/GET/DELETE roundtrip, empty-body rejection, bad-target-kind rejection, writes-require-auth, client-`author`-ignored, unknown-delete 404. |

---

## 8. Open follow-ups (documented but not yet shipped)

- **Churn as stacked-negative band** in `HeroForecast` — needs BFF to expose a per-month churn-forecast series; currently only `PVMWaterfall` and the customer drill-in surface churn.
- **Real ML retrain pipeline** wired to the `forecast:retrain-requested` window event — backend job queue.
- **`fvaDelta` from actual backtest** — `_score_fva` is currently a heuristic stub. Phase G's FVA summary strip consumes whatever `fvaDelta` is at the time; accuracy improves for free when the real cycle lands.
- **Migrate JSON store → analytics warehouse table** — applies to `forecast-overrides.json`, `plan.json`, and the new (Phase H) `forecast-annotations.json`. Fine for demo / single-process, not for multi-worker prod.
- **Annotation ownership enforcement** — `DELETE /forecast/annotations/:id` currently allows any authed user to delete any annotation. Acceptable for single-tenant Scherzinger demo; needs author check for multi-tenant.
- **Pricing-studio + margin-cockpit filter propagation** — reuse the `FilterScopeBadge` primitive (separate plan).
- **Delete `AggregateViewV1`** — once Frank signs off on V2.
- **Right-click annotation E2E** — covered by `HeroForecast.test.tsx` (unit) + structurally in `forecasting-v2-2.spec.ts`; the discoverable mouse path works in real browsers but the Recharts hover/contextmenu combo is flaky under Playwright (chart `mouseLeave` clears `hoverMonth` before contextmenu fires).
- **Pre-existing `dangerouslySetInnerHTML`** on movers in `HeroForecast.tsx` was *fixed* in Phase 9 (commit `38a8144`) — `renderMoverSub` now emits real `<strong>` JSX nodes.

---

## 9. Quick file map

```
frontend-v2/src/features/forecasting/
├── index.tsx                              ← page shell, V1/V2 dispatch
├── components/
│   ├── HeroKPIStrip.tsx                   ← V2 KPI tiles
│   ├── HeroForecast.tsx                   ← two-band fan chart + click-to-edit
│   ├── ActualEntryPanel.tsx               ← side panel for entering actuals
│   ├── PVMWaterfall.tsx                   ← V2 PVM bridge
│   ├── TopSKUsForecastTable.tsx           ← V2 top SKUs table
│   ├── ClusterLens.tsx                    ← 4 cluster mini-cards
│   ├── TornadoCard.tsx                    ← input sensitivity
│   ├── DistributionGrid.tsx               ← per-cluster MC distributions
│   ├── CalibrationCard.tsx                ← backtest accuracy
│   ├── WalkForward.tsx                    ← MAPE backtest bars
│   ├── MarginTrajectoryCard.tsx           ← DB2 quarterly margin
│   ├── CostDecompositionCard.tsx          ← cost structure
│   ├── SeasonalOverlayCard.tsx            ← seasonal indices
│   ├── CommodityTrajectoriesCard.tsx      ← commodity multi-line
│   ├── InputCostTrajectory.tsx            ← commodity tiles
│   ├── QuoteToRevenueBridge.tsx           ← Q→R funnel
│   ├── ParetoLayer.tsx                    ← customers + SKUs Pareto tables
│   ├── PriceFloor.tsx                     ← renewals top-10
│   ├── NewProductForecast.tsx             ← cluster-anchor cards
│   ├── OverrideLog.tsx                    ← V2 audit table (v2.2: + FVA summary strip)
│   ├── WinLossDriverCard.tsx              ← v2.2 PA/PR rejection lens
│   ├── ErosionProjectionCard.tsx          ← v2.2 list-price erosion projection
│   ├── AtRiskRevenueBar.tsx               ← v2.2 tier-stacked at-risk revenue
│   ├── AnnotationPopover.tsx              ← v2.2 note layer (right-click / keyboard)
│   ├── PlanTrackingStrip.tsx              ← v2.1 plan vs actual
│   ├── PocketWaterfallCard.tsx            ← v2.1 pocket-margin waterfall
│   ├── NextCycleMovesStrip.tsx            ← v2.1/v2.2 ranked moves → Action Center
│   ├── BiasCard.tsx                       ← v2.1 tracking-signal table
│   ├── FilterScopeBadge.tsx               ← v2.2 unfiltered chip
│   ├── DiagnosticsAccordionToggle.tsx     ← v2.1 nested toggle
│   ├── PageHead.tsx                       ← header + filter pills
│   ├── MarketDirectionStrip.tsx           ← market tiles row
│   ├── MarketTileDrawer.tsx               ← tile detail drawer
│   ├── BriefingButton.tsx                 ← LLM briefing export
│   ├── ModeToggle.tsx                     ← revenue/margin/volume + horizon
│   ├── ScenarioLibrary.tsx                ← saved-scenarios strip
│   ├── ScenarioBuilder.tsx                ← create-scenario drawer
│   ├── ScenarioCompareView.tsx            ← side-by-side scenario diff
│   ├── ScenarioActiveBanner.tsx           ← active-scenario indicator
│   ├── PerCustomerTab.tsx                 ← churn / decline-risk tab
│   ├── DistributionDrawer.tsx             ← MC distribution drilldown
│   ├── LineageDrawer.tsx                  ← methodology lineage drilldown
│   ├── MethodologyPanel.tsx               ← methodology accordion
│   ├── AssumptionsFooter.tsx              ← one-line assumptions strip
│   ├── ForecastSkeleton.tsx               ← loading state
│   ├── ThresholdAlertButton.tsx           ← "notify me" alert
│   ├── AccuracyBadge.tsx                  ← reusable accuracy chip
│   ├── RiskTierChip.tsx                   ← reusable risk-tier badge
│   ├── CrossLinkStrip.tsx                 ← footer cross-links
│   └── metricFormat.ts                    ← shared formatters
├── hooks/
│   └── useFVAGuardrail.ts                 ← FVA warning + adjustment-% calc
└── (data hooks live one level up)
    └── frontend-v2/src/data/api/
        ├── useForecast.ts                 ← page data fetch
        └── useForecastOverrides.ts        ← override CRUD hooks
```
