# Products & SKUs Page — Redesign Plan

**Goal:** Fill the gaps on a page that already has good bones. The scatter + Margin at Risk sidebar pattern is correct — add KPIs, product-type breakdown, competitive signals, and decliner tracking.

**Principle:** Every SKU has a margin story, a competitive story, and a portfolio-role story. This page should surface all three at a glance.

---

## Page Structure

### Global header (kept)
- Commodity group filter tabs: All · BKAES · BKAGG · MBKUEHL · SOPU · BKAIZ
- Year filter: 2023 · 2024 · 2025
- Search bar + margin threshold filters (<25%, 25–30%, >30%)

---

### Row 0 — KPI Cards (NEW, 4 cards)

| # | Metric | Value | Notes |
|---|---|---|---|
| 1 | Total Active SKUs | 1,015 | Updates with commodity filter (BKAES: 627, BKAGG: 370) |
| 2 | Avg DB2 Margin (rev-weighted) | 63.4% | Updates with filters — instantly shows BKAES (68%) vs BKAGG (53.7%) |
| 3 | SKUs Below Target | **N warning · M critical** | Two thresholds: Warning <50%, Critical <25%. More useful than a single count. |
| 4 | New Product Revenue | €1.5M · 203 SKUs · 8.3% | 2024 introductions. Include monthly sparkline. |

**Optional 5th callout:** "Top 10 SKUs = X% of revenue" concentration indicator. If >50%, flag as portfolio-risk signal.

---

### Row 1 — Article Margin vs Revenue Scatter + Margin at Risk Sidebar (IMPROVED)

**Left (2/3): Scatter** *(kept, enhanced)*
- Add horizontal **target margin line** at 60% (operational target).
- Keep dashed **floor line** at ~10–25% (emergency threshold).
- Between lines = "needs attention." Below floor = "urgent."
- Add **quadrant labels**:
  - Top-right: "Stars" (high rev, high margin)
  - Bottom-right: "Fix or Reprice" (high rev, low margin — the 204604 cluster)
  - Top-left: "Niche" (low rev, high margin)
  - Bottom-left: "Review/Drop" (low rev, low margin)

**Right (1/3): Margin at Risk sidebar** *(kept, enhanced, two tabs)*

| Tab | Content |
|---|---|
| **At Risk** (default) | Articles below 25% margin. Add **€ impact column** per article: (Target Margin − Actual Margin) × Revenue = unrealized margin. e.g. 206028-01: 8.5% margin, €168K impact. |
| **Declining Fast** (NEW) | Articles with steepest YoY margin drop (see watch list below). |

Declining Fast data:

| Article | Revenue | 2022 | 2024 | Drop |
|---|---|---|---|---|
| 201773 | €50K | 62.5% | 23.1% | −39.4pp |
| 205169 | €63K | 70.1% | 44.2% | −25.9pp |
| 200832-E | €162K | 30.6% | 6.4% | −24.2pp |
| 204604 | €240K | 32.7% | 11.8% | −20.8pp |
| 200834-B | €124K | 55.8% | 36.8% | −19.0pp |

200832-E at 6.4% DB2 is actively losing on full-cost basis. Flag prominently.

---

### Row 2 — Product Type Performance (NEW, full width)

**Type:** Horizontal grouped bars — one row per product type, margin % and revenue labeled, color-coded by margin health.

| Product Type | Revenue | DB2 Margin | Articles | Orders |
|---|---|---|---|---|
| Zahnradpumpe | €8,817K | 62.5% | 447 | 1,916 |
| Elektro-Zahnradpumpe | €6,149K | 64.4% | 355 | 1,095 |
| Zahnrad-Flanschpumpe | €1,327K | 63.9% | 112 | 535 |
| Innenzahnringpumpe | €1,057K | 54.9% | 19 | 214 |
| Pumpenkopf | €847K | 74.3% | 66 | 334 |

**Why this matters:** Product type cuts across commodity groups and drives margin more than the group does. Pumpenkopf at 74.3% is 20pp above Innenzahnringpumpe — but both sit inside the same filter view today. This chart doesn't exist anywhere else in the product.

Sort by revenue descending.

---

### Row 3 — Commodity Group Scorecard (NEW, compact)

**Type:** Compact comparison table, clickable rows (filter whole page).

| Group | Revenue | DB2 | Win Rate | SKUs | Orders |
|---|---|---|---|---|---|
| BKAES | €12.3M | 68.0% | 52.7% | 627 | 2,066 |
| BKAGG | €5.3M | 53.7% | 47.0% | 370 | 1,939 |
| BKAIZ | €564K | 54.4% | 61.2% | 13 | 103 |
| SOPU | €170K | 46.4% | — | 6 | 12 |

**Note:** Fixed-overhead column (DB1−DB2 gap) lives on **Revenue & Margins** page, not here, to avoid duplication.

**Story this surfaces:** BKAGG has lower margins AND lower win rates. The "fix or reprice" narrative writes itself.

---

### Row 4 — Product Performance Details Table (IMPROVED)

**Kept columns:** Article ID · Description · Commodity Group · M 2023 · M 2024 · M 2025 · Trend · Revenue · Units

**New columns:** Win Rate · Lost Revenue · Product Type · Customer Count

**Problem:** 13 columns is too wide. Solution: **view presets.**

| Preset | Columns |
|---|---|
| Margin view (default) | Article, Desc, Group, M 2023, M 2024, M 2025, Trend, Revenue |
| Competitiveness view | Article, Desc, Revenue, Win Rate, Lost Revenue, Margin |
| Portfolio view | Article, Desc, Product Type, Customer Count, Revenue, Margin |

Or column visibility toggle if presets feel too rigid.

**New column detail — Win Rate / Lost Revenue:** per-article quote stats. Example: Article 201456 has 21.7% win rate, €774K lost revenue, but 84.9% margin on wins. That's a strategic pricing flag — either premium positioning is intentional, or overpriced vs. competitors.

**New column detail — Customer Count:** # of unique customers buying this SKU. Single-customer SKU = concentration risk. Consider a sidebar stat: "N SKUs sold to only 1 customer."

---

## Final Count

4 KPIs · enhanced scatter + two-tab sidebar · product type bars · commodity scorecard · enhanced table with view presets.

---

## Nothing Removed

The existing structure is good — scatter, sidebar, table stay. This plan fills gaps only.

---

## Open Decisions Before Build

1. **Margin targets** — confirm 60% operational target and 25% emergency floor with stakeholders.
2. **"Below Target" thresholds** — Warning/Critical cutoffs (default 50%/25%).
3. **Commodity scorecard scope** — confirm fixed-overhead lives only on Revenue & Margins, not duplicated here.
4. **Table presets vs toggle** — UX decision, test with users.
5. **Concentration risk KPI** — include in Row 0 as 5th callout, or hold for v2?
6. **"Declining Fast" sidebar tab** — define "fast" (>15pp drop YoY? steepest 10 by drop? weighted by revenue?).
