# Pricing & Quotes Page — Redesign Plan

**Goal:** The most content-rich page in the product. Turn it from a collection of good individual charts into a structured pricing intelligence surface with clear hierarchy. Every element should answer one of three questions: "Are we pricing right?", "Where are we losing?", or "What should we change?"

**Principle:** The Pricing Command Center is the anchor. Everything else feeds into it or explains why its recommendations exist.

**Structural decision:** The page is too large for a single scroll. Organize into **KPIs + Command Center (always visible)** above **3 tabbed sections** (Win Rate Intelligence / Loss Analysis / Price Governance). This keeps each view focused.

---

## Page Structure

### Global header
- Commodity group filter: All · BKAES · BKAGG · BKAIZ · SOPU
- Year range: 2022 · 2023 · 2024 · 2025 · All
- Toggle: "Exclude inquiry-only (AN)" — recalculates all loss metrics when active. AN = 138 quotes / €1.17M that were never real opportunities.

---

## Always-Visible Section (above tabs)

### Row 1 — KPI Cards (4, reworked)

| # | Metric | Value | Notes |
|---|---|---|---|
| 1 | Win Rate | 37.1% | +2.4pp YoY. This replaces "Avg Margin Gap" as lead KPI — win rate is the headline metric for a pricing page. |
| 2 | Revenue Lost (Pricing-Related) | €971K | PA (competitor cheaper: €794K) + PR (price too high: €177K) only. Excludes process/market losses. More actionable than total €9.59M which includes non-pricing reasons. |
| 3 | Open Pipeline | €957.8K → **€355K expected** | Pipeline × 37.1% win rate. Add: closing horizon (30/60/90d). Moved here from Forecasting page. |
| 4 | Price Sensitivity | 1.8% (p=0.006) | Keep — statistically significant, credible. |

**Secondary KPI strip** (smaller, below main cards):

| Metric | Value |
|---|---|
| Avg Margin Gap (Quoted vs Actual) | 1.9% |
| Linked Records | 1,313 |
| Avg Conversion Time | 67 days (range 26–80) |
| Total Rule Violations | 1,384 |

---

### Row 2 — Pricing Command Center (KEPT, detail panel overhauled)

The Command Center table stays as-is — articles sorted by risk score with revenue, margin, recovery potential, Reactive/Proactive split.

**Pipeline compact card** (right-aligned above or beside Command Center):
62 new → 86 quoted → 1,684 won → €7.42M. Stage-level conversion rates. Moved from Forecasting page.

#### Expanded Row Detail Panel — MAJOR OVERHAUL

**Problem:** Current panel shows raw numbers without context or methodology. "Recommended: €954" with no explanation will get pushback.

**Solution:** Tabbed detail panel — 4 tabs per expanded row.

---

**Tab A: Summary (default)**

| Field | Content |
|---|---|
| Article / Commodity Group | 201827 / BKAES |
| Product Type | Elektro-Zahnradpumpe (ADD — from description) |
| Customer Count | 2 customers (ADD — critical context for repricing strategy) |
| Current Price | €791 |
| Recommended Price | €954 (+€163/unit, +20.6%) |
| Annual Recovery | €18.9K (163 × 116 units at 2024 volume) |
| Methodology | Show calculation: "Target margin (47.6%) at current cost (€488) = €488 / (1−0.476) = €931" |
| Status Label | 2×2 matrix: Revenue trend × Margin trend → "Cash Trap" / "Star" / "Sunset Candidate" / "Optimize" (replaces misleading BCG quadrant) |
| Suggested Approach | Template: "Phase 1: +10% (€87/unit). Monitor win rate for 2 quarters. Phase 2: +10% if retained." (framed as template, not firm recommendation) |
| Approval Level | VP |

---

**Tab B: Cost Deep-Dive**

Price vs Cost Trend (mini sparkline):

| Year | Avg Price | Avg Cost | Margin |
|---|---|---|---|
| 2022 | €675 | €354 | 47.6% |
| 2023 | €741 (+10%) | €433 (+22%) | 41.6% |
| 2024 | €801 (+8%) | €488 (+13%) | 39.1% |

Key metrics:
- **Cost Pass-Through Rate: 50%** — "Costs rose €134/unit, price only rose €126. €8/unit absorbed = €928 total leakage across 116 units."
- Cost Breakdown: Material 29.7% (€224) · Direct Mfg 13.9% (€105) · Outsourced: minimal
- Annotation: "Material costs are 30% of revenue and climbing. Renegotiate supplier or increase price."

---

**Tab C: Quote & Competition**

| Field | Value |
|---|---|
| Quote Win Rate | 80% (4/5) |
| Lost Quotes | 1 (€17K) |
| Won Quote Avg Margin | 39.8% |
| Competitor Pressure | Low (inferred from 80% win rate) |
| Repeat Quote Pattern | No persistent losses |

Interpretation: "High win rate confirms demand. Room to increase price — customer absorbs current pricing well."

---

**Tab D: Customer Context**

| Customer | Revenue (this article) | Total Relationship | % of Spend | Switching Risk |
|---|---|---|---|---|
| Customer A | €150K | €500K | 30% | Medium |
| Customer B | €56K | €200K | 28% | Medium |

Note: "2-customer article requires account-by-account negotiation. A 20% increase on this article affects ~6% of Customer A's total spend — material but manageable."

---

#### Special Case Handling in Command Center

Not all articles should say "Increase Price." The system should flag different action types:

| Condition | Action Label | Example |
|---|---|---|
| Cost-driven erosion, fixable volume | "Increase Price" (default) | 201827 |
| Material cost >40% of revenue + declining volume | **"Strategic Review: Renegotiate supply or sunset"** | 200832-E (−1.3% margin, 20 units/yr, material 48.7% of revenue) |
| High win rate + high margin | "Hold — pricing optimal" | Top performers |
| Low win rate + high margin | "Volume discount restructure" | Niche premium articles |
| Persistent 0% win rate with customer | "Stop quoting or reprice fundamentally" | 131 persistent-loss pairs |

---

## Tab 1: Win Rate Intelligence

### 1.1 — Win Rate Trend by Quarter (NEW, full width — #1 priority)

**Type:** Line chart, quarterly, 2022-Q1 through 2024-Q4.

| Quarter | Win Rate | Note |
|---|---|---|
| 2022-Q1 | 62.4% | Strong |
| 2023-Q2 | 35.1% | Collapse begins |
| 2023-Q3 | 11.4% | Crisis — 27 wins from 236 quotes |
| 2023-Q4 | 60.4% | Recovery |
| 2024-Q4 | 64.4% | Strongest quarter |

Show two lines: **BKAES** and **BKAGG** (BKAGG crashed harder at 11.1% in Q3 2023, recovered to 66.7% in Q4 2024).

Annotate Q3 2023 trough: "Win rate collapsed to 11.4%. Investigate: competitive pressure? Pricing error? Market event?"

**This chart alone justifies the page redesign.**

---

### 1.2 — Two charts side by side

| Position | Chart | Details |
|---|---|---|
| Left (1/2) | **Win Rate by Commodity Group** (NEW) | Horizontal bars. BKAES 52.7%, BKAGG 47.0%, BKAIZ 61.2%. Color-coded by health. |
| Right (1/2) | **Win Rate by Margin Band** (KEPT, enhanced) | Keep existing chart. Add **EMC overlay** (second Y-axis): Expected Margin Contribution = Win Rate × Avg Margin per band. |

EMC data:

| Band | Win Rate | Avg Margin | EMC |
|---|---|---|---|
| <40% | 64.3% | 28.2% | 18.1% |
| 40–50% | 53.3% | 45.8% | 24.4% |
| 50–60% | 51.7% | 55.5% | 28.7% |
| 60–70% | 45.3% | 65.5% | 29.7% |
| 70–80% | 46.3% | 75.3% | 34.8% |
| >80% | 56.9% | 84.3% | 47.9% |

**Key insight:** EMC keeps climbing. Higher margins win often enough that expected return per quote is maximized above 80%. "The math says: don't discount."

---

### 1.3 — Win Rate Seasonality (NEW)

**Type:** Bar chart, win rate by month.

| Month | Win Rate | Note |
|---|---|---|
| Apr | 59.5% | Best |
| Aug | 33.5% | Worst |
| Dec | 66.9% | Best |

Summer crash (Jun–Aug: 33–38%) vs winter peak (Nov–Dec: 60–67%). Actionable: adjust pricing aggression seasonally.

---

### 1.4 — Commodity Group × Margin Band Heatmap (NEW)

**Type:** Heatmap — rows = commodity groups, columns = margin bands, cells = win rate %.

BKAES at 60–70%: 57.1% vs BKAGG at 60–70%: 41.9%. BKAGG at >80%: 69.6% (niche specialty).

"BKAGG needs a completely different pricing strategy than BKAES." Enable as a drill-down from the margin band chart, or toggle by commodity group.

---

### 1.5 — Quote Response Time vs Win Rate (NEW)

**Type:** Bar or scatter — response time buckets vs win rate.

If quotes answered <7 days win at ~50% but >30 days win at ~20%, that's a process fix worth more than any pricing change. Derive from quote date vs decision date in the data.

---

## Tab 2: Loss Analysis

### 2.1 — Revenue Lost by Reason (KEPT, enhanced)

Donut + rejection codes table. **Enhancements:**

Group codes into three categories:
- **Pricing-Related:** PA (competitor cheaper: 87 quotes, €794K) + PR (price too high: 27 quotes, €177K) = **114 quotes, €971K**
- **Process-Related:** KA, KR, KE, KD, KN (customer cancelled, rejected, etc.)
- **Market-Related:** TE, LZ, RZ (delivery, timing)

Visual grouping in the donut and table. Pricing-related highlighted — "these are the ones pricing changes can fix."

---

### 2.2 — Lost Revenue by Deal Size (NEW)

**Type:** Bar chart + callout card.

| Size | Lost Quotes | Lost Revenue | % of Total |
|---|---|---|---|
| <€1K | 319 | €212K | 2.3% |
| €1–5K | 721 | €1.67M | 18.4% |
| €10–50K | 113 | €2.09M | 23.0% |
| >€50K | 37 | €4.37M | 48.2% |

**Callout:** "37 lost quotes over €50K = €4.37M (48% of all lost revenue). Win 5 more = +€590K. These are worth fighting for."

---

### 2.3 — Customer Win Rate Table (NEW)

**Type:** Sortable table, top 15 by lost revenue.

| Customer | Quotes | Win Rate | Lost Revenue | Won Margin | Lost Margin | Gap |
|---|---|---|---|---|---|---|
| 101580 | 51 | 39.2% | €2.78M | 83.7% | 72.5% | 11.2pp |
| 101728 | 14 | 21.4% | €137K | 74.0% | 66.9% | 7.1pp |
| 101690 | 13 | 46.2% | €125K | 68.5% | 42.3% | 26.2pp |

"Customer 101580 alone = 29% of all lost quote revenue. Won margins (83.7%) far exceed lost margins (72.5%) — they lose on competitive deals where they're still quoting 72.5%."

---

### 2.4 — Won vs Lost Margin Comparison (KEPT, enhanced)

Horizontal bar: 70.6% won vs 72.4% lost. **Add:** commodity group toggle to see segment-level differences.

---

### 2.5 — Persistent Losses Alert (NEW)

**Type:** Alert card.

"131 customer-product pairs quoted multiple times with 0% win rate. Review pricing or stop quoting."

Expandable to show top 10 by cumulative lost revenue. Filterable by commodity group.

---

## Tab 3: Price Governance & Strategy

### 3.1 — Price Governance Rules (KEPT)

4 rules with violation counts. Keep as-is.

---

### 3.2 — Discount Distribution (NEW)

**Type:** Histogram — % of quotes by discount level off list price.

If 60% of quotes get >10% discount, there's a pricing discipline problem upstream of win rates and margins. Shows whether the issue is list price (too high, everyone discounts) or selective discounting (some reps discount more than others).

---

### 3.3 — Price History (KEPT, enhanced)

List price vs quoted price vs discount % over time. **Add:** margin % overlay line as second axis. If discounts increase but margin holds = costs falling too. If both drop = real problem. The relationship tells the story.

---

### 3.4 — Margin Gap Trend (IMPROVED — upgraded from annual to quarterly)

**Type:** Dual line chart, quarterly, with shaded gap. Same structure as Revenue & Margins page hero chart.

**Canonical home decision:** This chart lives HERE (it's about quoting accuracy). Revenue & Margins page gets the delivered margin trend only. Remove duplication.

| Quarter | Quoted | Actual | Gap |
|---|---|---|---|
| 2022-Q1 | 76.5% | 61.6% | 14.9pp |
| 2022-Q4 | 66.4% | 68.2% | −1.8pp |
| 2024-Q3 | 70.1% | 60.0% | 10.1pp |
| 2024-Q4 | 64.4% | 63.0% | 1.4pp |

Keep annual view as a toggle.

---

### 3.5 — SKU Recommendations (KEPT)

Article, commodity group, margin, risk score, action, priority, approval level. Keep as-is — the workflow concept with approval levels is strong.

---

### 3.6 — Price Elasticity by Product Type (NEW)

**Type:** Compact table or horizontal bars.

| Product Type | Avg Margin | Win Rate | Pricing Power |
|---|---|---|---|
| Pumpenkopf | 74.3% | High | Strong — can maintain premium |
| Zahnradpumpe | 62.5% | Medium | Moderate |
| Innenzahnringpumpe | 54.9% | Low-Medium | Weak — competitive pressure |

Connects to Products page product-type breakdown. Different product types need different pricing strategies.

---

## What Moved Here From Other Pages

| Element | From | Placement |
|---|---|---|
| Pipeline by Stage | Forecasting | Compact card above Command Center |

---

## What Moved Away

| Element | To | Why |
|---|---|---|
| Margin Gap quarterly chart (canonical) | Stays here | Was duplicated on Revenue & Margins — remove from there, keep the delivered margin trend there instead |

---

## Final Count

**Always visible:** 4 KPIs + secondary strip · Pipeline card · Pricing Command Center (with overhauled 4-tab detail panel)

**Tab 1 (Win Rate):** trend line · commodity group bars + margin band with EMC · seasonality · heatmap · response time

**Tab 2 (Loss Analysis):** rejection codes (grouped) · deal size · customer win rates · won vs lost · persistent losses

**Tab 3 (Governance):** rules · discount distribution · price history · margin gap trend · SKU recommendations · product type elasticity

---

## Open Decisions Before Build

1. **Tabbed layout vs single scroll** — test with users. Tabs reduce overwhelm but hide content. Alternative: collapsible sections.
2. **Margin Gap canonical home** — confirm Pricing & Quotes owns the quoted-vs-actual chart. Update Revenue & Margins plan to remove duplication.
3. **Quote response time data** — confirm quote date and decision date fields exist to derive response time.
4. **Detail panel tabs vs single scroll** — 4 tabs per expanded row may be complex. Test: do users click through, or do they want everything visible?
5. **FX Risk and Inventory in detail panel** — keep only if sourced from real data. If synthetic, remove.
6. **Persistent losses threshold** — define "persistent" (≥2 quotes? ≥3? with 0% win rate only, or <10%?).
7. **Discount distribution data** — confirm list price vs quoted price fields exist for all quotes.
8. **Staged repricing templates** — how many templates (2-phase, 3-phase, immediate)? Who decides which applies?
9. **EMC insight framing** — "don't discount" is counterintuitive. Needs careful annotation so it's not misread.
