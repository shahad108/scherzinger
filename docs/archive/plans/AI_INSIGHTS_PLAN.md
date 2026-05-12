# AI Insights Page — Redesign Plan

**Goal:** Transform from an empty chatbot window into a daily intelligence briefing with a follow-up analyst. The page should have value before anyone types anything.

**Principle:** When Manuel opens this page, insights should be waiting for him — not an empty text box. The AI should know the business, connect dots across data, and speak in Scherzinger-specific terms.

**Core reframe:** Intelligence Feed (pre-generated, ready on arrival) + AI Chat (for follow-up questions). Not a search bar — a briefing room.

---

## Page Layout

**60/40 split:**
- Left 60%: Intelligence Feed — pre-generated reports, ranked by severity
- Right 40%: AI Chat — conversational follow-up with memory

---

## Left Panel: Intelligence Feed (60%)

### Report Types

| Report | Content | Frequency | Trigger |
|---|---|---|---|
| **Weekly Margin Brief** | "DB2 at 61.0%, down 0.3pp. BKAGG drove the decline. 3 new articles fell below 45% floor. Customer 101580 lost 2 more quotes (€48K)." | Weekly (Monday AM) | Scheduled |
| **Pricing Action Summary** | "11 critical SKUs pending review. Total recovery potential: €217.9K. 4 items critical >30 days without action." | Weekly | Scheduled |
| **Churn Early Warning** | "Customer 101580 revenue down 96% YoY (€371K→€15K). 0% win rate on last 5 quotes. Recommend immediate account review." | When triggered | Rule: revenue drop >50% YoY + declining win rate |
| **Cost Alert** | "Article 200832-E material cost +56% since 2022. Now at negative margin (−1.3%). Supplier renegotiation or discontinuation recommended." | When triggered | Rule: article margin <5% OR cost increase >30% YoY |
| **Win Rate Signal** | "Win rate recovered to 64.4% in Q4 2024 — strongest in 3 years. BKAGG leading the recovery at 66.7%." | When triggered | Rule: win rate crosses above/below threshold |
| **Pipeline Alert** | "€957.8K in open pipeline. 12 quotes >30 days without response. 3 quotes >€50K pending." | Weekly | Scheduled |

### Feed Ranking (severity-first, then recency)

1. 🔴 Critical alerts (churn warning, cost alert with negative margin)
2. 🟠 Action-required (pricing overdue, pipeline aging)
3. 🟡 Weekly briefs (margin, pricing summary)
4. 🟢 Positive signals (win rate recovery, new customer revenue)

Color-code left border of each card to match. Same visual language as Dashboard AI Headlines.

### Report Architecture

**Decision:** Rule-based triggers, LLM-written copy.
- **Triggers** are deterministic (if margin < 0% → fire alert). Trustworthy, testable, no hallucination risk.
- **Copy** is LLM-generated from pre-computed data. Natural language, readable, specific.
- The LLM does NOT decide *what* to report — it decides *how* to say it. The rules engine decides what's important.

### Card Interactions

Each card includes:
- **[Expand →]** — shows full report with supporting data, charts, numbers
- **[View in {Page} →]** — links to the relevant page (Pricing, Customers, Revenue & Margins)
- **[Ask about this →]** — opens the chat with this report's context pre-loaded
- **[👍 / 👎]** — feedback on report relevance (if a report type gets no engagement for 4+ weeks, deprioritize it)
- **[Export PDF]** / **[Email to team]** — share reports outside the platform

### Report Customization

Allow users to:
- Pin/unpin report types (pinned always show at top)
- Set frequency preferences (daily digest vs individual alerts)
- Role-based defaults: exec sees margin brief first, KAM sees churn alerts first, pricing analyst sees pricing actions first

---

## Right Panel: AI Chat (40%)

### Chat Header

Collapsible **"Recent Chats"** dropdown (not a permanent sidebar — saves space for the chat itself):
- Margin deep-dive (5 msgs) — Apr 3
- BKAGG pricing (3 msgs) — Apr 1
- Customer 101580 (2 msgs) — Mar 28
- [+ New Chat]

### Suggested Prompts

**Dynamic, not static.** Prompts update based on current Intelligence Feed content and recent data changes.

**Static fallbacks** (Scherzinger-specific, replace generic ones):

| Current (generic) | Replace with |
|---|---|
| "What is our overall margin performance?" | "Why is BKAGG margin 14pp below BKAES?" |
| "Which commodity groups have the highest margins?" | "Which 5 articles have the highest repricing potential?" |
| "Show me the quote win rate trend" | "Walk me through the Q3 2023 win rate collapse and recovery" |
| "Which customers are at highest risk?" | "Build a retention plan for Customer 101580" |
| "What's driving the margin decline?" | "How much margin would we recover if we reprice the top 10 bleeders?" |
| "Cost inflation analysis by commodity" | "Why is article 200832-E losing money and what should we do?" |
| "Total margin recovery potential by action" | "Prepare a quarterly pricing review brief for Manuel" |
| "Full FY26 forecast with confidence intervals" | "What's the impact of a 5% BKAGG price increase on win rate?" |

**Dynamic prompt generation:** When a churn alert fires for Customer X, a new prompt appears: "Build a retention plan for Customer X." When a cost alert fires for Article Y, prompt becomes: "What should we do about Article Y's cost increase?" Prompts rotate with the data.

### Context Architecture

**Tiered context, not a massive system prompt:**

| Tier | Content | Size | When loaded |
|---|---|---|---|
| Always loaded | Data brief: 20 key metrics, top 5 bleeders, top 5 risk customers, current KPIs, recent alerts | ~2K tokens | Every conversation |
| Topic-triggered | Customer detail, article history, commodity breakdowns | Variable | When user asks about specific entity |
| On-demand retrieval | Full data tables, historical series, quote-level detail | Variable | RAG lookup when needed |

The "always loaded" brief ensures every response is grounded. Topic-triggered and on-demand layers keep the context window manageable.

### AI Response Quality Standards

The AI should NOT produce generic analyst-speak. Quality bar:

| Bad (generic) | Good (Scherzinger-specific) |
|---|---|
| "Margin declined in 2024. Consider investigating cost drivers." | "Margin declined 1.6pp in 2024 WHILE revenue grew 7.9% — classic mix-shift signal. BKAGG's revenue share grew from 26% to 29% while its margin is 14pp below BKAES. Mix shift alone accounts for ~0.4pp of the decline." |
| "Investigate overhead cost escalation." | "Article 200832-E's material cost is 48.7% of revenue (vs 15% BKAGG average). This single article drags BKAGG margins. Renegotiate with supplier or discontinue — annual impact: €2K at current volume, but signals broader sourcing risk across 3 related Zahnradpumpe SKUs." |
| "Customer X shows signs of churn risk." | "Customer 101580 went from €371K (2022) to €15K (2024) — effectively churning. They're still quoting (51 quotes, 39.2% win rate) but losing €2.78M in opportunities. The won margins (83.7%) vastly exceed lost margins (72.5%), meaning they lose only on competitive deals. This is active displacement by a competitor, not disengagement." |

Ensure the system prompt includes instructions to: cite specific numbers, connect cross-page dots, name specific articles/customers, and explain the "so what."

### Conversation Memory

- Pass full message history with each API call.
- **Soft cap at 8–10 turns:** after turn 8, show nudge: "This conversation is getting long. Start a fresh chat for a new topic — this one is saved." User can continue if they want.
- Persist conversations to "Recent Chats" dropdown.
- When topic shifts significantly mid-conversation, suggest: "This seems like a new topic. Want to start a fresh chat?"

---

## Bottom Strip: Quick Prompts with Context

```
💡 Based on this week's data:
"Walk me through the Q3 2023 win rate collapse"
"Build a repricing plan for the top 5 BKAGG bleeders"
"Compare customer 101690 vs 100883 margin trajectories"
```

These rotate based on Intelligence Feed content and data recency. Not hardcoded.

---

## Notification Integration (mark for future phases)

Critical alerts shouldn't wait for Manuel to visit the page. Design alert cards with a **"Notify me"** toggle now, wire to email/Slack later.

| Alert Type | Notification Channel | Phase |
|---|---|---|
| Churn Early Warning (high-value) | Email + in-app | Future |
| Cost Alert (negative margin) | Email + in-app | Future |
| Pricing Action Overdue (>30 days) | In-app only | Future |
| Weekly Brief | Email digest | Future |

Design the toggle into the card UI now so it's ready when notification infrastructure exists.

---

## Feedback System

### On pre-generated reports:
- 👍 / 👎 per report card
- If a report type gets <10% engagement over 4 weeks, auto-deprioritize
- If 👎 rate >30% on a report type, flag for template review

### On AI chat responses:
- 👍 / 👎 per response
- "Was this answer specific enough?" follow-up on 👎
- Feed into system prompt refinement

---

## Removed from Current Page

| Element | Status |
|---|---|
| Empty chat window with generic prompts | Replaced by Intelligence Feed + contextual chat |
| 6 large AI Intelligence cards (from Dashboard) | Compressed to 3-line summary on Dashboard; full reports live here |
| Generic suggested prompts | Replaced with Scherzinger-specific, dynamically rotating prompts |

---

## Final Structure

| Element | Status |
|---|---|
| Intelligence Feed (left 60%) — severity-ranked, pre-generated reports | NEW |
| AI Chat (right 40%) — contextual, memory-enabled, Scherzinger-specific | REWORKED |
| Dynamic suggested prompts — rotate with data | NEW |
| Report cards with expand/link/ask/export actions | NEW |
| Feedback loop (thumbs up/down on reports + responses) | NEW |
| Notification toggles on alert cards | DESIGNED (wired in future phases) |
| Report customization (pin/unpin, role-based defaults) | NEW |

---

## Open Decisions Before Build

1. **Report generation pipeline** — rule-based triggers + LLM copy confirmed? Or fully rule-based (templates with variable substitution)?
2. **LLM provider for chat** — same model as report generation, or separate? Latency requirements for chat vs batch reports differ.
3. **Context brief refresh frequency** — daily? Real-time? Stale brief = stale answers.
4. **Dynamic prompt generation** — fully automated from feed, or curated weekly by the team?
5. **Export format** — PDF only, or also email-formatted HTML?
6. **Role-based defaults** — how many roles? (Exec / KAM / Pricing Analyst / Operations). Map each to a default report priority order.
7. **Notification infrastructure** — email provider, Slack integration, or both? Affects "Notify me" toggle scope.
8. **Conversation storage** — how long to retain? Per-user or shared across team? Privacy implications.
9. **Feedback action threshold** — at what 👎 rate does a report type get auto-deprioritized? (suggested: 30% over 4 weeks)
