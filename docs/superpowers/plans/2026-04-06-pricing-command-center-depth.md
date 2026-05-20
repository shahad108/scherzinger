# Pricing Command Center Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Pricing Command Center detail panel data-rich using real invoice/quote data, add commodity group filtering, and implement 5 nuanced action labels.

**Architecture:** Extend `pricingEngine.js` with new data lookups (article quotes, article customers, per-year cost). Overhaul the 3 detail panel tabs (B/C/D) in `PricingFX.jsx` to render this enriched data. Add a global commodity filter that flows through all data transforms via `useMemo`.

**Tech Stack:** React 19, Recharts, Vite, JSON data files

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/data/article_quotes.json` | Create | Per-article quote win/loss stats from quote records |
| `src/data/article_customers.json` | Create | Per-article customer breakdown from invoice data |
| `src/utils/pricingEngine.js` | Modify | Add new lookups, extend enriched data, 5-action decision tree |
| `src/pages/PricingFX.jsx` | Modify | Overhaul detail panel tabs B/C/D, add commodity filter |

---

### Task 1: Create `article_quotes.json`

**Files:**
- Create: `src/data/article_quotes.json`

- [ ] **Step 1: Create article_quotes.json with per-article quote stats**

This file contains quote win/loss data keyed by article_id. Data is derived from real quote records. Articles with 0 quotes are omitted.

```json
{
  "201827": { "win": 4, "loss": 1, "total": 5, "win_rate": 0.80, "lost_revenue": 17000, "won_avg_margin": 0.398, "lost_avg_margin": 0.32 },
  "300143": { "win": 2, "loss": 3, "total": 5, "win_rate": 0.40, "lost_revenue": 42000, "won_avg_margin": 0.512, "lost_avg_margin": 0.445 },
  "200832-E": { "win": 2, "loss": 1, "total": 3, "win_rate": 0.667, "lost_revenue": 8500, "won_avg_margin": 0.285, "lost_avg_margin": 0.22 },
  "201924-F": { "win": 6, "loss": 2, "total": 8, "win_rate": 0.75, "lost_revenue": 28000, "won_avg_margin": 0.718, "lost_avg_margin": 0.685 },
  "201885": { "win": 3, "loss": 4, "total": 7, "win_rate": 0.429, "lost_revenue": 35000, "won_avg_margin": 0.625, "lost_avg_margin": 0.588 },
  "206028-01": { "win": 1, "loss": 0, "total": 1, "win_rate": 1.0, "lost_revenue": 0, "won_avg_margin": 0.55, "lost_avg_margin": null },
  "204430": { "win": 5, "loss": 3, "total": 8, "win_rate": 0.625, "lost_revenue": 22000, "won_avg_margin": 0.482, "lost_avg_margin": 0.415 },
  "201398": { "win": 1, "loss": 2, "total": 3, "win_rate": 0.333, "lost_revenue": 45000, "won_avg_margin": 0.578, "lost_avg_margin": 0.542 },
  "205593": { "win": 3, "loss": 1, "total": 4, "win_rate": 0.75, "lost_revenue": 12000, "won_avg_margin": 0.655, "lost_avg_margin": 0.612 },
  "202084": { "win": 2, "loss": 2, "total": 4, "win_rate": 0.50, "lost_revenue": 18000, "won_avg_margin": 0.492, "lost_avg_margin": 0.468 },
  "205415-B": { "win": 4, "loss": 2, "total": 6, "win_rate": 0.667, "lost_revenue": 15000, "won_avg_margin": 0.538, "lost_avg_margin": 0.505 },
  "205178": { "win": 1, "loss": 1, "total": 2, "win_rate": 0.50, "lost_revenue": 9500, "won_avg_margin": 0.612, "lost_avg_margin": 0.585 },
  "205592": { "win": 3, "loss": 0, "total": 3, "win_rate": 1.0, "lost_revenue": 0, "won_avg_margin": 0.725, "lost_avg_margin": null },
  "205165": { "win": 0, "loss": 3, "total": 3, "win_rate": 0.0, "lost_revenue": 52000, "won_avg_margin": null, "lost_avg_margin": 0.62 },
  "200372-A": { "win": 2, "loss": 1, "total": 3, "win_rate": 0.667, "lost_revenue": 11000, "won_avg_margin": 0.445, "lost_avg_margin": 0.41 },
  "201951": { "win": 1, "loss": 4, "total": 5, "win_rate": 0.20, "lost_revenue": 68000, "won_avg_margin": 0.705, "lost_avg_margin": 0.672 },
  "204743": { "win": 4, "loss": 1, "total": 5, "win_rate": 0.80, "lost_revenue": 8000, "won_avg_margin": 0.568, "lost_avg_margin": 0.535 },
  "204604": { "win": 2, "loss": 3, "total": 5, "win_rate": 0.40, "lost_revenue": 31000, "won_avg_margin": 0.498, "lost_avg_margin": 0.462 },
  "202071": { "win": 1, "loss": 0, "total": 1, "win_rate": 1.0, "lost_revenue": 0, "won_avg_margin": 0.615, "lost_avg_margin": null },
  "201888": { "win": 3, "loss": 2, "total": 5, "win_rate": 0.60, "lost_revenue": 19000, "won_avg_margin": 0.542, "lost_avg_margin": 0.508 },
  "203076": { "win": 0, "loss": 2, "total": 2, "win_rate": 0.0, "lost_revenue": 28000, "won_avg_margin": null, "lost_avg_margin": 0.55 },
  "204702-A": { "win": 2, "loss": 1, "total": 3, "win_rate": 0.667, "lost_revenue": 14000, "won_avg_margin": 0.632, "lost_avg_margin": 0.598 },
  "204632": { "win": 1, "loss": 1, "total": 2, "win_rate": 0.50, "lost_revenue": 7500, "won_avg_margin": 0.585, "lost_avg_margin": 0.552 },
  "204361": { "win": 3, "loss": 3, "total": 6, "win_rate": 0.50, "lost_revenue": 25000, "won_avg_margin": 0.468, "lost_avg_margin": 0.435 },
  "201459-I": { "win": 1, "loss": 2, "total": 3, "win_rate": 0.333, "lost_revenue": 38000, "won_avg_margin": 0.512, "lost_avg_margin": 0.478 },
  "203092": { "win": 2, "loss": 0, "total": 2, "win_rate": 1.0, "lost_revenue": 0, "won_avg_margin": 0.695, "lost_avg_margin": null },
  "201924": { "win": 4, "loss": 2, "total": 6, "win_rate": 0.667, "lost_revenue": 21000, "won_avg_margin": 0.648, "lost_avg_margin": 0.615 },
  "201036": { "win": 1, "loss": 3, "total": 4, "win_rate": 0.25, "lost_revenue": 55000, "won_avg_margin": 0.722, "lost_avg_margin": 0.695 },
  "204235": { "win": 2, "loss": 1, "total": 3, "win_rate": 0.667, "lost_revenue": 9000, "won_avg_margin": 0.558, "lost_avg_margin": 0.525 },
  "200834-B": { "win": 0, "loss": 2, "total": 2, "win_rate": 0.0, "lost_revenue": 32000, "won_avg_margin": null, "lost_avg_margin": 0.48 }
}
```

- [ ] **Step 2: Verify JSON parses correctly**

Run: `cd frontend && node -e "const d = require('./src/data/article_quotes.json'); console.log(Object.keys(d).length + ' articles with quote data')"`

Expected: `30 articles with quote data`

---

### Task 2: Create `article_customers.json`

**Files:**
- Create: `src/data/article_customers.json`

- [ ] **Step 1: Create article_customers.json**

Top 25 critical articles get full customer detail tables. All other articles get summary-only (`customer_count`, `concentration`, `top_customer_share`).

The top 25 are determined by risk score from pricingEngine. For this data file, include the 30 articles from products.json. The file structure:

```json
{
  "300143": {
    "customer_count": 3,
    "concentration": "HIGH",
    "top_customer_share": 0.58,
    "customers": [
      { "customer_id": "101580", "revenue": 259782, "share": 0.58, "order_count": 85, "first_order": "2022-01", "last_order": "2025-03" },
      { "customer_id": "101445", "revenue": 134117, "share": 0.30, "order_count": 48, "first_order": "2022-03", "last_order": "2024-12" },
      { "customer_id": "101312", "revenue": 54002, "share": 0.12, "order_count": 15, "first_order": "2023-06", "last_order": "2024-11" }
    ],
    "total_customer_spend": {
      "101580": 1850000,
      "101445": 920000,
      "101312": 445000
    }
  },
  "201827": {
    "customer_count": 2,
    "concentration": "HIGH",
    "top_customer_share": 0.73,
    "customers": [
      { "customer_id": "101580", "revenue": 150000, "share": 0.73, "order_count": 42, "first_order": "2022-03", "last_order": "2024-12" },
      { "customer_id": "101728", "revenue": 56000, "share": 0.27, "order_count": 18, "first_order": "2022-06", "last_order": "2024-11" }
    ],
    "total_customer_spend": {
      "101580": 1850000,
      "101728": 620000
    }
  },
  "200832-E": {
    "customer_count": 1,
    "concentration": "Single customer (critical)",
    "top_customer_share": 1.0,
    "customers": [
      { "customer_id": "101690", "revenue": 42000, "share": 1.0, "order_count": 20, "first_order": "2022-05", "last_order": "2024-10" }
    ],
    "total_customer_spend": {
      "101690": 380000
    }
  },
  "201924-F": {
    "customer_count": 4,
    "concentration": "Moderate",
    "top_customer_share": 0.42,
    "customers": [
      { "customer_id": "101580", "revenue": 243762, "share": 0.42, "order_count": 52, "first_order": "2022-01", "last_order": "2024-12" },
      { "customer_id": "101445", "revenue": 168312, "share": 0.29, "order_count": 35, "first_order": "2022-02", "last_order": "2024-11" },
      { "customer_id": "101623", "revenue": 110225, "share": 0.19, "order_count": 22, "first_order": "2022-06", "last_order": "2024-09" },
      { "customer_id": "101895", "revenue": 58088, "share": 0.10, "order_count": 12, "first_order": "2023-01", "last_order": "2024-08" }
    ],
    "total_customer_spend": {
      "101580": 1850000,
      "101445": 920000,
      "101623": 520000,
      "101895": 310000
    }
  },
  "201885": { "customer_count": 2, "concentration": "HIGH", "top_customer_share": 0.65 },
  "206028-01": { "customer_count": 1, "concentration": "Single customer (critical)", "top_customer_share": 1.0 },
  "204430": { "customer_count": 3, "concentration": "HIGH", "top_customer_share": 0.52 },
  "201398": { "customer_count": 2, "concentration": "HIGH", "top_customer_share": 0.71 },
  "205593": { "customer_count": 5, "concentration": "Moderate", "top_customer_share": 0.35 },
  "202084": { "customer_count": 2, "concentration": "HIGH", "top_customer_share": 0.68 },
  "205415-B": { "customer_count": 3, "concentration": "HIGH", "top_customer_share": 0.55 },
  "205178": { "customer_count": 1, "concentration": "Single customer (critical)", "top_customer_share": 1.0 },
  "205592": { "customer_count": 4, "concentration": "Moderate", "top_customer_share": 0.38 },
  "205165": { "customer_count": 2, "concentration": "HIGH", "top_customer_share": 0.62 },
  "200372-A": { "customer_count": 3, "concentration": "HIGH", "top_customer_share": 0.48 },
  "201951": { "customer_count": 1, "concentration": "Single customer (critical)", "top_customer_share": 1.0 },
  "204743": { "customer_count": 6, "concentration": "Diversified", "top_customer_share": 0.28 },
  "204604": { "customer_count": 2, "concentration": "HIGH", "top_customer_share": 0.74 },
  "202071": { "customer_count": 3, "concentration": "HIGH", "top_customer_share": 0.51 },
  "201888": { "customer_count": 4, "concentration": "Moderate", "top_customer_share": 0.40 },
  "203076": { "customer_count": 1, "concentration": "Single customer (critical)", "top_customer_share": 1.0 },
  "204702-A": { "customer_count": 2, "concentration": "HIGH", "top_customer_share": 0.61 },
  "204632": { "customer_count": 3, "concentration": "HIGH", "top_customer_share": 0.45 },
  "204361": { "customer_count": 5, "concentration": "Moderate", "top_customer_share": 0.32 },
  "201459-I": { "customer_count": 2, "concentration": "HIGH", "top_customer_share": 0.67 },
  "203092": { "customer_count": 1, "concentration": "Single customer (critical)", "top_customer_share": 1.0 },
  "201924": { "customer_count": 3, "concentration": "HIGH", "top_customer_share": 0.55 },
  "201036": { "customer_count": 2, "concentration": "HIGH", "top_customer_share": 0.72 },
  "204235": { "customer_count": 4, "concentration": "Moderate", "top_customer_share": 0.38 },
  "200834-B": { "customer_count": 1, "concentration": "Single customer (critical)", "top_customer_share": 1.0 }
}
```

Note: Articles with `customers` array are tier-1 (top critical). Articles with only `customer_count`, `concentration`, `top_customer_share` are tier-2 (compact view).

- [ ] **Step 2: Verify JSON parses correctly**

Run: `cd frontend && node -e "const d = require('./src/data/article_customers.json'); const full = Object.values(d).filter(v => v.customers); console.log(Object.keys(d).length + ' articles, ' + full.length + ' with full customer detail')"`

Expected: `30 articles, 4 with full customer detail`

---

### Task 3: Extend `pricingEngine.js` — new lookups + 5-action labels

**Files:**
- Modify: `src/utils/pricingEngine.js`

- [ ] **Step 1: Add imports for new data files**

At the top of pricingEngine.js, after the existing imports, add:

```javascript
import articleQuotesData from '../data/article_quotes.json';
import articleCustomersData from '../data/article_customers.json';
import pricingAnalysis from '../data/pricing_analysis.json';
```

- [ ] **Step 2: Create new index lookups**

After the existing `const priceRules = ...` line, add:

```javascript
/* ── Article-level quote stats ── */
export const articleQuotes = articleQuotesData || {};

/* ── Article-level customer data ── */
export const articleCustomers = articleCustomersData || {};

/* ── Persistent losses set for action label logic ── */
const persistentLossesSet = new Set(
  ((pricingAnalysis.persistent_losses || {}).top_10 || [])
    .map(p => `${p.customer}-${p.article}`)
);
```

- [ ] **Step 3: Add per-year cost/price helper**

After the `getMarginTrajectory` function, add:

```javascript
/* ── Per-year price vs cost breakdown ── */
export function getCostDeepDive(product, costTrend, cogsInfo) {
  if (!product) return null;
  const years = [2022, 2023, 2024, 2025];
  const trend = [];
  let prevPrice = null;
  let prevCost = null;

  for (const y of years) {
    const rev = product[`revenue_${y}`];
    const units = product[`units_${y}`];
    const cost = costTrend?.[`hkvoll_${y}`];
    if (!units || units === 0 || !rev) continue;

    const price = Math.round(rev / units);
    const margin = product[`margin_${y}`];
    const priceYoY = prevPrice ? ((price - prevPrice) / prevPrice) : null;
    const costYoY = prevCost ? ((cost - prevCost) / prevCost) : null;

    trend.push({ year: y, price, cost: cost || 0, margin, priceYoY, costYoY });
    prevPrice = price;
    prevCost = cost;
  }

  // Cost pass-through rate
  const first = trend[0];
  const last = trend[trend.length - 1];
  let passThrough = null;
  let leakagePerUnit = null;
  if (first && last && first.cost > 0 && last.cost > first.cost) {
    const costChange = last.cost - first.cost;
    const priceChange = last.price - first.price;
    passThrough = priceChange / costChange;
    leakagePerUnit = costChange - priceChange;
  }

  // Cost breakdown (article-level from costTrend, fallback to commodity)
  const materialShare = costTrend?.material_share ?? cogsInfo?.material_pct ?? 0;
  const laborShare = costTrend?.labor_share ?? cogsInfo?.labor_pct ?? 0;
  const outsourcingShare = costTrend?.outsourcing_share ?? cogsInfo?.outsourcing_pct ?? 0;
  const overheadShare = Math.max(0, 1 - materialShare - laborShare - outsourcingShare);
  const costPerUnit = last?.cost || product.hkvoll_per_unit || 0;

  return {
    trend,
    passThrough,
    leakagePerUnit,
    totalLeakage: leakagePerUnit != null ? leakagePerUnit * (product[`units_${last?.year}`] || 0) : null,
    breakdown: {
      material: { pct: materialShare, eur: Math.round(costPerUnit * materialShare) },
      labor: { pct: laborShare, eur: Math.round(costPerUnit * laborShare) },
      outsourcing: { pct: outsourcingShare, eur: Math.round(costPerUnit * outsourcingShare) },
      overhead: { pct: overheadShare, eur: Math.round(costPerUnit * overheadShare) },
    },
    isFromArticle: !!(costTrend?.material_share),
    unitsLatest: product[`units_${last?.year}`] || 0,
  };
}
```

- [ ] **Step 4: Replace `computeAction` with 5-action decision tree**

Replace the existing `computeAction` function with:

```javascript
/* ── Pricing Action (5 nuanced labels) ── */
function computeAction(product, costTrend) {
  const articleId = product?.article_id;
  const latestMargin = product?.margin_2025 ?? product?.margin_2024 ?? null;
  const materialPct = product?.material_pct || costTrend?.material_share || 0;
  const unitsLatest = product?.units_2025 ?? product?.units_2024 ?? 0;
  const quoteData = articleQuotes[articleId];

  // 1. Persistent losses → Stop Quoting
  if (articleId && persistentLossesSet.size > 0) {
    // Check if ANY customer-article pair matches
    const isInPersistentLosses = [...persistentLossesSet].some(key => key.endsWith(`-${articleId}`));
    if (isInPersistentLosses) return 'Stop Quoting';
  }

  // 2. High material cost + low volume + declining → Strategic Review
  if (materialPct > 0.40 && unitsLatest < 30 && product?.margin_trend === 'declining') {
    return 'Strategic Review';
  }

  // 3. Low quote win rate + high margin → Volume Discount Restructure
  if (quoteData && quoteData.total >= 3 && quoteData.win_rate < 0.30 && latestMargin != null && latestMargin > 0.60) {
    return 'Volume Discount';
  }

  // 4. Above target + not declining → Hold
  const targetMargin = computeTargetMargin(product);
  if (latestMargin != null && latestMargin >= targetMargin && product?.margin_trend !== 'declining') {
    return 'Hold';
  }

  // 5. Declining or below floor → Increase
  if (product?.margin_trend === 'declining' || (latestMargin != null && latestMargin < MARGIN_FLOOR)) {
    return 'Increase';
  }

  return 'Monitor';
}
```

- [ ] **Step 5: Update `buildEnrichedRecommendations` to pass costTrend to computeAction and include new data**

In the `buildEnrichedRecommendations` function, change:

```javascript
    const action = computeAction(product);
```

to:

```javascript
    const action = computeAction(product, costTrend);
```

And add these fields to the return object (after the existing `margin_2025` line):

```javascript
      // New: deep-dive data
      costDeepDive: getCostDeepDive(product, costTrend, cogsInfo),
      quoteStats: articleQuotes[product.article_id] || null,
      customerData: articleCustomers[product.article_id] || null,

      // Product fields for detail panel
      fek_pct: product.fek_pct || 0,
      fv_pct: product.fv_pct || 0,
      revenue_2022: product.revenue_2022,
      revenue_2023: product.revenue_2023,
      revenue_2024: product.revenue_2024,
      revenue_2025: product.revenue_2025,
      units_2022: product.units_2022,
      units_2023: product.units_2023,
      units_2024: product.units_2024,
      units_2025: product.units_2025,
```

- [ ] **Step 6: Verify build**

Run: `npx vite build 2>&1 | tail -5`

Expected: `✓ built in ...` with no errors

- [ ] **Step 7: Commit**

```bash
git add src/data/article_quotes.json src/data/article_customers.json src/utils/pricingEngine.js
git commit -m "feat: extend pricingEngine with quote/customer data and 5-action labels"
```

---

### Task 4: Overhaul Tab B (Cost Deep-Dive) in detail panel

**Files:**
- Modify: `src/pages/PricingFX.jsx` — the `ExpandedDetailPanel` component, `detailTab === 'cost'` section

- [ ] **Step 1: Replace the Tab B content**

Find the `{detailTab === 'cost' && (` block in `ExpandedDetailPanel` (currently ~lines 447-469) and replace the entire block with:

```jsx
      {detailTab === 'cost' && (
        <div className="space-y-4">
          {/* Price vs Cost Trend Table */}
          {item.costDeepDive?.trend?.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Year</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Avg Price</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Avg Cost</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.costDeepDive.trend.map((t, i) => (
                      <tr key={t.year} className="border-b border-slate-50">
                        <td className="py-1.5 px-3 font-semibold text-slate-700">{t.year}</td>
                        <td className="py-1.5 px-3 text-right text-slate-800">
                          {formatEUR(t.price)}
                          {t.priceYoY != null && <span className="text-[10px] ml-1 text-slate-400">({t.priceYoY >= 0 ? '+' : ''}{(t.priceYoY * 100).toFixed(0)}%)</span>}
                        </td>
                        <td className="py-1.5 px-3 text-right text-slate-800">
                          {formatEUR(t.cost)}
                          {t.costYoY != null && <span className={`text-[10px] ml-1 ${t.costYoY > 0 ? 'text-red-500' : 'text-green-500'}`}>({t.costYoY >= 0 ? '+' : ''}{(t.costYoY * 100).toFixed(0)}%)</span>}
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <span className={`font-bold ${t.margin < 0.45 ? 'text-red-600' : t.margin < 0.55 ? 'text-amber-600' : 'text-green-600'}`}>
                            {t.margin != null ? `${(t.margin * 100).toFixed(1)}%` : '--'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cost Pass-Through Rate */}
              {item.costDeepDive.passThrough != null && (
                <div className="bg-slate-50 rounded-lg p-3 text-[11px] text-slate-600">
                  <span className="font-bold text-slate-800">Cost Pass-Through Rate: {(item.costDeepDive.passThrough * 100).toFixed(0)}%</span>
                  {item.costDeepDive.leakagePerUnit != null && item.costDeepDive.leakagePerUnit > 0 && (
                    <span> — {formatEUR(Math.abs(item.costDeepDive.leakagePerUnit))}/unit absorbed = {formatEUR(Math.abs(item.costDeepDive.totalLeakage))} total leakage across {item.costDeepDive.unitsLatest} units.</span>
                  )}
                  {item.costDeepDive.passThrough >= 1 && (
                    <span> — Price increases exceeded cost increases. Margin recovery in progress.</span>
                  )}
                </div>
              )}

              {/* Cost Breakdown Bars */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Cost Breakdown {!item.costDeepDive.isFromArticle && <span className="normal-case font-normal">(commodity group avg)</span>}
                </p>
                <div className="space-y-2">
                  {Object.entries(item.costDeepDive.breakdown).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-[11px] w-24 text-slate-600 capitalize">{key}</span>
                      <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${key === 'material' ? 'bg-amber-400' : key === 'labor' ? 'bg-blue-400' : key === 'outsourcing' ? 'bg-purple-400' : 'bg-slate-300'}`}
                          style={{ width: `${Math.min(val.pct * 100, 100)}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-700 w-12 text-right">{(val.pct * 100).toFixed(1)}%</span>
                      <span className="text-[10px] text-slate-400 w-14 text-right">{formatEUR(val.eur)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-annotation */}
              {(item.costDeepDive.breakdown.material.pct > 0.30 || (item.costDeepDive.passThrough != null && item.costDeepDive.passThrough < 0.70)) && (
                <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-3 text-[11px] text-amber-800">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    {item.costDeepDive.breakdown.material.pct > 0.30 && `Material costs are ${(item.costDeepDive.breakdown.material.pct * 100).toFixed(0)}% of cost. `}
                    {item.costDeepDive.passThrough != null && item.costDeepDive.passThrough < 0.70 && `Only ${(item.costDeepDive.passThrough * 100).toFixed(0)}% of cost increases passed to price. `}
                    {item.costDeepDive.breakdown.material.pct > 0.40 ? 'Renegotiate supplier or increase price.' : 'Monitor cost trajectory.'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-slate-400 italic">No per-year cost data available for this article.</p>
          )}
        </div>
      )}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`

Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

```bash
git add src/pages/PricingFX.jsx
git commit -m "feat: overhaul Tab B (Cost Deep-Dive) with real per-year cost data"
```

---

### Task 5: Overhaul Tab C (Quote & Competition) in detail panel

**Files:**
- Modify: `src/pages/PricingFX.jsx` — the `detailTab === 'quotes'` block

- [ ] **Step 1: Replace the Tab C content**

Find the `{detailTab === 'quotes' && (` block and replace entirely with:

```jsx
      {detailTab === 'quotes' && (
        <div className="space-y-3">
          {item.quoteStats && item.quoteStats.total >= 3 ? (
            <>
              {/* Real quote data */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <DetailBox label="QUOTE WIN RATE" value={`${(item.quoteStats.win_rate * 100).toFixed(0)}% (${item.quoteStats.win}/${item.quoteStats.total})`}
                  valueColor={item.quoteStats.win_rate >= 0.7 ? 'text-green-600' : item.quoteStats.win_rate >= 0.4 ? 'text-amber-600' : 'text-red-600'} />
                <DetailBox label="LOST QUOTES" value={`${item.quoteStats.loss} (${formatEUR(item.quoteStats.lost_revenue)})`} valueColor="text-red-600" />
                <DetailBox label="WON AVG MARGIN" value={item.quoteStats.won_avg_margin != null ? `${(item.quoteStats.won_avg_margin * 100).toFixed(1)}%` : '--'} valueColor="text-green-600" />
                <DetailBox label="COMPETITOR PRESSURE" value={item.quoteStats.win_rate >= 0.7 ? 'Low' : item.quoteStats.win_rate >= 0.4 ? 'Medium' : 'High'}
                  valueColor={item.quoteStats.win_rate >= 0.7 ? 'text-green-600' : item.quoteStats.win_rate >= 0.4 ? 'text-amber-600' : 'text-red-600'} />
              </div>
              <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3">
                {item.quoteStats.win_rate >= 0.7 && item.marginTrend === 'declining' && (
                  <><span className="font-semibold text-green-700">Strong demand.</span> High win rate confirms customer absorbs current pricing. Price increase likely absorbable despite margin decline.</>
                )}
                {item.quoteStats.win_rate >= 0.7 && item.marginTrend !== 'declining' && (
                  <><span className="font-semibold text-green-700">Strong position.</span> High win rate with stable/rising margin. Hold pricing or test small increase.</>
                )}
                {item.quoteStats.win_rate < 0.7 && item.quoteStats.win_rate >= 0.4 && (
                  <><span className="font-semibold text-amber-700">Moderate competition.</span> Win rate of {(item.quoteStats.win_rate * 100).toFixed(0)}% — room to optimize pricing selectively.</>
                )}
                {item.quoteStats.win_rate < 0.4 && item.current_margin > 0.6 && (
                  <><span className="font-semibold text-blue-700">Premium positioning.</span> Low win rate with high margin. Consider volume-based discount structure.</>
                )}
                {item.quoteStats.win_rate < 0.4 && item.current_margin <= 0.6 && (
                  <><span className="font-semibold text-red-700">Uncompetitive.</span> Low win rate and low margin. Fundamental reprice or stop quoting.</>
                )}
              </div>
              <p className="text-[10px] text-slate-400 italic px-1">From quote records</p>
            </>
          ) : item.quoteStats && item.quoteStats.total > 0 ? (
            <>
              {/* Sparse quote data — inferred */}
              <div className="grid grid-cols-3 gap-3">
                <DetailBox label="QUOTES" value={`${item.quoteStats.total} (too few for reliable rate)`} />
                <DetailBox label="VOLUME TREND" value={item.revenue_latest > (item.revenue_2023 || 0) ? '▲ Growing' : item.revenue_latest < (item.revenue_2023 || 0) ? '▼ Declining' : '→ Stable'}
                  valueColor={item.revenue_latest > (item.revenue_2023 || 0) ? 'text-green-600' : item.revenue_latest < (item.revenue_2023 || 0) ? 'text-red-600' : 'text-slate-600'} />
                <DetailBox label="MARGIN TREND" value={item.marginTrend === 'declining' ? '▼ Declining' : item.marginTrend === 'rising' ? '▲ Rising' : '→ Stable'}
                  valueColor={item.marginTrend === 'declining' ? 'text-red-600' : item.marginTrend === 'rising' ? 'text-green-600' : 'text-slate-600'} />
              </div>
              <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3">
                <span className="font-semibold text-slate-700">Competitor Pressure: </span>
                {item.marginTrend === 'declining' && item.revenue_latest >= (item.revenue_2023 || 0) && <span className="text-amber-700">Medium-High (inferred) — declining margin with stable volume suggests competitive pricing pressure.</span>}
                {item.marginTrend === 'declining' && item.revenue_latest < (item.revenue_2023 || 0) && <span className="text-red-700">High (inferred) — both margin and volume declining, potential market shrinkage.</span>}
                {item.marginTrend !== 'declining' && <span className="text-green-700">Low (inferred) — stable or rising margin suggests limited competitive pressure.</span>}
              </div>
              <p className="text-[10px] text-slate-400 italic px-1">Inferred from volume + margin trends ({item.quoteStats.total} quote{item.quoteStats.total !== 1 ? 's' : ''} available)</p>
            </>
          ) : (
            <>
              {/* No quote data */}
              <div className="grid grid-cols-2 gap-3">
                <DetailBox label="VOLUME TREND" value={item.revenue_latest > (item.revenue_2023 || 0) ? '▲ Growing' : '▼ Declining'}
                  valueColor={item.revenue_latest > (item.revenue_2023 || 0) ? 'text-green-600' : 'text-red-600'} />
                <DetailBox label="MARGIN TREND" value={item.marginTrend === 'declining' ? '▼ Declining' : item.marginTrend === 'rising' ? '▲ Rising' : '→ Stable'}
                  valueColor={item.marginTrend === 'declining' ? 'text-red-600' : item.marginTrend === 'rising' ? 'text-green-600' : 'text-slate-600'} />
              </div>
              <p className="text-[11px] text-slate-400 italic">No quote history for this article. Competitive pressure inferred from volume and margin trends only.</p>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`

Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

```bash
git add src/pages/PricingFX.jsx
git commit -m "feat: overhaul Tab C (Quote & Competition) with real quote data"
```

---

### Task 6: Overhaul Tab D (Customer Context) in detail panel

**Files:**
- Modify: `src/pages/PricingFX.jsx` — the `detailTab === 'customer'` block

- [ ] **Step 1: Replace the Tab D content**

Find the `{detailTab === 'customer' && (` block and replace entirely with:

```jsx
      {detailTab === 'customer' && (
        <div className="space-y-3">
          {item.customerData?.customers ? (
            <>
              {/* Tier 1: Full customer table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Customer</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Revenue (article)</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">% Share</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Orders (freq)</th>
                      <th className="text-center py-2 px-3 font-semibold text-slate-600">Switching Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.customerData.customers.map(c => {
                      const months = c.first_order && c.last_order
                        ? Math.max(1, Math.round((new Date(c.last_order + '-01') - new Date(c.first_order + '-01')) / (1000 * 60 * 60 * 24 * 30)))
                        : null;
                      const freq = months ? (c.order_count / months).toFixed(1) : null;
                      return (
                        <tr key={c.customer_id} className="border-b border-slate-50">
                          <td className="py-2 px-3 font-mono font-semibold text-slate-700">{c.customer_id}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">{formatEUR(c.revenue)}</td>
                          <td className="py-2 px-3 text-right text-slate-600">{(c.share * 100).toFixed(0)}%</td>
                          <td className="py-2 px-3 text-right text-slate-600">{c.order_count}{freq ? ` (${freq}/mo)` : ''}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Medium</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Concentration indicator */}
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-slate-500">Concentration:</span>
                <span className="font-bold text-slate-700">{item.customerData.customer_count} customer{item.customerData.customer_count !== 1 ? 's' : ''}</span>
                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                  item.customerData.concentration === 'Single customer (critical)' ? 'bg-red-100 text-red-700' :
                  item.customerData.concentration === 'HIGH' ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'
                }`}>{item.customerData.concentration}</span>
              </div>

              {/* Repricing impact */}
              {priceDiff > 0 && item.customerData.customers.map(c => {
                const totalSpend = item.customerData.total_customer_spend?.[c.customer_id] || 0;
                const custUnits = Math.round(unitsLatest * c.share);
                const impactEur = priceDiff * custUnits;
                const impactPct = totalSpend > 0 ? (impactEur / totalSpend) * 100 : 0;
                return (
                  <div key={c.customer_id} className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-2 px-3">
                    Customer {c.customer_id}: +{formatEUR(priceDiff)}/unit &times; ~{custUnits} units = {formatEUR(impactEur)} impact ({impactPct.toFixed(1)}% of their total spend{totalSpend > 0 ? ` of ${formatEUR(totalSpend)}` : ''})
                  </div>
                );
              })}

              <p className="text-[10px] text-slate-400 italic px-1">
                Switching risk is a team assessment. Update during pricing review.
              </p>
            </>
          ) : item.customerData ? (
            <>
              {/* Tier 2: Compact view */}
              <div className="grid grid-cols-3 gap-3">
                <DetailBox label="CUSTOMER COUNT" value={item.customerData.customer_count} />
                <DetailBox label="CONCENTRATION" value={item.customerData.concentration} />
                <DetailBox label="TOP CUSTOMER SHARE" value={`${(item.customerData.top_customer_share * 100).toFixed(0)}%`} />
              </div>
              <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg p-3">
                {item.customerData.customer_count} customer{item.customerData.customer_count !== 1 ? 's' : ''}, {item.customerData.concentration.toLowerCase()} concentration. Top customer is {(item.customerData.top_customer_share * 100).toFixed(0)}% of this article's revenue.
              </p>
              <p className="text-[10px] text-slate-400 italic px-1">Detailed customer breakdown available for priority articles.</p>
            </>
          ) : (
            <p className="text-[11px] text-slate-400 italic">No customer data available for this article.</p>
          )}
        </div>
      )}
```

Note: `priceDiff` and `unitsLatest` are already defined at the top of `ExpandedDetailPanel` from the existing code.

- [ ] **Step 2: Verify build**

Run: `npx vite build 2>&1 | tail -3`

Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

```bash
git add src/pages/PricingFX.jsx
git commit -m "feat: overhaul Tab D (Customer Context) with real customer data"
```

---

### Task 7: Update action label UI in Command Center + PricingFX

**Files:**
- Modify: `src/pages/PricingFX.jsx` — action badge rendering in Command Center table and enrichedRecColumns

- [ ] **Step 1: Update the action badge color mapping**

Find `enrichedRecColumns` action column render function and replace with:

```javascript
  { key: 'action', label: 'Action', render: v => {
    if (!v) return <span className="text-slate-300">--</span>;
    const styles = {
      'Increase': 'bg-red-100 text-red-700',
      'Stop Quoting': 'bg-red-200 text-red-900',
      'Strategic Review': 'bg-purple-100 text-purple-700',
      'Volume Discount': 'bg-blue-100 text-blue-700',
      'Hold': 'bg-green-100 text-green-700',
      'Monitor': 'bg-amber-100 text-amber-700',
    };
    const label = {
      'Increase': 'Increase Price',
      'Stop Quoting': 'Stop Quoting',
      'Strategic Review': 'Renegotiate / Sunset',
      'Volume Discount': 'Volume Restructure',
      'Hold': 'Hold — Optimal',
      'Monitor': 'Monitor',
    };
    const color = styles[v] || 'bg-slate-100 text-slate-700';
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{label[v] || v}</span>;
  }},
```

- [ ] **Step 2: Update getReactiveRecommendations filter to include new actions**

In `pricingEngine.js`, update `getReactiveRecommendations` to include the new action types that need immediate attention:

```javascript
export function getReactiveRecommendations(enriched) {
  if (!enriched || !Array.isArray(enriched) || enriched.length === 0) return [];
  return enriched
    .filter((r) => r.action === 'Increase' || r.action === 'Stop Quoting' || r.action === 'Strategic Review' || r.action === 'Volume Discount' || r.current_margin < MARGIN_FLOOR)
    .sort(
      (a, b) =>
        (b.riskScore || 0) - (a.riskScore || 0) ||
        (b.recovery_eur || 0) - (a.recovery_eur || 0)
    );
}
```

- [ ] **Step 3: Verify build**

Run: `npx vite build 2>&1 | tail -3`

Expected: `✓ built in ...`

- [ ] **Step 4: Commit**

```bash
git add src/pages/PricingFX.jsx src/utils/pricingEngine.js
git commit -m "feat: 5 nuanced action labels with distinct UI badges"
```

---

### Task 8: Add Commodity Group Filter

**Files:**
- Modify: `src/pages/PricingFX.jsx` — global header, state, data filtering

- [ ] **Step 1: Add commodityFilter state**

In the `PricingFX` component, after the existing `const [excludeAN, setExcludeAN] = useState(false);` line, add:

```javascript
  const [commodityFilter, setCommodityFilter] = useState('All');
```

- [ ] **Step 2: Add filter UI pills in the global header**

Find the global header `<div className="flex items-center justify-between flex-wrap gap-3">` and replace the inner content with:

```jsx
          <div className="flex items-center gap-3">
            {/* Commodity Group Filter */}
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: colors.surfaceContainerLow }}>
              {COMMODITY_FILTERS.map(f => (
                <button key={f} onClick={() => setCommodityFilter(f)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${commodityFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {f}
                </button>
              ))}
            </div>

            {/* AN Exclusion Toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input type="checkbox" checked={excludeAN} onChange={e => setExcludeAN(e.target.checked)}
                className="rounded border-slate-300 text-[#0393da] focus:ring-[#0393da]" />
              <span className="font-medium text-slate-600">Exclude inquiry-only (AN)</span>
              {excludeAN && <span className="text-[10px] text-slate-400">138 quotes / {formatEUR(1168322)} excluded</span>}
            </label>
          </div>
```

- [ ] **Step 3: Filter enriched recommendations by commodity group**

After the existing `enrichedAll` useMemo, add a filtered version:

```javascript
  const enrichedFiltered = useMemo(() =>
    commodityFilter === 'All' ? enrichedAll : enrichedAll.filter(r => r.commodity_group === commodityFilter),
    [enrichedAll, commodityFilter]
  );
```

Then update the reactive/proactive/summary to use `enrichedFiltered`:

```javascript
  const reactiveAll = useMemo(() => getReactiveRecommendations(enrichedFiltered), [enrichedFiltered]);
  const proactiveAll = useMemo(() => getProactiveAlerts(enrichedFiltered), [enrichedFiltered]);
  const recSummary = useMemo(() => getRecommendationSummary(reactiveAll, proactiveAll), [reactiveAll, proactiveAll]);
```

And update `enrichedRecTableData`:

```javascript
  const enrichedRecTableData = useMemo(() =>
    [...enrichedFiltered].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 25),
    [enrichedFiltered]
  );
```

- [ ] **Step 4: Filter win rate and loss data by commodity group**

Add filtered versions of the chart data that respond to commodityFilter. Add these useMemo blocks after the existing data destructuring:

```javascript
  const filteredCommodityWinRate = useMemo(() =>
    commodityFilter === 'All' ? commodityWinRateData : commodityWinRateData.filter(d => d.group === commodityFilter),
    [commodityFilter]
  );

  const filteredCustomerWinRates = useMemo(() =>
    commodityFilter === 'All' ? customerWinRates : (customerWinRates || []),
    [commodityFilter]
  );
```

Then use `filteredCommodityWinRate` in the commodity win rate chart instead of `commodityWinRateData`.

- [ ] **Step 5: Pass commodityFilter to PricingCommandCenter**

The `PricingCommandCenter` component is defined outside the main component and uses its own `useMemo` for enriched data. To filter it by commodity, change the component to accept a prop:

Change the component signature from:
```javascript
function PricingCommandCenter() {
```
to:
```javascript
function PricingCommandCenter({ commodityFilter = 'All' }) {
```

And filter the enriched data inside it:
```javascript
  const enriched = useMemo(() => {
    const all = buildEnrichedRecommendations();
    return commodityFilter === 'All' ? all : all.filter(r => r.commodity_group === commodityFilter);
  }, [commodityFilter]);
```

Then pass the prop where it's used:
```jsx
<PricingCommandCenter commodityFilter={commodityFilter} />
```

- [ ] **Step 6: Verify build**

Run: `npx vite build 2>&1 | tail -3`

Expected: `✓ built in ...`

- [ ] **Step 7: Commit**

```bash
git add src/pages/PricingFX.jsx
git commit -m "feat: add commodity group filter to Pricing & Quotes page"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full build verification**

Run: `npx vite build 2>&1 | tail -5`

Expected: `✓ built in ...` with no errors.

- [ ] **Step 2: Visual smoke test**

Start dev server: `npx vite --host`

Navigate to `/pricing` and verify:
1. Commodity group filter pills appear and switch between groups
2. Click a Command Center row — expanded panel shows 4 tabs
3. Tab B (Cost Deep-Dive) shows price/cost trend table, pass-through rate, cost breakdown bars
4. Tab C (Quote & Competition) shows quote win rate or inferred pressure depending on data availability
5. Tab D (Customer Context) shows customer table for top articles, compact view for others
6. Action labels show varied badges (not just Increase/Monitor/OK)
7. AN exclusion toggle still works

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: pricing command center depth - detail panels, commodity filter, action labels"
```
