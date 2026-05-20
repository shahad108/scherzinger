# Phase 3: Frontend Integration Plan

## Scherzinger Margin Intelligence Platform — PRYZM Frontend

**Version:** 1.0
**Date:** 2026-03-08
**Author:** Claude (Pryzm Engineering)
**Depends On:** Phase 1 (Foundation) ✅, Phase 2 (Forecasting & Risk) ✅

---

## 1. Current State Analysis

### 1.1 Existing Frontend (Copied Template)

The frontend is a React 19 + Vite 7 SPA located at `/frontend/` with 9 pages, 6 shared components, and 12 static JSON data files. It was built as a **medical devices demo** (hospitals, spine implants, endoscopy, RF/Energy) — **none of this data matches Scherzinger's actual business** (industrial pumps: BKAES, BKAGG, BKAIZ, etc.).

**Tech stack (keeping as-is):**
- React 19.2 + Vite 7
- React Router 7.13
- Recharts 3.7 (bar, line, area, scatter, pie, composed charts)
- Tailwind CSS 4.2
- Framer Motion 12.34
- Lucide React icons
- react-countup for KPI animations

**Current pages and their data sources:**

| Page | Route | JSON File(s) | Status |
|------|-------|-------------|--------|
| Dashboard Overview | `/` | dashboard_data.json, monthly_detail.json | ❌ Fake data — REMAKE |
| Revenue & Margins | `/revenue` | dashboard_data.json, monthly_detail.json, products.json | ❌ Fake data — REMAKE |
| Customers | `/customers` | customers_detail.json | ❌ Fake hospital data — REMAKE |
| Products & SKUs | `/products` | products.json | ❌ Fake medical devices — REMAKE |
| Forecasting | `/forecasting` | forecasting.json, pipeline.json | ❌ Fake revenue forecasts — REMAKE |
| Pricing & FX | `/pricing` | pricing_analysis.json | ⚠️ No backend yet (Phase 4) — STUB |
| ML Analytics | `/ml-analytics` | ml_analytics.json | ⚠️ No backend yet (Phase 5) — STUB |
| Inventory | `/inventory` | inventory_detail.json | ❌ DELETE — not in scope |
| AI Insights | `/ai-insights` | All JSON via system prompt | ⚠️ REWORK — connect to real data |

### 1.2 Existing Backend API (28 Endpoints)

**Phase 1 Endpoints (19):**

| Prefix | Endpoint | Method | Returns |
|--------|----------|--------|---------|
| `/stats` | `/stats` | GET | Invoice/quote/customer/product counts, date range |
| `/margins` | `/margins/summary` | GET | Revenue, DB2 margin (avg + weighted), record count |
| `/margins` | `/margins/by-year` | GET | Annual revenue, margin, record count |
| `/margins` | `/margins/by-customer` | GET | Top N customers by revenue with margins |
| `/margins` | `/margins/by-product` | GET | Top N products by revenue with margins |
| `/margins` | `/margins/by-commodity-group` | GET | Revenue + margin per commodity group |
| `/margins` | `/margins/gap-analysis` | GET | Quoted vs actual margin gap, overall + by year |
| `/margins` | `/margins/catalog-vs-quoted` | GET | Catalog vs quoted pricing comparison |
| `/margins` | `/margins/trend` | GET | Monthly/quarterly margin + revenue trend |
| `/quotes` | `/quotes/summary` | GET | Win/loss counts, rates, revenue |
| `/quotes` | `/quotes/win-rate-by-year` | GET | Annual win rates |
| `/quotes` | `/quotes/win-rate-by-deal-size` | GET | Win rate by deal size band |
| `/quotes` | `/quotes/win-rate-by-customer` | GET | Win rate per customer |
| `/quotes` | `/quotes/rejection-codes` | GET | Rejection code distribution + revenue impact |
| `/quotes` | `/quotes/price-sensitivity` | GET | Margin groups + t-test p-value |
| `/quotes` | `/quotes/conversion-timing` | GET | Days to conversion stats |
| `/quality` | `/data-quality/summary` | GET | Quality percentages |
| `/quality` | `/data-quality/issues` | GET | Individual DQ issue records |
| `/quality` | `/data-quality/completeness` | GET | Field-level completeness |

**Phase 2 Endpoints (9):**

| Prefix | Endpoint | Method | Returns |
|--------|----------|--------|---------|
| `/forecasts` | `/forecasts/accuracy` | GET | Backtest accuracy by model type |
| `/forecasts` | `/forecasts/accuracy/{model_type}` | GET | Accuracy for specific model |
| `/forecasts` | `/forecasts/{entity_type}/{entity_id}` | GET | Margin forecasts for entity |
| `/forecasts` | `/forecasts/{entity_type}/{entity_id}/compare` | GET | All models side-by-side |
| `/risk` | `/risk/scores` | GET | Risk scores, filterable by tier |
| `/risk` | `/risk/scores/{customer_id}` | GET | Risk detail + explanation |
| `/risk` | `/risk/distribution` | GET | Tier distribution + averages |
| `/costs` | `/costs/trends` | GET | Product cost trends by quarter |
| `/costs` | `/costs/risers` | GET | Top cost-rising products |
| `/costs` | `/costs/seasonal` | GET | Seasonal margin patterns |
| `/benchmarks` | `/benchmarks` | GET | All commodity benchmarks |
| `/benchmarks` | `/benchmarks/{commodity_group}` | GET | Benchmark for specific group |
| `/benchmarks` | `/benchmarks/compare/{entity_type}/{entity_id}` | GET | Entity vs benchmark |
| `/simulations` | `/simulations/{entity_type}/{entity_id}` | GET | Monte Carlo results |

---

## 2. Architecture Decisions

### 2.1 API Integration Layer

Create a centralized API service layer instead of importing JSON files:

```
frontend/src/
├── api/
│   ├── client.js          # Axios instance with base URL + error handling
│   ├── dashboardApi.js    # Dashboard composite calls
│   ├── marginApi.js       # Margin endpoints
│   ├── quoteApi.js        # Quote endpoints
│   ├── forecastApi.js     # Forecast endpoints
│   ├── riskApi.js         # Risk score endpoints
│   ├── costApi.js         # Cost trend + seasonal endpoints
│   ├── benchmarkApi.js    # Benchmark endpoints
│   └── simulationApi.js   # Monte Carlo endpoints
```

**Why not React Query / SWR:** Keep it simple. Use `useState` + `useEffect` with the API client. The data is read-only and doesn't need cache invalidation or optimistic updates. Add React Query later if needed.

### 2.2 Environment Configuration

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_OPENROUTER_API_KEY=sk-or-v1-...  # existing
```

### 2.3 Proxy Configuration (Vite)

```js
// vite.config.js — add proxy to avoid CORS
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
```

### 2.4 CORS on Backend

Add CORS middleware to `backend/main.py`:

```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 3. Page-by-Page Remake Plan

### 3.1 Dashboard Overview (`/`) — FULL REMAKE

**Current:** Fake medical device KPIs, hardcoded revenue/margin data
**Target:** Real Scherzinger data from multiple API calls

**KPIs (4 cards):**

| KPI | API Call | Calculation |
|-----|----------|-------------|
| Total Revenue | `GET /margins/summary` | `total_revenue` formatted as €X.XXM |
| Weighted DB2 Margin | `GET /margins/summary` | `db2_margin_weighted` as % |
| Active Customers | `GET /stats` | `customers` count |
| Total Quotes | `GET /stats` | `quotes` count |

**Charts:**

1. **Monthly Revenue & Margin Trend (ComposedChart)**
   - API: `GET /margins/trend?granularity=monthly`
   - X-axis: `period` (YYYY-MM)
   - Left Y-axis: `revenue` (€ bars)
   - Right Y-axis: `db2_margin` (% line)

2. **Revenue by Commodity Group (Donut Chart)**
   - API: `GET /margins/by-commodity-group`
   - Slices: `commodity_group` (BKAES, BKAGG, BKAIZ, etc.)
   - Values: `revenue`
   - Colors: Assign fixed color per commodity group

3. **Risk Distribution (Donut or Bar)**
   - API: `GET /risk/distribution`
   - Segments: `tier` (low, medium, high, critical)
   - Values: `count`
   - Colors: green/amber/orange/red

**Status Cards (3):**

| Card | API Call | Display |
|------|----------|---------|
| Customer Concentration | `GET /margins/by-customer?top=5` | Top 5 customers' % of total revenue |
| Margin Gap Alert | `GET /margins/gap-analysis` | Average gap (quoted vs actual) |
| High Risk Customers | `GET /risk/distribution` | Count where tier = "critical" or "high" |

**Remove:** AI Insights carousel (move to AI page), inventory alerts, pipeline value.

---

### 3.2 Revenue & Margins (`/revenue`) — FULL REMAKE

**Current:** Fake revenue by year, margin distributions, product table
**Target:** Real invoice-based margin analytics

**KPIs (4 cards, with year filter):**

| KPI | API Call | Field |
|-----|----------|-------|
| Total Revenue | `GET /margins/summary?year={y}` | `total_revenue` |
| Weighted DB2 Margin | `GET /margins/summary?year={y}` | `db2_margin_weighted` |
| YoY Growth | `GET /margins/by-year` | Calculate from consecutive years |
| Record Count | `GET /margins/summary?year={y}` | `record_count` |

**Year Filter:** Tabs for 2022, 2023, 2024, 2025, All

**Charts:**

1. **Monthly Revenue & Margin Trend (ComposedChart)** — Same as dashboard but filterable by year
   - API: `GET /margins/trend?granularity=monthly`
   - Filter client-side by selected year

2. **Annual Comparison (Grouped Bar)**
   - API: `GET /margins/by-year`
   - X-axis: Year
   - Bars: Revenue, DB2 Total
   - Overlay line: DB2 Margin %

3. **Margin by Commodity Group (Horizontal Bar)**
   - API: `GET /margins/by-commodity-group`
   - Y-axis: Commodity group names
   - X-axis: Weighted margin %
   - Color: gradient by margin level

4. **Margin Gap Analysis (Bar + Line)**
   - API: `GET /margins/gap-analysis`
   - X-axis: Year
   - Bars: avg_quoted_margin, avg_actual_margin
   - Line: avg_gap (erosion)

**Tables:**

1. **Top Products by Revenue** — Columns: article_id, revenue, db2_margin_avg, invoice_count
   - API: `GET /margins/by-product?top=50&year={y}`

2. **Top Customers by Revenue** — Columns: customer_id, revenue, db2_margin_avg, invoice_count
   - API: `GET /margins/by-customer?top=50&year={y}`

---

### 3.3 Customers (`/customers`) — FULL REMAKE

**Current:** Fake hospital data with LTV, NPS, churn risk
**Target:** Real Scherzinger customer analytics from invoices + risk scores

**KPIs (4 cards):**

| KPI | API | Field |
|-----|-----|-------|
| Total Customers | `GET /stats` | `customers` |
| High Risk Count | `GET /risk/distribution` | Sum of "high" + "critical" counts |
| Avg Margin Gap | `GET /margins/gap-analysis` | `overall.avg_gap` |
| Win Rate | `GET /quotes/summary` | `win_rate` |

**Charts:**

1. **Customer Revenue Concentration (Horizontal Bar)**
   - API: `GET /margins/by-customer?top=15`
   - Y-axis: customer_id (truncated)
   - X-axis: revenue
   - Cumulative % line overlay

2. **Risk Score Distribution (Bar)**
   - API: `GET /risk/distribution`
   - X-axis: tier (low, medium, high, critical)
   - Y-axis: count
   - Colors: green/amber/orange/red

3. **Customer Risk Detail (Radar Chart)** — For selected customer
   - API: `GET /risk/scores/{customer_id}`
   - 5 axes: margin_trend, gap, volume, win_rate, rejection
   - Each component value plotted

**Tables:**

1. **Customer Risk Scores** — Columns: customer_id, risk_score, risk_tier, margin_trend_component, gap_component, volume_component, win_rate_component, rejection_component
   - API: `GET /risk/scores?top=100`
   - Sortable, searchable, with tier badge colors
   - Click row → loads radar chart for that customer

2. **Customer Win Rates** — Columns: customer_id, total_quotes, won, lost, win_rate, total_revenue
   - API: `GET /quotes/win-rate-by-customer?top=50`

---

### 3.4 Products & SKUs (`/products`) — FULL REMAKE

**Current:** Fake medical device scatter plot, margin-at-risk panel
**Target:** Real Scherzinger product analytics

**KPIs (4 cards):**

| KPI | API | Field |
|-----|-----|-------|
| Total Products | `GET /stats` | `products` |
| Avg Product Margin | `GET /margins/summary` | `db2_margin_avg` |
| Top Cost Risers | `GET /costs/risers?top=5` | Count |
| Commodity Groups | `GET /margins/by-commodity-group` | Array length |

**Charts:**

1. **Product Margin vs Revenue (Scatter)**
   - API: `GET /margins/by-product?top=100`
   - X-axis: revenue
   - Y-axis: db2_margin_avg
   - Color by commodity group (needs one extra API call or join)
   - Reference line at 25% margin floor

2. **Cost Trend Top Risers (Line Chart)**
   - API: `GET /costs/trends?article_id={selected}` or `GET /costs/risers?top=10`
   - X-axis: period_start (quarter)
   - Y-axis: avg_hkvoll_per_unit
   - Multiple lines for top 5 rising products

3. **Commodity Group Performance (Horizontal Bar)**
   - API: `GET /margins/by-commodity-group`
   - Y-axis: commodity_group
   - X-axis: weighted margin %
   - Bar color: green if > 30%, amber if 20-30%, red if < 20%

**Tables:**

1. **Product Performance** — Columns: article_id, revenue, db2_margin_avg, invoice_count, quote_count
   - API: `GET /margins/by-product?top=200`
   - Sortable, searchable, paginated

2. **Cost Risers** — Columns: article_id, description, commodity_group, avg_hkvoll_per_unit, cost_change_pct
   - API: `GET /costs/risers?top=30`

---

### 3.5 Forecasting (`/forecasting`) — FULL REMAKE

**Current:** Fake revenue forecasts, pipeline funnel
**Target:** Real margin forecasts from Phase 2

**KPIs (4 cards):**

| KPI | API | Field |
|-----|-----|-------|
| Forecast Accuracy (MAE) | `GET /forecasts/accuracy` | Best model's avg_mae |
| Avg Predicted Margin | `GET /forecasts/commodity_group/{cg}` | avg of predicted_db2_margin |
| Monte Carlo P50 | `GET /simulations/overall/all?horizon_months=6` | median_margin |
| Prob Below 50% | `GET /simulations/overall/all?horizon_months=6` | prob_below_threshold |

**Charts:**

1. **Margin Forecast Comparison (Line Chart)** — For selected entity
   - API: `GET /forecasts/{entity_type}/{entity_id}/compare`
   - X-axis: horizon_months (1, 3, 6, 12)
   - Lines: one per model_type (ema, linear_trend, seasonal_decomp, ensemble)
   - Shaded band: prediction_lower to prediction_upper for ensemble

2. **Monte Carlo Distribution (Area Chart)** — For selected entity
   - API: `GET /simulations/{entity_type}/{entity_id}`
   - X-axis: horizon_months (3, 6, 12)
   - Area bands: p5-p95 (light), p25-p75 (medium), median (line)
   - Reference line at threshold (0.50)

3. **Model Accuracy Comparison (Grouped Bar)**
   - API: `GET /forecasts/accuracy`
   - X-axis: model_type
   - Bars: avg_mae, avg_rmse
   - Grouped by entity_type

4. **Seasonal Patterns (Line Chart)** — Overall + selected commodity group
   - API: `GET /costs/seasonal?entity_type=overall`
   - X-axis: month (1-12, labeled Jan-Dec)
   - Y-axis: seasonal_index
   - Reference line at 1.0

**Entity Selector:**
- Dropdown: Overall | Commodity Group (9 options) | Customer (top 50) | Product (top 50)
- Selecting changes all charts on the page

**Tables:**

1. **Backtest Results** — Columns: model_type, entity_type, mae, rmse, mape, directional_accuracy
   - API: `GET /forecasts/accuracy`

---

### 3.6 Benchmarks & Cost Intelligence (NEW PAGE — `/benchmarks`)

This is a **new page** replacing the Inventory page. No backend exists for inventory; we have rich benchmark and cost data instead.

**Route:** `/benchmarks`
**Sidebar icon:** BarChart3 or TrendingUp

**KPIs (4 cards):**

| KPI | API | Field |
|-----|-----|-------|
| Commodity Groups | `GET /benchmarks` | Distinct count |
| Highest Margin Group | `GET /benchmarks` | Max weighted_db2_margin |
| Avg Win Rate | `GET /benchmarks` | Mean avg_win_rate |
| Avg Margin Gap | `GET /benchmarks` | Mean avg_margin_gap |

**Charts:**

1. **Commodity Benchmark Comparison (Grouped Bar)**
   - API: `GET /benchmarks?year=2025`
   - X-axis: commodity_group
   - Bars: avg_db2_margin, weighted_db2_margin, median_db2_margin
   - Whiskers: p25 to p75

2. **Benchmark Trend by Year (Line Chart)**
   - API: `GET /benchmarks` (all years, quarter=NULL for annual)
   - X-axis: year
   - Lines: one per commodity group
   - Y-axis: weighted_db2_margin

3. **Entity vs Benchmark (Bar + Reference)**
   - API: `GET /benchmarks/compare/{entity_type}/{entity_id}`
   - Single bar: entity margin
   - Reference lines: benchmark avg, median, p25, p75
   - Color: green if above median, red if below p25

4. **Cost Trend Heatmap (Table-style)**
   - API: `GET /costs/trends?top=30`
   - Rows: article_id
   - Columns: quarters
   - Color: green (cost down) to red (cost up) by cost_change_pct

**Tables:**

1. **Full Benchmark Data** — Columns: commodity_group, year, quarter, weighted_db2_margin, median_db2_margin, p25, p75, win_rate, margin_gap, total_records
   - API: `GET /benchmarks`

---

### 3.7 Pricing & FX (`/pricing`) — STUB (Phase 4)

**Current:** Elaborate fake FX analysis with EUR/INR data
**Target:** Placeholder page with message "Coming in Phase 4 — Pricing Intelligence"

Keep the page route and sidebar entry. Show:
- A "Coming Soon" card with Phase 4 description
- List of planned features: Price Optimization, FX Impact Analysis, Price Governance, What-If Simulator

**No API calls.** Remove all fake JSON imports.

---

### 3.8 ML Analytics (`/ml-analytics`) — STUB (Phase 5)

**Current:** Fake ML model results (churn, CLV, BCG matrix, demand classification)
**Target:** Placeholder page with message "Coming in Phase 5 — Advanced Analytics"

Keep the page route and sidebar entry. Show:
- A "Coming Soon" card with Phase 5 description
- List of planned features: ML Churn Prediction, CLV Modeling, Demand Classification, Anomaly Detection

**No API calls.** Remove all fake JSON imports.

---

### 3.9 AI Insights (`/ai-insights`) — REWORK

**Current:** OpenRouter chat with fake data in system prompt
**Target:** OpenRouter chat with real data summary injected

**Changes:**
1. On page load, fetch key data from backend:
   - `GET /stats` — counts
   - `GET /margins/summary` — overall margins
   - `GET /margins/by-commodity-group` — group breakdown
   - `GET /risk/distribution` — risk summary
   - `GET /forecasts/accuracy` — model performance
2. Inject this real data into the system prompt (replace `systemPrompt.js` content)
3. Keep the chat UI, streaming, markdown rendering, and chart generation as-is
4. Update suggested prompts to match Scherzinger's actual data

---

### 3.10 Data Quality (NEW PAGE — `/data-quality`)

**Route:** `/data-quality`
**Sidebar icon:** ShieldCheck or ClipboardCheck

**KPIs (4 cards):**

| KPI | API | Field |
|-----|-----|-------|
| Invoice Quality | `GET /data-quality/summary` | `invoice_quality_pct` |
| Quote Quality | `GET /data-quality/summary` | `quote_quality_pct` |
| Linkage Rate | `GET /data-quality/summary` | `linkage_rate_pct` |
| Rejection Coverage | `GET /data-quality/summary` | `rejection_code_coverage_pct` |

**Charts:**

1. **Field Completeness (Horizontal Bar)**
   - API: `GET /data-quality/completeness`
   - Two sections: Invoices, Quotes
   - Y-axis: field name
   - X-axis: completeness_pct (0-100%)
   - Color: green > 95%, amber 80-95%, red < 80%

**Tables:**

1. **Data Quality Issues** — Columns: record_type, record_id, issue_type, details
   - API: `GET /data-quality/issues`

---

## 4. Shared Component Changes

### 4.1 Sidebar.jsx — Update Navigation

Replace current 9 items with:

| Order | Label | Icon | Route | Status |
|-------|-------|------|-------|--------|
| 1 | Dashboard | LayoutDashboard | `/` | Active |
| 2 | Revenue & Margins | TrendingUp | `/revenue` | Active |
| 3 | Customers | Users | `/customers` | Active |
| 4 | Products | Package | `/products` | Active |
| 5 | Forecasting | LineChart | `/forecasting` | Active |
| 6 | Benchmarks | BarChart3 | `/benchmarks` | Active |
| 7 | Data Quality | ShieldCheck | `/data-quality` | Active |
| 8 | Pricing | DollarSign | `/pricing` | Stub |
| 9 | ML Analytics | Brain | `/ml-analytics` | Stub |
| 10 | AI Insights | MessageSquare | `/ai-insights` | Active |

Remove: Inventory page.
Add: Benchmarks page, Data Quality page.

Update bottom user card: Change from "Alex Meier, Head of Analytics" to "Pryzm Analytics" or make it configurable.

### 4.2 Header.jsx — Minor Updates

- Remove hardcoded notifications (or connect to real alerts later)
- Keep search bar as placeholder (future feature)
- Update user display name

### 4.3 Footer.jsx — Update

- Remove "Demo Mode" / "Heiko Stärk" references
- Show: "Scherzinger Margin Intelligence Platform v2.0 — Powered by Pryzm"

### 4.4 KPICard.jsx — Add Loading State

Add a `loading` prop that shows a skeleton/shimmer animation while API data loads.

### 4.5 DataTable.jsx — No Changes

Keep as-is. Already supports custom columns, sorting, search, pagination.

### 4.6 ChartCard.jsx — Add Loading State

Add a `loading` prop with a centered spinner or skeleton.

---

## 5. New Files to Create

### 5.1 API Layer (8 files)

```
frontend/src/api/
├── client.js              # Axios instance, base URL, error interceptor
├── dashboardApi.js        # Composite: stats + margins/summary + risk/distribution
├── marginApi.js           # All /margins/* endpoints
├── quoteApi.js            # All /quotes/* endpoints
├── forecastApi.js         # All /forecasts/* endpoints
├── riskApi.js             # All /risk/* endpoints
├── costApi.js             # /costs/trends, /costs/risers, /costs/seasonal
├── benchmarkApi.js        # All /benchmarks/* endpoints
└── simulationApi.js       # /simulations/* endpoints
```

### 5.2 Custom Hooks (1 file)

```
frontend/src/hooks/
└── useApi.js              # Generic hook: useApi(fetchFn, deps) → { data, loading, error }
```

### 5.3 New Pages (2 files)

```
frontend/src/pages/
├── Benchmarks.jsx         # NEW — Commodity benchmarks + cost intelligence
└── DataQuality.jsx        # NEW — Data quality dashboard
```

### 5.4 Updated Pages (7 files)

```
frontend/src/pages/
├── DashboardOverview.jsx  # REWRITE — real API calls
├── RevenueMargins.jsx     # REWRITE — real API calls
├── Customers.jsx          # REWRITE — real API calls + risk scores
├── ProductsSKUs.jsx       # REWRITE — real API calls + cost trends
├── Forecasting.jsx        # REWRITE — real API calls + Monte Carlo
├── PricingFX.jsx          # STUB — "Coming in Phase 4"
├── MLAnalytics.jsx        # STUB — "Coming in Phase 5"
└── AIInsights.jsx         # REWORK — inject real data into system prompt
```

### 5.5 Updated Components (4 files)

```
frontend/src/components/
├── Sidebar.jsx            # UPDATE — new nav items
├── Header.jsx             # UPDATE — remove fake notifications
├── shared/KPICard.jsx     # UPDATE — add loading state
└── shared/ChartCard.jsx   # UPDATE — add loading state
```

### 5.6 Updated Utils (1 file)

```
frontend/src/utils/
└── systemPrompt.js        # UPDATE — real data summary
```

### 5.7 Files to Delete

```
frontend/src/data/              # DELETE entire directory (12 JSON files)
├── dashboard_data.json
├── customers_detail.json
├── products.json
├── forecasting.json
├── pricing_analysis.json
├── price_governance.json
├── ml_analytics.json
├── inventory_detail.json
├── monthly_detail.json
├── cogs_detail.json
├── pipeline.json
└── sales_transactions.json

frontend/src/pages/
└── Inventory.jsx              # DELETE — not in scope
```

---

## 6. Backend Changes Required

### 6.1 CORS Middleware (Task 3.1)

Add to `backend/main.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 6.2 New Composite Endpoint: Dashboard Summary (Task 3.2)

Create `backend/api/v1/dashboard.py` — a single endpoint that aggregates multiple queries into one response for the dashboard page, reducing frontend round-trips.

```
GET /api/v1/dashboard/summary
```

Response:
```json
{
  "stats": { "invoices": 5565, "quotes": 4539, "customers": 385, "products": 821 },
  "margins": { "total_revenue": 12345678, "db2_margin_weighted": 0.312, ... },
  "by_year": [ { "year": 2022, "revenue": ..., "margin": ... }, ... ],
  "by_commodity_group": [ { "commodity_group": "BKAES", "revenue": ..., "margin": ... }, ... ],
  "risk_distribution": [ { "tier": "low", "count": 100 }, ... ],
  "top_customers": [ ... ],
  "margin_trend": [ ... ]
}
```

### 6.3 Commodity Group Lookup for Products (Task 3.3)

The `/margins/by-product` endpoint doesn't return `commodity_group`. Either:
- **Option A:** Add a JOIN in `margin_service.get_margin_by_product()` to include commodity_group from the products table
- **Option B:** Create a separate lookup endpoint

**Recommended: Option A** — modify the existing query to join with the products table.

---

## 7. Implementation Tasks

### Task 3.1: Backend CORS + Dashboard Endpoint
**Files:** `backend/main.py`, `backend/api/v1/dashboard.py`
**Effort:** Small

1. Add CORS middleware to main.py
2. Create dashboard.py with composite `/dashboard/summary` endpoint
3. Register router in main.py
4. Modify `margin_service.get_margin_by_product()` to include commodity_group

### Task 3.2: API Client Layer
**Files:** All files in `frontend/src/api/`, `frontend/src/hooks/useApi.js`
**Effort:** Small

1. Install axios: `npm install axios`
2. Create `api/client.js` with base URL from env var
3. Create 8 API modules (one per backend domain)
4. Create `useApi` hook for consistent loading/error states

### Task 3.3: Shared Component Updates
**Files:** Sidebar.jsx, Header.jsx, Footer.jsx, KPICard.jsx, ChartCard.jsx
**Effort:** Small

1. Update Sidebar navigation (add Benchmarks, Data Quality; remove Inventory)
2. Add loading skeleton to KPICard and ChartCard
3. Update Footer text
4. Update Header (remove fake notifications)

### Task 3.4: Dashboard Page Rewrite
**Files:** `DashboardOverview.jsx`
**Effort:** Medium

1. Remove all JSON imports
2. Fetch from `/dashboard/summary` on mount
3. Render 4 KPI cards with real data
4. Render Monthly Trend chart (ComposedChart)
5. Render Commodity Group donut
6. Render Risk Distribution chart
7. Add 3 status cards from API data
8. Loading + error states

### Task 3.5: Revenue & Margins Page Rewrite
**Files:** `RevenueMargins.jsx`
**Effort:** Medium

1. Remove all JSON imports
2. Fetch from margins/summary, margins/by-year, margins/trend, margins/gap-analysis, margins/by-product, margins/by-customer
3. Year filter (tabs: 2022, 2023, 2024, 2025, All)
4. 4 KPI cards
5. Monthly trend chart
6. Annual comparison chart
7. Commodity group bar chart
8. Margin gap chart
9. Products + Customers tables

### Task 3.6: Customers Page Rewrite
**Files:** `Customers.jsx`
**Effort:** Medium

1. Remove all JSON imports
2. Fetch from stats, risk/scores, risk/distribution, margins/by-customer, quotes/win-rate-by-customer, margins/gap-analysis
3. 4 KPI cards
4. Customer concentration bar chart
5. Risk distribution chart
6. Customer risk radar (on row select)
7. Risk scores table
8. Win rates table

### Task 3.7: Products Page Rewrite
**Files:** `ProductsSKUs.jsx`
**Effort:** Medium

1. Remove all JSON imports
2. Fetch from stats, margins/by-product, margins/by-commodity-group, costs/risers, costs/trends
3. 4 KPI cards
4. Scatter plot (margin vs revenue)
5. Cost trend lines
6. Commodity group bar
7. Product table + cost risers table

### Task 3.8: Forecasting Page Rewrite
**Files:** `Forecasting.jsx`
**Effort:** Large

1. Remove all JSON imports
2. Entity selector (dropdown: overall/commodity_group/customer/product)
3. Fetch from forecasts/compare, simulations, forecasts/accuracy, costs/seasonal
4. 4 KPI cards
5. Forecast comparison line chart (4 models)
6. Monte Carlo distribution area chart
7. Model accuracy grouped bar
8. Seasonal pattern line chart
9. Backtest results table

### Task 3.9: Benchmarks Page (NEW)
**Files:** `Benchmarks.jsx`
**Effort:** Medium

1. Create new page from scratch
2. Fetch from benchmarks, benchmarks/compare, costs/trends, costs/risers
3. 4 KPI cards
4. Commodity benchmark grouped bar
5. Benchmark trend by year line
6. Entity vs benchmark comparison
7. Cost trend heatmap
8. Full benchmark data table

### Task 3.10: Data Quality Page (NEW)
**Files:** `DataQuality.jsx`
**Effort:** Small

1. Create new page from scratch
2. Fetch from data-quality/summary, data-quality/completeness, data-quality/issues
3. 4 KPI cards
4. Field completeness horizontal bar
5. Issues table

### Task 3.11: Pricing & ML Stubs
**Files:** `PricingFX.jsx`, `MLAnalytics.jsx`
**Effort:** Small

1. Replace entire page content with "Coming Soon" card
2. Remove all JSON imports
3. List planned Phase 4/5 features

### Task 3.12: AI Insights Rework
**Files:** `AIInsights.jsx`, `systemPrompt.js`
**Effort:** Small

1. On page load, fetch real summary data from API
2. Inject into system prompt as context
3. Update suggested prompts to reference real Scherzinger data
4. Keep all chat/streaming/markdown/chart rendering as-is

### Task 3.13: Router & App Updates
**Files:** `App.jsx`, delete `Inventory.jsx`, delete `src/data/` folder
**Effort:** Small

1. Add routes for `/benchmarks` and `/data-quality`
2. Remove route for `/inventory`
3. Delete Inventory.jsx
4. Delete all 12 JSON files in src/data/
5. Update page imports in App.jsx

### Task 3.14: Testing & Verification
**Effort:** Medium

1. Start backend: `uvicorn backend.main:app --reload`
2. Start frontend: `npm run dev`
3. Verify each page loads with real data
4. Check all charts render correctly
5. Check all tables populate and sort/search works
6. Check loading states display during API calls
7. Check error states if backend is down
8. Check AI chat works with real data context
9. Browser console: no errors, no failed API calls
10. Test year filters on Revenue page
11. Test entity selector on Forecasting page
12. Verify Pricing and ML pages show stubs

---

## 8. Execution Order

```
Task 3.1  → Backend CORS + Dashboard endpoint (prerequisite for everything)
Task 3.2  → API Client Layer (prerequisite for all pages)
Task 3.3  → Shared Component Updates
Task 3.13 → Router & App Updates (clean up routing)
Task 3.4  → Dashboard Page
Task 3.5  → Revenue & Margins Page
Task 3.6  → Customers Page
Task 3.7  → Products Page
Task 3.8  → Forecasting Page
Task 3.9  → Benchmarks Page (NEW)
Task 3.10 → Data Quality Page (NEW)
Task 3.11 → Pricing & ML Stubs
Task 3.12 → AI Insights Rework
Task 3.14 → Testing & Verification
```

**Total new files:** 12 (8 API + 1 hook + 2 pages + 1 backend endpoint)
**Total modified files:** 12 (7 pages + 4 components + 1 util)
**Total deleted files:** 14 (12 JSON + 1 page + empty data folder)
**Estimated tasks:** 14

---

## 9. Data Mapping Reference

Quick reference showing which frontend visualization uses which backend endpoint:

| Page | Visualization | Backend Endpoint |
|------|--------------|-----------------|
| Dashboard | Revenue KPI | `GET /dashboard/summary` |
| Dashboard | Margin KPI | `GET /dashboard/summary` |
| Dashboard | Monthly Trend | `GET /margins/trend` |
| Dashboard | Commodity Donut | `GET /margins/by-commodity-group` |
| Dashboard | Risk Distribution | `GET /risk/distribution` |
| Revenue | Year KPIs | `GET /margins/summary?year=X` |
| Revenue | Annual Bars | `GET /margins/by-year` |
| Revenue | Margin Gap | `GET /margins/gap-analysis` |
| Revenue | Product Table | `GET /margins/by-product` |
| Revenue | Customer Table | `GET /margins/by-customer` |
| Customers | Risk Scores | `GET /risk/scores` |
| Customers | Risk Detail | `GET /risk/scores/{id}` |
| Customers | Risk Dist | `GET /risk/distribution` |
| Customers | Concentration | `GET /margins/by-customer?top=15` |
| Customers | Win Rates | `GET /quotes/win-rate-by-customer` |
| Products | Scatter | `GET /margins/by-product` |
| Products | Cost Risers | `GET /costs/risers` |
| Products | Cost Trends | `GET /costs/trends` |
| Products | Commodity Bars | `GET /margins/by-commodity-group` |
| Forecasting | Model Compare | `GET /forecasts/{type}/{id}/compare` |
| Forecasting | Monte Carlo | `GET /simulations/{type}/{id}` |
| Forecasting | Accuracy | `GET /forecasts/accuracy` |
| Forecasting | Seasonal | `GET /costs/seasonal` |
| Benchmarks | Group Compare | `GET /benchmarks?year=X` |
| Benchmarks | Yearly Trend | `GET /benchmarks` |
| Benchmarks | Entity vs Bench | `GET /benchmarks/compare/{type}/{id}` |
| Benchmarks | Cost Trends | `GET /costs/trends` |
| Data Quality | Summary KPIs | `GET /data-quality/summary` |
| Data Quality | Completeness | `GET /data-quality/completeness` |
| Data Quality | Issues | `GET /data-quality/issues` |
| AI Insights | Chat Context | `GET /stats` + `GET /margins/summary` + `GET /risk/distribution` |

---

## 10. Notes & Constraints

1. **No inventory data exists** in the Scherzinger backend. The Inventory page is removed entirely.
2. **No pipeline/CRM data exists**. Pipeline funnel and deal tracking are removed from Forecasting.
3. **No ML models exist yet** (Phase 5). The ML Analytics page becomes a stub.
4. **No FX/pricing optimization exists yet** (Phase 4). The Pricing page becomes a stub.
5. **Commodity groups replace product categories**: The frontend used "Spine", "RF/Energy", etc. — these are replaced with BKAES, BKAGG, BKAIZ, BKAIZ2, BKMF, BKMF2, BKPUMP, BKZYL, MBKUEHL.
6. **Customer IDs are real**: No more UNI-1000 style fake codes. Use actual Scherzinger customer_ids.
7. **Margins are DB2 margins** stored as decimals (0.00-1.00), displayed as percentages.
8. **Revenue is in EUR** — no INR, no FX conversion needed for Phase 3.
9. **The AI chat (OpenRouter)** stays as-is architecturally — just update the system prompt context.
10. **All `src/data/*.json` files are deleted** — no static data remains in the frontend.
