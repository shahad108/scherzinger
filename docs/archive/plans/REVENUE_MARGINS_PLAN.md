# Revenue & Margins Page — Redesign Plan

**Goal:** Turn this page from "one chart + a misplaced product table" into a full margin intelligence surface. The page should answer: *how much margin are we leaking, where, why, and who's causing it.*

**Principle:** Every chart must show something the ERP can't. If the ERP already shows it, it doesn't belong here.

---

## Page Structure

### Global header
- Year tabs: 2022 · 2023 · 2024 · 2025 · All *(keep current)*
- Add: commodity-group filter (multi-select) — cascades to Rows 3R, 4, 6.
- Add: "Last updated: [timestamp]" right-aligned.

---

### Row 1 — KPI Cards (4)

| # | Card | Value | Subtitle |
|---|---|---|---|
| 1 | Total Revenue | €6.25M | +7.9% YoY (kept) |
| 2 | DB II Margin | 60.9% | ▼1.2pp YoY (kept) |
| 3 | **Margin Gap (Quoted vs Actual)** | **X.Xpp** | Rev-weighted · direction arrow · define period once |
| 4 | **DB I Margin** | 73.2% | Fixed-cost spread: 9.1pp between DB1 & DB2 |

**Removed:** "Growth YoY" (redundant with Revenue subtitle) and "Months: 12" (not a metric).

**Decision needed:** Lock the Margin Gap definition (FY avg / trailing 4Q / rev-weighted) and use the same number on the Dashboard Overview. Current dashboard draft says 9.7→8.5→7.2pp; quarterly series here shows different numbers — these must reconcile.

---

### Row 2 — Hero Chart: Quoted vs Actual Margin Trend (NEW, full width)

**Type:** Dual line chart, quarterly, shaded gap between lines.

- **Blue line:** Quoted DB2 margin (won quotes) — expected
- **Green line:** Actual DB2 margin (invoices) — delivered
- **Shaded band:** leakage

Data (quarterly):

| Quarter | Quoted | Actual | Gap |
|---|---|---|---|
| 2022-Q1 | 76.5% | 61.6% | 14.9pp |
| 2022-Q2 | 74.7% | 62.4% | 12.3pp |
| 2022-Q3 | 66.4% | 61.8% | 4.6pp |
| 2022-Q4 | 66.4% | 68.2% | −1.8pp * |
| 2023-Q1 | 69.0% | 64.9% | 4.1pp |
| 2023-Q2 | 74.1% | 65.8% | 8.3pp |
| 2023-Q3 | 62.5% | 60.8% | 1.7pp |
| 2023-Q4 | 66.6% | 65.2% | 1.4pp |
| 2024-Q1 | 65.9% | 63.7% | 2.2pp |
| 2024-Q2 | 70.6% | 62.6% | 8.0pp |
| 2024-Q3 | 70.1% | 60.0% | 10.1pp |
| 2024-Q4 | 64.4% | 63.0% | 1.4pp |

\* Negative gap = underquoted deals that overperformed. Surface via tooltip so it isn't read as a data error.

**Why this is the hero:** No ERP shows this. Answers "how much are we leaving on the table, and is it getting better or worse?"

---

### Row 3 — Two charts, side by side

| Position | Chart | Notes |
|---|---|---|
| Left (1/2) | **Monthly Revenue & Margin Performance** (kept) | Bars = monthly revenue, overlay line = margin %. Red-flag bars when margin dips below threshold. Differentiate from Row 2: this is *monthly cadence & seasonality*, Row 2 is *quarterly quoted-vs-actual narrative*. Make titles explicit. |
| Right (1/2) | **Margin by Commodity Group** (NEW) | Horizontal bars, one per group, DB2 margin %. Color: red <50%, orange 50–55%, green >60%. Revenue shown as secondary label. Sort by revenue descending. |

Commodity group data:

| Group | DB2 Margin | Revenue |
|---|---|---|
| BKAES | 68.0% | €12.3M |
| BKAGG | 53.7% | €5.3M |
| BKAIZ | 54.4% | €564K |
| MBDIV | 77.2% | *confirm* |
| SOPU | 46.4% | €170K |

**Check:** MBDIV has the highest DB2 (77.2%) but wasn't on the dashboard donut. Confirm it's a real commodity group, not a residual/misc bucket.

---

### Row 4 — DB1 vs DB2 Breakdown by Commodity Group (NEW, full width)

**Type:** Grouped horizontal bars (or bullet chart) — two bars per group.

| Group | DB1 | DB2 | Fixed Overhead |
|---|---|---|---|
| BKAES | 76.2% | 68.0% | 8.2pp |
| BKAGG | 64.6% | 53.7% | 10.9pp |
| BKAIZ | 65.4% | 54.4% | 11.0pp |
| SOPU | 58.5% | 46.4% | 12.1pp |
| MBDIV | 82.1% | 77.2% | 4.9pp |

**Why unique:** The DB1→DB2 gap = fixed overhead burden per group. BKAGG's problem isn't just variable cost — its fixed allocation is 10.9pp vs 8.2pp for BKAES. That's an operations conversation (capacity utilization, batch sizes, overhead methodology) that the ERP cannot surface.

Sort bars by revenue (BKAES, BKAGG, BKAIZ, MBDIV, SOPU).

---

### Row 5 — Margin Gap by Customer (NEW, full width)

**Type:** Sortable table, top 15 customers by gap impact.

**Columns:** Customer · Revenue · Actual Margin · Quoted Margin · Gap (pp) · **Impact (€)** · Trend arrow (QoQ)

Sample rows:

| Customer | Revenue | Actual | Quoted | Gap | Impact | Trend |
|---|---|---|---|---|---|---|
| 101690 | €1,053K | 54.1% | 77.5% | 23.4pp | €246K | ↓ |
| 100850 | €187K | 54.1% | 73.0% | 18.9pp | €35K | → |
| 101728 | €299K | 53.7% | 71.7% | 18.0pp | €54K | ↑ |
| 101887 | €312K | 42.1% | 59.6% | 17.6pp | €55K | ↓ |
| 100883 | €847K | 49.8% | 64.5% | 14.7pp | €124K | → |

Impact = Revenue × Gap. Added trend arrow beyond original spec — static gap is diagnosis, direction is prognosis.

**Interactions:** search, sort any column, export CSV, click-through to Customers page detail.

---

### Row 6 — Margin Distribution Histogram (KEPT, enhanced)

Existing histogram is conceptually fine. Enhancements:

- Vertical reference line at target margin (e.g. 60%) — instantly shows volume below target.
- **Toggle: Count ↔ Revenue-weighted.** 3 articles at 10% margin representing €500K matters more than 20 articles at 10% representing €5K.
- Color bars: red <35%, orange 35–55%, blue 55–75%, green >75%.
- Commodity-group filter (inherited from page header).

---

### Row 7 — Margin Bridge Waterfall (NEW, optional but recommended)

**Type:** Waterfall chart decomposing YoY DB2 margin change.

**Buckets:** Starting DB2 (FY23) → Price → Volume → Mix → Cost → Ending DB2 (FY24).

**Why:** Classic CFO ask. Bridges "what happened" (rows 1–6) to "why it happened." Currently no chart on the page attributes the −1.2pp decline to drivers.

If space/data unavailable, defer to v2.

---

## Removed from this page

| Element | New home |
|---|---|
| All Products by Revenue table | Products & SKUs page |
| "Growth YoY" KPI | Folded into Revenue subtitle |
| "Months: 12" KPI | Dropped entirely |

---

## Final Count

4 KPIs · 1 hero trend chart · 2 side-by-side charts · 1 DB1/DB2 breakdown · 1 customer gap table · 1 enhanced distribution histogram · 1 optional waterfall.

---

## Open Decisions Before Build

1. **Margin Gap definition** — period, weighting method — locked across Dashboard + this page.
2. **MBDIV** — confirm it's a real commodity group.
3. **Row 2 negative-gap handling** — tooltip wording for 2022-Q4.
4. **Row 3L vs Row 2 differentiation** — title/axis labels must make the distinction obvious.
5. **Waterfall (Row 7)** — ship v1 or defer? Depends on whether price/volume/mix/cost decomposition is available in the data model.
