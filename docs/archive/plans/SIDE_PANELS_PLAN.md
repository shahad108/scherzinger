# Side Panels & Search — Redesign Plan

**Goal:** The side panels are the micro-level of the product — where portfolio-level insights become specific, actionable intelligence about one article or one customer. They should answer: "Tell me everything I need to know about THIS entity in 10 seconds."

**Principle:** Every section in a panel must show data specific to THAT entity, not portfolio averages. The current Gap Analysis bug (showing portfolio numbers in an SKU panel) is the anti-pattern — fix this everywhere.

**Navigation model:** Panels are summaries, not replacements for full pages. Every panel includes "Open Full Page →" and supports breadcrumb navigation when panels nest (SKU → Customer → back).

---

## SKU Side Panel

### Header

```
205415-B    BKAES    Elektro-Zahnradpumpe
Risk: 25    ● OK    Low Priority
```

Product Type added (currently missing — "Elektro-Zahnradpumpe" from description field).

---

### Section 1: KPI Cards (4, fix bugs)

| Card | Value | Fix |
|---|---|---|
| Revenue | €261K | **Fix:** current shows €303.5K — verify aggregation method (invoices only, exclude quotes) |
| Units | XXX | Keep |
| Current Margin | 63.6% | Keep |
| Customers | **3** | **Fix:** currently shows 0. Data linkage bug — 104053, 103987, 104340 |

---

### Section 2: Revenue & Margin by Year (KEPT)

Bar chart by year — works well, keep as-is.

---

### Section 3: Monthly Margin Trajectory (KEPT)

Line chart with confidence band — works well, keep as-is.

---

### Section 4: Quote Performance (NEW — most critical missing piece)

```
📊 QUOTE PERFORMANCE
Win Rate: 3/5 (60%)        Lost Revenue: €12K
Last Quote: 2024-08        Avg Quote Size: €18K
Trend: Stable              Competitor Pressure: Low
```

If no quotes exist for an article (repeat-order pattern): show "No recent quotes — repeat order pattern. Last quoted: [date] or Never."

---

### Section 5: Customer List (NEW)

```
👥 CUSTOMERS (3)
104053   Enterprise   €145K   (55% of this SKU's revenue)   68.2%
104340   Mid-Market   €98K    (38%)                          61.1%
103987   SME          €18K    (7%)                           52.4%
```

Click any customer → opens Customer side panel (with breadcrumb: "SKU 205415-B → Customer 104053").

For articles with >10 customers: show top 5 by revenue + "and X more →" link.

Highlight concentration risk: if top 1 customer >60% of revenue, flag: "⚠️ Single-customer concentration: 104053 = 55% of revenue."

---

### Section 6: Price vs Cost Trend (NEW)

```
📈 PRICE vs COST (per unit)
          Price      Cost      Margin
2023:     €8,043     €2,852    64.5%
2024:     €8,966     €3,264    63.6%
          (+11%)     (+14%)    (−0.9pp)

Cost Pass-Through Rate: 79%
"Absorbing 21% of cost increases — €702/unit × 29 units = €20K margin leakage"
```

One-line annotation connecting the numbers to € impact.

---

### Section 7: Cost Structure (KEPT, minor fix)

HKVoll/Unit, Material %, Labor %, Cost Trend bars — keep.

Material cost alert ("Material costs are 50% of production cost") — keep, this is great.

---

### Section 8: Order Frequency & Recency (NEW)

```
📦 ORDER ACTIVITY
Last Order: 2024-08     Avg: 4.2 orders/year     Total: 14 orders
Status: Active

⚠️ Flag if no orders in >6 months: "No orders in X months — previously Y/year"
```

Cheap to compute, essential for spotting dying articles before margin analysis even begins.

---

### Section 9: Margin Gap — THIS ARTICLE (FIX — currently showing portfolio data)

```
📐 MARGIN GAP (this article)
Quoted: 69.2%     Actual: 66.9%     Gap: 2.3pp
vs portfolio avg gap: 1.9pp — slightly above average
Trend: Stable
```

**Critical fix:** Replace portfolio-level numbers (Mean Gap 1.9pp, 1,313 linked records) with article-specific quoted vs actual. The portfolio comparison is a one-line reference, not the headline.

---

### Section 10: Margin Rank (NEW)

```
📊 RANK: #142 of 627 BKAES articles by margin (top 23%)
```

One line. Instant context — is this a top performer or a laggard within its commodity group?

---

### Section 11: Related / Similar SKUs (NEW)

```
🔗 RELATED ARTICLES
205415-A   €180K   71.2%   ▲ improving    (same base article)
205415-C   €45K    58.3%   ▼ declining    (same base article)
203891     €92K    65.1%   → stable       (same type, similar revenue)
```

**Matching logic:** Same article prefix (variants like -A, -B, -C) first, then same product type + commodity group + similar revenue band (±50%). Max 5 results. Sort by relevance (variants first, then margin similarity).

---

### Section 12: Enriched Pricing Recommendation (KEPT)

Margin, Action, Approval, Priority — keep. Consistent with Pricing Command Center detail panel.

---

### Section 13: Inventory Status (CONDITIONAL)

**Decision:** Show ONLY if sourced from real ERP data. If synthetic/placeholder, remove entirely for v1. "Stock: 120 units" that's fake destroys trust faster than an empty section.

Add back when real ERP inventory integration exists.

---

### Section 14: Footer

```
[Open in Products & SKUs →]     (filtered to this article)
```

---

## Customer Side Panel

### Header

```
101728    Enterprise    ● High Risk
Primary: BKAES + BKAGG mix    Zahnradpumpe buyer
```

Segment + Risk tier + primary commodity groups at a glance.

---

### Section 1: KPI Cards (4)

| Card | Value | Flag |
|---|---|---|
| Revenue | €299K | — |
| DB2 Margin | 53.7% | 🟠 Below portfolio avg (63.4%) |
| Win Rate | 21.4% (3/14) | 🔴 Critical — losing 79% of quotes |
| Orders | 104 | Active buyer |

---

### Section 2: Revenue & Margin by Year

```
📊 ANNUAL TREND
2022:  €95K    45.3%
2023:  €140K   58.5%   (+€45K ✅, +13.2pp ✅)
2024:  €64K    55.7%   (−€76K ⚠️, −2.8pp ⚠️)
```

Revenue collapsed 54% in 2024. Flag prominently.

---

### Section 3: Order Recency (NEW — prominent banner if triggered)

```
⚠️ INACTIVITY ALERT
Last order: [date] — no orders in X months
Previously: Y orders/year
```

Show as a top-of-panel amber/red banner ONLY when triggered (>6 months inactive for previously active customer). This is the simplest, most reliable churn signal — make it unmissable.

If customer is active, show a compact line instead: "Last order: 2 weeks ago · 8.7 orders/month."

---

### Section 4: Quote Performance (NEW — critical)

```
📊 QUOTES
Won: 3        Lost: 11       Win Rate: 21.4%
Lost Revenue: €137K
Won Margin: 74.0%     Lost Margin: 66.9%     Gap: 7.1pp
Last Won: [date]      Last Lost: [date]

"Losing on competitive deals at 66.9% margin — still quoting well above
cost. Either competitor is undercutting or relationship needs attention."
```

One-line interpretation connecting the numbers to a possible cause.

---

### Section 5: Product Mix (NEW)

```
📦 PRODUCT MIX (14 unique articles)
BKAES:  8 articles   €180K   (60%)   Avg margin: 62.1%
BKAGG:  6 articles   €119K   (40%)   Avg margin: 43.8%

Top articles:
[ID]   €45K   48.2%   Zahnradpumpe
[ID]   €38K   55.1%   Elektro-Zahnradpumpe
[ID]   €32K   61.7%   Zahnradpumpe
```

Shows commodity group mix contribution to margin. "BKAGG portion (40% of orders) drags average margin down — BKAGG avg 43.8% vs BKAES 62.1%."

Click any article → opens SKU side panel (with breadcrumb).

---

### Section 6: Margin Gap — THIS CUSTOMER (NEW)

```
📐 MARGIN GAP (this customer)
Quoted: 71.7%     Actual: 53.7%     Gap: 18.0pp
vs portfolio avg gap: 1.9pp — 9× worse than average

"Gap driven by BKAGG product mix (40% of orders) where actual margins
run 14pp below quoted. Cost estimation for this customer's BKAGG orders
may be systematically too low."
```

**Key:** Don't just show the 18pp — explain WHY. Connect to product mix data from Section 5. The gap + the mix = the story.

---

### Section 7: Comparable Customers (NEW)

```
👥 SIMILAR CUSTOMERS (Enterprise, €200K-€400K revenue)
101139   €308K   65.2%   Win Rate: 48%    → benchmark
100922   €383K   61.6%   Win Rate: 52%    → benchmark
101043   €156K   72.8%   Win Rate: 50%    → outperformer

This customer: 53.7% margin, 21.4% win rate
vs peer avg: 65.2% margin, 48% win rate
Gap: −12pp margin, −27pp win rate
```

Same segment + similar revenue band (±50%). Benchmarks the individual against peers so the numbers aren't floating in a vacuum.

---

### Section 8: Risk Signals (NEW — synthesized)

```
⚠️ RISK ASSESSMENT
Revenue declining:     −54% YoY                    🔴
Win rate critical:     21.4% (3/14)                🔴
Margin gap extreme:    18.0pp (9× avg)             🔴
Product diversity:     14 articles (moderate)       🟡
Order recency:         [X months ago]              🟡/🟢

Overall: HIGH RISK
Recommendation: Account review — repricing conversation for BKAGG products

[Schedule Review →]   [Copy Brief →]   [View Full Profile →]
```

**[Schedule Review →]** creates a task if task management exists. If not, opens a pre-formatted email draft.

**[Copy Brief →]** copies to clipboard: "Customer 101728 · Enterprise · €299K · 53.7% margin · 21.4% win rate · 18pp margin gap · BKAGG mix driving margin erosion · Recommend repricing conversation."

**[View Full Profile →]** opens Customers page filtered to this customer.

---

### Section 9: Footer

```
[Open in Customers →]     (filtered to this customer)
```

---

## Search Dropdown

### Current State
Shows SKU and Customer results with colored badges. Works, but needs enrichment.

### Enhanced Result Preview

```
┌─────────────────────────────────────────────────────────┐
│  🔍  "pumpe"                           [All ▾] filter   │
│                                                          │
│  ── Result Type Tabs ──                                  │
│  [ All (47) ] [ SKUs (38) ] [ Customers (9) ]           │
│                                                          │
│  ── Commodity Group Pills ──                             │
│  [BKAES] [BKAGG] [BKAIZ] [SOPU] [All]                  │
│                                                          │
│  SKU  200372-A  Zahnradpumpe       €74.8K  69.5%  ● OK  │
│  SKU  201272    Elektro-Innenz..   €149K   41.1%  ● Crit │
│  SKU  205415-B  Elektro-Zahnr..   €261K   63.6%  ● OK   │
│  ───────────────────────────────────────────────────────  │
│  CUST 101728    Enterprise         €299K   53.7%  ● High │
│  CUST 104072    Enterprise         €104K   73.6%  ● Low  │
└─────────────────────────────────────────────────────────┘
```

**Additions:**
- **Revenue + Margin + Status badge** in each result row — no click needed to assess relevance
- **Result type tabs** (All / SKUs / Customers) — essential when a search like "101" returns both article IDs and customer IDs
- **Commodity group filter pills** — narrow results without clearing the search
- **Recent searches** — show last 5 searches below the input when dropdown opens with no query
- **"No results" state:** "No matches for '[query]'. Try searching by article ID, customer name, or product type."

---

## Panel Navigation

### Breadcrumb Trail

When panels nest (SKU → Customer or Customer → SKU), show:

```
← SKU 205415-B  →  Customer 104053
```

Click "← SKU 205415-B" to go back. Maximum nesting depth: 2 levels. If user tries to go deeper, open in full page instead.

### Panel Behavior

- Panels slide in from the right (standard side panel pattern)
- Clicking outside the panel or pressing Esc closes it
- Panel width: ~400px on desktop, full-screen on mobile/tablet
- Scroll within panel, page beneath is dimmed but visible
- "Pin" option to keep panel open while scrolling the main page (useful for comparing panel data with table data)

---

## Data Integrity Rules (applies to both panels)

1. **Every number must be entity-specific.** No portfolio averages presented as entity data. If showing a portfolio comparison, label it explicitly: "vs portfolio avg."
2. **Missing data = say so.** If quote data doesn't exist for an article, show "No quote data available" — not a zero or a blank.
3. **Synthetic data = remove.** If a field (Inventory, FX Risk, Demand Class) isn't sourced from real data pipeline, remove it from the panel. Add back when real integration exists.
4. **Stale data = flag.** If the panel's data is >30 days old, show: "Data as of [date] — may not reflect recent changes."

---

## Summary

| Panel | Change | Priority |
|---|---|---|
| SKU: Fix "Customers: 0" | Data bug | Critical |
| SKU: Fix Gap Analysis (portfolio → article-specific) | Data bug | Critical |
| SKU: Fix Revenue discrepancy (€303K vs €261K) | Data bug | Critical |
| SKU: Add Quote Performance section | New | High |
| SKU: Add Customer List (clickable, with concentration flag) | New | High |
| SKU: Add Price vs Cost Trend | New | High |
| SKU: Add Order Frequency & Recency | New | High |
| SKU: Add Margin Rank within group | New | Medium |
| SKU: Add Related/Similar SKUs | New | Medium |
| SKU: Remove Inventory if synthetic | Remove | Medium |
| Customer: Build full panel | New panel | High |
| Customer: Order Recency banner (prominent) | New | High |
| Customer: Quote Performance with interpretation | New | High |
| Customer: Product Mix with margin attribution | New | High |
| Customer: Margin Gap with cause explanation | New | High |
| Customer: Comparable Customers benchmark | New | Medium |
| Customer: Risk Signals with CTA buttons | New | Medium |
| Search: Add preview (revenue, margin, status) | Improve | Medium |
| Search: Add result type tabs + commodity pills | Improve | Medium |
| Navigation: Breadcrumb trail for nested panels | New | Medium |

---

## Open Decisions Before Build

1. **Panel width** — 400px sufficient for the data density? Test with real content.
2. **Related SKUs matching logic** — article prefix first, then type+group+revenue? Confirm with product team.
3. **Comparable Customers** — same segment + ±50% revenue, or tighter/looser bands?
4. **"Schedule Review" CTA** — task management integration exists? If not, email draft or clipboard-only for v1.
5. **Inventory section** — confirm real ERP data availability. Remove if synthetic.
6. **Nesting depth** — 2 levels max? Or allow deeper nesting with a "back" stack?
7. **Panel pinning** — include in v1 or defer?
8. **Search recent history** — per-user, persisted across sessions? Or session-only?
