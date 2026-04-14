# Demo-Only Phase 3/4/5 Preview

**Date:** 2026-04-14
**Status:** Approved design, pre-implementation
**Scope:** `/demo/` build only. The real Scherzinger `/` deploy and the Avanna INR `/` build must render byte-identical to the current production bundle.

## Goal

The live Scherzinger product currently ships Phases 1, 2, and 3F (Frontend Integration). A client demo is scheduled for 2026-04-15. Before that demo, the anonymised `/demo/` build at `https://demo.pryzm-solutions.com/demo/` must visually present the full product vision — including all 23 not-yet-built features from Phases 3, 4, and 5 in the project tracker — using mock data. The goal is to show breadth and depth of the platform's roadmap as if every feature were already live.

## Non-Goals

- No changes to the real Scherzinger `/` build served from the Scherzinger EC2 instance.
- No changes to the Avanna INR `/` build on `3.76.141.43`.
- No backend work. No Supabase schema changes. No new API calls.
- No new login flows. Demo auth (fake session seeded in `main.jsx`) stays as-is.
- No branding changes beyond what already exists — the demo is still de-branded to "Demo".
- No attempt at real data accuracy — mock data is deterministic and plausible, not correct.

## Success Criteria

1. Every one of the 23 Phase 3/4/5 features from `Scherzinger_Project_Tracker.xlsx` is visibly represented somewhere in the `/demo/` UI.
2. The real Scherzinger `dist/` bundle MD5s are byte-identical before and after this change.
3. Scenario Lab sliders produce a live, visible margin response within one animation frame.
4. Every existing page still renders and navigates identically in the real build.
5. SKU rows on the Products & SKUs page open a unified slide-over with per-SKU floor price, break-even, shock sensitivity, anomaly history, and cross-sell recommendations.
6. All new copy is translated EN + DE.
7. Deploy to Avanna server happens only after the user explicitly approves the local build output.

## Isolation Contract

Every new surface is gated on the existing build-time constant `IS_DEMO` from `src/utils/brand.js`, which is defined as `import.meta.env.BASE_URL === '/demo/'`. Because this is a literal at build time, Vite tree-shakes all demo-only code out of the real build. The contract:

- New routes only registered inside `{IS_DEMO && ...}` in `App.jsx`.
- New sidebar entries only registered inside `{IS_DEMO && ...}` in `Sidebar.jsx`.
- New page sections only rendered inside `{IS_DEMO && ...}` in their parent page components.
- New data file (`mock_phase45.json`) and its generator module (`utils/mockPhase45.js`) imported only inside `if (IS_DEMO)` blocks or from demo-only components — never from the real build's import graph.
- Hard stop: before any deploy, the real `dist/index-*.js` MD5 must match the current production hash `06934b36f1c4747629e2733d4483568d`. If it changes, the build is rejected.

## Feature Distribution (23/23)

| # | Feature (from tracker) | Home | Component |
|---|---|---|---|
| 3.1 | Price Optimization Engine | Pricing page | `PriceOptimizer.jsx` |
| 3.2 | Win Probability Model | Pricing page | `WinProbabilityScorer.jsx` |
| 3.3 | Price Elasticity Analysis | Pricing page | `ElasticityCurve.jsx` |
| 3.4 | Floor Price Calculator | Products & SKUs page | `FloorPriceTable.jsx` |
| 3.5 | Customer Willingness-to-Pay | Customers page | `WTPBands.jsx` |
| 3.6 | Competitive Positioning | Pricing page | `CompetitiveMap.jsx` |
| 3.7 | Lost Opportunity Analysis | Pricing page | `LostOpportunitySunburst.jsx` |
| 4.1 | Material Cost Shock | Scenario Lab (new page) | `ShockSlider.jsx` instance |
| 4.2 | Labor Cost Shock | Scenario Lab | `ShockSlider.jsx` instance |
| 4.3 | Outsourcing Shock | Scenario Lab | `ShockSlider.jsx` instance |
| 4.4 | Volume Scenarios | Scenario Lab | `ShockSlider.jsx` instance |
| 4.5 | Combined Stress Test | Scenario Lab | composed from the four sliders |
| 4.6 | Monte Carlo Simulation | Scenario Lab | `MonteCarloHistogram.jsx` |
| 4.7 | Break-even Analysis | Products & SKUs page | `BreakEvenChart.jsx` |
| 4.8 | Regime-Based Scenarios | Scenario Lab | `RegimeToggle.jsx` |
| 5.1 | Quote-to-Cash Predictor | Forecasting page (new tab) | `QuoteToCashTab.jsx` |
| 5.2 | Customer Lifetime Value | Customers page | `CLVRanking.jsx` |
| 5.3 | Product Profitability Optimizer | Products & SKUs page | `ProfitabilityQuadrant.jsx` |
| 5.4 | Real-time Margin Alerts | Dashboard | `LiveAlertStrip.jsx` |
| 5.5 | Customer Churn Prediction | ML Analytics page | `ChurnSurvivalCurve.jsx` |
| 5.6 | Cross-sell / Upsell | Customers page + SKU slide-over | `CrossSellPanel.jsx` |
| 5.7 | Natural Language Insights | Revenue & Margins header + AI Insights prompts | `NLHeaderCard.jsx` + prompt additions |
| 5.8 | Anomaly Detection | Dashboard + SKU slide-over | `AnomalyFeedCard.jsx` |

**Total: 23/23.** The only new sidebar entry is **Scenario Lab** (`/scenario-lab`, demo-only). Everything else attaches to existing pages.

## SKU Drill-Down (`SKUDeepDiveSlideOver.jsx`)

The Products & SKUs page's existing table gets a row-click handler (demo-only) that opens a unified slide-over using the existing `InsightSlideOver` visual pattern. The slide-over has five tabs, each sourced from `mock_phase45.json`:

1. **Pricing** — floor price, optimizer suggestion, win probability score
2. **Break-even** — break-even volume curve, margin-at-volume chart
3. **Shock sensitivity** — material/labor/outsourcing/volume sensitivity bars for this SKU
4. **Anomalies** — last 12 months of anomaly flags with severity and short description
5. **Cross-sell** — top 5 customers likely to buy this SKU next, with confidence bars

This delivers the user's "SKU-wise also" requirement: every Phase 3/4/5 signal that can be SKU-scoped is reachable from one click on any SKU row.

## Data Layer

Single new file: `src/data/mock_phase45.json`. Structure:

```
{
  "liveAlerts":          [ { id, severity, message, delta, ts } ],
  "anomalies":           [ { id, sku, metric, zscore, ts, severity, note } ],
  "nlHeader":            { en, de },
  "floorPrices":         [ { sku, name, cg, hkvoll, floor, current, gap } ],
  "breakEven":           [ { sku, fixed, variable, breakEvenUnits, curve } ],
  "profitability":       [ { sku, revenue, margin, quadrant } ],
  "wtpBands":            [ { customer, lowWTP, midWTP, highWTP, current } ],
  "clvRanking":          [ { customer, clv, tier, retentionProb, monthsActive } ],
  "crossSell":           [ { sku, customer, confidence, reason } ],
  "quoteToCash":         { median, p25, p75, mean, driverBars, timeline },
  "priceOptimizer":      [ { sku, suggested, min, max, expectedMargin } ],
  "winProbability":      [ { quoteId, customer, features, probability } ],
  "elasticity":          { xs, ys, segments },
  "competitive":         [ { sku, ourPrice, marketLow, marketHigh, position } ],
  "lostOpportunity":     { total, byReason: [ { reason, amount, count } ] },
  "churn":               { survivalCurve, drivers, atRiskCustomers },
  "scenarioLab":         { baseline, shockFormula, monteCarloRuns, regimeSpike, regimePlateau }
}
```

All values are deterministic — seeded where possible from the real Scherzinger metrics in the tracker (€24.6M revenue, 64.8% DB2, 9 commodity groups, 1,798 products, 787 customers) so charts feel plausible to a client who has seen the rest of the app.

Companion file: `src/utils/mockPhase45.js` — thin wrapper that exports typed getters (`getLiveAlerts(t)`, `getScenarioBaseline()`, etc.) with a hard `IS_DEMO` guard at the top. In non-demo builds, each getter returns `null` and the caller's `IS_DEMO && ...` JSX branch never mounts, so nothing ever renders.

## Scenario Lab Interactivity

The only fully interactive surface. Four sliders (material %, labor %, outsourcing %, volume %), each in range [-30, +30]. A closed-form formula computes the resulting margin from the mock baseline:

```
newMargin = baseMargin
          - baseMatShare  * (matShock  / 100)
          - baseLaborShare* (laborShock/ 100)
          - baseOutShare  * (outShock  / 100)
          + volumeLeverage * (volShock / 100)
```

Sliders update `useState` which drives a single Recharts `<LineChart>` showing baseline vs shocked margin curve over 12 months. A "Reset" button zeroes all sliders. A regime toggle (spike 2022–24 vs plateau 2024–25) switches which baseline curve is used. Monte Carlo histogram is pre-computed (static).

Combined stress test = all four sliders engaged at once; the shared chart is already combined, so this is free.

## Labeling

Per user's explicit direction: **no "preview" badges**. New features blend in with existing Phase 1–3F sections. This is safe because the decision is scoped to the `/demo/` build only, which is already marked as anonymised demo data throughout.

## File Footprint

**New files (21 components + 1 page + 1 data file + 1 util):**
```
src/pages/ScenarioLab.jsx
src/components/phase45/FloorPriceTable.jsx
src/components/phase45/BreakEvenChart.jsx
src/components/phase45/ProfitabilityQuadrant.jsx
src/components/phase45/SKUDeepDiveSlideOver.jsx
src/components/phase45/WTPBands.jsx
src/components/phase45/CLVRanking.jsx
src/components/phase45/CrossSellPanel.jsx
src/components/phase45/QuoteToCashTab.jsx
src/components/phase45/PriceOptimizer.jsx
src/components/phase45/WinProbabilityScorer.jsx
src/components/phase45/ElasticityCurve.jsx
src/components/phase45/CompetitiveMap.jsx
src/components/phase45/LostOpportunitySunburst.jsx
src/components/phase45/ChurnSurvivalCurve.jsx
src/components/phase45/LiveAlertStrip.jsx
src/components/phase45/AnomalyFeedCard.jsx
src/components/phase45/NLHeaderCard.jsx
src/components/phase45/ShockSlider.jsx
src/components/phase45/MonteCarloHistogram.jsx
src/components/phase45/RegimeToggle.jsx
src/data/mock_phase45.json
src/utils/mockPhase45.js
```

**Modified files (existing pages + sidebar + routes + translations):**
```
src/App.jsx                         — register /scenario-lab route inside {IS_DEMO && ...}
src/components/Sidebar.jsx          — add Scenario Lab nav item inside {IS_DEMO && ...}
src/pages/DashboardOverviewV2.jsx   — mount LiveAlertStrip + AnomalyFeedCard
src/pages/RevenueMargins.jsx        — mount NLHeaderCard
src/pages/ProductsSKUs.jsx          — mount FloorPriceTable, BreakEvenChart, ProfitabilityQuadrant, SKUDeepDiveSlideOver
src/pages/Customers.jsx             — mount WTPBands, CLVRanking, CrossSellPanel
src/pages/Forecasting.jsx           — add QuoteToCashTab tab
src/pages/PricingFX.jsx             — mount PriceOptimizer, WinProbabilityScorer, ElasticityCurve, CompetitiveMap, LostOpportunitySunburst
src/pages/MLAnalytics.jsx           — mount ChurnSurvivalCurve
src/pages/AIInsights.jsx            — extend prompt template list (demo-only)
src/i18n/translations.js            — add phase45.* EN + DE keys
```

Every mount point is wrapped in `{IS_DEMO && <Component />}` so the real build's JSX tree is unchanged at runtime. Because `IS_DEMO` is a build-time literal in the demo bundle, Vite inlines it to `true` there and leaves the component mounted.

## Build, Verification, and Deploy Sequence

1. Implement all new files and mount points.
2. Run `npm run build` (real build). Compute MD5 of `dist/index-*.js` and `dist/index.html`.
3. **Gate 1:** real-build MD5 must equal the current production hash (`06934b36f1c4747629e2733d4483568d` for the bundle, `403800309985c88dac7dd947f9ea0604` for the HTML entry — already captured in the previous deploy's verification log). If different, reject and debug.
4. Run `npm run build -- --base=/demo/` → `dist-demo/` new output.
5. Local smoke test: serve `dist-demo/` via `vite preview --base /demo/`, walk every page, confirm Scenario Lab sliders react, confirm SKU slide-over opens on Products table row click, confirm all 23 features render in EN and DE.
6. **Gate 2:** show the user the local preview. No deploy without explicit "push it" from the user.
7. Backup existing `~/pryzm/frontend/dist-demo/` on `3.76.141.43` to `dist-demo.bak.<timestamp>`.
8. Rsync new `dist-demo/` to `3.76.141.43` using `pryzm_avana_demo.pem`.
9. Smoke test the live URL `https://demo.pryzm-solutions.com/demo/`.
10. Final verification: the real Scherzinger site `https://<scherzinger-url>/` and the Avanna INR site still render the old bundles — MD5 on those servers unchanged.
11. Commit code to git only after the user confirms the live demo works.

## Risks and Mitigations

- **Real-build leak.** Mitigated by: (a) `IS_DEMO` build-time literal → tree-shaken, (b) MD5 gate before deploy, (c) explicit user approval before deploy.
- **Time pressure (demo tomorrow).** Mitigated by: implementation order prioritizes the highest-impact surfaces (Scenario Lab first, then SKU slide-over, then Pricing page, then remaining pages). If time runs out, remaining sections get a thinner treatment rather than being dropped — every feature still appears in SOME form.
- **Client asks "is this live?"** Out of scope for this doc but noted — user has explicitly accepted this risk because it's the demo build.
- **Mock data feels wrong.** Mitigated by seeding from real Scherzinger numbers in the tracker where possible, so aggregates are plausible.
- **Bundle size growth in demo build.** Acceptable — demo build is already ~1.3 MB gzipped and has no performance SLA.

## Open Questions

None remaining — all four clarifying questions answered in the brainstorming session.

## Next Step

Transition to the `writing-plans` skill to produce an implementation plan ordered by priority (Scenario Lab → SKU slide-over → Pricing → remaining pages → mock data polish → build + deploy).
