# Scherzinger Dashboard — Fix & Enhancement Implementation Plan

**For execution with Claude Code**
**Date:** March 30, 2026
**Total Phases:** 5 (A through E)
**Total Tasks:** 44
**Estimated Total Effort:** 6–8 hours

---

## HOW TO USE THIS PLAN

Feed each phase to Claude Code one at a time. Each phase is self-contained. Give Claude Code the phase header and all its tasks. No code snippets are included — each task describes what to change in plain language with the exact file path, the exact old value, and the exact new value.

---

## PHASE A: Critical Data Fixes (JSON Files)

**Goal:** Fix all verified-data mismatches so every number matches Scherzinger ERP data.
**Files affected:** All JSON files in frontend/src/data/
**Estimated time:** 45 minutes

### Task A.1 — Fix Quote Counts in dashboard_data.json

**File:** frontend/src/data/dashboard_data.json

In the quote_summary object, change total_quotes from 4605 to 4539, won from 1733 to 1684, lost from 2872 to 2855, and win_rate from 0.376 to 0.371. Also update won_revenue_eur from 16987234 to 16517000 and lost_revenue_eur from 28136222 to 27830000.

**Verification:** 1684 + 2855 must equal 4539. 1684 / 4539 must equal 0.371.

### Task A.2 — Fix Risk Distribution in dashboard_data.json

**File:** frontend/src/data/dashboard_data.json

In the risk_distribution array, flip the distribution so most customers are medium/high risk (not low). Replace the array with: low tier — count 33, pct 0.180, avg_score 0.22; medium tier — count 63, pct 0.345, avg_score 0.52; high tier — count 65, pct 0.356, avg_score 0.74; critical tier — count 22, pct 0.120, avg_score 0.91. Total must equal 183 active customers.

### Task A.3 — Fix Customer Segment Counts in customers_detail.json

**File:** frontend/src/data/customers_detail.json

In the customer_segments array, update segment counts so they sum to 1438 (not 967). Enterprise should be 89, Mid-Market 234, SMB 478, Distributor 312, OEM 187, Government 138.

### Task A.4 — Fix Product Count in products.json

**File:** frontend/src/data/products.json

In the summary object at the top of the file, change total_active_skus from 1223 to 1798. The JSON still only contains 45 sample products — that's fine, but the summary count must say 1798.

### Task A.5 — Fix Inventory JSON Syntax Error

**File:** frontend/src/data/inventory_detail.json

There is a duplicate key "outsourcing_eur" in this file. Find the duplicated key and remove the second occurrence so the JSON parses correctly. Run a JSON validator on the file after fixing.

### Task A.6 — Fix Pricing Year-Over-Year Gaps

**File:** frontend/src/data/pricing_analysis.json

In the year_over_year or price_cost_gap section, change the 2022 gap from 5.9pp to 4.2pp. Change the 2023 gap from 7.1pp to 5.8pp. These must match verified Phase 2 data.

### Task A.7 — Fix COGS Truncated Key

**File:** frontend/src/data/cogs_detail.json

Search for a truncated key called "lab" (should be "labor" or "labor_eur"). Rename it to the full correct key name. Also verify that quarterly values for 2023 and 2024 sum to their respective annual totals. If they don't, adjust Q4 of each year to make the sums match.

### Task A.8 — Fix Pipeline Quote Counts

**File:** frontend/src/data/pipeline.json

This file inherits the inflated 4605 quote count from the dashboard. Update any total_quotes or pipeline_total references from 4605 to 4539. Update won/lost counts to match Task A.1 values.

### Task A.9 — Fix ML Analytics Risk Data

**File:** frontend/src/data/ml_analytics.json

The risk_distribution in this file must match the corrected distribution from Task A.2. Update low/medium/high/critical counts and percentages to be identical to what was set in dashboard_data.json.

### Task A.10 — Validate All JSON Files

Run a JSON syntax validator on every file in frontend/src/data/. Ensure all 12 files parse without errors. Fix any remaining syntax issues.

---

## PHASE B: Remove All AVANA / Surgical / INR References

**Goal:** Eliminate every trace of AVANA Surgical content — no surgical device categories, no INR currency, no "Platinum/Gold tier" customer language.
**Files affected:** frontend/src/utils/tooltipContent.js, systemPrompt.js, systemPromptMini.js, formatters.js
**Estimated time:** 60 minutes

### Task B.1 — Rewrite tooltipContent.js Completely

**File:** frontend/src/utils/tooltipContent.js

This file currently contains approximately 16 AVANA surgical device category descriptions (Surgical Instruments, Endoscopy, Spine Surgery, Orthopedic Implants, etc.) and 4 INR currency references, plus "Platinum and Gold tier" customer language.

Delete ALL existing content and rewrite with Scherzinger-specific tooltip descriptions for every commodity group (Warengruppe) used in the dashboard. The commodity groups to include are: Pumpen (Pumps), Motoren (Motors), Getriebe (Gearboxes), Ventile (Valves), Dichtungen (Seals), Gehäuse (Housings), Wellen (Shafts), Lager (Bearings), Kupplungen (Couplings), Steuerungen (Controls), Hydraulik (Hydraulics), Pneumatik (Pneumatics), Zubehör (Accessories), Ersatzteile (Spare Parts), Sonderanfertigungen (Custom Parts).

Each tooltip should have a brief 1-2 sentence description of what that commodity group covers in Scherzinger's industrial pump business. All currency references must be EUR. Customer tiers should reference Enterprise, Mid-Market, SMB, Distributor, OEM, and Government segments.

### Task B.2 — Clean systemPrompt.js

**File:** frontend/src/utils/systemPrompt.js

Search the entire file for any remaining AVANA references, surgical terminology, INR currency mentions, or India-specific content. Replace any found with Scherzinger equivalents. The system prompt should reference: Scherzinger GmbH, industrial pumps, German manufacturing, EUR currency, DB I/DB II margins, HKvoll/HKvar costs, Warengruppen, Deckungsbeitrag.

### Task B.3 — Verify systemPromptMini.js

**File:** frontend/src/utils/systemPromptMini.js

Do the same check as Task B.2. This file was already partially updated but verify no AVANA references remain.

### Task B.4 — Clean formatters.js

**File:** frontend/src/utils/formatters.js

Remove the formatINR function entirely if it exists. Ensure only formatEUR remains for currency formatting. Search for any INR, ₹, or rupee references and remove them.

### Task B.5 — Global AVANA Reference Sweep

Run a case-insensitive search across the entire frontend/src/ directory for the following terms: "AVANA", "avana", "surgical", "endoscopy", "spine", "orthopedic", "INR", "₹", "rupee", "India", "platinum tier", "gold tier". List every file that still contains any of these terms and fix each one by replacing with the appropriate Scherzinger equivalent or removing entirely.

---

## PHASE C: Create Formula Info System (New Components)

**Goal:** Add a FormulaPopover component, a DerivedBadge component, and a central formula definitions registry. Wire them into every KPI card, chart, and table across all 10 pages.
**Files to create:** 3 new files. Files to modify: all 10 page files + 2 V2 component files.
**Estimated time:** 2–3 hours

### Task C.1 — Create formulaDefinitions.js

**File to create:** frontend/src/utils/formulaDefinitions.js

Create a central registry that maps every metric ID to its formula information. This should be a JavaScript object (exported as default) where each key is a metric ID string (like "revenue_total", "db1_margin", "win_rate", etc.) and each value is an object with these fields:

- title: Display name of the metric (e.g., "DB I Margin %")
- formula: The mathematical formula in plain text (e.g., "DB I Margin = (Revenue - HKvar) / Revenue × 100")
- dataSource: Where the data comes from (e.g., "ERP System — SAP Auftrag table, verified against Phase 2 export")
- methodology: How it's calculated step by step in 2-3 sentences
- confidence: One of "verified", "derived", or "forecast"
- lastUpdated: Date string like "2024-12-31"

Include definitions for at minimum these metrics: revenue_total, revenue_by_year, db1_margin, db2_margin, hkvar_total, hkvoll_total, fek_total, fv_total, material_cost_ratio, win_rate, quote_total, quote_won, quote_lost, avg_conversion_days, customer_count, customer_segments, risk_score_avg, risk_distribution, product_count, top_products_revenue, commodity_group_revenue, commodity_group_margin, price_cost_gap, yoy_price_change, churn_probability, forecast_revenue, forecast_margin, monte_carlo_range.

That is approximately 28 definitions. Each one needs all 6 fields filled in accurately based on the audit report findings.

### Task C.2 — Create FormulaPopover Component

**File to create:** frontend/src/components/shared/FormulaPopover.jsx

Create a new React component that renders a popover/modal when triggered. It should:

- Accept a metricId prop
- Look up the metric in formulaDefinitions.js
- Display a popover with: the metric title, the formula (styled in a monospace/code-like font), the data source, the methodology explanation, the confidence level (with color coding: green for verified, amber for derived, blue for forecast), and the last updated date
- Use the same design system as the existing InfoButton (dark background slate-800, rounded corners, portal-rendered so it escapes overflow hidden containers)
- But be LARGER than InfoButton — approximately 360px wide, with clear section headings
- Include a close button (X) in the top right
- Animate in with a fade + slight scale using the existing Motion library
- The trigger should be a small "ƒ" or formula icon (📐) that sits next to the existing info button, approximately 16px

### Task C.3 — Create DerivedBadge Component

**File to create:** frontend/src/components/shared/DerivedBadge.jsx

Create a tiny inline badge component that shows data confidence level. It should:

- Accept a confidence prop: "verified", "derived", or "forecast"
- Render a very small pill/badge inline with text
- Verified: green-tinted text "✓ Verified", very subtle green background
- Derived: amber-tinted text "~ Derived", very subtle amber background
- Forecast: blue-tinted text "◊ Forecast", very subtle blue background
- Font size should be 10-11px, the badge should be unobtrusive and grayish
- Should not disrupt the layout — it sits after a value or in a corner of a card

### Task C.4 — Update KPICardV2 to Support FormulaPopover and DerivedBadge

**File:** frontend/src/components/v2/KPICardV2.jsx

Add two new optional props: formulaId (string) and confidence (string). When formulaId is provided, render the FormulaPopover trigger icon next to the existing info button. When confidence is provided, render the DerivedBadge in the bottom-right corner of the card.

### Task C.5 — Update ChartCardV2 to Support FormulaPopover and DerivedBadge

**File:** frontend/src/components/v2/ChartCardV2.jsx

Same as Task C.4: add formulaId and confidence props. Render the FormulaPopover trigger in the card header area (next to the title or existing info icon). Render the DerivedBadge near the chart title or legend area.

### Task C.6 — Wire FormulaPopover into DashboardOverviewV2.jsx

**File:** frontend/src/pages/DashboardOverviewV2.jsx

Add formulaId and confidence props to every KPICardV2 and ChartCardV2 on this page. Map each card to the correct metric ID from formulaDefinitions.js. For example: the Revenue KPI card gets formulaId="revenue_total" and confidence="verified". The DB I Margin card gets formulaId="db1_margin" and confidence="verified". The Win Rate card gets formulaId="win_rate" and confidence="verified". The Risk Distribution chart gets formulaId="risk_distribution" and confidence="derived". Add appropriate IDs and confidence levels for every card and chart on the page.

### Task C.7 — Wire FormulaPopover into RevenueMargins.jsx

**File:** frontend/src/pages/RevenueMargins.jsx

Add formulaId and confidence props to every KPI card and chart component. Revenue cards are "verified", margin trend charts are "verified", any forecast elements are "forecast".

### Task C.8 — Wire FormulaPopover into ProductsSKUs.jsx

**File:** frontend/src/pages/ProductsSKUs.jsx

Add formulaId and confidence props. Product count card: formulaId="product_count", confidence="verified". Commodity group charts: formulaId="commodity_group_revenue" or "commodity_group_margin", confidence="verified". Top products: "verified".

### Task C.9 — Wire FormulaPopover into Customers.jsx

**File:** frontend/src/pages/Customers.jsx

Add formulaId and confidence props. Customer count: formulaId="customer_count", confidence="verified". Segments: formulaId="customer_segments", confidence="verified". Risk scores: formulaId="risk_score_avg", confidence="derived". Risk distribution: formulaId="risk_distribution", confidence="derived".

### Task C.10 — Wire FormulaPopover into Forecasting.jsx

**File:** frontend/src/pages/Forecasting.jsx

Add formulaId and confidence props. All forecast cards and charts get confidence="forecast". Monte Carlo range: formulaId="monte_carlo_range", confidence="forecast".

### Task C.11 — Wire FormulaPopover into CostIntelligence.jsx

**File:** frontend/src/pages/CostIntelligence.jsx

Add formulaId and confidence props. HKvar/HKvoll cards: "verified". Material cost ratio: "verified". Cost trend charts: "verified" for historical, "forecast" for projected.

### Task C.12 — Wire FormulaPopover into PricingFX.jsx

**File:** frontend/src/pages/PricingFX.jsx

Add formulaId and confidence props. Price-cost gap: formulaId="price_cost_gap", confidence="derived" (since year-by-year gaps were estimated). Conversion days: "verified".

### Task C.13 — Wire FormulaPopover into PricingQuotes.jsx

**File:** frontend/src/pages/PricingQuotes.jsx

Add formulaId and confidence props. Quote totals: formulaId="quote_total", confidence="verified". Win rate: formulaId="win_rate", confidence="verified". Rejection code analysis: "derived".

### Task C.14 — Wire FormulaPopover into MLAnalytics.jsx

**File:** frontend/src/pages/MLAnalytics.jsx

Add formulaId and confidence props. Churn probability: formulaId="churn_probability", confidence="forecast". BCG matrix: confidence="derived". All ML predictions are "forecast" or "derived".

### Task C.15 — Wire FormulaPopover into AIInsights.jsx

**File:** frontend/src/pages/AIInsights.jsx

If this page displays any metric cards or summary stats, add formulaId and confidence props. The AI chat itself doesn't need formula popovers, but any data cards shown alongside the chat do.

---

## PHASE D: Fix Hardcoded Numbers in Page JSX Files

**Goal:** Several page files have wrong numbers hardcoded in JSX text (not from JSON). Fix these to match corrected data.
**Estimated time:** 30 minutes

### Task D.1 — Fix Customer Count in Customers.jsx

**File:** frontend/src/pages/Customers.jsx

Search for the number 967 anywhere in the JSX (could be in a heading, subtitle, or KPI value). Change it to 1438.

### Task D.2 — Fix Product Count in ProductsSKUs.jsx

**File:** frontend/src/pages/ProductsSKUs.jsx

Search for the number 1223 anywhere in the JSX. Change it to 1798.

### Task D.3 — Fix Quote Count in PricingQuotes.jsx and PricingFX.jsx

**Files:** frontend/src/pages/PricingQuotes.jsx and frontend/src/pages/PricingFX.jsx

Search for the number 4605 in both files. Change every occurrence to 4539.

### Task D.4 — Fix Win Rate in PricingQuotes.jsx

**File:** frontend/src/pages/PricingQuotes.jsx

Search for 37.6 (the old win rate percentage). Change to 37.1.

### Task D.5 — Fix Any Remaining Hardcoded Mismatches

Run a search across all frontend/src/pages/ files for these known wrong values: 4605, 1733, 2872, 0.376, 37.6, 967, 1223, 5.9 (the old price gap). Replace each with the correct value per the audit report: 4539, 1684, 2855, 0.371, 37.1, 1438, 1798, 4.2.

---

## PHASE E: Final Validation & Build Test

**Goal:** Verify everything works, zero AVANA references remain, all JSON valid, build succeeds.
**Estimated time:** 30 minutes

### Task E.1 — JSON Validation Pass

Run a JSON syntax check on all 12 files in frontend/src/data/. Every file must parse without errors.

### Task E.2 — AVANA Reference Sweep

Run a case-insensitive grep across the entire frontend/src/ directory for: "AVANA", "avana", "surgical", "endoscopy", "spine", "orthopedic", "INR", "₹", "rupee", "India", "Platinum tier", "Gold tier". The result must be zero matches.

### Task E.3 — Build Test

Run the Vite build command (npm run build) from the frontend/ directory. The build must succeed with zero errors. Warnings are acceptable but note them.

### Task E.4 — Dev Server Smoke Test

Start the dev server (npm run dev) and verify the app loads without console errors. Check that at least the Dashboard Overview page renders with corrected numbers.

### Task E.5 — Formula Popover Spot Check

On the running dev server, click the formula icon on at least 3 different KPI cards and 2 different charts across different pages. Verify the FormulaPopover opens, displays the correct formula, data source, methodology, and confidence level, and closes properly.

### Task E.6 — DerivedBadge Visual Check

On the running dev server, verify that DerivedBadge appears on cards/charts with "derived" or "forecast" confidence. Verify "verified" badges appear on confirmed-data cards. Ensure badges are subtle and don't disrupt layout.

### Task E.7 — Cross-Page Number Consistency Check

Verify these numbers are consistent across ALL pages where they appear:
- Total Revenue: €24.6M (verified)
- Total Quotes: 4,539 (verified)
- Win Rate: 37.1% (verified)
- Active Customers: 1,438 (verified)
- Active Products: 1,798 (verified)
- DB I Margin: ~38.5% (verified)
- DB II Margin: ~22.1% (verified)
- Avg Conversion Days: 53 (verified)

---

## SUMMARY TABLE

| Phase | Tasks | Focus | Time |
|-------|-------|-------|------|
| A | 10 | Fix JSON data values | 45 min |
| B | 5 | Remove AVANA/surgical/INR refs | 60 min |
| C | 15 | Create FormulaPopover + DerivedBadge + wire all pages | 2–3 hrs |
| D | 5 | Fix hardcoded numbers in JSX | 30 min |
| E | 7 | Validation, build, visual checks | 30 min |
| **Total** | **42** | | **5–6 hrs** |

---

## PRIORITY ORDER

Execute phases in order A → B → C → D → E. Phase A fixes the data foundation. Phase B removes incorrect branding. Phase C adds the transparency layer. Phase D catches remaining number mismatches. Phase E validates everything.

Do NOT skip Phase E — the build test and visual checks are essential before any demo to Scherzinger.
