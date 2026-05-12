# Pryzm Dashboard Redesign — Mockup Build Prompt

> Paste everything below this line into Claude Code as one prompt. It assumes you're starting fresh with no other context.

---

## What I'm asking you to build

Build me a **single-file HTML mockup** of a redesigned dashboard for a product called **Pryzm**. Self-contained: inline CSS, inline JS, no build step. Optional: load Chart.js v4 from CDN for one chart. No localStorage / sessionStorage — keep all state in memory. Light mode only.

The deliverable is one `.html` file I can open in a browser and click through. It is a **prototype to evaluate the redesign before I commit engineering time** — so it must look polished and feel real, but does not need real data or a backend.

## Context — what Pryzm is and why we're redesigning

Pryzm is a margin / pricing intelligence platform for German Mittelstand precision manufacturers. The pilot client is **Scherzinger** (a precision manufacturer). The data foundation is strong (5,565 invoices, 4,605 quotes, 89.3% quote-to-invoice linkage, 4 years of history, Monte Carlo forecasting with <5% error, margin leakage detection).

But the current product is "fancy Excel with capabilities" — 9 screens, ~30 KPIs each, no persona, no clear action, the strongest feature (forecasting) buried as menu item #5, and an AI Insights summary that reads "like a college intern wrote it."

A senior expert (ex-Amex, Amazon, L'Oréal) gave us this diagnosis: **corporates don't buy capabilities, they buy financial value, strategic value, and a story their manager can forward up the chain.** The redesign pivots from "show every KPI" to **"action-first dashboard with closed-loop feedback."**

## The two personas in this mockup

1. **Pricing Manager** (primary — design this view best). Daily user. Cares about: margin leakage per SKU, cross-customer price discrepancy, guardrails, pricing actions. Doesn't care about: order recency, win-rate (that's sales team's job).

2. **MD / Geschäftsführer** (secondary). Buyer. Sees the strategic narrative. Forwards the weekly summary up the chain.

Build a **persona toggle in the top-right header** that switches the Action Center home content between these two views. Both share the same left-nav.

## Navigation — left sidebar (5 items, same for both personas)

1. **Action Center** (home — opens by default)
2. **Forecast**
3. **Margin Intelligence**
4. **Quotes & Guardrails**
5. **AI Briefing**

Header (full width, top): Pryzm wordmark on the left; on the right — search icon (just visual, no real search), persona toggle (Pricing Manager / MD), user avatar circle with initials "SK".

---

## Screen 1: Action Center — Pricing Manager view (THE CRITICAL SCREEN — make this great)

This is the new home. It replaces the current generic "Dashboard Overview." Build it section by section, top to bottom:

### A. Strategic Value Banner (full-width hero card, dark navy background)
- Bold headline: *"In the next 12 months, your team will reduce margin leakage to <2pp on 80% of SKUs."*
- Sub-line in lighter color: *"Current state: 4.6pp gap on 60% of SKUs. Last 4 weeks: -0.3pp."*
- Small inline sparkline (12 weekly points) on the right side of the banner showing margin-gap trend.

### B. Financial Value — three counter cards in a row
1. **€ Captured YTD** — €147,300 — green, small "↑ €12,400 this week" caption
2. **€ At Risk** — €82,400 — amber, caption "from 24 un-actioned items"
3. **€ Open Opportunity** — €296,000 — blue, caption "next 90 days, requires action"

Each card has a small "View detail →" link in the bottom-right (no real navigation; just visual).

### C. Your 3 Actions This Week (centerpiece — spend the most design effort here)
Section heading: **"Your 3 actions this week — ranked by impact"**

Each action is a card with:
- **Top strip**: rank badge (1, 2, 3) | type tag (color-coded: Margin Leak = amber, Churn Risk = red, Price Increase = blue, Inventory = grey) | timestamp ("Generated Mon 8:00")
- **Headline** (large, bold): the recommended action in plain language
- **Rationale** (one line, smaller, grey): why Pryzm thinks this
- **Two-row metadata strip**: Expected Impact (€) | Confidence (High/Med/Low) | Customer ID | Article/SKU
- **4-option feedback buttons** (the most important UI element on the page):
  - `✓ Accept & Implement` (green outline)
  - `◐ Accept, Not Implemented` (amber outline)
  - `◑ Accept, Partial` (amber outline; clicking it reveals an input field "Actual value €___")
  - `✗ Reject` (red outline; clicking it reveals a dropdown with reasons: "Customer relationship", "Market conditions", "Strategic decision", "Pricing already addressed", "Other")
- **Assign to** dropdown (right side): Me (default) / Sales Rep — N. Bauer / Pricing Team / Controller — M. Klein
- **Comments** field (collapsible, "+ Add comment" link)

When a feedback button is clicked, it should visually mark as selected (filled instead of outlined) and the others should fade. Make this interaction feel real.

**Use these three mock actions** (do not invent others — they tie back to the rest of the mockup):

1. **Article 205415-B price gap**
   Headline: "Raise Article 205415-B from €4.10 to €4.38 for Customer 101580"
   Rationale: "Same article sold to Customer 102330 last month at €6.80, same volume tier. 66% price spread."
   Impact: €12,400/quarter | Confidence: High | Tag: Margin Leak

2. **Customer 101580 churn risk**
   Headline: "Send retention offer to Customer 101580 — order frequency down 40% in Q1"
   Rationale: "Largest single-customer ARR (€487K). Three consecutive months below 90-day rolling average."
   Impact: €48,000 ARR at risk | Confidence: Medium | Tag: Churn Risk

3. **Article 200832-E negative margin**
   Headline: "Increase Article 200832-E by 12% — currently at 8% margin, below 25% guardrail"
   Rationale: "539 DB II governance violations in Q1 on this SKU. Volume of 4,200 units/quarter."
   Impact: €18,600/year | Confidence: High | Tag: Margin Leak

### D. Insight of the Week (right-side card, anchored next to actions)
Heading: **"Insight of the week"**
Subhead (italic): *"Same article. Two customers. 66% price spread."*
Body: *"Article 200832-E sold to Customer 101580 at €4.10 last week. Same article, same volume tier, sold to Customer 102330 at €6.80 a month earlier. €4,800/quarter recoverable if 101580 priced to match peer benchmark."*
Button: `Investigate →` (when clicked, switches the main pane to Margin Intelligence — Tab 2: Cross-Customer Price Discrepancy)

### E. Cumulative Performance (below actions, full width)
Title: **"Last 90 days — recommendation outcomes"**

Five-stat strip:
- Recommendations made: **142**
- Accepted & Implemented: **47** → €421,000 captured
- Accepted, not implemented: **28** → €187,000 missed
- Partially implemented: **19** → €68,000 of €124,000
- Rejected: **48**

Below the strip: a **Chart.js line chart** showing two lines over 12 weekly points — "€ captured" (green) and "€ missed" (amber). Mock data — €0 to €60K range, generally upward trend on green, flatter on amber.

Caption row at the bottom of the chart, right-aligned: *"Forward this to your manager →"* with a button `Generate weekly report (PDF)` (no real export — just a button visual).

---

## Screen 2: Action Center — MD / Geschäftsführer view (alternate via persona toggle)

Same nav, **different home content**. When persona toggle is on "MD", the main pane shows:

### A. Strategic Health Headline (large card, navy background)
*"Pryzm is on track to capture €1.2M of margin opportunity in 2026. €421K captured YTD. €68K at risk this quarter."*

Below, smaller: *"Pricing Manager (S. Klein) has accepted 47 of 75 recommendations. 28 accepted but not implemented (€187K)."*

### B. Three Red-Flag Alerts (stacked cards)
1. 🔴 **BKAGG region**: Margin gap widened to -3.9pp. No actions taken in 14 days. 4 open quotes pending review.
2. 🟡 **Customer 101580** (largest customer): Churn signal triggered. €48K retention offer pending. 12 days since flag.
3. 🟡 **Article 200832-E**: 539 governance violations in Q1. Sales team consistently breaching guardrails by 6-9%.

Each red-flag has a small button `Email Pricing Manager →` that opens a mock mailto with a pre-filled body: *"Are you doing something about [topic]?"*

### C. 12-Month Forecast Band (chart card)
Chart.js area chart with three bands (conservative / primary / aggressive) over 12 months. Pre-filled mock data: revenue ranging €4M–€7M.
Sidebar callout: *"<5% error on Q1 2025 actuals. Walk-forward retraining. Monte Carlo bands."*

### D. Team Performance Table
Columns: Manager | Recommendations issued | Accepted | Implemented | € Captured | € Missed

Three rows:
- S. Klein (Pricing) | 75 | 47 | 38 | €421,000 | €187,000
- T. Hoffmann (Sales) | 42 | 31 | 22 | €184,000 | €76,000
- M. Becker (Controller) | 25 | 18 | 16 | €92,000 | €18,000

---

## Screen 3: Forecast (existing module, just promoted)

Simple placeholder content — does not need to be complex:

- Page title: "Revenue Forecast — Next 12 Months"
- Three filter chips: All Customers ▾ | All SKUs ▾ | All Regions ▾
- Big Chart.js area chart with conservative / primary / aggressive bands over 12 months (use placeholder Mittelstand data: monthly revenue €350K–€620K range)
- Below chart: 4 stat cards
  - Q1 2025 actual error: **<5%**
  - Methodology: Walk-forward + Monte Carlo
  - Models trained daily: 3 (gradient boosting, time-series FM, Bayesian)
  - Top driver: Repeat customers (top 20 = 80% of revenue)
- Footer note (italic, grey): *"Promoted from menu position 5 → 2 in this redesign. Crown-jewel feature."*

---

## Screen 4: Margin Intelligence (NEW — consolidates 3 current screens)

Tabbed interface:

### Tab 1: SKU Margin Leakage
Sortable table:
| Article | Description | Volume (units) | Quoted margin | Actual margin | Gap (pp) | Opportunity (€) |
|---|---|---|---|---|---|---|
| 200832-E | Precision shaft | 4,200 | 25% | 8% | -17pp | €18,600 |
| 205415-B | Coupling A | 1,840 | 32% | 24% | -8pp | €12,400 |
| 211094-C | Bearing housing | 980 | 28% | 22% | -6pp | €7,200 |
| 218750-D | Sleeve | 6,400 | 30% | 26% | -4pp | €4,800 |
| 205418-A | Coupling B | 2,100 | 31% | 29% | -2pp | €1,400 |

Header: "SKU-level margin leakage detection" + small caption: "Cross-checked against quoted vs invoiced prices."

### Tab 2: Cross-Customer Price Discrepancy
Sortable table — this is the screen the "Insight of the week" Investigate button lands on:
| Article | Customer A | Price A | Customer B | Price B | Volume tier | Spread % | Action |
|---|---|---|---|---|---|---|---|
| 200832-E | 101580 | €4.10 | 102330 | €6.80 | Tier 2 | 66% | [Review] |
| 205415-B | 101582 | €4.10 | 102801 | €5.50 | Tier 1 | 34% | [Review] |
| 211094-C | 103044 | €12.20 | 101900 | €15.40 | Tier 3 | 26% | [Review] |

Highlight the first row (200832-E) since it ties to the Insight of the Week.

### Tab 3: Customer Margin Trend
Customer table sorted by margin trajectory (worst first):
| Customer | YTD Revenue | YTD Margin | Trend (12 mo) | Status |
|---|---|---|---|---|
| 101580 | €487,000 | 18% | ↓ -6pp | 🔴 Action |
| 102330 | €312,000 | 26% | ↓ -2pp | 🟡 Watch |
| 103044 | €198,000 | 31% | → flat | 🟢 Healthy |
| 101582 | €176,000 | 24% | ↑ +1pp | 🟢 Healthy |

---

## Screen 5: Quotes & Guardrails

Two stacked tables:

### Active Quotes (top)
| Quote # | Customer | Article | Quoted Price | Margin | Guardrail Status | Action |
|---|---|---|---|---|---|---|
| 12847 | 102330 | 201104-G | €18.40 | 34% | 🟢 Above | Proceed |
| 12848 | 101580 | 200832-E | €4.20 | 8% | 🔴 Below | Escalate |
| 12849 | 103044 | 205415-B | €5.10 | 28% | 🟢 Above | Proceed |
| 12850 | 101900 | 211094-C | €13.80 | 19% | 🟡 Marginal | Review |

Each row has a clickable RAG dot (green / amber / red).

### Guardrail Breaches (last 30 days)
Small log entries — date | sales rep | quote # | breach type | resolution.

Footer note (italic): *"This same screen will become the Sales Rep traffic-light interface in Phase 1.5 — no separate sales view needed."*

---

## Screen 6: AI Briefing (replaces "AI Insights")

Single-column memo layout. Looks like a Monday-morning briefing email:

```
Monday Briefing — Pricing Manager — Week of Apr 27, 2026

Margin gap on DB2 deals widened 0.4pp last week, driven primarily by the BKAGG
region — three deals were priced 6-9% below guardrail. Recommend immediate review
of BKAGG quote pipeline before Friday: sales team has 4 open quotes that will
compound the gap if approved at current levels.

The biggest open opportunity remains Article 200832-E. Same article was sold to
Customer 102330 at €6.80 vs Customer 101580 at €4.10 — same volume tier, same
month. €18,600/year recoverable if 101580 pricing is aligned to the peer benchmark.

Next week, watch the Customer 101580 churn signal. Order frequency is down 40%
and the retention offer hasn't been sent yet. If frequency doesn't recover by
end of week 18, treat as confirmed churn and reroute to account management.
```

Below the memo, three sub-cards:

1. **What changed this week** — three bullets:
   - Margin gap on DB2 deals: +0.4pp (worsening)
   - 3 BKAGG deals breached guardrail
   - Article 200832-E discrepancy first detected

2. **Self-correction notes** (with badge: "Pryzm flagged itself"):
   - "Recommendation #128 (raise Article 220011-A by 8%) backfired — Customer 101900 reduced order volume by 22%. Suggested rollback to original price. Investigation ongoing."

3. **Pull request to a 10-year senior pricing manager voice** — caption that reads: *"This briefing is generated from your data, in the voice of a 10-year senior pricing manager. Replaces the previous 'AI Insights' page."*

---

## Visual style guide

- **Colors**:
  - Background: `#f8f9fb`
  - Card surface: `#ffffff` with `0 1px 3px rgba(15,23,42,0.06)` shadow + `1px solid #e2e8f0` border
  - Primary navy: `#1e293b` (header, hero banners)
  - Accent navy: `#1e3a8a`
  - Success green: `#059669`
  - Warning amber: `#d97706`
  - Error red: `#dc2626`
  - Info blue: `#2563eb`
  - Text primary: `#0f172a`
  - Text secondary: `#64748b`
  - Border: `#e2e8f0`
- **Typography**: System stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Type scale**: 28px headlines, 16px body, 13px captions, 11px labels (uppercase, tracked +0.05em)
- **Card radius**: 8px
- **Spacing**: 24px between top-level sections, 16px inside cards
- **Status dots**: filled circles 8px, color-coded
- **Buttons**: outline style for secondary actions, filled navy for primary
- **Icons**: emoji or unicode glyphs only — no icon library

## Interactions to implement

- Persona toggle (top right) actually swaps the Action Center home content between Pricing Manager and MD views. Other 4 screens stay the same.
- Sidebar nav items are clickable and switch the main pane.
- 4-option feedback buttons on each action: clicking marks one as selected (filled) and fades the others. Reject reveals a reason dropdown. Partial reveals an input field.
- Insight of the Week's "Investigate →" button switches to Margin Intelligence Tab 2 and highlights the matching row.
- Tabs in Margin Intelligence work.
- Hover states on all cards and buttons.
- No real backend, no real persistence. Refreshing the page resets state — that's fine.

## Things NOT to add

- No login screen
- No real data fetching
- No localStorage / sessionStorage (will not work in target environment — use in-memory state only)
- No animations beyond CSS hover transitions
- No dark mode toggle
- No additional personas (don't add Sales Rep, CFO, Controller, Inventory views — just MD and Pricing Manager)
- No icon libraries (Font Awesome, Lucide, etc.) — emoji and unicode only

## Mock data conventions to follow

- All € amounts realistic for German Mittelstand mid-market (€10K–€500K range for individual items, €1M–€10M annual revenue range)
- Article numbers: 6-digit + dash + letter (e.g. `205415-B`)
- Customer numbers: 6-digit (e.g. `101580`)
- Person names: German (S. Klein, N. Bauer, M. Klein, T. Hoffmann, M. Becker)
- Region codes: BKAGG (a German region code used by the real client)
- Dates: "Apr 27, 2026" or "27.04.2026"
- The numbers above (€147,300 captured, 4.6pp gap, 142 recommendations, etc.) should match exactly across screens — this is the same fictional Scherzinger snapshot.

## Deliverable format

One self-contained `.html` file. Should open in any modern browser and look complete. Keep total file under ~2,000 lines. Pricing Manager Action Center is the most polished view; the other screens can be simpler but functional. Light mode only.

When you're done, save it to my workspace folder and give me a `computer://` link to open it.

---

> End of prompt. Paste from the top into Claude Code.
