# Pryzm — Investor Demo Script (7 minutes)
**Persona:** Pricing Controller / Sales Lead at Scherzinger (industrial pump manufacturer)
**Goal:** Show how Pryzm turns raw ERP data into margin, revenue and risk decisions in seconds.

Every number below matches the value rendered on the live demo screen.

---

## 0:00 — 0:30 — The Hook (before clicking anything)

> "Imagine you run pricing at a 100-year-old precision pump manufacturer. You sell to 411 customers, you issue four and a half thousand quotes a year — and you only win 37% of them. Today, your controller spends Monday morning building one report from SAP, Excel and emails. Pryzm does it before her coffee is poured. Let me show you."

Open browser → log in → **Dashboard**.

---

## 0:30 — 2:15 — Dashboard: the 30-second business health check

Land on **Dashboard Overview**. Time-range header is set to **FY 2025**.

> "Four numbers across the top tell our pricing controller if today is a good day or a bad day."

Walk the **KPI row** left to right:
- **Revenue FY 2025: €6.25M, +7.9% YoY** — "We rebounded from a soft 2024."
- **DB II Margin · FY 2025: 61.0%, ▼1.2pp YoY** — "But margin slipped 1.2 points. That orange marker is the story of this demo."
- **Margin Gap: 1.4pp, ▼0.7pp YoY (closing)** — "Quoted 71.9% vs Actual 70.5%. The gap between what reps promise and what we capture is finally narrowing — but a third of a percent on €6M is still real money."
- **Win Rate: 37.1% Quote-to-Invoice** — "Won €7.42M from 4,539 quotes."

Move down to the **three alert cards**:
- **Margin Erosion: −1.2pp** — helper reads *"Driven by BKAGG cost structure and mix shift."* "Pryzm has already attributed the decline to one product line."
- **High-Risk Customers: 87** — helper reads *"Critical + High only · €5.59M revenue exposed."* "Out of our active base, 87 customers — 22 critical, 65 high — represent €5.6M of revenue at risk. That's the call-list for the sales team this week."
- **Cost Regime: Plateau** — helper reads *"Input costs stable 6 months — pricing power window."* "After three years of input cost inflation, materials have been flat for six months. This is the moment to push prices up."

Now the **hero chart — Quoted vs Actual Margin**:

> "Four years of quoted margin in blue against actual realized margin in red. Look at FY22: we quoted 73.2%, captured 70.9% — a 2.3-point gap. FY24: quoted 72.9%, actual 70.9%, gap widened to 2.1. FY25: quoted 71.9%, actual 70.5%, gap down to 1.4. The gap is closing — that's pricing discipline working."

Right-side donut — **Revenue Distribution**:

> "Two product lines carry the company. Electric Gear Pumps — BKAES — 41% of historical revenue at a 67% margin. Standard Gear Pumps — BKAGG — 17% but only 54%. Same factory, 13 points of margin difference. That gap is where money is made or lost."

Glance at **Sales Activity Pipeline FY 2025**:

> "62 new quotes in the funnel, 86 actively quoted, 1,684 won this year, €7.42M won revenue."

And **Quote Conversion**:

> "37% win rate, +2.4pp YoY, target is 45%. Trending the right way — Q4 2024 actually hit 64.4%."

Quickly point at the **AI Highlights strip** at the bottom:

> "Pryzm has already written the headlines: margin alert, 87 customers at risk, forecast recovering, win rate climbing, cost-plateau pricing window. Each one is clickable. Let me follow the first one."

Click the red highlight → it deep-links to SKU **300143**.

---

## 2:15 — 3:30 — SKU Search & Products: drilling into the margin leak

The click drops us into **Products / SKUs**, SKU **300143 — Innenzahnringpumpe** open.

> "1,798 active SKUs across the company. Without AI, finding the bleeders is a week of pivot tables. Pryzm sent me directly to the worst offender."

Read the margin trend on the SKU card:

> "Look at this product's margin: **57.0% in 2022, 44.5% in 2023, 45.5% in 2024, 42.8% in 2025**. Declining four years straight. Pryzm flagged it 'at-risk' automatically. The cost breakdown shows materials at 47.8% of unit cost, hand-finishing — the FEK line — at 27.5%. We were getting squeezed on inputs and never repriced."

Use the search box → type **201924-F**, open it.

> "Same family, different story — Zahnradpumpe, 71.7% margin in 2022, stable trend, no flags. The pattern across our catalog: legacy quoted prices held steady while material costs climbed. Pryzm doesn't just show one product — it ranks every SKU by margin risk in one screen."

---

## 3:30 — 4:45 — Pricing & Quotes: the Pricing Command Center

Click **Pricing & Quotes**.

Glance at the **KPI strip** without dwelling:
- **Win Rate: 37.1%, +2.4pp YoY**
- **Revenue Lost (Pricing): €971K** — helper reads *"PA: €793,893 (competitor cheaper) + PR: €177,374 (price too high)"* — "Only the losses pricing changes can actually fix."
- **Open Pipeline: €958K open · Expected €355K**
- **Price Sensitivity: 1.8% (p=0.006, statistically significant)** — "Won quotes carry 1.8 points lower margin than lost quotes — and the p-value tells us this isn't noise."

Then move straight to the centerpiece — **Pricing Command Center**:

> "This is the single most important screen in the product. Every active SKU, ranked by risk, with a recommended price and a recovery number attached. Reactive tab — what to fix today. Proactive tab — what's about to break."

Point at the header strip:

> "Pryzm has flagged the Critical and High-priority articles, the average risk score, total revenue at risk, and the green Total Recovery number on the right — that's the EUR we believe we can recover by repricing this list."

Click the top row — let's say **300143 — Innenzahnringpumpe**. The row expands inline.

> "One click and the dropdown opens with everything I need to defend a price decision. Watch what's in here."

Read across the **Summary tab** detail boxes:
- **Article / Group:** 300143 / BKAGG
- **Current Price:** €608 — "Reverse-engineered from current cost and margin: €348 cost ÷ (1 − 42.8% margin)."
- **Recommended:** €696 (+€88, +14.5%) — "Target margin 50% at the same cost."
- **Annual Recovery:** ~€9K on this SKU alone — "Modest, but multiply across 60 reactive articles…"
- **Status:** *Cash Trap / Sunset Candidate* (badge) — "Pryzm classifies every SKU on a 2×2: margin trend × revenue trend. This one is bleeding."
- **Approval:** **Director** — "Because the gap to floor is between 5 and 8 points, this needs Director sign-off, not the rep."

Point at the **Methodology** line:

> "Below the boxes: 'Target margin 50% at current cost €348 = €348 / (1 − 0.500) = €696.' No black box. Every recommendation shows its math."

Point at the **Suggested Approach**:

> "And then a phased rollout — 'Phase 1: +€44 to €652. Monitor win rate for 2 quarters. Phase 2: +€44 if retained.' Reps don't have to guess how to take a price increase."

Click the **Cost Deep-Dive** tab.

> "Year by year — price, cost, margin, YoY change. This is where the rep sees that cost climbed every year while we kept the price flat. Pass-through ratio, leakage per unit — the diagnosis is right there."

Click **Quote & Competition** then **Customer Context** quickly.

> "Last 90 days of quotes on this SKU, who we lost to, which customers buy it, average discount they get. The whole context for repricing on one screen, in three clicks."

Collapse the row.

> "Now picture this for 1,798 SKUs every Monday morning. That's the platform."

---

## 4:45 — 5:45 — Forecasting: looking 12 months ahead

Click **Forecasting**.

Point at the **Overall Margin Forecast** card.

> "Current DB2 margin: **59.7%**. Our ensemble model — and we're transparent on the math, MAE and directional accuracy are shown right here — projects a stabilization at **60.4% in 12 months**, with a confidence band of 57.1% to 63.6%."

Point at the **Monte Carlo simulation**.

> "Ten thousand simulations. Probability of overall margin falling below 50% — the red line where the company stops being healthy — is **25.6%**. One-in-four. Manageable, but not ignorable. Now look at it by commodity group: BKAES, our crown jewel, only 16.9% probability. **BKAGG — our standard pumps — 61.0% probability of falling below 50%.** That's where the board needs to act."

Point at **Seasonal Patterns**.

> "December peaks at a seasonal index of 1.31 — 31% above average. So when we tell the sales team to push in Q4, that's not gut feel, it's a four-year statistical pattern."

---

## 5:45 — 6:45 — AI Insights: ask anything in plain language

Click **AI Insights**.

> "This is where Pryzm goes from dashboard to co-pilot. The left panel is an automated daily intelligence feed — the system already wrote the briefing for me overnight."

Read the top card aloud:

> "'DB2 margin trending down: 61.0%, declined from 63.8% in 2023. Three commodity groups under pressure. Recommended: review pricing on OFRLMG and MBDIV, set a 60% margin floor alert.'"

Click into the chat. Type:

> **"Which 5 customers should I call this week to protect revenue?"**

Wait for the answer to stream in. (Expected: ranks critical-risk customers by LTV, names Customer 101690 at €1.54M as the top concentration risk.)

> "That answer would have taken our controller two hours in Excel. It took Pryzm eight seconds. And — important — every number it cites is auditable, traceable back to the source row in SAP."

Type one more:

> **"What's our biggest pricing opportunity?"**

> "It tells us: reprice BKAGG into the 60–70% margin band. Addressable revenue €6.81M, recoverable margin in the high six figures. That's the recommendation that pays for the platform fifty times over."

---

## 6:45 — 7:00 — The Close

> "So what did you just see? In seven minutes, our pricing controller went from 'how is the business?' to 'this SKU is bleeding, this quote is worth chasing, this customer needs a call, and here is my Q4 plan.' Same data the company already owns. Pryzm is the layer that turns it into decisions."
>
> "Scherzinger is one factory. There are 8,000 mid-cap manufacturers in Germany alone with the exact same problem. That's the opportunity."

> **"Questions?"**

---

## Cheat Sheet — numbers you will see on screen

| Screen | Element | Value |
|---|---|---|
| Dashboard | KPI: Revenue FY 2025 | €6.25M (+7.9% YoY) |
| Dashboard | KPI: DB II Margin · FY 2025 | 61.0% (▼1.2pp YoY) |
| Dashboard | KPI: Margin Gap | 1.4pp (▼0.7pp, closing) |
| Dashboard | KPI: Win Rate | 37.1% · Won €7.42M / 4,539 quotes |
| Dashboard | Alert: Margin Erosion | −1.2pp |
| Dashboard | Alert: High-Risk Customers | 87 · €5.59M exposed |
| Dashboard | Alert: Cost Regime | Plateau |
| Dashboard | Hero chart: FY25 quoted vs actual | 71.9% vs 70.5% (gap 1.4pp) |
| Dashboard | Donut: BKAES / BKAGG share | 41% (67% margin) / 17% (54%) |
| Dashboard | Activity Pipeline FY 2025 | New 62 / Quoted 86 / Won 1,684 / Won Rev €7.42M |
| Dashboard | Quote Conversion | 37% (+2.4pp YoY, goal 45%) |
| Products | Active SKUs | 1,798 |
| Products | SKU 300143 margin trend | 57.0% → 44.5% → 45.5% → 42.8% (declining, at-risk) |
| Products | SKU 201924-F margin | 71.7% (stable) |
| Pricing | KPI: Win Rate | 37.1% (+2.4pp YoY) |
| Pricing | KPI: Revenue Lost (Pricing) | €971K (PA €794K + PR €177K) |
| Pricing | KPI: Open Pipeline | €958K open · €355K expected |
| Pricing | KPI: Price Sensitivity | 1.8% (p=0.006) |
| Pricing | Secondary: Avg Margin Gap | 1.9% |
| Pricing | Secondary: Linked Records | 1,313 |
| Pricing | Secondary: Avg Conversion Time | 67 days |
| Command Center | SKU 300143 — Current Price | €608 |
| Command Center | SKU 300143 — Recommended | €696 (+€88, +14.5%) |
| Command Center | SKU 300143 — Approval | Director |
| Command Center | SKU 300143 — Phase 1 step | +€44 → €652 |
| Forecast | Current → 12m margin | 59.7% → 60.4% (band 57.1–63.6%) |
| Forecast | Monte Carlo P(<50%) overall | 25.6% |
| Forecast | Monte Carlo P(<50%) BKAGG | 61.0% |
| Forecast | December seasonal index | 1.31 (+31%) |

---

## Pacing notes

- Total spoken length: ~1,050 words ≈ 7 minutes at 150 wpm.
- If running long: drop the second AI question (saves ~30s).
- If running short: expand on Customer 101690 concentration risk (€1.54M, 25% of FY25 revenue).
- Keep the cursor moving — don't dwell, the dashboard sells itself.
- Open the demo in a fresh tab beforehand so the dashboard is pre-rendered.
