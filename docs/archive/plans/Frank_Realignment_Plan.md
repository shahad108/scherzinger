# Frank Realignment Plan — Pricing Analyst Cockpit

**Files**
- `Pryzm_Dashboard_Mockup.html` — ORIGINAL, untouched, for side-by-side comparison
- `Pryzm_Dashboard_Mockup_Frank.html` — WORKING COPY, edits land here only

**Scope of this round:** PM screen only (lines 1423–1655 in working copy: `<section id="screen-action-pm">`). All other screens (MD, SR, Forecast, Studio, Margin, Quotes, AI, MD-Monthly, MD-Beirat) stay untouched until their own rounds.

**Persona toggle change:** button `data-p="pm"` label "Pricing Manager" → "Pricing Analyst (Frank)". Header greeting "Good morning, Markus." → "Good morning, Frank." Crumb "Action Center · Pricing Manager" → "Analyst Cockpit · Pricing Analyst / Head of Controlling".

**Default assumptions (resolving the 4 open questions, can be overridden):**
1. Movable-vs-locked share — derived from `price_governance.price_rules.violations` plus a small clearly-labeled mock overlay ("est. movable share, pilot estimate")
2. A/B test entries — 2 mocked on real SKUs (`205418-A` slice 12% day 9/21; `211094-C` slice 8% day 3/14), labeled "demo A/B test"
3. Toggle label — "Pricing Analyst (Frank)"
4. Display name — "Frank" (no last name)

---

## The 13 sections (top → bottom in Frank's home)

### 1. Header rewrite
- Greeting → "Good morning, Frank."
- Crumb → "Analyst Cockpit · Pricing Analyst / Head of Controlling"
- Persona pill → "Pricing Analyst (Frank)" (replaces "Pricing Manager")
- Right-side "Suggested forward" line → "Send to Till (MD)" + "Push to Heiko (Sales)"

### 2. Movable-revenue hero (replaces strategic value banner)
- Headline: *"€X.XM of revenue is movable. €Y captured YTD on the movable share."*
- Sub: *"Locked under contract: €Z.ZM (XX%). Pilot estimate, refined per cluster."*
- Right-side mini sparkline = 4-yr quoted-margin trend from `price_governance.price_history_with_margin`
- **Data:** sum of revenue from `dashboard_data.annual_summary[2025]`, movable% derived from violation density

### 3. Model Trust Strip — 4 tiles
| Tile | Source | Click → |
|---|---|---|
| Churn model F1 | `ml_analytics.churn_prediction.f1` | drawer: feature_importance bars + last_trained + next_scheduled |
| Forecast error (Q1 actuals) | "<5%" caption + `forecasting.json` | drawer: walk-forward methodology + per-month error |
| Anomalies caught | `ml_analytics.anomaly_detection.total_anomalies` | drawer: cost vs quote anomaly split |
| Data coverage | `ml_analytics.data_coverage` (Invoice 99.2%) | drawer: per-source coverage table |

The drawer is the critical Frank-trust feature: per-cluster confidence + explainability. Single shared drawer, content swaps by tile.

### 4. Lost-Quote Differential card (the +5pp / p<0.001 finding)
- Big stat: won_avg_margin vs lost_avg_margin from `pricing_analysis.price_sensitivity`
- Significance pill: "p = 0.0006 · statistically significant" (green)
- One-line plain-language interpretation
- Tag: "shared with Heiko (Sales) and Till (MD)"

### 5. Today's Analyst Decisions (replaces "Your 3 actions this week")
Reuse the 3 existing action-card slots BUT reframe each card:
- Top strip adds: cluster confidence badge ("Cluster confidence: 87%") + contract chip (Movable / Locked)
- Bottom row adds 5th button: `🧪 Slice as A/B test` (alongside Accept Implement / Accept Not / Partial / Reject)
- Section heading: "Today's analyst decisions — ranked by impact"
- Caption: "Frank analyzes; outputs flow to Heiko (Sales) and Till (MD)."

### 6. SKU Pricing Engine table (NEW — large card)
- Source: join `products_detail.declining_fast` + `pricing_analysis.gap_analysis` + `article_customers`
- Columns: Article · Commodity · Cluster confidence · Catalog vs Quoted · Movable share · Action
- **Relevance filter toggle** at top: "Hide contract-locked items" (default OFF)
- Row click → links to existing Pricing Studio screen (no re-implementation)

### 7. Heterogeneous portfolio diagnostics
- Small heatmap from `pricing_analysis.commodity_margin_heatmap`
- Cell click → tooltip with cluster confidence + sample size + flag for "low-n cluster, do not auto-act"

### 8. Long-tail coverage strip
- Top-10 concentration % (from `products_detail.kpis.top10_concentration_pct`)
- B/C SKU count vs A SKU count
- "Model-covered" vs "uncovered" gap as horizontal bar

### 9. Annual List-Price Negotiation Cockpit (collapsible — closed by default)
- Composite card combining:
  - 4-yr list/quoted/discount/margin trend (`price_governance.price_history_with_margin`)
  - 8-commodity trajectory mini-charts (`commodities.json`)
  - Market-direction summary line
- Caption: "Once-a-year deliverable. Synthesized prep for list-price negotiations."

### 10. A/B Test Tracker
- Small list, 2 mock entries on real SKUs
- Each entry: SKU · slice % · day X of Y · pre→post margin · confidence (or "n too small")
- Button: "+ Start new A/B"

### 11. Why we lose (rejection codes ranked)
- Source: `pricing_analysis.rejection_codes`
- Ranked list with revenue_lost
- KA "No information" called out as **data-quality issue analyst should fix** (51.7% of lost revenue → opportunity)

### 12. Audit trail (last 30 days)
- Compact log: timestamp · author · action · pre→post
- Seeded from `ml_analytics.training_history` + `price_governance.price_rules` + a few mocked recent entries (clearly mocked)

### 13. Generate branded report (footer)
- Two buttons: `📄 Branded PDF — corporate design` and `📊 Send to Till (board pack)`
- Caption: "Reports auto-generated in Scherzinger corporate design. Audit trail attached."

---

## What gets removed from current PM screen
- "3 actions this week" headline → "Today's analyst decisions"
- "Sales rep watchlist" block (lines ~1560–1600 area) → moves out (belongs to Heiko's round)
- "Forward this to your manager → Generate weekly report (PDF)" block at bottom (kept but reworded for Frank's voice)
- Markus / Pricing Manager labels → Frank / Pricing Analyst replacements

## What gets KEPT from current PM screen
- "Last 90 days — recommendation outcomes" performance strip + chart (still useful for Frank, reframe heading)
- Action card visual treatment (Accept/Reject buttons, assign-to dropdown, comments) — extend, don't replace
- All CSS variables and shared utility classes
- Persona toggle JS logic (just relabel)

## Build sequence
1. Persona toggle relabel + header rewrite (low risk)
2. Movable-revenue hero (replaces existing banner in-place)
3. Model trust strip + drawer (NEW above existing financial cards)
4. Lost-quote differential card (NEW)
5. Reframe 3 action cards (extend existing, don't rewrite)
6. SKU pricing engine table (NEW after actions)
7. Heterogeneous portfolio diagnostics (NEW)
8. Long-tail coverage strip (NEW)
9. Annual list-price negotiation cockpit, collapsible (NEW)
10. A/B test tracker (NEW)
11. Rejection codes ranked (NEW)
12. Audit trail (NEW)
13. Branded report footer (replaces existing forward block)

After each section: visual diff against original by switching files in browser.

## Data wiring approach
- Inline a small JS object `FRANK_DATA = {...}` near top of script block, populated by reading the relevant `frontend/src/data/*.json` files at edit-time and pasting actual values
- No fetch / no XHR — keeps single-file constraint
- Each value annotated with source comment

## Out of scope (this round)
- Heiko (SR) screen — next round
- Till (MD) screen — round after
- Forecast / Studio / Margin / Quotes / AI / MD-Monthly / MD-Beirat — untouched
- Cross-features pass (market data, churn risk, ROI tile) — final round
