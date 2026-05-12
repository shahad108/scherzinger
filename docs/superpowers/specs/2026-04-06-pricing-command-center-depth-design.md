# Pricing & Quotes — Command Center Depth + Filters + Action Labels

**Date:** 2026-04-06
**Status:** Approved
**Scope:** 4 priorities for the Pricing & Quotes page, ordered by business impact

---

## Context

The Pricing & Quotes page has its visual structure complete (3 tabs, KPIs, charts). The gap is depth — specifically the Command Center detail panel, which is the feature Manuel's team will sit in front of during pricing review meetings. Without real data in the expanded row tabs, the page is a reporting layer, not negotiation intelligence.

**Credibility standard:** Every number must trace back to invoice or quote data. "Your data, not our model."

---

## Priority 1: Command Center Detail Panel — 3 Tabs Overhauled

### Tab B: Cost Deep-Dive (all articles, real data)

**Data source:** Per-article cost data from `cogs_detail.json` + per-year revenue/cost/units from `products.json`, indexed via `pricingEngine.js`.

**Layout:**

1. **Price vs Cost Trend table (3 years)**

| Year | Avg Price | Avg Cost | Margin |
|------|-----------|----------|--------|
| 2022 | €675      | €354     | 47.6%  |
| 2023 | €741 (+10%) | €433 (+22%) | 41.6% |
| 2024 | €801 (+8%) | €488 (+13%) | 39.1% |

- Price per unit = revenue_YYYY / units_YYYY
- Cost per unit = hkvoll_per_unit (from cost trends, per year)
- YoY % change calculated inline
- Show all years available (2022-2025)

2. **Cost Pass-Through Rate**

Formula: `(price_change / cost_change) * 100`

Display: "Costs rose €134/unit, price only rose €126. €8/unit absorbed = €928 total leakage across 116 units."

- price_change = price_2024 - price_2022
- cost_change = cost_2024 - cost_2022
- leakage_per_unit = cost_change - price_change
- total_leakage = leakage_per_unit * units_latest

3. **Cost Breakdown (horizontal bars)**

- Material % (from COGS data by commodity, or article-level if available)
- Direct Manufacturing %
- Outsourced %
- Overhead (remainder to 100%)

Each bar shows percentage + absolute EUR value per unit.

4. **Auto-generated annotation**

Decision tree:
- material_pct > 0.30 → "Material costs are {X}% of revenue and climbing. Renegotiate supplier or increase price."
- cost_pass_through < 0.70 → "Only {X}% of cost increases passed to price. €{Y} leakage per unit."
- cost_trend === 'rising' AND margin_trend === 'declining' → "Cost-margin scissors: costs rising faster than price. Action required."

**Fallback:** Articles missing granular cost data show commodity-group average breakdown with badge: "Commodity group average — article-level cost data not available."

---

### Tab C: Quote & Competition (real quote data with inference fallback)

**Data source:** New file `article_quotes.json` derived from actual quote records. Per article: win_count, loss_count, total_quotes, lost_revenue, won_avg_margin, lost_avg_margin.

**Two display modes based on data availability:**

#### Mode 1: Articles with >=3 quotes (real data)

| Field | Value | Source |
|-------|-------|--------|
| Quote Win Rate | 80% (4/5) | Quote records |
| Lost Quotes | 1 (€17K) | Quote records |
| Won Quote Avg Margin | 39.8% | Quote records |
| Lost Quote Avg Margin | N/A (1 loss) | Quote records |
| Competitor Pressure | Low | Derived: >=70% win rate = Low |

Competitor pressure scale:
- Win rate >= 70% → Low
- Win rate 40-70% → Medium
- Win rate < 40% → High

Interpretation text auto-generated:
- High win rate + declining margin → "Demand is strong but costs are eroding margin. Price increase likely absorbable."
- Low win rate + high margin → "Premium positioning. Consider volume-based discount structure."
- Low win rate + low margin → "Uncompetitive. Fundamental reprice or stop quoting."
- High win rate + high margin → "Strong position. Hold pricing or test small increase."

Badge: "From quote records"

#### Mode 2: Articles with <3 quotes (inferred)

Show: quote count with "(too few for reliable rate)", volume trend, margin trend.

Competitor pressure inferred from:
- Declining margin + stable/growing volume → Medium-High (competitive pricing pressure)
- Declining margin + declining volume → High (market shrinkage)
- Stable/rising margin + growing volume → Low

Badge: "Inferred from volume + margin trends (N quotes available)"

#### Mode 3: Articles with 0 quotes

Show: "No quote history for this article" + volume/margin inference only.

---

### Tab D: Customer Context (real linkage, manual qualitative fields)

**Data source:** New file `article_customers.json` derived from invoice data. Per article: list of customer_ids with revenue, order_count, first_order_date, last_order_date.

**Two display tiers:**

#### Tier 1: Top 25 critical articles (by risk score)

Full customer table:

| Customer | Revenue (article) | % Share | Orders (freq) | Switching Risk |
|----------|-------------------|---------|---------------|----------------|
| 101580   | €150K             | 73%     | 42 (2/mo)     | Medium         |
| 101728   | €56K              | 27%     | 18 (1/mo)     | Medium         |

Computed fields (all real):
- Revenue per customer-article pair from invoice data
- % share = customer revenue / total article revenue
- Order frequency = order_count / months between first and last order
- Concentration: 1 customer = "Single customer (critical)", 2-3 = "HIGH", 4-10 = "Moderate", 10+ = "Diversified"

Repricing impact calculation:
- units_for_customer = total_units_latest * customer_share (proportional allocation)
- impact_eur = price_increase_per_unit * units_for_customer
- impact_pct = impact_eur / customer_total_spend_all_articles (from products.json, sum of revenue where customer appears)
- Display: "A 20.6% increase on this article affects ~6% of Customer 101580's total spend — material but manageable."

Manual field:
- Switching risk: Pre-populated as "Medium" for all. Note displayed: "Switching risk is a team assessment. Update during pricing review."
- Not computed, not inferred — honest about what it is.

#### Tier 2: All other articles

Compact view:

| Customer Count | Concentration | Top Customer Share |
|----------------|---------------|-------------------|
| 4              | Moderate      | 45%               |

Auto-text: "{N} customers, {concentration level}. Top customer is {X}% of this article's revenue."

Note: "Detailed customer breakdown available for priority articles."

---

## Priority 2: Commodity Group Filter

**UI:** Pill selector in global header, same visual pattern as Forecasting page year range selector.

```
[ All ]  [ BKAES ]  [ BKAGG ]  [ BKAIZ ]  [ SOPU ]     ☑ Exclude inquiry-only (AN)
```

**State:** `commodityFilter` in PricingFX component, default "All".

**Filtering behavior:**

| Element | Filter behavior |
|---------|----------------|
| KPI: Win Rate | Recalculates for selected group |
| KPI: Revenue Lost | Filters rejection codes to group |
| KPI: Pipeline | Shows group subset if available, otherwise "All groups" badge |
| KPI: Price Sensitivity | Recalculates won/lost margins for group |
| Secondary KPI strip | All 4 recalculated |
| Command Center | Filters enriched recommendations by commodity_group |
| Tab 1 charts | Win Rate Trend highlights selected group line. Commodity bars highlights group. Heatmap highlights group row. |
| Tab 2 charts | All loss data filtered. Customer table filtered. |
| Tab 3 charts | Governance, discount, gap filtered where group data exists. |

**Graceful fallback:** For data without per-group breakdown (e.g., aggregate price history), show chart unchanged with subtle badge: "Showing all groups — group-level data not available for this view."

**Implementation:** Filter applied via `useMemo` in each data transform. Command Center already has `commodity_group` on every enriched recommendation.

---

## Priority 3: Special Case Action Labels

**Current:** 3 actions: `Increase | Monitor | OK`

**New:** 5 nuanced actions with distinct UI treatment.

### Decision Tree (evaluated in order)

```
1. Article in persistent losses set (≥2 quotes, 0% win rate for customer-pair)
   → "Stop Quoting or Reprice Fundamentally"
   → Dark red badge

2. material_pct > 0.40 AND units_latest < 30 AND marginTrend === 'declining'
   → "Strategic Review: Renegotiate or Sunset"
   → Purple badge

3. quote_win_rate < 0.30 AND current_margin > 0.60 (from article_quotes.json)
   → "Volume Discount Restructure"
   → Blue badge

4. current_margin >= target_margin AND marginTrend !== 'declining'
   → "Hold — Pricing Optimal"
   → Green badge

5. marginTrend === 'declining' OR current_margin < MARGIN_FLOOR
   → "Increase Price"
   → Red badge (default action)

6. Everything else
   → "Monitor"
   → Amber badge
```

### Data dependencies

- Persistent losses lookup: already in `pricing_analysis.json` → create Set of `${customer}-${article}` keys
- Per-article quote win rate: from new `article_quotes.json`
- material_pct, units_latest, marginTrend, current_margin, target_margin: already in enriched recommendations

### Changes to pricingEngine.js

- `computeAction()` function expands from ~10 lines to ~30 lines
- New parameters: `persistentLossesSet`, `articleQuoteLookup`
- These are passed into `buildEnrichedRecommendations()` as optional lookups

---

## New Data Files Required

### 1. `article_quotes.json`

Structure:
```json
{
  "201827": { "win": 4, "loss": 1, "total": 5, "win_rate": 0.80, "lost_revenue": 17000, "won_avg_margin": 0.398 },
  "300143": { "win": 2, "loss": 3, "total": 5, "win_rate": 0.40, "lost_revenue": 42000, "won_avg_margin": 0.512 },
  ...
}
```

Source: Derived from actual quote data (article_id + is_won + margin + value).

### 2. `article_customers.json`

Structure:
```json
{
  "201827": {
    "customer_count": 2,
    "concentration": "HIGH",
    "customers": [
      { "customer_id": "101580", "revenue": 150000, "share": 0.73, "order_count": 42, "first_order": "2022-03", "last_order": "2024-12" },
      { "customer_id": "101728", "revenue": 56000, "share": 0.27, "order_count": 18, "first_order": "2022-06", "last_order": "2024-11" }
    ]
  },
  ...
}
```

Source: Derived from invoice data (article_id + customer_id + revenue + order dates).

For articles outside the top 25 critical: only `customer_count`, `concentration`, and `top_customer_share` fields.

---

## Priority 4: Cross-page Navigation (Deferred)

Not in scope for this design. Links to Products, Cost Intelligence, and Forecasting pages are polish for a later phase.

---

## Out of Scope

- Year range filter (lower priority than commodity group)
- Heatmap drill-down interaction
- Persistent losses commodity filter
- Switching risk as editable field (would require state persistence / backend)
