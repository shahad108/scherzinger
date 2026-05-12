# ML Analytics Page — Redesign Plan

**Goal:** This page exists to build trust, not to impress. It answers one question: "How reliable are these predictions?" Every element should increase or honestly qualify confidence in the models. If a model isn't ready, say so.

**Audience:** Manuel or a technically-minded stakeholder. Not daily-use — consulted when someone asks "can I trust the churn flag on Customer X?"

**Principle:** A model that flags 710 out of 827 customers as at-risk isn't discriminating — it's predicting the majority class. Be honest about what works, what's learning, and what's not ready. Scherzinger's team will respect transparency over polish.

**Nav placement consideration:** This is a transparency/debugging page. Most users consume model outputs on the Customers page (risk tiers) and Forecasting page (projections). Consider: keep in nav but as last item, or accessible via "Model Details →" links from output pages. Product decision — flag for discussion.

---

## Page Structure

### Global header
- Model selector: Churn Model · Forecast Model · Anomaly Detection (filter the page to one model's details, or show all)
- "Models last updated: [date]" — right-aligned

---

### Row 1 — KPI Cards (4, reframed for honesty)

| # | Current (remove) | Replace with | Value | Notes |
|---|---|---|---|---|
| 1 | Churn Model Accuracy: 78% | **Churn Model: 78%** | 78% accuracy | Subtitle: "Base rate: 58%. Lift: +20pp." If lift is small, the model isn't adding much over "predict everyone churns." Also show: "Precision on >€50K customers: X%" — break out where it matters. |
| 2 | At-Risk Customers: 710 | **High-Confidence At-Risk** | XX customers | Only: >€10K LTV AND >80% probability. Add: "(model precision at this threshold: Y%)." 710/827 is not useful — this filters to the actionable set. |
| 3 | Revenue at Risk: €9.81M | **Material Revenue at Risk** | €X.XM | "From top 20 at-risk accounts." Concentrated on customers that matter — not micro-accounts inflating the total. |
| 4 | Anomalies Detected: 33 | **Keep: 33 anomalies** | 33 | Genuinely useful. Add subtitle: "15 negative-margin · 18 missing-data" |

---

### Row 2 — Model Performance (honest transparency section)

**Left (1/2): Churn Model Performance**

**Summary card** (always visible):

| Metric | Value |
|---|---|
| Accuracy | 78% |
| Base Rate | 58% (a "predict all churn" model gets 58% for free) |
| Lift over Baseline | +20pp |
| Precision (overall) | X% |
| Recall (overall) | X% |
| F1 Score | X% |

**Accuracy by customer segment:**

| Segment | Accuracy | Precision | Note |
|---|---|---|---|
| Enterprise | X% | X% | "Hard — where it matters most" |
| Mid-Market | X% | X% | |
| SME | X% | X% | |
| Occasional | X% | X% | "Easy — one-time buyers mostly churn" |

**Precision at top-K:** "Of the top 20 predicted churners with >€50K LTV, how many actually churned?" — this is the metric Manuel cares about.

**Expandable drawer — "Technical Details":**
- Confusion matrix (TP/FP/TN/FN)
- ROC curve or precision-recall curve
- Threshold calibration plot

Keep the technical detail accessible but not front-and-center. Summary card = Manuel. Drawer = data scientist.

---

**Right (1/2): Forecast Model Performance**

Table with honest status flags:

| Model | MAE | RMSE | Directional % | Status |
|---|---|---|---|---|
| Model A | 0.032 | 0.048 | 45.5% | ⚠️ Below threshold |
| Model B | 0.024 | 0.035 | 54.5% | ✅ Best — used for 3M projections |
| Model C | 0.089 | 0.102 | 9.1% | 🔴 Not deployed — worse than random |
| Ensemble | 0.045 | 0.060 | 9.1% | 🔴 Not deployed — in development |

**Deployment threshold line:** "Minimum for production use: 60% directional accuracy. No model currently meets this bar. Forecasting page uses trend projections, not ML, until models improve."

This is the most important sentence on the page. It connects the ML Analytics page to the Forecasting page's "honest trend projections" approach.

---

### Row 3 — Churn Predictions Table (MAJOR FIX)

**Critical change:** Sort by **Revenue at Risk** (LTV × Churn Probability), NOT by probability.

**Filter bar:** "Show only: >€50K LTV · >€10K LTV · All" — default to >€10K so micro-accounts don't clutter the view.

| Customer | Revenue | Churn Prob | Revenue at Risk | Last Order | Margin Trend | Products | Recommended Action | Why |
|---|---|---|---|---|---|---|---|---|
| 101690 | €1.54M | 35% | €539K | 1mo ago | ↓ Declining | 15 | Account review | Margin eroding, high value |
| 101580 | €726K | 65% | €472K | 3mo ago | ↓ Declining | 8 | Reprice conversation | Active quoting but losing, €2.78M lost quotes |
| 100883 | €1.18M | 25% | €295K | 2mo ago | → Flat | 12 | Monitor | Stable but below-avg margin |
| ... | | | | | | | | |

**Columns added:** Last Order (strongest real-world churn signal), Margin Trend, Products (count — single-product = higher churn risk), Recommended Action, Why (brief reason).

**Action logic** (derived, not hardcoded):
- Declining margin + active quoting → "Reprice conversation"
- No orders >6 months + high LTV → "Win-back campaign"
- Single product + declining volume → "Cross-sell opportunity"
- Margin stable + low churn prob → "Monitor"

Show the "why" so users understand and trust the recommendation.

Click-through: row click → Customer detail on Customers page.

---

### Row 4 — Anomaly Detection (KEPT, improved)

**Summary strip:**
- 15 negative-margin invoices (€XK revenue)
- 18 missing-margin records
- XX cost anomalies (NEW)

**Cost anomalies** (NEW): articles where cost-to-revenue ratio deviates >2 standard deviations from their commodity group average.

| Article | Cost/Rev Ratio | Group Average | Deviation | Revenue |
|---|---|---|---|---|
| 200832-E | 48.7% material | 16.9% (BKAGG) | +31.8pp | €162K |
| ... | | | | |

200832-E at 48.7% material cost vs 16.9% group average is a screaming anomaly. Surface it.

**Quote anomalies** (NEW): quotes where quoted margin is >20pp away from the customer's historical average. Flags potential pricing errors or deliberate undercutting BEFORE the quote goes out. Makes anomaly detection forward-looking.

**Detail table:** expandable — which specific invoices/articles are anomalous, with investigation status.

---

### Row 5 — Feature Importance (NEW, replaces BCG Matrix + Margin Classification + Revenue YoY)

**Left (1/2): Churn Model Feature Importance**

Horizontal bar chart — top 10 features by importance weight.

Example (illustrative — use actual model features):
1. Order recency (months since last invoice)
2. Margin trend slope (pp/yr)
3. Product count (unique articles)
4. Quote win rate (trailing 12mo)
5. Revenue trend (YoY change)
6. Segment (Enterprise/SME/etc.)
7. Payment terms
8. Quote frequency
9. Commodity group concentration
10. Average order size trend

**Why this matters:** Builds trust ("the model uses sensible signals") AND gives actionable insight ("single-product customers churn 3× more — so cross-sell"). Turns model transparency into business strategy.

---

**Right (1/2): Forecast Model Feature Importance**

Same format. What drives margin forecasts?
- Material cost trend
- Commodity mix shift
- Seasonal index
- Volume trend
- Customer concentration changes

---

### Row 6 — Model Changelog & Data Coverage (NEW)

**Left (1/2): Training History**

| Model | Last Trained | Training Window | Data Points | Next Scheduled |
|---|---|---|---|---|
| Churn Model | 2024-11-15 | 2022-Q1 to 2024-Q3 | 827 customers | 2025-Q1 |
| Forecast Model B | 2024-10-01 | 2022-Q1 to 2024-Q2 | 12 quarters | 2025-Q1 |
| Anomaly Detection | 2024-12-01 | Rolling 12mo | 18,462 invoices | Monthly |

**Why:** If the churn model was trained on 2022–2023 data and hasn't seen 2024, its predictions on 2024 customers are extrapolations. Technical stakeholders will ask this immediately.

---

**Right (1/2): Data Coverage**

| Feature Category | Coverage | Note |
|---|---|---|
| Invoice data | 99.2% | Strong |
| Margin history | 89.4% | Some articles missing cost data |
| Quote data | 73.1% | Gap — not all quotes captured |
| Customer metadata | 95.8% | Strong |
| Product attributes | 91.2% | Some descriptions missing |

"Churn model uses 12 features. 8 have >95% coverage. Quote data at 73% is the weakest input — improving this will directly improve model precision."

Prioritizes data quality work. Gives the team a concrete improvement roadmap.

---

### Row 7 — Backtesting Panel (Phase 4 placeholder)

```
┌─────────────────────────────────────────────────────────────┐
│  🔬  MODEL BACKTESTING                      COMING SOON     │
│                                                              │
│  "How would this model have performed on last quarter's      │
│   actual churn?"                                             │
│                                                              │
│  Backtest results are the gold standard for model trust.     │
│  Walk-forward validation on quarterly holdout sets —         │
│  available in future phases.                                 │
│                                                              │
│  ⚠️ Available in future phases                                │
│                                                              │
│  [Notify me when available]                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Removed from This Page

| Element | Moved to | Why |
|---|---|---|
| Margin Classification (High/Standard/Low) | Revenue & Margins or Products | Basic descriptive analytics, not ML |
| BCG Portfolio Matrix | Products & SKUs | Strategic framework, not ML output |
| Revenue YoY Comparison | Revenue & Margins | Already exists there |

---

## Final Count

4 KPIs (reframed) · model performance split (churn + forecast, with honest status flags) · churn predictions table (sorted by revenue at risk, filtered, with actions) · anomaly detection (expanded: negative margin + missing data + cost anomalies + quote anomalies) · feature importance (churn + forecast) · model changelog + data coverage · Phase 4 backtesting placeholder.

---

## Open Decisions Before Build

1. **Churn model precision on high-value customers** — compute and display. If it's poor, say so prominently.
2. **"High-Confidence At-Risk" threshold** — >€10K AND >80% prob, or different cutoffs? Test which threshold gives a useful-sized list (target: 15–30 customers, not 710).
3. **Action logic for churn table** — hardcoded rules vs model-derived? Rules are more transparent; model-derived is more nuanced. Recommend rules for Phase 3, model-derived for Phase 4.
4. **Quote anomaly detection** — does the data include pre-submission quotes, or only submitted? Pre-submission = can catch errors before they go out.
5. **Feature importance** — available from current model implementation? If using simple models (logistic regression, random forest), feature importance is straightforward. If black-box, need SHAP or similar.
6. **Nav placement** — keep as top-level nav item or demote to "Model Details →" link from Customers and Forecasting pages?
7. **Forecast model deployment threshold** — 60% directional accuracy as the bar? Confirm with stakeholders. Document on the page.
8. **Data coverage targets** — set goals (e.g. "Quote data from 73% to 90% by Q2 2025") to make the coverage table actionable.
