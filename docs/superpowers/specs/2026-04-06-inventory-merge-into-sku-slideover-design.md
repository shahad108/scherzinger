# Remove Inventory & Cost Intelligence Pages — Merge into SKU Slide-Over

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Remove 2 standalone pages, extend SKU slide-over with inventory + cost intelligence, wire up slide-over on Products page

---

## Context

Manuel's team doesn't need a standalone inventory page. The useful inventory/cost data should live where they already work — the Products/SKUs page. When clicking an article (from the table or search bar), a slide-over panel shows everything about that SKU: margin, pricing, cost breakdown, and now inventory status.

---

## What Gets Removed

### Routes (in App.jsx)
- `/cost-intelligence` route → delete
- `/inventory` redirect → delete

### Sidebar navigation entries
- "Cost Intelligence" nav item → delete
- "Inventory" nav item (if exists) → delete

### Page files (delete or keep unused)
- `src/pages/CostIntelligence.jsx` → delete
- `src/pages/Inventory.jsx` → delete

---

## What Gets Added

### 1. New Data File: `src/data/inventory_stock.json`

Per-article stock data for all 30 articles in the products dataset.

```json
{
  "201827": {
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
}
```

Fields:
- `current_stock`: units currently on hand
- `reorder_point`: stock level that triggers reorder
- `safety_stock`: minimum buffer stock
- `lead_time_weeks`: supplier lead time in weeks
- `avg_monthly_demand`: average units sold per month (trailing 12 months)
- `months_of_supply`: current_stock / avg_monthly_demand
- `last_order_date`: date of most recent restock order
- `stockouts_12mo`: number of stockout events in past 12 months
- `carrying_cost_annual`: annual cost to hold this inventory (EUR)
- `max_capacity`: maximum storage capacity for this article

### 2. SKU Slide-Over Extension

**File:** `src/components/shared/SKUSlideOver.jsx`

Add two new sections below existing content (Risk Score, Margin, Cost Details, Price):

#### Section A: Inventory Status

Traffic light status badge:
- Green "Adequate": `current_stock > reorder_point + safety_stock`
- Amber "Reorder Soon": `current_stock > safety_stock` AND `current_stock <= reorder_point`
- Red "Critical": `current_stock <= safety_stock` OR `stockouts_12mo > 0` in past 3 months

Layout:
- Status badge (top-right of section header)
- 3-column grid: Current Stock | Reorder Point | Lead Time
- Single line: Monthly Demand + Months of Supply
- Single line: Safety Stock
- Single line: Last Order Date + Stockouts (12mo) + Carrying Cost
- Visual bar: current stock vs max capacity, with reorder point and safety stock markers

#### Section B: Cost Intelligence

Moved from the deleted Cost Intelligence page. Uses existing data from `inventory_detail.json` (cost_trends).

Layout:
- Cost breakdown horizontal bars: Material, Labor, Outsourcing, Overhead (percentage + EUR per unit)
- Cost Change line: year-over-year change with direction arrow
- Cost Trend label: Rising / Stable / Declining
- Auto-annotation: if material_share > 0.40, show warning about renegotiation

Data source: `costTrendsByArticle[articleId]` from `pricingEngine.js` (already exported).

### 3. Wire Slide-Over on Products/SKUs Page

**File:** `src/pages/ProductsSKUs.jsx`

Currently clicking a table row calls `selectItem()` for AI chat context but does NOT open the slide-over.

Changes:
- Import `openSlideOver` from UIContext
- On table row click: call BOTH `selectItem()` AND `openSlideOver({type: 'sku', id: article_id})`
- On search result selection: same — open slide-over for the selected article
- The `<SKUSlideOver />` component is already rendered in the Layout, so it will appear automatically

### 4. Sidebar Navigation Update

**File:** `src/components/Sidebar.jsx` (or wherever nav items are defined)

- Remove "Cost Intelligence" entry
- Remove "Inventory" entry (if present)
- Keep all other nav items unchanged

---

## What Stays Unchanged

- `inventory_detail.json` — still used by pricingEngine.js for cost trends
- `cogs_detail.json` — still used for commodity-level cost breakdowns
- The SKUSlideOver's existing sections (Risk Score, Margin Trajectory, Price Comparison) — untouched
- Other pages that reference cost data (Pricing & Quotes detail panel Tab B uses cost trends) — unaffected

---

## Out of Scope

- Editable stock levels (would need backend persistence)
- Purchase order creation from the slide-over
- Supplier management
- Warehouse location tracking
- Real-time stock sync
