---
name: frank-forecasting-redesign
status: in-review
created: 2026-05-14T00:16:35Z
updated: 2026-05-14T00:16:35Z
---

# Frank's Forecasting Page — Redesign

## Problem

Frank is a Pricing Analyst (power user persona). His forecasting page today renders 24 components in an order driven by build chronology, not Frank's job-to-be-done. Concretely:

- **The forecast itself is buried.** `HeroForecast` lives at slot 12 of `AggregateView` (`frontend-v2/src/features/forecasting/index.tsx:212`). The top of the page is Tornado → Distribution → Quote-bridge → Margin → Cost → Seasonal → Commodity → Calibration *before* Frank sees a single number for next month's revenue.
- **Top SKUs are even deeper** — `ParetoLayer` at slot 16 (`index.tsx:216`).
- **The fan chart is a single line with one band.** Hyndman (fpp3) and every serious forecasting reference require **two intervals (80% dark / 95% light)** to communicate uncertainty honestly.
- **2025 historical bloat.** History overwhelms the forecast horizon. Frank wants to see the next 12 months, not relitigate last year.
- **No "submit actual" loop.** `HeroForecast` renders actual dots read-only — there's no plumbing for Frank to click a month, enter the real number, and feed it back to the model. Pigment, Anaplan, and Workday Adaptive all have this; Pricefx routes it through scenario clones.
- **Churn is hidden** in the Per-Customer tab. The headline revenue chart doesn't net it; the variance story doesn't decompose it.

## Goals

1. **Forecast-first layout.** Frank lands on the page and within the first viewport sees: 12-month forecast revenue, variance vs plan, MAPE, and the fan chart.
2. **Click any future month → enter the actual.** Right-side panel (Pigment/Anaplan pattern), with reason + source + confidence required, FVA guardrail on small adjustments, persisted to an override log, queued for next nightly retrain.
3. **Two-band fan chart** (80% dark / 95% light), 6mo history + 12mo forecast horizon, churn netted into the line and broken out in the waterfall.
4. **Top SKUs forecast table** moves into the first two viewports. Actual | Forecast | Variance | Variance% | Reason | Last-override author.
5. **Drivers and accuracy** (tornado, distributions, calibration, walk-forward, cost, commodity, seasonal) collapse into a single "Drivers & accuracy" accordion below the fold — accessible but not in the way.
6. **Bulletproof** — Playwright coverage on the new flow (click point → enter actual → see diamond glyph → see override log entry); review by an independent agent before merge.

## Non-Goals

- Actually retraining the ML model in this PR. We persist overrides to a JSON-backed store + emit a "Retrain queued" event; backend retrain integration is a follow-up.
- Per-Customer / churn deep-dive tab redesign. We touch it only to add a "Churn share" badge that links from the main fan chart's churn band.
- Mobile / responsive < 1024px. Frank uses a 27" monitor.

## New page order (top → bottom)

```
1.  PageHead                          (keep — header + filter pills)
2.  MarketDirectionStrip              (keep — slim banner)
3.  HeroKPIStrip            **NEW**   (4 tiles: Forecast 12mo · Variance vs plan · MAPE · FVA)
4.  HeroForecast            **MOVED** (slot 1 of body)
        - Two-band fan chart (80%/95%)
        - 6mo history + 12mo forecast
        - Click any month → opens ActualEntryPanel (right side, 420px)
        - Diamond glyph for overridden points; circle for model-predicted
        - Churn shown as stacked-negative band beneath the line
5.  PVMWaterfall            **NEW**   (Price · Volume · Mix · Churn · FX; current period delta explanation)
6.  TopSKUsForecastTable    **MOVED + REPURPOSED from ParetoLayer**
        - Columns: SKU · Cluster · Actual (LTM) · Forecast (NTM) · Variance · Variance% · Reason · Last override · Action
        - Sortable, filterable, drillable to per-SKU detail
7.  ClusterLens                       (keep — 4 cluster mini-cards w/ sparklines)
8.  ScenarioLibrary + ScenarioCompare (keep — moved below cluster lens)
9.  Drivers & accuracy accordion **COLLAPSED BY DEFAULT**
        - TornadoCard
        - DistributionGrid
        - CalibrationCard
        - WalkForward (per-cluster MAPE backtest)
        - MarginTrajectoryCard
        - CostDecompositionCard
        - SeasonalOverlayCard
        - CommodityTrajectoriesCard
        - InputCostTrajectory
        - QuoteToRevenueBridge
10. Renewals & new product accordion **COLLAPSED BY DEFAULT**
        - PriceFloor (renewals)
        - NewProductForecast
11. OverrideLog            **NEW**    (collapsed table: who/what/when/reason/FVA delta)
12. MethodologyPanel + AssumptionsFooter (keep — bottom)
```

## ActualEntryPanel — UX spec

Triggered by clicking any month point on `HeroForecast` (history OR forecast). 420px right side panel slides over (chart stays visible, dimmed to 0.6).

**Header**: "Month: 2026-08" · "Cluster: All" (or active cluster filter) · close X.

**Body** (vertical stack):
1. **Forecast summary** — read-only:
    - P50: €612K
    - 80% band: €587K – €638K
    - 95% band: €561K – €672K
    - Drivers: 3 chips ("Steel +4.2%", "BKAES seasonal +", "MBDIV decline")
2. **Enter actual** form:
    - `Actual (€)` — numeric input, currency-formatted, autofocused
    - `Source` — select: ERP feed (default if past month), Manual reconciliation, Contracted, Other
    - `Confidence` — segmented control: Low · Medium · High
    - `Reason` — textarea, required, **min 10 chars**
3. **Impact preview** — auto-renders as user types:
    - Mini sparkline: model prediction vs entered value
    - Adjustment magnitude: "+€19K (+3.1% vs P50)"
    - **FVA guardrail banner** (yellow) if `|adjustment| < 5%`:
      *"Small overrides typically harm accuracy (Fildes 2007). 73% of overrides <5% on this account have hurt MAPE. Continue?"*
4. **CTA row**:
    - Primary: "Save actual"
    - Secondary: "Save & retrain now"
    - Tertiary: "Cancel"

**On Save**:
- POST `/forecast/overrides` (mocked endpoint persisting to `data/forecast-overrides.json` server-side; frontend optimistic update via TanStack Query mutation)
- Point on chart switches to **diamond glyph** in `var(--rose-deep)`
- Toast: "Actual saved for Aug 2026. Model retrain queued for tonight."
- Override log row added (visible in section #11)
- ActualEntryPanel auto-closes after 600ms

**Edge cases**:
- Past month with ERP-fed actual → form pre-fills with ERP value, source locked to "ERP feed", `Save & retrain` disabled (no thrash on reconciled history)
- User edits an existing override → diff shown in header ("Editing override from Frank, 2026-05-12")
- Network failure → optimistic update reverts, error toast with retry

## Component architecture (new files)

```
frontend-v2/src/features/forecasting/
├── components/
│   ├── HeroKPIStrip.tsx                  [NEW]
│   ├── HeroForecast.tsx                  [MAJOR REVISION — bands + click-to-edit]
│   ├── ActualEntryPanel.tsx              [NEW]
│   ├── PVMWaterfall.tsx                  [NEW]
│   ├── TopSKUsForecastTable.tsx          [NEW — replaces direct ParetoLayer usage in this slot; ParetoLayer retained for back-compat]
│   ├── DriversAccuracyAccordion.tsx      [NEW — wrapper that lazy-renders existing cards]
│   ├── RenewalsNewProductAccordion.tsx   [NEW — wrapper for PriceFloor + NewProductForecast]
│   ├── OverrideLog.tsx                   [NEW]
│   └── (existing components unchanged)
├── hooks/
│   ├── useForecastOverrides.ts           [NEW — TanStack Query CRUD on /forecast/overrides]
│   └── useFVAGuardrail.ts                [NEW — computes adjustment % + Fildes warning]
└── index.tsx                              [REORDER + accordion wiring]
```

Backend stub (BFF):
```
scherzinger-platform/backend/services/forecast/
├── overrides.py                          [NEW — GET/POST/PATCH/DELETE; JSON-backed]
└── routes.py                             [NEW endpoint wiring]
```

## Data shape

```ts
// types/forecast.ts — additions
export interface ForecastOverride {
  id: string;            // uuid
  month: string;         // YYYY-MM
  cluster: string | null; // null = aggregate
  mode: 'revenue' | 'margin' | 'volume';
  actual: number;        // value in source mode units
  modelP50: number;      // snapshot of model P50 at time of override
  adjustmentPct: number; // (actual - modelP50) / modelP50
  source: 'erp' | 'manual' | 'contracted' | 'other';
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  author: string;        // 'Frank' for now
  createdAt: string;     // ISO
  fvaDelta: number | null; // bps change in MAPE after this override (null until next retrain)
}

export interface HeroKPI {
  forecast12mo: { value: number; unit: 'EUR' | 'pct' | 'units' };
  varianceVsPlan: { value: number; pct: number; trend: 'up' | 'down' | 'flat' };
  mape: { value: number; window: string };
  fva: { score: number; verdict: 'helping' | 'neutral' | 'hurting'; n: number };
}

export interface PVMBar {
  factor: 'price' | 'volume' | 'mix' | 'churn' | 'fx' | 'other';
  delta: number;
  pctOfTotal: number;
}
```

## Visual / interaction details

- **Fan chart bands**: Recharts `Area` with `fillOpacity` 0.18 (95%) and 0.32 (80%), `var(--rose-deep)` family. P50 line `strokeWidth: 2.5`.
- **History/forecast separator**: vertical dashed line at "now"; history points open circles, forecast points filled.
- **Diamond glyph for overrides**: custom Recharts `<Symbol>` shape, 9px diagonal, rose-deep fill.
- **Side panel**: position-fixed right, top 0, h-screen, w-[420px], shadow-xl, slide animation 220ms ease-out. Focus-trap. ESC closes.
- **Cursor on chart**: pointer when hovering any month; tooltip shows P50 + bands + "Click to enter actual".

## Testing

**Unit (Vitest)**:
- `useFVAGuardrail` returns warning when |adjustmentPct| < 0.05
- Override mutation optimistic update + rollback on error
- PVM waterfall arithmetic: sum of bars equals total delta
- HeroKPIStrip variance formula

**Integration (Vitest + React Testing Library)**:
- Click month → panel opens with correct prefilled P50
- Submit invalid (reason < 10 chars) → blocked, validation visible
- Submit valid → optimistic point becomes diamond
- Network 500 → rollback + retry toast

**E2E (Playwright)** — `tests/e2e/forecasting-actual-entry.spec.ts`:
1. Navigate as Frank → `/forecasting`
2. Assert HeroKPIStrip is first below header (viewport check)
3. Assert HeroForecast renders within first 900px of body
4. Click forecast point for month +6 → panel slides in
5. Fill actual = 650000, source = manual, confidence = medium, reason = "Q3 contract renegotiation closed early"
6. Assert FVA guardrail does NOT appear (adjustment > 5%)
7. Click Save → assert toast, assert diamond glyph on point, assert override log row exists
8. Reload page → override persists, diamond still present
9. Click same point again → form prefilled with previous values, header says "Editing override"
10. Small-adjustment path: enter actual = modelP50 * 1.02 → assert FVA warning visible

**Visual regression (Playwright screenshots)**:
- First viewport baseline (KPI strip + hero fan chart)
- Hero chart with 3 overrides marked (diamond glyphs)
- ActualEntryPanel open state
- Mobile breakpoint NOT tested (out of scope)

## Rollout

- Behind URL flag `?layout=v2` for first cycle. If `?layout=v1` or no flag, legacy order renders (one-line guard at top of `AggregateView`).
- After Playwright + human walk-through on the v2 path, default flips to v2 in a follow-up commit.
- Phase commits per `MEMORY.md` rule (commit + push every phase, no asking).

## Open decisions (resolved inline — see below)

- **Churn placement** → resolved: stacked-negative band in HeroForecast + dedicated bar in PVMWaterfall + "Churn share" badge linking to Per-Customer tab. Not a separate hero block.
- **Horizon default** → resolved: 6mo history + 12mo forecast (rolling 18mo). User can toggle "Show full history" to see 24mo back.
- **FVA threshold** → resolved: 5% per Fildes/De Baets 2024.
- **Save & retrain now vs nightly** → resolved: both buttons; nightly is default; "now" emits event but no synchronous retrain in this PR.

## References

- Hyndman & Athanasopoulos, *Forecasting: Principles and Practice* (fpp3): two-interval fan chart convention
- Fildes, Goodwin & De Baets (2024), "Forecast Value Added in Demand Planning", IJF
- Anaplan drill-down + override-at-higher-level patterns
- Pigment Predictions / Actuals-vs-Plan feature
- Vendavo Margin Bridge Analyzer (PVM waterfall)
