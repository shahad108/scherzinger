# Scherzinger Dashboard — Pre-Client Audit Report

**Date:** March 30, 2026
**Auditor:** PRYZM Analytics Team
**Purpose:** Full accuracy audit before presenting to Scherzinger GmbH
**Verdict:** NOT READY — 8 critical fixes required before client demo

---

## Overall Score: 62/100

| Category | Score | Status |
|----------|-------|--------|
| Revenue & Invoice Data | 98/100 | PASS |
| Margin Data | 90/100 | PASS (minor gaps) |
| Quote & Win Rate Data | 40/100 | FAIL — wrong totals |
| Customer Data | 45/100 | FAIL — missing 32% |
| Risk Distribution | 30/100 | FAIL — completely inverted |
| Cost/COGS Data | 55/100 | FAIL — syntax errors + reconciliation |
| Forecasting Data | 75/100 | ACCEPTABLE — unverifiable by design |
| Page Components & UI | 85/100 | PASS (4 text fixes needed) |
| Branding & Currency | 70/100 | FAIL — INR/surgical references remain |

---

## SECTION 1: What's CORRECT (Safe to Present)

These numbers match the verified backend data exactly and are safe to show Scherzinger:

### Revenue (100% accurate)
| Year | Dashboard Value | Verified Value | Match? |
|------|----------------|----------------|--------|
| 2022 | €6,369,103 | €6,369,103 | EXACT |
| 2023 | €6,233,961 | €6,233,961 | EXACT |
| 2024 | €5,793,294 | €5,793,294 | EXACT |
| 2025 | €6,250,360 | €6,250,360 | EXACT |
| **Total** | **€24,646,718** | **€24,646,717** | **€1 rounding** |

### Invoice Counts (100% accurate)
| Year | Dashboard | Verified | Match? |
|------|-----------|----------|--------|
| 2022 | 1,500 | 1,500 | EXACT |
| 2023 | 1,337 | 1,337 | EXACT |
| 2024 | 1,320 | 1,320 | EXACT |
| 2025 | 1,408 | 1,408 | EXACT |
| **Total** | **5,565** | **5,565** | **EXACT** |

### DB II Margins by Year (100% accurate)
| Year | Dashboard | Verified | Match? |
|------|-----------|----------|--------|
| 2022 | 63.6% | 63.6% | EXACT |
| 2023 | 63.8% | 63.8% | EXACT |
| 2024 | 62.2% | 62.2% | EXACT |
| 2025 | 60.6% | 60.6% | EXACT |

### Monthly Revenue Trend (100% accurate)
All 48 months of revenue and margin data in monthly_detail.json match the verified data exactly. The monthly trend chart on the Dashboard and Revenue pages is trustworthy.

### Linkage Metrics (100% accurate)
| Metric | Dashboard | Verified | Match? |
|--------|-----------|----------|--------|
| Linked records | 1,378 | 1,378 | EXACT |
| Median days to invoice | 53 | 53 | EXACT |
| Mean margin gap | 5.4pp | 5.4pp | EXACT |

### Price Sensitivity (100% accurate)
| Metric | Dashboard | Verified | Match? |
|--------|-----------|----------|--------|
| t-test p-value | 0.011 | 0.011 | EXACT |
| Won margin (2025) | 74.4% | 74.4% | EXACT |
| Price-lost margin (2025) | 78.9% | 78.9% | EXACT |

### Catalog vs Quoted (2025 values correct)
| Metric | Dashboard | Verified | Match? |
|--------|-----------|----------|--------|
| Catalog margin 2025 | 60.1% | 60.1% | EXACT |
| Quoted margin 2025 | 69.5% | 69.5% | EXACT |

---

## SECTION 2: What's WRONG (Must Fix Before Demo)

### CRITICAL #1: Quote Counts Are Inflated (+66 quotes)

The dashboard shows pre-dedup quote counts instead of the verified post-dedup numbers:

| Metric | Dashboard Shows | Verified (Post-Dedup) | Error |
|--------|-----------------|------------------------|-------|
| Total quotes | **4,605** | **4,539** | **+66 inflated** |
| Won quotes | **1,733** | **1,684** | **+49 inflated** |
| Lost quotes | **2,872** | **2,855** | **+17 inflated** |
| Win rate | **37.6%** | **37.1%** | **+0.5pp overstated** |

**Where this appears:** dashboard_data.json `quote_summary`, pipeline.json `pipeline_stages` (Won/Lost counts), multiple pages that reference these numbers.

**Impact:** Scherzinger's data team will immediately spot this if they cross-reference with their ERP. The 66-quote discrepancy is the pre-dedup vs post-dedup difference.

**Fix:** Update dashboard_data.json and pipeline.json with correct post-dedup counts.

---

### CRITICAL #2: Risk Distribution Is Completely Inverted

The dashboard shows the opposite risk distribution from the verified model output:

| Tier | Dashboard Shows | Verified Data | Error |
|------|-----------------|---------------|-------|
| Low | 87 (47.6%) | 32 (17.6%) | **+55 too many** |
| Medium | 58 (31.7%) | 88 (48.4%) | **-30 too few** |
| High | 33 (18.0%) | 61 (33.5%) | **-28 too few** |
| Critical | 5 (2.7%) | 1 (0.5%) | **+4 too many** |
| **Total** | **183** | **182** | **+1** |

**Where this appears:** dashboard_data.json `risk_distribution`, Dashboard Overview pie chart, Customers page risk badges, ML Analytics page.

**Impact:** This is a SHOWSTOPPER. If Scherzinger sees "87 low-risk customers" when their model actually shows only 32, they'll lose all confidence in the platform. The dashboard makes the portfolio look much healthier than reality (48.4% medium + 33.5% high = 82% at some risk level, but dashboard shows only 52%).

**Fix:** Replace with verified distribution: `[{tier: "low", count: 32}, {tier: "medium", count: 88}, {tier: "high", count: 61}, {tier: "critical", count: 1}]`

---

### CRITICAL #3: Customer Count Is Wrong (967 vs 1,438)

| Metric | Dashboard Shows | Verified | Error |
|--------|-----------------|----------|-------|
| Unique customers | **967** | **1,438** | **Missing 471 (32%)** |

**Where this appears:** customers_detail.json segments total (45+180+520+222=967), Dashboard KPI card, Customers page header.

**Impact:** Scherzinger knows how many customers they have. Showing 967 when they have 1,438 implies we're missing a third of their customer base. This is because the old data used 967 from earlier processing; the verified customer table has 1,438.

**Fix:** Update to 1,438 total customers. Redistribute segment counts proportionally.

---

### CRITICAL #4: Product Count Is Wrong (45 shown vs 1,798 actual)

| Metric | Dashboard Shows | Verified | Error |
|--------|-----------------|----------|-------|
| Products in JSON | **45** | **1,798** | **Only 2.5% represented** |
| Products in KPI | **1,223** (hardcoded) | **1,798** | **-575 missing** |

**Where this appears:** products.json only has 45 product entries. Some pages reference "1,223 products" which is also stale (verified count is 1,798).

**Impact:** The products table and scatter plot only show 45 items. This is a sample, not the full catalog. Acceptable for demo IF disclosed, but the KPI card should show 1,798.

**Fix:** Update KPI references from 1,223 to 1,798. Add note that product table shows "top 45 by revenue" if keeping sample size.

---

### CRITICAL #5: Margin Gap By Year Values Don't Match

| Year | Dashboard Gap | Verified Gap | Difference |
|------|--------------|--------------|------------|
| 2022 | 5.9pp | 4.2pp | **+1.7pp overstated** |
| 2023 | 5.1pp | 5.6pp | -0.5pp understated |
| 2024 | 5.6pp | 6.4pp | -0.8pp understated |
| 2025 | 5.5pp | 5.3pp | +0.2pp (acceptable) |

**Where this appears:** pricing_analysis.json `gap_analysis.by_year`, Revenue & Margins page gap chart, Pricing & Quotes page.

**Impact:** The 2022 gap is overstated by 1.7 percentage points. While the overall 5.4pp mean is correct, Scherzinger may drill into year-by-year and find discrepancies.

**Fix:** Update year-by-year gap values to match verified: [4.2, 5.6, 6.4, 5.3].

---

### CRITICAL #6: JSON Syntax Errors in 2 Data Files

**inventory_detail.json (line ~52):**
```json
"outsourcing_eur": 96102, "outsourcing_eur": 42688
```
Duplicate key — second should be `"overhead_eur": 42688`. This causes unpredictable JSON parsing.

**cogs_detail.json (line ~46):**
```json
"lab": 227451
```
Truncated key — should be `"labor": 227451`. Breaks data binding.

**Impact:** These files may parse incorrectly in the browser. Some parsers take the last value for duplicate keys, others the first. The truncated key means cost breakdown charts may show missing labor data.

**Fix:** Correct the JSON syntax errors.

---

### CRITICAL #7: COGS Quarterly Totals Don't Reconcile

| Year | Quarterly Sum | Annual Total | Difference |
|------|---------------|-------------|------------|
| 2022 | €2,312,000 | €2,312,000 | OK |
| 2023 | €1,844,000 | €2,245,000 | **-€401,000 missing** |
| 2024 | €1,686,200 | €2,187,000 | **-€500,800 missing** |
| 2025 | €1,952,037 | €1,953,037 | -€1,000 (rounding, OK) |

**Where this appears:** cogs_detail.json quarterly cost trend data vs annual totals.

**Impact:** If someone adds up the quarterly bars in the Cost Intelligence chart and compares to the annual total KPI, the numbers won't add up for 2023-2024. Missing nearly half a million euros per year.

**Fix:** Recalculate quarterly breakdowns so they sum to the annual figures.

---

### CRITICAL #8: Leftover AVANA/Medical Device References

**tooltipContent.js — INR currency references (4 locations):**
- Line 2: "...in INR." → should be "...in EUR."
- Line 46: "EUR/INR currency exposure" → wrong (Scherzinger is domestic German)
- Line 50: "EUR/INR exchange rate" → wrong
- Line 67: "...in INR including duties" → should be EUR

**tooltipContent.js — Surgical device categories (~30 lines):**
- Category descriptions reference "Surgical Instruments," "Endoscopy," "Spine Surgery," "Power Equipment"
- Should reference Scherzinger commodity groups: BKAES (Electric Gear Pumps), BKAGG, SOPU, etc.

**tooltipContent.js — Customer segment naming:**
- References "Platinum and Gold tier customers" instead of Enterprise/Mid-Market/SME/Occasional

**systemPrompt.js — AI context:**
- While correctly identifies Scherzinger, imports category descriptions from tooltipContent.js which contain surgical device references
- AI chatbot may give medical-device-context answers

**Impact:** If Scherzinger clicks any info (i) button or hovers over chart elements, they'll see "INR" and "Surgical Instruments." This instantly reveals the dashboard was ported from another client.

**Fix:** Rewrite tooltipContent.js with Scherzinger-specific commodity group descriptions and EUR currency.

---

## SECTION 3: What's FABRICATED (Estimated, Not Verified)

These values were generated to fill the dashboard but have no backend verification. They are plausible but should be disclosed as estimates:

| Data | File | Notes |
|------|------|-------|
| DB I margins (all months) | monthly_detail.json | Estimated at ~72%, not in verified data |
| Individual product revenues/units | products.json | 45 products with fabricated per-year figures |
| Customer LTV scores | customers_detail.json | No backend CLV model exists yet (Phase 5) |
| Customer segment distribution | customers_detail.json | Enterprise/Mid-Market/SME split is estimated |
| Forecast predictions (3/6/12m) | forecasting.json | Generated, not from actual model runs |
| Seasonal indices | forecasting.json | Estimated monthly patterns |
| Monte Carlo distributions | forecasting.json | Simulated, not from Phase 2 pipeline output |
| Cost component splits (material/labor/outsourcing %) | multiple files | Estimated at 32%/42%/18%/8%, not verified |
| Pipeline stage counts | pipeline.json | Fabricated distribution across stages |
| Conversion funnel rates | pipeline.json | Not based on real funnel data |
| Churn probabilities | ml_analytics.json | No churn model exists yet (Phase 5) |
| BCG matrix growth rates | ml_analytics.json | Fabricated (Phase 5 feature) |
| Price governance rules | price_governance.json | Made up (no governance system exists) |
| Discount history percentages | price_governance.json | Not from verified data |
| Recent transaction details | sales_transactions.json | Fabricated sample transactions |
| Notification content | Header.jsx | Static demo notifications |

**Recommendation:** For the client demo, present these pages as "illustrative of the platform's capabilities" rather than "your actual analytics." The verified data (revenue, margins, quotes) is accurate, but the derived analytics are mockups.

---

## SECTION 4: What's MISSING (Not Built Yet)

These features are shown as stubs or are absent:

| Feature | Page | Status | Phase |
|---------|------|--------|-------|
| Live API connection | All pages | Static JSON only | Phase 3F (next step) |
| Real-time margin alerts | Dashboard | Not implemented | Phase 5 |
| Customer churn model | ML Analytics | Fabricated scores | Phase 5 |
| BCG matrix with real growth | ML Analytics | Estimated growth rates | Phase 5 |
| Price optimization engine | Pricing | Placeholder data | Phase 3 |
| Win probability model | Pricing | Not built | Phase 3 |
| Shock pricing simulator | (stub) | Not started | Phase 4 |
| Cross-sell/upsell model | (absent) | Not started | Phase 5 |
| Real notification system | Header | Static demo alerts | Future |
| Admin panel real data | Admin pages | No PostHog/Supabase connected | Future |
| Search functionality | Header | Searches fabricated product list | Needs real data |
| Slide-over detail panels | Products/Customers | Template from AVANA, not Scherzinger-adapted | Needs update |

---

## SECTION 5: How Each Chart/Visual Connects

### Dashboard Overview Page
```
KPI Cards (4):
├── Total Revenue → dashboard_data.json → annual_summary[].revenue_eur SUM → €24.6M ✓
├── DB II Margin → dashboard_data.json → annual_summary[].avg_db2_margin WEIGHTED → 64.8% ✓
├── Active Customers → HARDCODED or dashboard_data.json → ⚠️ Shows 967, should be 1,438
└── Win Rate → dashboard_data.json → quote_summary.win_rate → ⚠️ Shows 37.6%, should be 37.1%

Alert Cards (3):
├── Margin Erosion → Computes 2022 vs 2025 decline → 3.0pp decline ✓
├── High-Risk Customers → risk_distribution sum of high+critical → ⚠️ Shows 38, should be 62
└── Cost Regime Shift → Static text → ✓ (factually correct: plateau 2024-25)

Charts:
├── Monthly Revenue & Margin Trend → monthly_detail.json → 48 months → ✓ VERIFIED
├── Revenue by Commodity Group → dashboard_data.json → commodity_group_revenue → ✓ STRUCTURE OK
└── Risk Distribution Pie → dashboard_data.json → risk_distribution → ⚠️ COMPLETELY WRONG
```

### Revenue & Margins Page
```
KPI Cards (4):
├── Revenue → Filtered by year from annual_summary → ✓ VERIFIED per year
├── DB II Margin → Filtered weighted avg → ✓ VERIFIED
├── DB I Margin → monthly_detail.json DB1 → ⚠️ FABRICATED (~72%)
└── Records → Invoice count → ✓ VERIFIED

Charts:
├── Monthly Performance (ComposedChart) → monthly_detail.json → ✓ VERIFIED
├── Margin by Commodity Group → commodity_group_revenue → ESTIMATED margins per group
├── Quoted vs Actual Gap → pricing_analysis.json → ⚠️ Year-by-year values off
└── Catalog vs Quoted → pricing_analysis.json → ✓ 2025 values verified

Tables:
├── Top Customers by Revenue → dashboard_data.json top_customers → FABRICATED names/amounts
└── Top Products by Revenue → products.json → FABRICATED (45 products only)
```

### Customers Page
```
KPI Cards:
├── Total Customers → ⚠️ Shows 967, verified = 1,438
├── High-Risk → ⚠️ Based on wrong risk distribution
├── Avg Margin Gap → ✓ 5.4pp verified
└── Win Rate → ⚠️ 37.6% vs 37.1%

Charts:
├── Revenue Concentration (Pareto) → customers_detail.json → FABRICATED but plausible
├── Risk Distribution → ⚠️ WRONG (inverted tiers)
└── Customer Radar → FABRICATED scores

Table:
└── Customer Risk Scores → FABRICATED individual scores with wrong tier distribution
```

### Products & SKUs Page
```
KPI Cards:
├── Total Products → ⚠️ May show 1,223 (stale) vs 1,798 verified
├── Avg DB II Margin → products.json average → ESTIMATED
├── Cost Risers → FABRICATED count
└── Commodity Groups → ✓ 9 groups

Charts:
├── Margin vs Revenue Scatter → products.json (45 items) → SAMPLE ONLY
├── Cost Trends → inventory_detail.json → ⚠️ JSON syntax error
└── Commodity Performance → ESTIMATED margins per group
```

### Forecasting Page
```
ALL DATA IS MODEL OUTPUT — inherently unverifiable
├── Current margin anchor: 60.6% → ✓ VERIFIED
├── Forecast values: GENERATED (not from real Phase 2 model runs)
├── Model accuracy metrics: FABRICATED (but plausible ranges)
├── Seasonal patterns: ESTIMATED
└── Monte Carlo: SIMULATED (not from Phase 2 pipeline)
```

### Cost Intelligence Page
```
├── Cost trends: ✓ 2022 quarterly data verified
├── Cost regime narrative: ✓ Correct (+12-13%/yr then plateau)
├── Quarterly breakdowns 2023-24: ⚠️ DON'T SUM TO ANNUAL TOTALS
├── Cost components: ESTIMATED splits
└── JSON syntax error in inventory_detail.json: ⚠️ WILL BREAK
```

### Pricing & Quotes Page
```
├── Overall gap 5.4pp: ✓ VERIFIED
├── Year-by-year gaps: ⚠️ OFF BY 0.5-1.7pp
├── t-test p-value: ✓ 0.011 VERIFIED
├── Won vs Lost margins: ✓ 74.4% vs 78.9% VERIFIED
├── Rejection codes: MIXED (all-time data, not 2025-segregated)
└── Win rate by margin band: FABRICATED but directionally correct
```

### ML Analytics Page
```
ALL DATA IS FABRICATED — Phase 5 features not built yet
├── Churn model accuracy: MADE UP
├── BCG matrix: FABRICATED growth rates
├── Customer segments: ESTIMATED
└── Anomaly detection: PARTIALLY VERIFIED (13 negative margins, 20 missing)
```

### AI Insights Page
```
├── Chat interface: ✓ FUNCTIONAL (OpenRouter streaming)
├── System prompt: ⚠️ Imports surgical device categories from tooltipContent.js
├── Suggested prompts: ✓ Scherzinger-relevant
└── Data context: MIXED (some verified, some fabricated)
```

---

## SECTION 6: Recommended Fix Priority

### Must Fix (Before ANY Client Demo)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Fix quote counts: 4,605→4,539, 1,733→1,684, 2,872→2,855, 37.6%→37.1% | 15 min | Scherzinger will cross-check |
| 2 | Fix risk distribution: swap to verified [32, 88, 61, 1] | 15 min | Dashboard pie chart is wrong |
| 3 | Fix customer count: 967→1,438 | 15 min | They know their customer count |
| 4 | Fix product count references: 1,223→1,798 | 10 min | They know their catalog size |
| 5 | Fix JSON syntax errors in inventory_detail.json and cogs_detail.json | 10 min | Pages may crash |
| 6 | Rewrite tooltipContent.js: remove INR, surgical, add Scherzinger commodities | 30 min | Info buttons reveal AVANA |
| 7 | Fix margin gap by-year values: [4.2, 5.6, 6.4, 5.3] | 10 min | Year drill-down is wrong |
| 8 | Fix COGS quarterly reconciliation (2023-24 sums) | 20 min | Cost chart inconsistency |

**Total estimated fix time: ~2 hours**

### Should Fix (Before Production)
- Connect to real FastAPI backend (replace all static JSON)
- Remove fabricated forecasting/ML data (replace with real Phase 2 output)
- Update slide-over panels for Scherzinger context
- Connect real notification system
- Wire search to actual product/customer database

### Nice to Have
- Add data freshness timestamp
- Add "demo data" watermark on fabricated sections
- Connect PostHog analytics
- Build admin panel with real session data

---

## SECTION 7: Honest Assessment for Scherzinger

**What you CAN say:** "This platform shows your verified revenue of €24.6M, margin trends declining from 63.6% to 60.6%, and quote-to-invoice linkage at 89.9% — all pulled from your actual ERP data."

**What you CANNOT say:** "All analytics are production-ready." Many derived metrics (forecasts, risk scores, churn predictions) are illustrative mockups.

**Bottom line:** The foundation is solid — revenue, margins, and invoice data are 100% accurate. But 8 critical data errors need fixing before Scherzinger sees it, and the advanced analytics pages should be framed as "platform capability demos" not "your live analytics."
