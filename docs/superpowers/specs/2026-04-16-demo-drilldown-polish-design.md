---
name: demo-drilldown-polish
description: Turn the Scherzinger demo from clickable prototype into finished-feeling product by wiring 12 targeted drill-down interactions and cosmetically cleaning the rest.
status: approved
created: 2026-04-16T18:16:28Z
updated: 2026-04-16T18:16:28Z
---

# Demo Drill-Down Polish — Design

## Goal

The demo at `/demo/` (Avanna EC2, `dist-demo/` only) feels like a prototype because charts and cards have `cursor:pointer` but click handlers either don't exist or call `selectItem` with no downstream effect. Make the demo feel like a finished product by wiring the 12 interactions a presenter will actually use during the sales narrative, and cosmetically neutralizing the ~40 other half-wired affordances so nothing looks broken.

**Non-goals:** new backends, scripted AI answers, changes to AI chat internals, changes to production `dist/`.

## Demo narrative (drives scope)

- **Opening act:** Dashboard
- **Act 2 drill paths (branch by audience):** KPI/alert → SKU deep-dive · pie slice → filtered Products · high-risk link → filtered Customers · AI Highlight → AI Insights with prompt pre-loaded
- **Closing act:** AI chat (real LLM, untouched) with optional branches through ScenarioLab, SKU deep-dive, or Forecasting depending on audience

## The 12 interactions to wire

### Dashboard (5)
1. KPI card click → SKU deep-dive slide-over on the driver SKU
2. Alert card click → SKU or Customer deep-dive (Margin Erosion → SKU, High Risk → Customer)
3. Top-commodities pie slice → Products page with `?commodity=X`
4. AI Highlight card → AI Insights with `?prompt=<canonical prompt>` (fires real LLM)
5. "View all high-risk customers" → Customers with `?risk=high`

(Anomaly feed rows are already wired — verify, keep.)

### Landing-page filter pickup (3)
6. Products reads `?commodity=` and `?risk=`, shows active pill state, pre-filters table
7. Customers reads `?risk=`, highlights segment pill, pre-filters table
8. AI Insights reads `?prompt=`, fills input, auto-submits once via existing submit handler, strips param

### Closing act (4)
9. ScenarioLab SKU-impact row click → SKU deep-dive with current shock values applied
10. Verify all 5 SKU deep-dive tabs (Pricing, Break-Even, Profitability, Anomalies, Cross-Sell) have non-empty content; fill gaps from existing JSON
11. Forecasting quote-to-cash row click → quote detail slide-over (new, lightweight)
12. Dashboard "Anomaly row → SKU deep-dive on anomalies tab" — verify existing wiring still works after Batch 1 refactor

## Reusable primitives (Batch 1)

### `<DrillPopover>` (new)
Anchored popover on chart-point / pie-slice / histogram-bar click. Not a modal.

- **Props:** `anchor` (ref or DOM element), `title`, `stats: Array<{label, value, delta?}>` (max 4), `sparkline?`, `cta: {label, onClick}`, `onClose`
- **Behavior:** opens on click, closes on outside click and Escape, positioned absolute to anchor, single primary CTA ("Open deep-dive" / "Filter by this" / "See all")
- **Data source:** derived from the same array the host chart already renders from — no new fetches

### `<DrillSlideOverProvider>` + `<EntityDrillSlideOver>` (extend existing)
Single slide-over instance at app root. Existing `SKUDeepDiveSlideOver` is refactored (not rewritten) into a single component that switches tab sets on `entityType`:

- `entityType="sku"` → Pricing, Break-Even, Profitability, Anomalies, Cross-Sell (current 5 tabs)
- `entityType="customer"` → Profile, WTP, CLV, Risk, Cross-Sell
- `entityType="commodity"` → Overview, Price History, Affected SKUs, Shock Impact

Provider exposes `openDrill({entityType, id, initialTab?})` via React context. Any component calls it; no prop drilling.

### `useUrlFilters()` (new hook)
Reads `?commodity`, `?risk`, `?prompt` on mount; exposes typed state; updates URL on filter change. Used only by Products, Customers, AI Insights.

### `<DemoClickable>` (utility wrapper)
`cursor-pointer` + hover ring + `role="button"` + keyboard (Enter/Space) handler in one wrapper. Replaces inconsistent ad-hoc clickable styling.

### Fixture: `public/demo-data/commodities.json` (new)
~8 commodities × 4 tabs of fields (overview metrics, price history points, affected-SKU IDs, shock-impact values). ~1 hour of fixture authoring.

## Cosmetic sweep (Batch 4, applied to everything NOT in the 12)

For each audit item not wired:

- **If it has `cursor:pointer` but no meaningful onClick** → remove `cursor:pointer`, remove hover ring
- **If a chart has data points with no tooltip** → add a real tooltip pulling from the same data array (PricingFX Seasonality, Revenue monthly trend, Forecasting margin trend, Win Rate by Commodity bars, etc.)
- **If a button has no handler** → hide behind a `FEATURE_WIRED` flag currently set to `false` (ML Deploy/Undeploy, PriceOptimizer Apply/Approve, Floor-price override UI, Threshold Tuning sliders)
- **If a filter pill has no active state** → normalize active state styling across Products/Customers/PricingFX

## What stays untouched

- AI chat internals: stream, conversation state, history persistence, feed panel, quick-prompt list, OpenRouter/Claude call path
- No scripted-answer layer, no citation chips — AI response path is real LLM end-to-end
- `frontend/dist/` (production build) — demo deploys from `dist-demo/` only per memory
- Pages not in the demo flow (Admin, Login, CostIntelligence unless in final audience branch)

## Build order

Each batch is independently mergeable; demo improves after each.

| Batch | Scope | Est |
|-------|-------|-----|
| 1 | Primitives: DrillPopover, DrillSlideOverProvider, EntityDrillSlideOver extension, useUrlFilters, DemoClickable, commodities.json | 1d |
| 2 | Dashboard interactions 1–5 | 0.5d |
| 3 | Landing-page filter pickup 6–8 | 0.5d |
| 4 | Closing act 9–11 + verify 12 + cosmetic sweep | 1d |

**Total: ~3 days.**

### Ship gates
- Batch 1: popover and provider render in isolation with mock data; existing SKU slide-over still works from Products row-click
- Batch 2: every clickable element on Dashboard navigates to real destination with context
- Batch 3: cross-page context carries via URL; presenter never re-filters after drilling
- Batch 4: nothing in the demo looks clickable unless it actually does something

## Risks

- **Refactoring `SKUDeepDiveSlideOver` into `EntityDrillSlideOver`** could regress existing SKU flows. Mitigation: keep `entityType="sku"` code path identical to current implementation; only add new switch arms for customer/commodity.
- **`?prompt=` auto-submit** could double-fire on HMR or back-nav. Mitigation: ref guard + strip param after first submit.
- **Removing `cursor:pointer` from static charts** changes visual affordance. Mitigation: replace with a subtle hover tooltip so the chart still feels alive without promising a click action.

## Open questions

None blocking. Author scripted/canonical prompt strings for the 5 Dashboard AI Highlight cards during Batch 2 so they match the quick-prompt buttons exactly (auto-submit works deterministically).
