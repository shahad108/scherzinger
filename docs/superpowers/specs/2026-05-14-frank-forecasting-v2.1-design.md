---
name: frank-forecasting-v2-1
status: in-review
created: 2026-05-14T02:22:59Z
updated: 2026-05-14T02:22:59Z
supersedes: 2026-05-14-frank-forecasting-redesign-design.md (extends, doesn't replace)
---

# Frank's Forecasting v2.1 — Plan-First, Pocket-Margin, Prescriptive Bridge

## Problem

External review (pricing-analyst persona walk by an industry-experienced reviewer, citing Pricefx / Vendavo / Zilliant / McKinsey / Fildes-Goodwin) confirmed v2 nails the **predictive layer** (2), **driver attribution** (3), and **FVA audit** (5), but is **light or muddled** on Frank's three other weekly questions:

1. *Did last week/month hit plan, and where did we miss?* → plan-vs-actual is one KPI tile only, no attribution, no plan-reset history.
3. *Where is margin leaking?* → PVM, cost decomposition, and seasonal are layered in three different cards instead of a unified **pocket-margin waterfall** (List → Quoted → Booked → Invoiced → DB2).
4. *What should I act on this cycle?* → Frank gets diagnostics, then has to leave for Action Center. No in-page prescriptive bridge.

Additional issues reviewer flagged that block the Scherzinger demo with Manuel:
- **Filter propagation is inconsistent** (Manuel's feedback theme): tier/family/cluster pills re-query the BFF for `useForecast`, but some downstream cards read from the BFF payload without confirming filter context — they may quietly render unfiltered data. Worse than no filter.
- **Bias is invisible.** MAPE = magnitude of error. Bias = sign. Low MAPE + persistent bias is "quietly wrong by the same amount every period" and we can't currently defend our accuracy story.
- **Statistical forecast is the only line.** Pipeline-derived P50 (P(win) × value × close-date over the open quote book) is missing — yet the company already has the open-quote ledger and we already show *historical* funnel via `QuoteToRevenueBridge`.
- **Drivers accordion is undifferentiated.** Seasonal / commodity / cost-decomposition diagnostics outweigh decision-relevant content (WalkForward, Calibration, Tornado) for Frank's weekly loop; he scrolls past 7 cards to find the one he uses.
- **No traffic-light freshness signal** for Mittelstand trust.
- **Scenarios require composing driver multipliers** — too much friction for a 5-minute weekly review.

## Goals

Six high-priority items + three quick wins. Each is shippable on its own, but together they take the page from "predictive only" to "plan-first, pocket-margin-aware, with a prescriptive bridge."

### High-priority

1. **PlanTrackingStrip** — cumulative plan vs actual line + variance attribution chips + plan-reset history button. Sits between `HeroKPIStrip` and `HeroForecast`. Owns Manuel's question #1.
2. **Filter propagation guarantee** — every card on the page either honors `tier`/`family`/`cluster`/`scenario_id` URL params, or shows a `(unfiltered — all clusters)` badge in its header. No silent half-filtering.
3. **PocketWaterfallCard** — List → Quoted → Booked → Invoiced → DB2-after-cost. McKinsey-style leakage bars per step and per cluster. Includes a per-cluster pocket-price band histogram. Lives in Drivers & Accuracy, but visible by default (not behind diagnostics toggle).
4. **NextCycleMovesStrip** — 3–5 ranked recommendations tied to the current forecast view, each stamped with the source signal (e.g. "Driven by: cost crossing list price in BKAGG"). Each card emits an `ActionIntent` event so the same Action Center plumbing handles execution. Sits below `HeroForecast`.
5. **BiasCard** — per-cluster tracking signal (cumulative ME / MAD), hit-rate-within-±5%, last-6-months bias-direction chip. Lives next to `CalibrationCard` inside Drivers & Accuracy. Visible by default.
6. **Pipeline-implied P50 lane** — a second `Line` on `HeroForecast` (lighter color, dashed) showing forward revenue inferred from the open-quote book × win probability × close-date. Tooltip diff between statistical P50 and pipeline P50.

### Quick wins (low-risk, in this PR)

7. **Scenario presets** — 5 pump-manufacturer presets bolted onto `ScenarioLibrary`:
    - "Steel S355 +20%, pass-through 60%"
    - "+3% list price, 50% capture"
    - "Lose top-3 customer in BKAGG"
    - "Win 5pp more of price-lost quotes" (Scherzinger p=0.003 finding)
    - "Industrial recession −10% volume"
8. **Traffic-light freshness chip** in `PageHead`. Single canonical `data_through` from the BFF. Green ≤24h, amber ≤72h, red >72h. `AssumptionsFooter` and `MethodologyPanel` consume the same field.
9. **Drivers accordion reorder + "Show diagnostics" toggle.** WalkForward + CalibrationCard + BiasCard + TornadoCard render at top of the accordion. `SeasonalOverlayCard` + `CommodityTrajectoriesCard` + `CostDecompositionCard` + `InputCostTrajectory` collapse behind a "Show diagnostics" toggle inside the accordion (default off).

## Non-Goals (explicit follow-ups)

- **WinLossDriverCard** (PA/PR rejection-code lens) — needs win/loss reason taxonomy in the BFF; defer.
- **List-price erosion projection** — needs price-update-cadence model; defer.
- **Annotation / comment layer** — needs a new persistence surface; defer.
- **Briefing persona toggle (Manuel mode)** — needs prompt-pack work in the briefing composer; defer.
- **At-Risk Revenue tier-stacked bar** — defer (data exists, but layout already heavy this PR).
- **FVA override drill-down** — needs backtest-cycle integration; defer.
- **Cutting `PerCustomerTab` or `ScenarioCompareView`** — these are designed; out of scope to cut without a separate call.
- **Real ML retrain on `forecast:retrain-requested`** — already explicit follow-up from v2.
- **JSON store → warehouse table** for overrides — same.

## New page order (top → bottom)

```
1.  PageHead (with traffic-light freshness chip)
2.  MarketDirectionStrip + BriefingButton
3.  PlanTrackingStrip                  **NEW**
4.  HeroKPIStrip
5.  HeroForecast                        (+ pipeline-implied P50 second line)
6.  NextCycleMovesStrip                 **NEW**
7.  PVMWaterfall
8.  PocketWaterfallCard                 **NEW** (was in Drivers; promoted)
9.  TopSKUsForecastTable
10. ClusterLens
11. ScenarioLibrary (with 5 presets) + ScenarioCompareView
12. Tablist: Aggregate · Per-customer
13. Drivers & Accuracy accordion (reordered):
       WalkForward → CalibrationCard → BiasCard **NEW** → TornadoCard
       → DistributionGrid → QuoteToRevenueBridge → MarginTrajectoryCard
       [Show diagnostics toggle]
          SeasonalOverlayCard, CommodityTrajectoriesCard,
          CostDecompositionCard, InputCostTrajectory
14. Renewals & New Product accordion
15. ParetoLayer
16. OverrideLog
17. AssumptionsFooter (consumes the canonical data_through)
18. MethodologyPanel
```

## Component / BFF additions

### Backend (FastAPI / composer)

```
scherzinger-platform/backend/services/forecast/
├── plan_tracking.py                          [NEW]
│     build_plan_tracking(...) -> PlanTracking
│     planned vs actual: monthly current FY; cumulative gap (€ and pp);
│     variance attribution from PVM bars (price/volume/mix); plan_reset
│     audit list ({ at: iso, by: str, reason: str, delta: int }).
├── pocket_waterfall.py                       [NEW]
│     build_pocket_waterfall(...) -> PocketWaterfall
│     steps: [{ name: 'list', value }, ..., { name: 'db2', value }]
│     leakage_per_step + per_cluster_band (histogram of net prices).
├── bias.py                                   [NEW]
│     build_bias(...) -> BiasPanel
│     per-cluster tracking signal CME/MAD, hit_rate_within_pct (±5),
│     trailing 6mo bias_direction ('over' | 'under' | 'flat').
├── next_moves.py                             [NEW]
│     build_next_moves(...) -> [NextMove]
│     3-5 ranked recommendations; each carries `source_signal`,
│     `cluster`, `forecast_impact_eur`, `action_intent` payload.
├── pipeline_p50.py                           [NEW]
│     build_pipeline_p50(...) -> [PipelineImpliedPoint]
│     monthly P50 from open quotes × win_prob × close-date, padded to
│     match the existing hero series window.
└── scenarios_presets.py                      [NEW]
      build_preset(name) -> ScenarioBody — five hard-coded preset bodies.
```

Composer (`services/forecast/composer.py`) is extended to attach optional
`planTracking`, `pocketWaterfall`, `bias`, `nextMoves`, and to merge
`pipelineP50` into `hero.series` (each point gets `pipelineP50?: number`).

`ForecastShell` (`frontend-v2/src/types/forecast.ts`) gains:

```ts
planTracking?: PlanTracking;
pocketWaterfall?: PocketWaterfall;
bias?: BiasPanel;
nextMoves?: NextMove[];
dataThrough?: string;            // canonical ISO timestamp
filterScope?: {                  // for badge rendering
  tier?: string; family?: string; cluster?: string; scenarioId?: string;
};
```

### Frontend

```
frontend-v2/src/features/forecasting/components/
├── PlanTrackingStrip.tsx                     [NEW]
├── PocketWaterfallCard.tsx                   [NEW]
├── BiasCard.tsx                              [NEW]
├── NextCycleMovesStrip.tsx                   [NEW]
├── FilterScopeBadge.tsx                      [NEW] reusable "(unfiltered)" pill
├── PipelineP50Lane.tsx                       [NEW helper, or extends HeroForecast]
├── DiagnosticsAccordionToggle.tsx            [NEW small wrapper component]
├── PageHead.tsx                              [MODIFY] add traffic-light freshness chip
├── ScenarioLibrary.tsx                       [MODIFY] add 5 presets row above the saved-scenarios strip
├── HeroForecast.tsx                          [MODIFY] add pipeline P50 line
└── (existing components: gain filterScope-aware "unfiltered" badge via FilterScopeBadge)

frontend-v2/src/features/forecasting/hooks/
├── usePlanTracking.ts                        (optional separate query if needed)
└── useNextMoves.ts                           (optional separate query if needed)

frontend-v2/src/data/api/
└── (no new endpoints — composer attaches new fields to /screens/forecast)
```

## ActionIntent integration for NextCycleMoves

Each NextCycleMove carries an `actionIntent` object compatible with the existing Action Center dispatch (see `useUiAction` in the codebase). On click:

1. The button calls `useUiAction()(actionIntent)` — same mutation Action Center uses.
2. The drawer / modal opens via `ActionDrawerHost` at the app shell.
3. On confirm, the same Action Center backend endpoint persists the action.

This keeps a single audit trail and zero divergent code paths.

## FilterScopeBadge contract

A component renders `(unfiltered — all clusters)` (and equivalents for tier/family/scenarios) when its section *cannot* honor the active filter. Every existing card on the page should either:

- (a) accept a `filterScope` prop and render filtered data, OR
- (b) wrap its header in `<FilterScopeBadge unfiltered={true} />` to declare it.

Phase 5 of the plan does the audit and adds badges where needed.

## Visual / UX details

- **PlanTrackingStrip:** Recharts `ComposedChart`. Two stacked area-ish lines (Plan, Actual), cumulative; thin gap-fill area between them shaded amber where Actual < Plan. Right side: variance chip strip — "Plan miss €−180k = Price €−95k · Volume €−40k · Mix €−25k · Cost +€−20k". Right of that: "Plan reset history" button → modal with the audit list.
- **PocketWaterfallCard:** Recharts `BarChart` with stacked-range bars for the waterfall (same approach as `PVMWaterfall.tsx`'s `computeWaterfall`). Y-axis = € per unit (or € per €1 of list). Each step's leakage as a percent badge. Below the chart: a small grid of 4 cluster cards each with a sparkline showing the cluster's pocket-margin band histogram.
- **BiasCard:** Per-cluster row layout (similar to `CalibrationCard`). Each row: cluster name, CME/MAD value (e.g. `+0.42σ`), hit-rate %, bias-direction chip (`Over` / `Under` / `Flat`) with arrow icon.
- **NextCycleMovesStrip:** Horizontal scroll on overflow, each card 320px wide. Card shows: rank · headline · €-impact · source-signal pill · CTA button.
- **Pipeline P50 line:** Light rose, 1.5px stroke, dashed `[6 4]`. Renders only if `point.pipelineP50` is defined. Tooltip shows both: `Model P50 €X · Pipeline P50 €Y · Δ Z%`.
- **Traffic-light chip:** Tiny pill in `PageHead`, top-right next to "Updated". `bg-emerald-50 text-emerald-700` / `amber-50 amber-700` / `rose-50 rose-700` by freshness band.
- **Scenario presets:** Horizontal row of 5 chip-style cards above the existing `ScenarioLibrary` list. Each card: name · 1-line description · "Apply" button.
- **Diagnostics toggle:** Inside Drivers accordion, after the always-visible cards, a small disclosure: `[+ Show diagnostics (4)]` → expands the 4 deep-dive cards.

## Rollout

- All v2.1 changes live behind the existing `?layout=v2` default. The legacy `?layout=v1` still renders the original ungrouped order — no v1 changes in this PR.
- New BFF fields are all **optional**. Old clients (and any tests still mocking the old payload) keep working — components render only when their field is present.
- If `planTracking`/`pocketWaterfall`/`bias`/`nextMoves`/`pipelineP50` are absent (mocks/dev), the page renders the v2.0 layout without those sections. Graceful degradation.
- Phase-commits + push per `MEMORY.md` `feedback_phase_commits`.

## Testing

- **Backend pytest:** unit tests for each new composer (`plan_tracking`, `pocket_waterfall`, `bias`, `next_moves`, `pipeline_p50`). Integration test that the screens endpoint composes all five together cleanly.
- **Frontend vitest:** unit tests for `PlanTrackingStrip` (cumulative math), `PocketWaterfallCard` (waterfall arithmetic + per-cluster band rendering), `BiasCard` (sign/direction logic), `NextCycleMovesStrip` (rank ordering + intent dispatch), `FilterScopeBadge` (visibility rules), `HeroForecast` (pipeline P50 line renders when prop present), `ScenarioLibrary` (preset rendering + apply click).
- **Playwright:** new `forecasting-v2-1.spec.ts` — assert the new components render in the v2 layout; click a NextCycleMove → assert ActionDrawerHost opens. Visual regression baseline refresh.

## Open decisions (resolved inline)

- **Pipeline P50 source data** — resolved: use the open-quote table that already feeds `QuoteToRevenueBridge`. Adapter in `pipeline_p50.py` aggregates by close-month × win_prob. If `win_prob` is missing for a quote, use a tier-level default (A=0.65, B=0.45, C=0.25, D=0.10) and tag the quote in the methodology footnote.
- **Plan data source** — resolved: there is no plan table in the BFF today. Use `data/plan.json` (committed) as a static plan for current FY, sourced from finance — same pattern as `forecast-overrides.json`. A real warehouse migration is a follow-up. Each plan row: `month`, `mode`, `cluster`, `value`, `reset_log: [{at, by, reason, prior_value}]`.
- **Pocket waterfall data source** — resolved: invoice + quote ledgers already in the BFF (used by `real_pareto.py` and `quote_to_revenue.py`). New composer joins them by article+customer+month.
- **NextCycleMove ranking** — resolved: rank by `forecast_impact_eur` desc. Top 5.

## References

- Fildes & Goodwin (2007), "Good and Bad Judgment in Forecasting"
- Hyndman & Athanasopoulos, fpp3
- McKinsey, "Setting value, not price" (pocket-margin waterfall framing)
- Vendavo Margin Bridge Analyzer
- Pricefx forecasting / scenario modules
- Vistaar's descriptive → predictive → prescriptive analytics framework
- Manuel feedback themes 1–4 (Pryzm internal): target tracking, filter consistency, freshness, language/audit
