# Inventory Merge into SKU Slide-Over Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone Cost Intelligence and Inventory pages, merge their useful data into the SKU slide-over panel, and wire the slide-over to open from the Products/SKUs page table and search bar.

**Architecture:** Create `inventory_stock.json` with per-article stock data. Extend `SKUSlideOver.jsx` with two new sections (Inventory Status + Cost Intelligence). Wire `openSKUDetail()` into ProductsSKUs table row clicks and search selection. Remove routes and sidebar entries.

**Tech Stack:** React 19, Recharts, Vite, JSON data files

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/data/inventory_stock.json` | Create | Per-article stock levels, reorder points, demand, carrying costs |
| `src/components/SKUSlideOver.jsx` | Modify | Add Inventory Status + Cost Intelligence sections |
| `src/pages/ProductsSKUs.jsx` | Modify | Wire openSKUDetail on table row click + search selection |
| `src/App.jsx` | Modify | Remove /cost-intelligence route and /inventory redirect |
| `src/components/Sidebar.jsx` | Modify | Remove Cost Intelligence nav item |

---

### Task 1: Create `inventory_stock.json`

**Files:**
- Create: `src/data/inventory_stock.json`

- [ ] **Step 1: Create inventory_stock.json with per-article stock data**

Create the file at `/Users/dharmendersingh/Documents/Scherzinger_new/frontend/src/data/inventory_stock.json`.

All 30 article IDs from products.json must be included: "201924-F", "300143", "201885", "206028-01", "204430", "201398", "205593", "202084", "205415-B", "201827", "205178", "205592", "205165", "200372-A", "201951", "204743", "204604", "202071", "201888", "203076", "204702-A", "204632", "204361", "201459-I", "200832-E", "203092", "201924", "201036", "204235", "200834-B"

Each entry has this shape:
```json
{
  "current_stock": 45,
  "reorder_point": 20,
  "safety_stock": 15,
  "lead_time_weeks": 6,
  "avg_monthly_demand": 8,
  "months_of_supply": 5.6,
  "last_order_date": "2024-11-15",
  "stockouts_12mo": 0,
  "carrying_cost_annual": 2340,
  "max_capacity": 75
}
```

Guidelines for realistic data:
- `current_stock`: 5-120 units (vary widely)
- `reorder_point`: typically 1-3 months of demand
- `safety_stock`: roughly 50-75% of reorder_point
- `lead_time_weeks`: 2-12 weeks
- `avg_monthly_demand`: derive roughly from products.json units_2024/12
- `months_of_supply`: current_stock / avg_monthly_demand
- `last_order_date`: between 2024-06 and 2025-02
- `stockouts_12mo`: 0-3 (most should be 0)
- `carrying_cost_annual`: roughly current_stock * hkvoll_per_unit * 0.25 (25% carrying rate)
- `max_capacity`: current_stock * 1.5 to 2.5 (rounded)

Some articles should be in each status:
- ~60% Green (adequate): current_stock > reorder_point + safety_stock
- ~25% Amber (reorder soon): current_stock > safety_stock but <= reorder_point
- ~15% Red (critical): current_stock <= safety_stock OR stockouts > 0

- [ ] **Step 2: Verify JSON parses**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && node -e "const d = require('./src/data/inventory_stock.json'); console.log(Object.keys(d).length + ' articles'); const green = Object.values(d).filter(v => v.current_stock > v.reorder_point + v.safety_stock).length; const amber = Object.values(d).filter(v => v.current_stock > v.safety_stock && v.current_stock <= v.reorder_point).length; const red = Object.values(d).filter(v => v.current_stock <= v.safety_stock || v.stockouts_12mo > 0).length; console.log('Green:', green, 'Amber:', amber, 'Red:', red)"`

Expected: `30 articles` with a mix of green/amber/red.

---

### Task 2: Remove routes and sidebar entry

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Sidebar.jsx`

- [ ] **Step 1: Remove routes from App.jsx**

Read `/Users/dharmendersingh/Documents/Scherzinger_new/frontend/src/App.jsx`.

Find and remove these two route lines (around lines 50-51):
```jsx
<Route path="/cost-intelligence" element={<CostIntelligence />} />
<Route path="/inventory" element={<Navigate to="/cost-intelligence" replace />} />
```

Also remove the CostIntelligence import (around line 12):
```javascript
import CostIntelligence from './pages/CostIntelligence';
```

If `Navigate` is no longer used by any other route, remove it from the react-router-dom import too. Check first — other routes may use it.

- [ ] **Step 2: Remove sidebar nav item**

Read `/Users/dharmendersingh/Documents/Scherzinger_new/frontend/src/components/Sidebar.jsx`.

In the `navItems` array (around line 17), remove:
```javascript
{ to: '/cost-intelligence', label: 'Cost Intelligence', icon: Warehouse },
```

If the `Warehouse` icon import from lucide-react is no longer used anywhere in the file, remove it from the import statement too.

- [ ] **Step 3: Verify build**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && npx vite build 2>&1 | tail -5`

Expected: `✓ built in ...` — no errors. The CostIntelligence.jsx and Inventory.jsx files still exist but are now unused (tree-shaken out of the build).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/Sidebar.jsx
git commit -m "feat: remove Cost Intelligence and Inventory routes/nav"
```

---

### Task 3: Extend SKUSlideOver with Inventory Status + Cost Intelligence

**Files:**
- Modify: `src/components/SKUSlideOver.jsx` (currently named `src/components/SKUSlideOver.jsx`, NOT in shared/)

- [ ] **Step 1: Add inventory data import**

Read `/Users/dharmendersingh/Documents/Scherzinger_new/frontend/src/components/SKUSlideOver.jsx`.

Near the top of the file, after existing imports, add:

```javascript
import inventoryStock from '../data/inventory_stock.json';
```

- [ ] **Step 2: Add inventory status helper function**

Before the main component function, add this helper:

```javascript
function getInventoryStatus(stock) {
  if (!stock) return { label: 'No Data', color: 'bg-slate-100 text-slate-500' };
  if (stock.current_stock <= stock.safety_stock || stock.stockouts_12mo > 0) {
    return { label: 'Critical', color: 'bg-red-100 text-red-700' };
  }
  if (stock.current_stock <= stock.reorder_point) {
    return { label: 'Reorder Soon', color: 'bg-amber-100 text-amber-700' };
  }
  return { label: 'Adequate', color: 'bg-green-100 text-green-700' };
}
```

- [ ] **Step 3: Add inventory + cost sections to the slide-over body**

Inside the main component, after the `skuCode` is resolved (around where `getSKUDetail` is called), add a lookup:

```javascript
const stockData = inventoryStock[skuCode] || null;
const stockStatus = getInventoryStatus(stockData);
```

Then find the last content section before the closing `</motion.div>` tags at the end of the component (around line 631-633). Insert these two new sections BEFORE the closing tags:

```jsx
            {/* ── Inventory Status ── */}
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Inventory Status</h4>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${stockStatus.color}`}>
                  {stockStatus.label}
                </span>
              </div>

              {stockData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Current Stock</p>
                      <p className="text-sm font-bold text-slate-800">{stockData.current_stock} units</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Reorder Point</p>
                      <p className="text-sm font-bold text-slate-800">{stockData.reorder_point} units</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Lead Time</p>
                      <p className="text-sm font-bold text-slate-800">{stockData.lead_time_weeks} weeks</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Monthly Demand</p>
                      <p className="text-sm font-bold text-slate-800">{stockData.avg_monthly_demand} units</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Months of Supply</p>
                      <p className={`text-sm font-bold ${stockData.months_of_supply < 2 ? 'text-red-600' : stockData.months_of_supply < 4 ? 'text-amber-600' : 'text-green-600'}`}>
                        {stockData.months_of_supply.toFixed(1)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-[11px]">
                    <div>
                      <span className="text-slate-400">Safety Stock:</span>
                      <span className="ml-1 font-semibold text-slate-700">{stockData.safety_stock} units</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Last Order:</span>
                      <span className="ml-1 font-semibold text-slate-700">{stockData.last_order_date}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Stockouts (12mo):</span>
                      <span className={`ml-1 font-semibold ${stockData.stockouts_12mo > 0 ? 'text-red-600' : 'text-green-600'}`}>{stockData.stockouts_12mo}</span>
                    </div>
                  </div>

                  <div className="text-[11px]">
                    <span className="text-slate-400">Carrying Cost:</span>
                    <span className="ml-1 font-semibold text-slate-700">{formatEUR(stockData.carrying_cost_annual)}/yr</span>
                  </div>

                  {/* Stock level bar */}
                  <div className="relative w-full h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                        stockStatus.label === 'Critical' ? 'bg-red-400' :
                        stockStatus.label === 'Reorder Soon' ? 'bg-amber-400' : 'bg-green-400'
                      }`}
                      style={{ width: `${Math.min((stockData.current_stock / stockData.max_capacity) * 100, 100)}%` }}
                    />
                    {/* Reorder point marker */}
                    <div className="absolute top-0 h-full border-l-2 border-dashed border-amber-500"
                      style={{ left: `${(stockData.reorder_point / stockData.max_capacity) * 100}%` }}
                      title="Reorder point" />
                    {/* Safety stock marker */}
                    <div className="absolute top-0 h-full border-l-2 border-dashed border-red-500"
                      style={{ left: `${(stockData.safety_stock / stockData.max_capacity) * 100}%` }}
                      title="Safety stock" />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">
                      {stockData.current_stock} / {stockData.max_capacity}
                    </span>
                  </div>
                  <div className="flex gap-4 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 border-t-2 border-dashed border-red-500" /> Safety</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-0.5 border-t-2 border-dashed border-amber-500" /> Reorder</span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">No inventory data available for this article.</p>
              )}
            </div>

            {/* ── Cost Intelligence ── */}
            {costTrend && (
              <div className="mt-6 pt-5 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Cost Intelligence</h4>
                <div className="space-y-3">
                  {/* Cost breakdown bars */}
                  <div className="space-y-2">
                    {[
                      { key: 'Material', pct: costTrend.material_share || 0, color: 'bg-amber-400' },
                      { key: 'Labor', pct: costTrend.labor_share || 0, color: 'bg-blue-400' },
                      { key: 'Outsourcing', pct: costTrend.outsourcing_share || 0, color: 'bg-purple-400' },
                      { key: 'Overhead', pct: Math.max(0, 1 - (costTrend.material_share || 0) - (costTrend.labor_share || 0) - (costTrend.outsourcing_share || 0)), color: 'bg-slate-300' },
                    ].map(item => (
                      <div key={item.key} className="flex items-center gap-3">
                        <span className="text-[11px] w-20 text-slate-600">{item.key}</span>
                        <div className="flex-1 h-3.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${Math.min(item.pct * 100, 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-700 w-12 text-right">{(item.pct * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <span className="text-slate-400">Cost Change:</span>
                      <span className={`ml-1 font-bold ${(costTrend.cost_change_pct || 0) > 0.1 ? 'text-red-600' : (costTrend.cost_change_pct || 0) < -0.05 ? 'text-green-600' : 'text-slate-700'}`}>
                        {costTrend.cost_change_pct != null ? `${(costTrend.cost_change_pct * 100).toFixed(1)}%` : '--'}
                        {(costTrend.cost_change_pct || 0) > 0 ? ' ▲' : (costTrend.cost_change_pct || 0) < 0 ? ' ▼' : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Trend:</span>
                      <span className={`ml-1 font-bold ${costTrend.cost_trend === 'rising' ? 'text-red-600' : costTrend.cost_trend === 'declining' ? 'text-green-600' : 'text-slate-700'}`}>
                        {costTrend.cost_trend === 'rising' ? '↑ Rising' : costTrend.cost_trend === 'declining' ? '↓ Declining' : '→ Stable'}
                      </span>
                    </div>
                  </div>

                  {(costTrend.material_share || 0) > 0.40 && (
                    <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-2.5 text-[11px] text-amber-800">
                      <span className="font-bold">!</span>
                      <span>Material costs are {((costTrend.material_share || 0) * 100).toFixed(0)}% of production cost. Consider supplier renegotiation or price adjustment.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
```

**Important:** The `costTrend` variable should already be available in the component scope since the existing code imports `costTrendsByArticle` from pricingEngine. Find where it's used and verify the variable name. It may be accessed as:
```javascript
const costTrend = costTrendsByArticle[skuCode];
```
If this doesn't already exist as a variable, add it near the `stockData` lookup.

Also verify that `formatEUR` is imported. If not, add: `import { formatEUR } from '../utils/formatters';`

- [ ] **Step 4: Verify build**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && npx vite build 2>&1 | tail -5`

Expected: `✓ built in ...`

- [ ] **Step 5: Commit**

```bash
git add src/components/SKUSlideOver.jsx src/data/inventory_stock.json
git commit -m "feat: add Inventory Status and Cost Intelligence sections to SKU slide-over"
```

---

### Task 4: Wire slide-over on Products/SKUs page

**Files:**
- Modify: `src/pages/ProductsSKUs.jsx`

- [ ] **Step 1: Import openSKUDetail from UIContext**

Read `/Users/dharmendersingh/Documents/Scherzinger_new/frontend/src/pages/ProductsSKUs.jsx`.

Find where UIContext hooks are destructured (around line 56). It currently has:
```javascript
const { selectItem, selectedItem } = useUI();
```

Change to:
```javascript
const { selectItem, selectedItem, openSKUDetail } = useUI();
```

- [ ] **Step 2: Wire table row click to open slide-over**

Find the DataTable `onRowClick` handler (around line 781). It currently calls only `selectItem()`. Change to call BOTH:

Find:
```javascript
onRowClick={(row) => selectItem({ type: 'article', id: row.ArticleID, label: row.description, data: row })}
```

Replace with:
```javascript
onRowClick={(row) => {
  selectItem({ type: 'article', id: row.ArticleID || row.article_id, label: row.description, data: row });
  openSKUDetail(row.ArticleID || row.article_id);
}}
```

Note: The row key might be `ArticleID` or `article_id` depending on how the data is transformed. Check the actual data shape in the file and use the correct key. Also apply this same pattern to ANY other DataTable or table row click handler in the file that handles article/SKU clicks.

- [ ] **Step 3: Wire search bar selection to open slide-over**

The search bar at around line 302-317 is a filter input that narrows the table. When the user types and the table shows matching results, clicking a row already uses the `onRowClick` from Step 2.

However, to make search more direct — if the search matches exactly one article, auto-open the slide-over. Find the search input's `onChange` handler and add auto-open logic.

After the existing `articleSearch` state, add an effect:

```javascript
// Auto-open slide-over when search matches exactly one article
React.useEffect(() => {
  if (articleSearch && filteredProducts.length === 1) {
    const match = filteredProducts[0];
    openSKUDetail(match.ArticleID || match.article_id);
  }
}, [articleSearch, filteredProducts]);
```

If `React.useEffect` is not already imported, ensure `useEffect` is in the React import. Check the existing imports — the file likely uses `import { useState, useMemo } from 'react'`. Add `useEffect` to this import.

- [ ] **Step 4: Verify build**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && npx vite build 2>&1 | tail -5`

Expected: `✓ built in ...`

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProductsSKUs.jsx
git commit -m "feat: wire SKU slide-over to Products table row click and search"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full build**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && npx vite build 2>&1 | tail -5`

Expected: `✓ built in ...` with no errors.

- [ ] **Step 2: Verify removed routes**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && grep -n 'cost-intelligence\|CostIntelligence\|inventory' src/App.jsx`

Expected: No matches (routes removed).

- [ ] **Step 3: Verify sidebar**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && grep -n 'cost-intelligence\|Cost Intelligence\|Warehouse' src/components/Sidebar.jsx`

Expected: No matches (nav item removed).

- [ ] **Step 4: Verify slide-over has new sections**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && grep -n 'Inventory Status\|Cost Intelligence\|inventory_stock\|stockData\|getInventoryStatus' src/components/SKUSlideOver.jsx`

Expected: Multiple matches confirming new sections present.

- [ ] **Step 5: Verify Products page wiring**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && grep -n 'openSKUDetail' src/pages/ProductsSKUs.jsx`

Expected: Multiple matches — import + usage in row click + search effect.
