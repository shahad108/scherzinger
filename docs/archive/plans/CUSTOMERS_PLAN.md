# Customers Page — Redesign Plan

**Goal:** The page already has strong snapshots (concentration, risk tiers, segments). Add the **motion** — slopes, churn flows, growing/declining trajectories — so a KAM can see not just who's big but who's changing.

**Principle:** Snapshots tell you where you are. Slopes tell you where you're going. This page should surface both, and end with an action list a KAM can act on Monday morning.

---

## Page Structure

### Global header (kept)
- Search bar
- Segment filters: Enterprise · Mid-Market · SME · Occasional
- Risk filters: Critical · High · Medium · Low

---

### Row 0 — KPI Cards (FIX 2 of 4)

| # | Metric | Value | Notes |
|---|---|---|---|
| 1 | Total Customers | 25 **of 827 total** | Add "of X total" subtitle so filter context is clear. |
| 2 | **Customer Retention Rate** | 42.2% · €1.1M churned revenue | Replaces circular "Enterprise+Mid-Market LTV%". Pair with €-at-risk for action. Show annual rate, not cumulative. Lock "churned" = no invoice in 12 months. Add benchmark if available. |
| 3 | High/Critical Risk | 4 | Keep, contextual to filter |
| 4 | Avg DB2 Margin | 57.4% **(▼X.Xpp YoY)** | Add YoY trend arrow. |

---

### Row 1 — Customer Revenue × Margin Scatter (NEW, full width or 2/3)

**Type:** Scatter plot — X = revenue, Y = avg DB2 margin. Color = risk tier. Size = invoice count (or order frequency).

**Quadrant labels** (same pattern as Products page):
- Top-right: "Strategic Accounts" (high rev, healthy margin)
- Bottom-right: **"Fix or Reprice"** (high rev, low margin) — 101690, 100883, 101887
- Top-left: "Profitable Niche" (low rev, high margin)
- Bottom-left: "Review/Drop" (low rev, low margin)

Reference lines: horizontal at 60% margin target, 25% floor.

**Why this is the hero:** This is the chart a sales director uses in a monthly review. "Show me who's big and unprofitable" — one glance.

---

### Row 2 — Customer Movement (NEW, compact)

**Option A (recommended):** Three sub-cards + a "Net Change" indicator.

| Card | Value | € Impact |
|---|---|---|
| Churned (12mo) | −259 | −€1.1M lost revenue |
| Retained | 189 | — |
| New | +202 | +€1.1M |
| **Net** | −57 customers | ~€0 net revenue |

**Option B:** Sankey flow (Start 448 → Churned −259 / Retained 189 → + New 202 → End 391). Only use if you're giving it full-width real estate.

**Why this matters:** Totals look stable, but 58% of the 2022 base churned and was replaced. Top churned customer: 101052 (€135K). Investigate.

**Lock definitions:** "Churned" = no invoice in 12 months. Churn rate shown annually, with cumulative as secondary.

---

### Row 3 — Growing vs Declining Customers (NEW)

**Type:** Diverging bar chart, top 5 growers (green, right) + top 5 decliners (red, left), revenue change €-labeled.

**Growers** (2022 → 2024): 101858 +€147K · 101139 +€69K · 101181 +€53K

**Decliners:** 101580 −€356K · 101690 −€115K · 101703 −€73K

**Caveat:** A decline may be a closed project, not churn. Add "Reason" hover field where known, or inline note: "investigate before acting."

**Strategic signal example:** 101580 dropped €371K → €15K AND has €2.78M in lost quotes at 39.2% win rate — that's active competitive displacement, not project completion.

---

### Row 4 — Customer Concentration (KEPT, enhanced)

Top 15 bar chart with cumulative % is well-designed. **One change:** replace the blue gradient with a **single neutral bar color + margin % health badge** on each bar (red <50% / orange 50–60% / green >60%). Don't stack gradient + color — it gets muddy.

Shows at a glance: big customers who are *also* margin problems (101690 at €1.54M / 53.3% would flag orange).

---

### Row 5 — Risk Tier Matrix + Customer Segments (side by side, KEPT, enhanced)

**Left — Risk Tier Matrix**
Segment × Risk heatmap. **Change:** cells show **€ revenue at risk**, not customer counts. "3 Enterprise at High risk" is meaningless without knowing if that's €150K or €1.5M.

**Right — Customer Segments** *(kept as-is)*
Breakdown table: 89 Enterprise · 234 Mid-Market · 574 Occasional · 541 SME with margin per segment.

---

### Row 6 — Customer List Table (IMPROVED)

**Kept columns:** ID · Customer · Segment · Est. LTV · Revenue · Risk Tier · Invoices · Avg Margin · Win Rate · Risk Score

**New columns:**
- **Margin Trend** — slope arrow + pp/yr (e.g. ↓ −6.5pp/yr). Sort by worst = instant priority list.
- **Margin Gap** — quoted vs actual (101690: 23.4pp gap = €246K unrealized).
- **Lost Quote Revenue** — competitive signal (101580: €2.78M).
- **Products** — count of unique articles purchased. Single-product = churn risk.
- **Last Order** — date of most recent invoice. Flag if >6 months for previously active customer.

**Problem:** 15 columns won't fit. Solution — **view presets**:

| Preset | Columns |
|---|---|
| At-a-glance (default) | ID, Customer, Segment, Revenue, Avg Margin, Margin Trend, Risk Tier |
| Risk view | ID, Customer, Risk Score, Risk Tier, Margin Trend, Last Order, Est. LTV |
| Competitiveness view | ID, Customer, Revenue, Win Rate, Lost Quote Revenue, Margin Gap |
| Portfolio view | ID, Customer, Products, Invoices, Revenue, Avg Margin, Segment |
| Full | all columns (horizontal scroll) |

Row click → opens **Customer detail drawer** (v2) with margin trend line, revenue-over-time, quote history, top products, open opportunities.

---

### Row 7 — Action List: This Week (NEW, recommended)

Compact synthesized callout — top 5–10 customers a KAM should contact now, ranked by composite signal:
- Declining margin slope (high weight)
- High lost-quote revenue (high weight)
- High LTV at risk
- Inactivity flag (no order >6 months)

**Why:** Everything else on this page is diagnostic. This row converts diagnosis into *action*. This is the Monday-morning view.

Each row: Customer · reason chips (🔻 margin / 💰 LTV / ⚠️ lost quotes) · suggested action · [Open drawer →]

---

## Final Count

4 KPIs · scatter · movement card row · growing/declining bars · concentration chart · risk matrix + segments · customer table with presets · action list.

---

## Nothing Removed

Existing structure is the strongest of the four pages. All additions are gap-filling.

---

## Open Decisions Before Build

1. **"Churned" definition** — 12mo / 18mo / 24mo of no invoice. Lock and use everywhere.
2. **Retention rate benchmark** — can we show an industry median for context?
3. **Sankey vs. sub-cards** for Row 2 — decide based on available width.
4. **Growing/Declining "reason" field** — is it available in the data, or inferred only?
5. **Action List scoring weights** — which signals matter most (margin slope vs. lost quotes vs. inactivity)?
6. **Customer detail drawer** — v1 or v2?
7. **Table preset set** — validate the 4 presets with a real KAM before building.
