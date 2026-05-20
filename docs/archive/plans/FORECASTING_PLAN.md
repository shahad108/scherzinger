# Forecasting Page — Redesign Plan

**Goal:** Build a credible forecasting page from 3 years of real data. Be transparent about what's a data-grounded projection vs what needs Phase 4 ML models. Don't fake precision.

**Principle:** A trend line from real data is more credible than a confidence interval from a 55%-accurate model. Show what you can defend. Placeholder the rest. When Phase 4 models are ready, swap them in — the page structure stays the same.

**Phase status:** Phase 3 complete. ML forecasting, Monte Carlo simulation, and scenario modeling are Phase 4 deliverables. This plan marks each element clearly.

---

## Page Structure

### Global header
- Year range selector (historical window): Last 2Y · Last 3Y · All
- "Data through: [latest invoice date]" — right-aligned freshness indicator. Builds trust.

---

### Row 1 — KPI Cards (4, all reworked)

| # | Current (remove) | Replace with | Value | Notes |
|---|---|---|---|---|
| 1 | Current Margin: 59.7% | **Trailing 4Q DB2 Margin** | 62.4% | Weighted average of most recent 4 quarters. Add: vs 4Q prior (63.6% → 62.4%, ▼1.2pp). Grounded, not vague. |
| 2 | 3-Month Forecast: 60.5% | **Revenue Run Rate** | €5.78M annualized | Trailing 4Q × 4. Add: vs prior year. More credible than a margin forecast from a 55% model. |
| 3 | Pipeline Value: €957.8K | **Open Pipeline (Expected)** | €957.8K open · **€355K expected** | Pipeline × 37.1% win rate = expected revenue. Add closing horizon (30/60/90d). |
| 4 | Best Model Accuracy: 55% | **Margin Trend** | ▼0.4pp/yr | Simple slope over 12 quarters. "At current trajectory, margin reaches 60% by [date]." |

---

### Row 2 — Quote-to-Revenue Bridge (NEW, compact card)

A single forward-looking calculation from current data — no ML needed:

```
Open Quotes: €957.8K  ×  Win Rate: 37.1%  ×  Avg Margin: 62.4%
= Expected Gross Profit from Pipeline: ~€222K
```

Shows: what the current pipeline is worth in margin terms. Updates live as quotes move. This is the one number that connects pipeline activity to margin outcomes.

---

### Row 3 — Info Banner (reworked)

Replace the model accuracy banner with plain-language trajectory statement:

> "DB2 margin has declined ~0.4pp/year over 3 years. At this rate, margin reaches the 60% floor by mid-2025. Primary driver: rising full manufacturing cost (36.5% → 37.6% of revenue). Material costs are stabilizing, but fixed overhead allocation is growing — investigate capacity utilization."

No ML jargon. Actionable. Anyone can read it.

---

### Row 4 — Margin Trajectory (REWORKED, full width)

**Type:** Line chart — historical actual + smoothed trend projection.

- **Left 75%:** Historical quarterly DB2 margin, 12 data points (2022-Q1 through 2024-Q4).
- **Right 25%:** 4-quarter weighted moving average projected forward, with shaded uncertainty band that widens over time.

**Important:** Use **weighted moving average**, NOT linear regression. The quarterly data is volatile (swings from 60.0% to 68.2%) — a straight regression line will be misleading with low R². WMA smooths noise and produces a defensible projection.

**Labels:**
- Horizontal dashed line at **60%** — operational/psychological floor.
- Annotation: "At current smoothed trend, margin crosses 60% by [date]."
- Chart title: **"Margin Trend Projection"** — NOT "Margin Forecast" or "AI Forecast."
- Small badge: *"Based on 3-year quarterly data · trend projection, not ML model"*

When Phase 4 models exceed 70% accuracy, swap WMA for ML forecast with proper confidence intervals. The chart structure stays identical.

---

### Row 5 — Two charts side by side

| Position | Chart | Details |
|---|---|---|
| Left (1/2) | **Commodity Group Margin Trajectories** | Multi-line chart, one line per group (BKAES, BKAGG, BKAIZ), quarterly. Each line gets a trend arrow. BKAES ~68%→~66% (slight decline), BKAGG volatile ~53–55%, BKAIZ improving slightly. No ML — just plotting the data with trend direction. |
| Right (1/2) | **Seasonal Pattern** (kept, enhanced) | Monthly indices from 3 years of data — reliable. Enhancement: **overlay actual recent months** so users see "are we tracking above or below seasonal expectation this month?" Deviation from seasonal norm = early signal. |

---

### Row 6 — Cost Trajectory (NEW, full width)

**Type:** Multi-line chart — 3 cost layers as % of revenue, quarterly.

| Line | 2022-Q1 | 2024-Q4 | Direction |
|---|---|---|---|
| Material % | 16.9% | 14.3% | ▼ Improving |
| Direct Manufacturing % | 14.5% | 11.3% | ▼ Volatile, bounced in 2024 |
| Full Manufacturing Cost % | 36.5% | 37.6% | ▲ Worsening |

**Key insight:** Material and direct costs are improving, but full cost is *rising*. That means fixed overhead allocation is growing — a capacity utilization or batch-size problem.

Add: dotted trend line extending 4 quarters forward per layer.

Annotation: *"Material costs declining, but full manufacturing cost trend rising — suggests fixed overhead growing. Investigate capacity utilization."*

**This is the most actionable chart on the page.** It tells operations what to expect and where to focus without any ML.

---

### Row 7 — Revenue Projection (NEW, full width)

**Type:** Bar chart — 12 historical quarterly revenue bars + 4 projected quarters with uncertainty band.

**Projection method (transparent, no ML):**
- Base: trailing 4Q average
- Seasonal adjustment: apply 3-year monthly indices
- Growth adjustment: +7.9% YoY from recent trend
- Band: ±15% based on historical quarterly variance

**Methodology panel** *(collapsible — "How is this calculated? ▼")*:

| Quarter | Base | Seasonal | Growth | Projection | Range |
|---|---|---|---|---|---|
| 2025-Q1 | €1.45M | ×1.02 | ×1.08 | €1.60M | €1.36–1.84M |
| 2025-Q2 | €1.45M | ×0.98 | ×1.08 | €1.53M | €1.30–1.76M |
| ... | | | | | |

Collapsible by default — chart shows for execs, math available on demand. Builds credibility when someone asks "where do these numbers come from?"

---

### Row 8 — Phase 4: Advanced Analytics (PLACEHOLDER, single section)

One section with 3 teaser cards, clearly marked as coming in future phases:

```
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  🔮 SCENARIO          │  │  📊 MONTE CARLO       │  │  👤 CUSTOMER-LEVEL   │
│  SIMULATOR            │  │  ENGINE               │  │  PREDICTION          │
│                       │  │                       │  │                       │
│  "What if material    │  │  P5/P25/P50/P75/P95   │  │  Per-customer margin  │
│  costs rise 10%?"     │  │  margin distribution   │  │  forecast with        │
│  "What if we reprice  │  │  from validated ML     │  │  churn probability    │
│  BKAGG by +5%?"       │  │  models.               │  │  scoring.             │
│                       │  │                       │  │                       │
│  ⚠️ Available in       │  │  ⚠️ Available when      │  │  ⚠️ Available in       │
│  future phases        │  │  model accuracy        │  │  future phases        │
│                       │  │  exceeds 70%           │  │                       │
│  [Notify me]          │  │  [View current model   │  │  [Notify me]          │
│                       │  │  performance →]        │  │                       │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

**Note:** Monte Carlo card links to ML Analytics page where model accuracy lives. Ties the pages together without putting the 55% number on the Forecasting page.

**Design rule:** No element on this page should say "AI-powered," "ML-driven," or "intelligent forecast" until models exceed 70% directional accuracy.

---

### Page footer — Assumptions

One-line-per-assumption strip:

- Growth rate: based on trailing 12-month YoY (7.9%)
- Seasonality: 3-year monthly index average (2022–2024)
- Cost trends: quarterly slopes from 12 data points
- Win rate: trailing 12-month average (37.1%)
- Data through: [latest invoice date]

---

## What Moved to Other Pages

| Element | Was on | Moved to | Why |
|---|---|---|---|
| Pipeline by Stage | Forecasting | Pricing & Quotes | Operational pipeline data, not forecasting |
| Model Accuracy Comparison | Forecasting | ML Analytics | That page exists for exactly this |
| Model Accuracy KPI (55%) | Forecasting | ML Analytics | Don't advertise coin-flip accuracy on the trust-building page |

---

## Final Count

4 KPIs · 1 pipeline bridge card · 1 info banner · 1 margin trajectory · 2 side-by-side charts · 1 cost trajectory · 1 revenue projection · 1 Phase 4 placeholder section · 1 assumptions footer.

---

## Phase 4 Activation Checklist

When Phase 4 models are ready, the following swaps happen (page structure unchanged):

| Current element | Phase 4 replacement | Trigger |
|---|---|---|
| Row 4: WMA trend projection | ML margin forecast with confidence intervals | Model accuracy >70% |
| Row 7: Seasonal + growth revenue bars | ML revenue forecast with scenario inputs | Model validated |
| Row 8 placeholder: Scenario Simulator | Interactive what-if calculator | Engine built |
| Row 8 placeholder: Monte Carlo | Live P5–P95 from validated model | Model accuracy >70% |
| Row 8 placeholder: Customer Prediction | Per-customer margin + churn scoring | Customer model trained |
| Row 3 info banner | AI-generated narrative from model outputs | Model accuracy >70% |

**Threshold rule:** No chart on this page gets labeled "AI forecast" or "ML-powered" until the underlying model exceeds **70% directional accuracy**. Below that, use "trend projection" and "data-based estimate."

---

## Open Decisions Before Build

1. **Weighted moving average window** — 4Q or 6Q smoothing for Row 4?
2. **Pipeline closing horizon** — 30d / 60d / 90d buckets for the expected-value calculation?
3. **Revenue projection growth rate** — use trailing 12mo YoY (7.9%) or trailing 8Q CAGR?
4. **Seasonal overlay (Row 5R)** — show deviation as % or pp from expected?
5. **Phase 4 placeholder design** — cards with [Notify me] or simpler "Coming soon" badges?
6. **Cost trajectory annotation** — static text or auto-generated from trend direction?
