# Frontend Forecasting Page — Reference

> Last updated: 2026-05-14. Mirrors the state of `forecast-redesign-v2` branch at HEAD `b9118b4`.
>
> Source of truth lives in `frontend-v2/src/features/forecasting/`. This document indexes every component the page can render, in render order, with data sources and interactions.

## 1. Entry point

| File | Role |
|---|---|
| `frontend-v2/src/features/forecasting/index.tsx` | Page shell. Reads URL params, fetches data via `useForecast`, dispatches to `AggregateView` (V1 or V2) or `PerCustomerTab`. |

### URL parameters (read by `ForecastingPage`)

| Param | Default | Effect |
|---|---|---|
| `mode` | `revenue` | One of `revenue` · `margin` · `volume`. Drives the entire shell — chart units, KPI tiles, axes. |
| `horizon` | `12` | Forecast horizon months (3 / 6 / 12). |
| `tab` | `aggregate` | `aggregate` shows the redesign body. `customers` swaps to `PerCustomerTab`. |
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
ScenarioCompareView
ModeToggle                              (revenue/margin/volume + horizon)
[Tablist: "Aggregate & clusters" | "Per customer"]
└─ AggregateView (V1 or V2) | PerCustomerTab
CrossLinkStrip                          (footer)
```

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
| 7d | WalkForward | `components/WalkForward.tsx` | Per-cluster MAPE backtest bar chart. Trained 2022-01 → 2025-09, holdout test. Target reference line. | Read-only. |
| 7e | MarginTrajectoryCard | `components/MarginTrajectoryCard.tsx` | Quarterly DB2 margin with 4-quarter WMA projection + floor band. | Read-only. |
| 7f | CostDecompositionCard | `components/CostDecompositionCard.tsx` | Cost structure breakdown (multi-line over time) + insights list. | Read-only. |
| 7g | SeasonalOverlayCard | `components/SeasonalOverlayCard.tsx` | Seasonal indices vs current-month actual. | Read-only. |
| 7h | CommodityTrajectoriesCard | `components/CommodityTrajectoriesCard.tsx` | Per-commodity-group quarterly margin multi-line (Steel S355, Alloys, Copper, etc.) + per-commodity slope chips. | Read-only. |
| 7i | InputCostTrajectory | `components/InputCostTrajectory.tsx` | Commodity tiles (price · pass-through %) + central-estimate stress scenario. | Read-only. |
| 7j | QuoteToRevenueBridge | `components/QuoteToRevenueBridge.tsx` | Quote-to-revenue funnel: trailing 30/60/90mo cumulative. Tabbed by closing-horizon. | Tab switching between horizons. |
| 8 | **Accordion: "Renewals & new product"** | `components/Accordion.tsx` (id=`block-renewals`) | Collapsed by default. Houses contract-edge artifacts. | Header expands. Auto-opens when deep-linked via `?queue=renewals`. |
| 8a | PriceFloor | `components/PriceFloor.tsx` | Top 10 renewal articles per cluster/tier. Columns: Tier · Customer · Article · Current price · Floor · Headroom · Movable share · Cluster · Next. CSV export. Highlights the article from `?article=`. | "Queue" / "Edit" row actions. CSV download. |
| 8b | NewProductForecast | `components/NewProductForecast.tsx` | Cluster-anchor recommendation cards (similarity score, sample size) + 12mo projection area chart. | "Pick this anchor" picker per card. |
| 9 | **ParetoLayer** | `components/ParetoLayer.tsx` | Customer & SKU tables: LTM revenue · % booked · 12mo forecast · YoY · trend (volume/price split) · renewal due · confidence. Top tier by default; `?show_all=1` expands. | Per-row actions: "Open Studio" or "Queue". Tier tabs at top. |
| 10 | **OverrideLog** | `components/OverrideLog.tsx` (V2 only) | `Accordion` collapsed by default. Audit table of every override Frank has entered. Columns: Month · Mode · Actual · Adj % · Source · Reason · Author · FVA Δ · Delete. Empty state directs the user to click the hero chart. Renders an error block with Retry when `useForecastOverrides` fails. | **Delete** per row (each row owns its own `useDeleteOverride` mutation, so pending-state is per-row). **Retry** button on fetch error. |
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

## 4. Per-customer tab

Source: `components/PerCustomerTab.tsx`. Renders when `?tab=customers`.

- "Top customers at decline risk" — sorted by joint risk `max(P(churn 4Q), P(major decline))`.
- Drill-in detail modal per customer.
- Risk-tier chip per row (`components/RiskTierChip.tsx`).
- Data: `useForecastCustomers` hook; `pChurn4Q`/`pDecline4Q` fields. AUC-ROC 0.93 badge advertised on the page.
- Currently the **only** place churn surfaces in the page; PVMWaterfall surfaces it as a delta bar but does not deep-link here yet.

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
| **ScenarioCompareView** | `components/ScenarioCompareView.tsx` | After ScenarioLibrary | Side-by-side scenario comparison (wishlist #2). |
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
| **Vitest unit** | `frontend-v2/src/features/forecasting/components/*.test.tsx`, `hooks/*.test.ts`, `src/tests/forecasting/*` | 194 tests across 52 files (full repo) — incl. `HeroForecast.test.tsx`, `ActualEntryPanel.test.tsx`, `HeroKPIStrip.test.tsx`, `PVMWaterfall.test.tsx`, `TopSKUsForecastTable.test.tsx`, `OverrideLog.test.tsx`, `Accordion.test.tsx`, `useFVAGuardrail.test.ts`, `use-forecast-overrides.test.tsx`. |
| **Playwright E2E** | `frontend-v2/tests/e2e/forecasting-actual-entry.spec.ts` | 2 — layout-first-viewport assertion + click-to-actual round trip with FVA guardrail and reload persistence. |
| **Playwright visual** | `frontend-v2/tests/e2e/forecasting-visual.spec.ts` | 2 — first-viewport baseline + panel-open baseline. PNG snapshots in `forecasting-visual.spec.ts-snapshots/`. |
| **Pytest (overrides API)** | `scherzinger-platform/tests/services/test_overrides.py`, `tests/api/test_forecast_overrides.py` | 23 — service CRUD, concurrent writes (20 threads), auth, 404 on unknown delete, FVA scoring bands, client-`author`-ignored. |

---

## 8. Open follow-ups (documented but not yet shipped)

- **Churn as stacked-negative band** in `HeroForecast` — needs BFF to expose a per-month churn-forecast series; currently only `PVMWaterfall` and `PerCustomerTab` surface churn.
- **Real ML retrain pipeline** wired to the `forecast:retrain-requested` window event — backend job queue.
- **`fvaDelta` from actual backtest** — `_score_fva` is currently a heuristic stub.
- **Migrate JSON store → analytics warehouse table** — the JSON file is fine for demo / single-process, but not for multi-worker prod.
- **Delete `AggregateViewV1`** — once Frank signs off on V2.
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
│   ├── OverrideLog.tsx                    ← V2 audit table
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
