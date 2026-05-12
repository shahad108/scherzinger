# Dashboard Overview — Redesign Plan

**Goal:** One focused Dashboard Overview page. Every element earns its pixel. No vanity metrics, no duplication with detail pages.

**Principle:** The dashboard exists to surface *the margin gap*. That is Pryzm's reason to exist — every other element supports or contextualizes it.

---

## Page Structure

### Global header (new)
- Time-range selector: **FY** (default) · QTD · MTD · Custom
- "Last updated: [timestamp]" right-aligned
- Keeps the rest of the page honest about what period it represents.

---

### Row 1 — KPI Cards (4)

| Card | Value | Subtitle |
|---|---|---|
| Revenue FY | €6.25M | +7.9% YoY · monthly sparkline |
| DB II Margin | 61.0% | ▼1.2pp YoY · 4-year sparkline |
| **Margin Gap** | **X.Xpp** | Quoted vs Actual · direction arrow (shrinking = good) |
| Win Rate | 37.1% | Won €7.42M from 4,539 quotes |

**Removed:** Active Customers ("411 entities" is not actionable).

**Open question:** Frame Margin Gap as *closing* (positive trend, 9.7→8.5→7.2pp) or *remaining* (7.2pp still lost per deal). Pick one voice and stick to it across the page.

---

### Row 2 — Alert Cards (3)

| Card | Value | Subtitle |
|---|---|---|
| 🔴 Margin Erosion | −3.0pp | "Driven by BKAGG cost structure and mix shift" |
| 🟠 High-Risk Customers | 87 | "Critical + High only · €X.XM revenue exposed" |
| 🟡 Cost Regime | Plateau | "Input costs stable 6 months — pricing power window" |

**Change from draft:** Risk card shows Critical+High only (87), not 683 (which included Medium and was noisy). Cost Regime gets a one-line "so what."

---

### Row 3 — Hero Chart Row

| Position | Chart | Purpose |
|---|---|---|
| Left (2/3) | **Quoted vs Actual Margin Trend** — dual line by quarter, shaded gap between | The single most important chart. The gap is the story. |
| Right (1/3) | **Revenue Distribution donut** | Labels: "BKAES · Rev 68% · Margin 68%" vs "BKAGG · Rev 28% · Margin 54%". Mismatch is instantly legible. |

---

### Row 4 — Pipeline + Conversion

| Position | Element |
|---|---|
| Left (1/2) | **Sales Activity Pipeline** — 62 new → 86 quoted → 1,684 won → €7.42M. *Label time windows clearly if funnel numbers don't reconcile.* Consider adding quote-aging indicator (# open quotes >30d). |
| Right (1/2) | **Quote Conversion** — 37% (goal 45%, +2.4pp YoY). Subtitle: "Win rate trending up — 64.4% in Q4 2024" |

---

### Row 5 — Top 10 Customers Table

**Columns:** Name · Revenue · Avg Margin · Margin Trend (↑→↓) · Win Rate · Risk Tier · Revenue at Risk (for High/Critical only)

**Removed:** Customer ID, Invoice count (not glance-actionable).

**Added vs draft:** "Revenue at Risk" column — more actionable than per-customer win rate alone.

**Footer:** "View all customers →" links to Customers page.

---

### Row 6 — AI Highlights (3 lines, not 6 cards)

```
🔴 Margin Alert: DB2 declining 1.2pp YoY, BKAGG primary driver     [View →]
🟡 87 customers at High/Critical risk — €X.XM revenue exposed      [View →]
🟢 Win rate recovering: 64.4% in Q4 2024, up from 11.4% in Q3 2023 [View →]
```

Full analyses live on the AI Insights page.

---

## What Got Removed (and where it went)

| Element | New home |
|---|---|
| Monthly Revenue bar chart | Revenue & Margins page |
| 6 large AI Intelligence cards | AI Insights page (3-line summary stays) |
| Risk Distribution donut | Customers page |
| Active Customers KPI | Dropped entirely |

---

## Final Count

4 KPIs · 3 alerts · 2 hero charts · 1 merged pipeline row · 1 streamlined table · 3 AI headlines · 1 global time-range selector.

---

## Open Decisions Before Build

1. Margin Gap voice: "closing" vs "remaining"?
2. Pipeline funnel numbers — single time window or labeled windows?
3. Include optional "Biggest Margin Movers" strip (3 up / 3 down QoQ)? High signal if space allows.
4. Revenue at Risk calculation method — confirm with data team.
