# Demo Drill-Down Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Scherzinger demo from clickable prototype into finished-feeling product by wiring 12 targeted drill-down interactions and cosmetically cleaning the rest.

**Architecture:** Extend the existing `UIContext` slide-over (already supports `sku|category|customer` with panel history) to add `commodity` and optional `initialTab`. Add one new `<DrillPopover>` component for chart-point clicks. Add one `useUrlFilters()` hook for cross-page filter context. Add one `<DemoClickable>` wrapper utility. Everything else is call-site wiring + a cosmetic sweep.

**Tech Stack:** React 19, Vite 7, Tailwind 4, react-router-dom, Recharts. No test framework in project — verification is `npm run dev` + manual browser click-through, `npm run build:demo` before commit.

**Spec:** `docs/superpowers/specs/2026-04-16-demo-drilldown-polish-design.md`

**Working directory for all paths below:** `frontend/`

---

## Verification Protocol (applies to every task)

This project has no unit-test harness. Each task's verification step is:

1. `cd frontend && npm run dev`
2. Open the URL the task specifies, perform the exact click sequence
3. Confirm the expected UI behavior
4. Before commit: `npm run build:demo` must succeed with no errors
5. Commit with the message in that task's Step N

If `npm run build:demo` fails, fix before committing. Never commit a broken demo build.

---

## File Structure

**New files:**
- `frontend/src/components/phase45/DrillPopover.jsx` — anchored popover for chart-point clicks
- `frontend/src/components/phase45/DemoClickable.jsx` — clickable wrapper (cursor + hover ring + keyboard)
- `frontend/src/components/CommoditySlideOver.jsx` — commodity entity slide-over (matches SKU/Category/Customer pattern)
- `frontend/src/hooks/useUrlFilters.js` — URL query-string filter hook
- `frontend/src/data/commodities.json` — fixture for commodity drill-downs
- `frontend/src/components/phase45/QuoteDetailSlideOver.jsx` — forecasting quote detail

**Modified files:**
- `frontend/src/context/UIContext.jsx` — add `openCommodityDetail`, add `initialTab` to all open-detail methods
- `frontend/src/components/Layout.jsx` (or wherever slide-overs render) — render `<CommoditySlideOver>` branch
- `frontend/src/pages/DashboardOverviewV2.jsx` — wire KPI, alert, pie, AI Highlight, "View all" clicks
- `frontend/src/pages/ProductsSKUs.jsx` — read `?commodity=`, `?risk=` via `useUrlFilters`
- `frontend/src/pages/Customers.jsx` — read `?risk=` via `useUrlFilters`
- `frontend/src/pages/AIInsights.jsx` — read `?prompt=`, auto-submit once, strip param
- `frontend/src/pages/ScenarioLab.jsx` — SKU-impact row click → open SKU detail
- `frontend/src/pages/Forecasting.jsx` — quote row click → QuoteDetailSlideOver
- Various phase45 + chart files — cosmetic sweep (tooltip + cursor removal)

---

## Batch 1 — Primitives

### Task 1: Extend UIContext with commodity + initialTab

**Files:**
- Modify: `frontend/src/context/UIContext.jsx`

- [ ] **Step 1: Add `initialTab` to slideOver state and open methods**

Replace `src/context/UIContext.jsx` contents with:

```jsx
import { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);

  // type: 'sku' | 'category' | 'customer' | 'commodity' | null
  const [slideOver, setSlideOver] = useState({ type: null, id: null, initialTab: null });
  const [panelHistory, setPanelHistory] = useState([]);

  const [selectedItem, setSelectedItem] = useState(null);
  const selectItem = useCallback((item) => setSelectedItem(item), []);
  const clearSelection = useCallback(() => setSelectedItem(null), []);

  const pushAndOpen = useCallback((next) => {
    setSlideOver(prev => {
      if (prev.type && prev.id) {
        setPanelHistory(h => [...h.slice(-1), prev]);
      }
      return next;
    });
  }, []);

  const openSKUDetail      = useCallback((skuCode, initialTab = null)     => pushAndOpen({ type: 'sku',       id: skuCode,     initialTab }), [pushAndOpen]);
  const openCategoryDetail = useCallback((categoryName, initialTab = null) => pushAndOpen({ type: 'category', id: categoryName, initialTab }), [pushAndOpen]);
  const openCustomerDetail = useCallback((customerId, initialTab = null)   => pushAndOpen({ type: 'customer', id: customerId,  initialTab }), [pushAndOpen]);
  const openCommodityDetail= useCallback((commodityId, initialTab = null)  => pushAndOpen({ type: 'commodity',id: commodityId, initialTab }), [pushAndOpen]);

  const goBackPanel = useCallback(() => {
    setPanelHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setSlideOver(prev);
      return h.slice(0, -1);
    });
  }, []);

  const closeSlideOver = useCallback(() => {
    setSlideOver({ type: null, id: null, initialTab: null });
    setPanelHistory([]);
  }, []);

  return (
    <UIContext.Provider value={{
      sidebarCollapsed, toggleSidebar, setSidebarCollapsed,
      slideOver, panelHistory,
      openSKUDetail, openCategoryDetail, openCustomerDetail, openCommodityDetail,
      goBackPanel, closeSlideOver,
      selectedItem, selectItem, clearSelection,
    }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify existing slide-overs still open**

Run: `cd frontend && npm run dev`
Open: `/products`, click any SKU row.
Expected: SKU slide-over opens as before (no regression).

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build:demo`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/UIContext.jsx
git commit -m "phase45: extend UIContext with commodity + initialTab"
```

---

### Task 2: Create commodity fixture

**Files:**
- Create: `frontend/src/data/commodities.json`

- [ ] **Step 1: Author commodity fixture**

Write `frontend/src/data/commodities.json`:

```json
[
  {
    "id": "silver",
    "name": "Silver",
    "overview": { "spend_eur_m": 18.4, "skus_affected": 47, "price_trend_pct": 12.3, "volatility": "high" },
    "priceHistory": [
      { "month": "2025-05", "price": 720 }, { "month": "2025-06", "price": 745 },
      { "month": "2025-07", "price": 768 }, { "month": "2025-08", "price": 790 },
      { "month": "2025-09", "price": 815 }, { "month": "2025-10", "price": 802 },
      { "month": "2025-11", "price": 820 }, { "month": "2025-12", "price": 838 },
      { "month": "2026-01", "price": 851 }, { "month": "2026-02", "price": 864 },
      { "month": "2026-03", "price": 878 }, { "month": "2026-04", "price": 890 }
    ],
    "affectedSkus": ["SKU-1042", "SKU-1087", "SKU-1123", "SKU-1201", "SKU-1344"],
    "shockImpact": { "plus10pct_margin_delta": -1.8, "plus15pct_margin_delta": -2.7, "plus20pct_margin_delta": -3.6 }
  },
  {
    "id": "copper",
    "name": "Copper",
    "overview": { "spend_eur_m": 14.2, "skus_affected": 62, "price_trend_pct": 8.1, "volatility": "medium" },
    "priceHistory": [
      { "month": "2025-05", "price": 9200 }, { "month": "2025-06", "price": 9310 },
      { "month": "2025-07", "price": 9420 }, { "month": "2025-08", "price": 9380 },
      { "month": "2025-09", "price": 9510 }, { "month": "2025-10", "price": 9650 },
      { "month": "2025-11", "price": 9720 }, { "month": "2025-12", "price": 9810 },
      { "month": "2026-01", "price": 9870 }, { "month": "2026-02", "price": 9920 },
      { "month": "2026-03", "price": 9980 }, { "month": "2026-04", "price": 10040 }
    ],
    "affectedSkus": ["SKU-1011", "SKU-1055", "SKU-1098", "SKU-1156"],
    "shockImpact": { "plus10pct_margin_delta": -1.2, "plus15pct_margin_delta": -1.8, "plus20pct_margin_delta": -2.4 }
  },
  {
    "id": "gold",
    "name": "Gold",
    "overview": { "spend_eur_m": 22.1, "skus_affected": 28, "price_trend_pct": 18.7, "volatility": "high" },
    "priceHistory": [
      { "month": "2025-05", "price": 2280 }, { "month": "2025-06", "price": 2310 },
      { "month": "2025-07", "price": 2355 }, { "month": "2025-08", "price": 2420 },
      { "month": "2025-09", "price": 2480 }, { "month": "2025-10", "price": 2540 },
      { "month": "2025-11", "price": 2590 }, { "month": "2025-12", "price": 2640 },
      { "month": "2026-01", "price": 2680 }, { "month": "2026-02", "price": 2710 },
      { "month": "2026-03", "price": 2745 }, { "month": "2026-04", "price": 2780 }
    ],
    "affectedSkus": ["SKU-1201", "SKU-1234", "SKU-1288"],
    "shockImpact": { "plus10pct_margin_delta": -2.4, "plus15pct_margin_delta": -3.6, "plus20pct_margin_delta": -4.8 }
  },
  {
    "id": "palladium",
    "name": "Palladium",
    "overview": { "spend_eur_m": 6.8, "skus_affected": 12, "price_trend_pct": -4.2, "volatility": "very_high" },
    "priceHistory": [
      { "month": "2025-05", "price": 1080 }, { "month": "2025-06", "price": 1055 },
      { "month": "2025-07", "price": 1030 }, { "month": "2025-08", "price": 1015 },
      { "month": "2025-09", "price": 998 }, { "month": "2025-10", "price": 985 },
      { "month": "2025-11", "price": 975 }, { "month": "2025-12", "price": 960 },
      { "month": "2026-01", "price": 945 }, { "month": "2026-02", "price": 935 },
      { "month": "2026-03", "price": 925 }, { "month": "2026-04", "price": 912 }
    ],
    "affectedSkus": ["SKU-1344", "SKU-1398"],
    "shockImpact": { "plus10pct_margin_delta": -0.4, "plus15pct_margin_delta": -0.6, "plus20pct_margin_delta": -0.8 }
  },
  {
    "id": "zinc",
    "name": "Zinc",
    "overview": { "spend_eur_m": 3.2, "skus_affected": 89, "price_trend_pct": 2.1, "volatility": "low" },
    "priceHistory": [
      { "month": "2025-05", "price": 2820 }, { "month": "2025-06", "price": 2835 },
      { "month": "2025-07", "price": 2845 }, { "month": "2025-08", "price": 2860 },
      { "month": "2025-09", "price": 2850 }, { "month": "2025-10", "price": 2870 },
      { "month": "2025-11", "price": 2880 }, { "month": "2025-12", "price": 2885 },
      { "month": "2026-01", "price": 2895 }, { "month": "2026-02", "price": 2880 },
      { "month": "2026-03", "price": 2890 }, { "month": "2026-04", "price": 2880 }
    ],
    "affectedSkus": ["SKU-1011", "SKU-1087", "SKU-1123", "SKU-1156", "SKU-1201"],
    "shockImpact": { "plus10pct_margin_delta": -0.3, "plus15pct_margin_delta": -0.5, "plus20pct_margin_delta": -0.6 }
  },
  {
    "id": "nickel",
    "name": "Nickel",
    "overview": { "spend_eur_m": 5.1, "skus_affected": 34, "price_trend_pct": 6.4, "volatility": "medium" },
    "priceHistory": [
      { "month": "2025-05", "price": 16200 }, { "month": "2025-06", "price": 16380 },
      { "month": "2025-07", "price": 16510 }, { "month": "2025-08", "price": 16650 },
      { "month": "2025-09", "price": 16820 }, { "month": "2025-10", "price": 16940 },
      { "month": "2025-11", "price": 17010 }, { "month": "2025-12", "price": 17120 },
      { "month": "2026-01", "price": 17220 }, { "month": "2026-02", "price": 17290 },
      { "month": "2026-03", "price": 17340 }, { "month": "2026-04", "price": 17220 }
    ],
    "affectedSkus": ["SKU-1055", "SKU-1098", "SKU-1288"],
    "shockImpact": { "plus10pct_margin_delta": -0.9, "plus15pct_margin_delta": -1.4, "plus20pct_margin_delta": -1.8 }
  },
  {
    "id": "steel",
    "name": "Steel",
    "overview": { "spend_eur_m": 4.7, "skus_affected": 112, "price_trend_pct": 3.8, "volatility": "low" },
    "priceHistory": [
      { "month": "2025-05", "price": 740 }, { "month": "2025-06", "price": 745 },
      { "month": "2025-07", "price": 752 }, { "month": "2025-08", "price": 758 },
      { "month": "2025-09", "price": 760 }, { "month": "2025-10", "price": 765 },
      { "month": "2025-11", "price": 770 }, { "month": "2025-12", "price": 775 },
      { "month": "2026-01", "price": 778 }, { "month": "2026-02", "price": 780 },
      { "month": "2026-03", "price": 782 }, { "month": "2026-04", "price": 785 }
    ],
    "affectedSkus": ["SKU-1011", "SKU-1042", "SKU-1087"],
    "shockImpact": { "plus10pct_margin_delta": -0.5, "plus15pct_margin_delta": -0.8, "plus20pct_margin_delta": -1.0 }
  },
  {
    "id": "aluminum",
    "name": "Aluminum",
    "overview": { "spend_eur_m": 2.9, "skus_affected": 56, "price_trend_pct": 1.2, "volatility": "low" },
    "priceHistory": [
      { "month": "2025-05", "price": 2410 }, { "month": "2025-06", "price": 2420 },
      { "month": "2025-07", "price": 2425 }, { "month": "2025-08", "price": 2430 },
      { "month": "2025-09", "price": 2438 }, { "month": "2025-10", "price": 2442 },
      { "month": "2025-11", "price": 2445 }, { "month": "2025-12", "price": 2450 },
      { "month": "2026-01", "price": 2452 }, { "month": "2026-02", "price": 2455 },
      { "month": "2026-03", "price": 2458 }, { "month": "2026-04", "price": 2460 }
    ],
    "affectedSkus": ["SKU-1042", "SKU-1123", "SKU-1156"],
    "shockImpact": { "plus10pct_margin_delta": -0.2, "plus15pct_margin_delta": -0.3, "plus20pct_margin_delta": -0.4 }
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/data/commodities.json
git commit -m "phase45: add commodities.json fixture for drill-down"
```

---

### Task 3: Create CommoditySlideOver component

**Files:**
- Create: `frontend/src/components/CommoditySlideOver.jsx`
- Read for reference: `frontend/src/components/CustomerSlideOver.jsx` (match this structure)

- [ ] **Step 1: Read CustomerSlideOver for the established pattern**

Open `frontend/src/components/CustomerSlideOver.jsx` and mirror its structure: top-right slide panel, close button, tab bar, tab body, uses `useUI()` for `slideOver.id`, `slideOver.initialTab`, `closeSlideOver`, `goBackPanel`, `panelHistory`.

- [ ] **Step 2: Write CommoditySlideOver**

Write `frontend/src/components/CommoditySlideOver.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useUI } from '../context/UIContext';
import commodities from '../data/commodities.json';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Price History' },
  { id: 'skus', label: 'Affected SKUs' },
  { id: 'shock', label: 'Shock Impact' },
];

export default function CommoditySlideOver() {
  const { slideOver, closeSlideOver, panelHistory, goBackPanel, openSKUDetail } = useUI();
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (slideOver.type === 'commodity') {
      setTab(slideOver.initialTab || 'overview');
    }
  }, [slideOver.type, slideOver.id, slideOver.initialTab]);

  if (slideOver.type !== 'commodity') return null;
  const data = commodities.find(c => c.id === slideOver.id);
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={closeSlideOver}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {panelHistory.length > 0 && (
              <button onClick={goBackPanel} className="text-slate-500 hover:text-slate-900">← Back</button>
            )}
            <div>
              <div className="text-xs uppercase text-slate-500">Commodity</div>
              <div className="text-xl font-semibold">{data.name}</div>
            </div>
          </div>
          <button onClick={closeSlideOver} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
        </div>

        <div className="border-b flex gap-6 px-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 text-sm border-b-2 ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600'}`}
            >{t.label}</button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'overview' && (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Annual spend" value={`€${data.overview.spend_eur_m}M`} />
              <Stat label="SKUs affected" value={data.overview.skus_affected} />
              <Stat label="12-mo trend" value={`${data.overview.price_trend_pct > 0 ? '+' : ''}${data.overview.price_trend_pct}%`} />
              <Stat label="Volatility" value={data.overview.volatility} />
            </div>
          )}
          {tab === 'history' && (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={data.priceHistory}>
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {tab === 'skus' && (
            <ul className="divide-y">
              {data.affectedSkus.map(sku => (
                <li key={sku}>
                  <button
                    className="w-full text-left py-3 px-2 hover:bg-slate-50 flex justify-between"
                    onClick={() => openSKUDetail(sku)}
                  >
                    <span className="font-medium">{sku}</span>
                    <span className="text-slate-400">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === 'shock' && (
            <div className="space-y-3">
              {Object.entries(data.shockImpact).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-2">
                  <span className="text-slate-600">{k.replace('_', ' ').replace('_', ' ')}</span>
                  <span className={`font-semibold ${v < 0 ? 'text-red-600' : 'text-green-600'}`}>{v}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Mount in Layout**

Find where `<SKUSlideOver />`, `<CustomerSlideOver />` are rendered (likely `frontend/src/components/Layout.jsx`). Add `<CommoditySlideOver />` as a sibling with the same placement. If Layout doesn't render them, find where they ARE rendered and add it there.

Command to find: `grep -rn "SKUSlideOver\|CustomerSlideOver" frontend/src --include="*.jsx" -l`

Add import at top of that file:
```jsx
import CommoditySlideOver from './CommoditySlideOver';
```

Add `<CommoditySlideOver />` next to the other slide-overs.

- [ ] **Step 4: Build + smoke-test**

Run: `cd frontend && npm run build:demo`
Expected: builds successfully.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CommoditySlideOver.jsx frontend/src/components/Layout.jsx
git commit -m "phase45: add CommoditySlideOver (4 tabs)"
```

---

### Task 4: DrillPopover component

**Files:**
- Create: `frontend/src/components/phase45/DrillPopover.jsx`

- [ ] **Step 1: Write DrillPopover**

Write `frontend/src/components/phase45/DrillPopover.jsx`:

```jsx
import { useEffect, useRef } from 'react';

export default function DrillPopover({ anchorRect, title, stats = [], cta, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // Defer mousedown listener to next tick so the click that opened us doesn't close us
    const id = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      clearTimeout(id);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 240);
  const left = Math.min(anchorRect.left, window.innerWidth - 280);

  return (
    <div
      ref={ref}
      className="fixed z-40 w-64 bg-white rounded-lg shadow-xl border border-slate-200"
      style={{ top, left }}
      role="dialog"
    >
      <div className="px-4 py-3 border-b">
        <div className="font-semibold text-slate-900">{title}</div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {stats.slice(0, 4).map((s, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-slate-500">{s.label}</span>
            <span className="font-medium">
              {s.value}
              {s.delta != null && (
                <span className={`ml-2 text-xs ${s.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {s.delta > 0 ? '+' : ''}{s.delta}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      {cta && (
        <div className="px-4 py-3 border-t">
          <button
            onClick={() => { cta.onClick(); onClose(); }}
            className="w-full bg-blue-600 text-white rounded px-3 py-2 text-sm hover:bg-blue-700"
          >{cta.label}</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `cd frontend && npm run build:demo`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/phase45/DrillPopover.jsx
git commit -m "phase45: add DrillPopover component"
```

---

### Task 5: DemoClickable wrapper

**Files:**
- Create: `frontend/src/components/phase45/DemoClickable.jsx`

- [ ] **Step 1: Write DemoClickable**

Write `frontend/src/components/phase45/DemoClickable.jsx`:

```jsx
export default function DemoClickable({ as: Tag = 'div', onClick, className = '', children, ...rest }) {
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(e);
    }
  };
  return (
    <Tag
      onClick={onClick}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      className={`cursor-pointer transition hover:ring-2 hover:ring-blue-400/40 rounded outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/phase45/DemoClickable.jsx
git commit -m "phase45: add DemoClickable wrapper"
```

---

### Task 6: useUrlFilters hook

**Files:**
- Create: `frontend/src/hooks/useUrlFilters.js`

- [ ] **Step 1: Write the hook**

Write `frontend/src/hooks/useUrlFilters.js`:

```js
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const KEYS = ['commodity', 'risk', 'prompt', 'segment'];

export function useUrlFilters() {
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(() => {
    const out = {};
    for (const k of KEYS) {
      const v = sp.get(k);
      if (v) out[k] = v;
    }
    return out;
  }, [sp]);

  const setFilter = useCallback((key, value) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSp]);

  const clearFilter = useCallback((key) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      next.delete(key);
      return next;
    }, { replace: true });
  }, [setSp]);

  return { filters, setFilter, clearFilter };
}
```

- [ ] **Step 2: Build check**

Run: `cd frontend && npm run build:demo`
Expected: builds successfully.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useUrlFilters.js
git commit -m "phase45: add useUrlFilters hook"
```

---

## Batch 2 — Dashboard drill-outs

### Task 7: Wire Dashboard KPI cards

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx`

- [ ] **Step 1: Identify the KPI cards in DashboardOverviewV2.jsx**

Read `frontend/src/pages/DashboardOverviewV2.jsx`. Locate the section rendering the top-row KPI cards (Revenue, Margin, Gap, Win Rate). Note their container element.

- [ ] **Step 2: Add driver-SKU mapping and click handlers**

At the top of the component body, add:

```jsx
import { useUI } from '../context/UIContext';
// ...existing imports

// Inside component:
const { openSKUDetail, openCustomerDetail } = useUI();

const KPI_DRIVER_SKU = {
  revenue:   'SKU-1201',
  margin:    'SKU-1042',
  gap:       'SKU-1087',
  win_rate:  'SKU-1234',
};
```

Wrap each KPI card's outer element with an `onClick` that calls `openSKUDetail(KPI_DRIVER_SKU[kpiKey])` and add `className="cursor-pointer hover:ring-2 hover:ring-blue-400/40 rounded transition"`.

If the KPI cards are currently mapped from an array, add a `driverSku` field to each entry and use it in the onClick.

- [ ] **Step 3: Verify in browser**

Run: `cd frontend && npm run dev`
Open `/` (or `/dashboard`). Click each of the 4 KPI cards.
Expected: each opens the SKU slide-over with the respective driver SKU.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "phase45: dashboard KPI cards drill to driver SKU"
```

---

### Task 8: Wire Dashboard alert cards

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (same file, continue)

- [ ] **Step 1: Locate alert cards**

Find the alert cards section (Margin Erosion, High Risk Customer, Cost Regime, etc.) in DashboardOverviewV2.jsx.

- [ ] **Step 2: Wire each alert to its appropriate drill target**

For each alert card, wrap the outer element:

```jsx
// Margin Erosion alert
<div
  onClick={() => openSKUDetail('SKU-1042', 'profitability')}
  className="cursor-pointer hover:ring-2 hover:ring-blue-400/40 rounded transition ..."
>
  {/* existing content */}
</div>

// High Risk Customer alert
<div onClick={() => openCustomerDetail('CUST-042', 'risk')} className="cursor-pointer ...">
  {/* existing content */}
</div>

// Cost Regime alert
<div onClick={() => openSKUDetail('SKU-1087', 'anomalies')} className="cursor-pointer ...">
  {/* existing content */}
</div>
```

Adjust the SKU/customer IDs and initial tabs to match what's on the card text. If alerts are rendered from an array, add `drillTo: { type, id, initialTab }` to each entry and a single onClick that dispatches accordingly.

- [ ] **Step 3: Verify**

Run: `npm run dev`. On the Dashboard, click each alert card. Each opens the correct slide-over with the right tab pre-selected.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "phase45: dashboard alert cards drill to SKU/customer"
```

---

### Task 9: Top commodities pie → filtered Products

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx`

- [ ] **Step 1: Replace pie onClick**

Locate the `<Pie>` (recharts) rendering top commodities. Its current onClick calls `selectItem`. Replace with navigation carrying filter state:

```jsx
import { useNavigate } from 'react-router-dom';
// ...

const navigate = useNavigate();

// On the Pie element:
<Pie
  data={topCommodities}
  dataKey="value"
  nameKey="name"
  onClick={(slice) => {
    const commodityId = (slice.name || slice.payload?.name || '').toLowerCase();
    navigate(`/products?commodity=${encodeURIComponent(commodityId)}`);
  }}
  style={{ cursor: 'pointer' }}
>
  {/* existing Cells */}
</Pie>
```

- [ ] **Step 2: Verify**

Run: `npm run dev`. Click a slice of the top-commodities pie.
Expected: navigates to `/products?commodity=<name>`. Filter application happens in Task 13.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "phase45: top-commodities pie slice navigates to filtered Products"
```

---

### Task 10: AI Highlight → AI Insights with prompt

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx`

- [ ] **Step 1: Define canonical prompts**

Locate the AI Highlights section. For each highlight card, add a `prompt` field matching the quick-prompt buttons on AIInsights (open `frontend/src/pages/AIInsights.jsx` and copy the exact prompt strings). If highlights are in an array:

```jsx
const AI_HIGHLIGHTS = [
  { id: 'margin-q2', title: '...', prompt: 'Why did margin drop 1.2% this quarter?' },
  { id: 'churn',     title: '...', prompt: 'Which customers are at highest churn risk?' },
  { id: 'shock',     title: '...', prompt: 'What\'s the impact of a 15% material cost shock?' },
  { id: 'reprice',   title: '...', prompt: 'Which SKUs should we reprice?' },
];
```

- [ ] **Step 2: Wire onClick**

Replace the existing "View Detailed Analysis" navigation with:

```jsx
onClick={() => navigate(`/ai-insights?prompt=${encodeURIComponent(h.prompt)}`)}
```

Add `cursor-pointer hover:ring-2 hover:ring-blue-400/40` to the card.

- [ ] **Step 3: Verify**

Run: `npm run dev`. Click an AI Highlight card.
Expected: navigates to `/ai-insights?prompt=...`. Auto-submit happens in Task 14.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "phase45: AI Highlight cards navigate with ?prompt="
```

---

### Task 11: "View all high-risk customers" → filtered

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx`

- [ ] **Step 1: Replace link**

Find the "View all" link near the top customers / risk section. Change the navigation target to:

```jsx
<Link to="/customers?risk=high" className="text-blue-600 hover:underline text-sm">View all</Link>
```

Repeat for the at-risk-products "View all":

```jsx
<Link to="/products?risk=high" className="text-blue-600 hover:underline text-sm">View all</Link>
```

- [ ] **Step 2: Verify**

Run: `npm run dev`. Click both "View all" links.
Expected: navigate to `/customers?risk=high` and `/products?risk=high`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "phase45: View-all links carry risk filter"
```

---

## Batch 3 — Landing-page filter pickup

### Task 12: Products page reads ?commodity= and ?risk=

**Files:**
- Modify: `frontend/src/pages/ProductsSKUs.jsx`

- [ ] **Step 1: Read current filter state management**

Open `frontend/src/pages/ProductsSKUs.jsx`. Find the existing filter state (likely `useState` for category, margin band, etc.). Note variable names.

- [ ] **Step 2: Wire filters from URL**

At the top of the component body:

```jsx
import { useEffect } from 'react';
import { useUrlFilters } from '../hooks/useUrlFilters';
// ...

const { filters, setFilter } = useUrlFilters();

// In whatever state initializes filters, sync from URL on mount and on filter change:
useEffect(() => {
  if (filters.commodity) setCommodityFilter(filters.commodity);  // existing setter
  if (filters.risk === 'high') setMarginFilter('below_floor');   // or whatever "high risk" means in Products
}, [filters.commodity, filters.risk]);
```

If Products uses a search/filter object, adapt to merge URL filters into it on mount.

Show the active filter pill selected when URL has a commodity or risk (check existing pill rendering; typically `isActive={filter === 'below_floor'}`).

- [ ] **Step 3: Verify**

Run: `npm run dev`. Go to `/products?commodity=silver`. Expected: filter pill shows active for silver (or table filters to silver SKUs). Go to `/products?risk=high`. Expected: margin filter set to below-floor / at-risk view.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ProductsSKUs.jsx
git commit -m "phase45: Products reads ?commodity= and ?risk= on mount"
```

---

### Task 13: Customers page reads ?risk=

**Files:**
- Modify: `frontend/src/pages/Customers.jsx`

- [ ] **Step 1: Identify risk filter state**

Open `frontend/src/pages/Customers.jsx`. Find the existing risk/segment filter state.

- [ ] **Step 2: Sync from URL**

```jsx
import { useEffect } from 'react';
import { useUrlFilters } from '../hooks/useUrlFilters';
// ...

const { filters } = useUrlFilters();

useEffect(() => {
  if (filters.risk === 'high') {
    setRiskFilter('high');        // existing setter name
  }
}, [filters.risk]);
```

Ensure the segment pill renders its active state when `riskFilter === 'high'`.

- [ ] **Step 3: Verify**

Run: `npm run dev`. Go to `/customers?risk=high`. Expected: high-risk segment pill is active, table shows high-risk customers only.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Customers.jsx
git commit -m "phase45: Customers reads ?risk= on mount"
```

---

### Task 14: AI Insights reads ?prompt= and auto-submits

**Files:**
- Modify: `frontend/src/pages/AIInsights.jsx`

- [ ] **Step 1: Identify the chat input state and submit handler**

Open `frontend/src/pages/AIInsights.jsx`. Find:
- The input value state (e.g., `input`, `setInput`)
- The submit handler (e.g., `handleSubmit`, `sendMessage`)

- [ ] **Step 2: Add auto-submit effect**

Near the top of the component body, add:

```jsx
import { useEffect, useRef } from 'react';
import { useUrlFilters } from '../hooks/useUrlFilters';
// ...

const { filters, clearFilter } = useUrlFilters();
const didAutoSubmit = useRef(false);

useEffect(() => {
  if (didAutoSubmit.current) return;
  if (!filters.prompt) return;
  // Only auto-submit if chat is empty to avoid clobbering an active conversation
  if (messages && messages.length > 0) { clearFilter('prompt'); return; }

  didAutoSubmit.current = true;
  setInput(filters.prompt);

  // Wait one tick so state is applied, then fire existing submit
  const id = setTimeout(() => {
    handleSubmit?.({ preventDefault: () => {} });   // match existing handler's signature
    clearFilter('prompt');
  }, 50);
  return () => clearTimeout(id);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [filters.prompt]);
```

Adjust `messages`, `setInput`, `handleSubmit` to match the actual identifiers in AIInsights.jsx. If `handleSubmit` reads from `input` state and state hasn't applied yet at 50ms, pass the prompt directly: `handleSubmit(null, filters.prompt)` if the handler supports an override arg — otherwise increase timeout to 100ms.

**Do not modify any other part of AIInsights.** The existing stream, history, feed panel, and LLM call path must remain untouched.

- [ ] **Step 3: Verify**

Run: `npm run dev`. Go to `/ai-insights?prompt=Which%20SKUs%20should%20we%20reprice%3F`.
Expected: input fills with the prompt, chat auto-submits once, URL strips `?prompt=`. Real LLM response streams.
Also verify: going to `/ai-insights` without `?prompt=` behaves exactly as before.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AIInsights.jsx
git commit -m "phase45: AIInsights auto-submits ?prompt= once"
```

---

## Batch 4 — Closing act + cosmetic sweep

### Task 15: ScenarioLab SKU-impact row click

**Files:**
- Modify: `frontend/src/pages/ScenarioLab.jsx`

- [ ] **Step 1: Find the SKU-impact table**

Open `frontend/src/pages/ScenarioLab.jsx`. Find the SKU-impact table (added in commit 805a17e). Note the row element and the SKU code field.

- [ ] **Step 2: Wire row click**

Add near top of component:
```jsx
import { useUI } from '../context/UIContext';
const { openSKUDetail } = useUI();
```

On each row:
```jsx
<tr
  onClick={() => openSKUDetail(row.skuCode, 'shock')}
  className="cursor-pointer hover:bg-slate-50"
>
  {/* existing cells */}
</tr>
```

(Use the actual shock tab id from SKUDeepDiveSlideOver; if there's no shock tab yet, use `'profitability'` as the initial tab.)

- [ ] **Step 3: Verify**

Run: `npm run dev`. Go to `/scenario-lab`. Adjust shock sliders, then click a row in the SKU-impact table.
Expected: SKU deep-dive opens; close it; slider values are still set (global state preserved).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ScenarioLab.jsx
git commit -m "phase45: ScenarioLab SKU-impact rows drill to SKU deep-dive"
```

---

### Task 16: Verify SKU deep-dive tabs are non-empty

**Files:**
- Read + possibly modify: `frontend/src/components/phase45/SKUDeepDiveSlideOver.jsx`

- [ ] **Step 1: Walk every tab with 3 SKUs**

Run: `npm run dev`. From `/products`, open 3 different SKU slide-overs (one low-margin, one high-volume, one at-risk). For each, click through all 5 tabs: Pricing, Break-Even, Profitability, Anomalies, Cross-Sell.

Record any tab that is empty, shows "—", or shows a chart with no data. If all tabs render real content for all 3 SKUs, skip to Step 3.

- [ ] **Step 2: Fill gaps**

For any empty tab, the fix is usually adding a fallback default to the component's data lookup. Example pattern:

```jsx
const anomalies = skuAnomalies[skuCode] || skuAnomalies['_default'];
```

Add a `_default` entry to the underlying data file if needed (with generic but plausible values so no tab ever looks empty).

- [ ] **Step 3: Commit (or skip commit if no changes)**

If changes were needed:
```bash
git add frontend/src/components/phase45/SKUDeepDiveSlideOver.jsx frontend/src/data/<any-touched-data>.json
git commit -m "phase45: backfill SKU deep-dive tabs with defaults"
```

If no changes: move on, no commit.

---

### Task 17: Forecasting quote row click + QuoteDetailSlideOver

**Files:**
- Create: `frontend/src/components/phase45/QuoteDetailSlideOver.jsx`
- Modify: `frontend/src/pages/Forecasting.jsx`
- Modify: `frontend/src/context/UIContext.jsx` (add quote type)

- [ ] **Step 1: Add 'quote' type to UIContext**

Open `frontend/src/context/UIContext.jsx`. Add `openQuoteDetail`:

```jsx
const openQuoteDetail = useCallback((quoteId, initialTab = null) => pushAndOpen({ type: 'quote', id: quoteId, initialTab }), [pushAndOpen]);
```

Add `openQuoteDetail` to the context value object.

- [ ] **Step 2: Create QuoteDetailSlideOver**

Open the existing quotes data file (check `frontend/src/data/` for `quotes.json` or similar). Note the field names.

Write `frontend/src/components/phase45/QuoteDetailSlideOver.jsx`:

```jsx
import { useUI } from '../../context/UIContext';
import quotes from '../../data/quotes.json';  // adjust path if different

export default function QuoteDetailSlideOver() {
  const { slideOver, closeSlideOver, panelHistory, goBackPanel, openCustomerDetail, openSKUDetail } = useUI();
  if (slideOver.type !== 'quote') return null;

  const quote = quotes.find(q => q.id === slideOver.id) || quotes.find(q => q.quote_id === slideOver.id);
  if (!quote) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={closeSlideOver}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {panelHistory.length > 0 && (
              <button onClick={goBackPanel} className="text-slate-500 hover:text-slate-900">← Back</button>
            )}
            <div>
              <div className="text-xs uppercase text-slate-500">Quote</div>
              <div className="text-xl font-semibold">{quote.id || quote.quote_id}</div>
            </div>
          </div>
          <button onClick={closeSlideOver} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Value" value={`€${(quote.value ?? 0).toLocaleString()}`} />
            <Stat label="Win probability" value={`${Math.round((quote.winProbability ?? quote.win_prob ?? 0) * 100)}%`} />
            <Stat label="Customer" value={quote.customerName || quote.customer || '—'}
              onClick={quote.customerId ? () => openCustomerDetail(quote.customerId) : undefined} />
            <Stat label="Status" value={quote.status || '—'} />
          </div>

          {quote.lineItems?.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-2">Line items</div>
              <ul className="divide-y border rounded">
                {quote.lineItems.map((li, i) => (
                  <li key={i}>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between"
                      onClick={() => li.skuCode && openSKUDetail(li.skuCode)}
                    >
                      <span>{li.skuCode || li.sku || `Line ${i+1}`}</span>
                      <span className="text-slate-500">×{li.qty ?? 1}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quote.winReasons && (
            <div>
              <div className="text-sm font-semibold mb-2">Why this win probability</div>
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                {quote.winReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, onClick }) {
  const base = "border rounded p-3";
  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} text-left hover:bg-slate-50`}>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </button>
    );
  }
  return (
    <div className={base}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
```

If `quotes.json` doesn't exist or uses different field names, open whichever data file Forecasting already uses and adjust the imports + field lookups. Do not invent new fields — map to what's already there.

- [ ] **Step 3: Mount QuoteDetailSlideOver**

Add `<QuoteDetailSlideOver />` next to the other slide-overs in Layout (same file as Task 3 Step 3).

- [ ] **Step 4: Wire Forecasting quote rows**

Open `frontend/src/pages/Forecasting.jsx`. Find the quote-to-cash table rows (in QuoteToCashTab). Add:

```jsx
import { useUI } from '../context/UIContext';
const { openQuoteDetail } = useUI();

<tr onClick={() => openQuoteDetail(row.id || row.quote_id)} className="cursor-pointer hover:bg-slate-50">
  {/* existing cells */}
</tr>
```

- [ ] **Step 5: Verify**

Run: `npm run dev`. Go to `/forecasting`, switch to the quote-to-cash tab, click a quote row.
Expected: QuoteDetailSlideOver opens with that quote's data. Clicking Customer stat opens customer slide-over. Clicking a line item opens SKU slide-over.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/context/UIContext.jsx \
        frontend/src/components/phase45/QuoteDetailSlideOver.jsx \
        frontend/src/components/Layout.jsx \
        frontend/src/pages/Forecasting.jsx
git commit -m "phase45: Forecasting quote rows open detail slide-over"
```

---

### Task 18: Cosmetic sweep — tooltips where missing

**Files:**
- Modify: `frontend/src/pages/PricingFX.jsx`, `frontend/src/pages/RevenueMargins.jsx`, `frontend/src/pages/Forecasting.jsx`

- [ ] **Step 1: Add Recharts Tooltip to three charts**

For each of these charts that currently lacks a `<Tooltip />`:
- PricingFX Seasonality line chart
- PricingFX Win Rate by Commodity bars
- RevenueMargins monthly trend line chart
- Forecasting margin trend chart

Import:
```jsx
import { Tooltip } from 'recharts';
```

Add `<Tooltip />` as a child of the chart (inside `<LineChart>`, `<BarChart>`, etc., as a sibling to the data elements). Default Recharts tooltip is fine.

- [ ] **Step 2: Verify**

Run: `npm run dev`. Hover over each of the 4 charts above.
Expected: tooltip appears with the series values.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PricingFX.jsx frontend/src/pages/RevenueMargins.jsx frontend/src/pages/Forecasting.jsx
git commit -m "phase45: add tooltips to previously-silent charts"
```

---

### Task 19: Cosmetic sweep — remove dead cursor:pointer

**Files:**
- Modify: whichever chart components currently have `cursor: 'pointer'` or `className="cursor-pointer"` but their onClick is only `selectItem(...)` with no downstream effect

- [ ] **Step 1: Find candidates**

Run from project root:
```bash
grep -rn "cursor-pointer\|cursor: 'pointer'\|style={{ cursor" frontend/src/components frontend/src/pages --include="*.jsx" | grep -v "onClick=" | head -30
grep -rln "selectItem" frontend/src --include="*.jsx"
```

Manually check each `selectItem`-only site: does clicking cause any visible change beyond selecting in AI chat context? If no, that's a dead affordance.

- [ ] **Step 2: Neutralize dead affordances**

For each confirmed dead affordance (NOT one of the 12 wired interactions, NOT a row that opens a slide-over, NOT a navigation):

- Remove `cursor-pointer` className
- Remove `style={{ cursor: 'pointer' }}`
- Remove hover ring classes (`hover:ring-*`, `hover:scale-*`) that imply clickability
- Keep the `selectItem` onClick (used by AI chat awareness) — just remove the VISUAL cues

- [ ] **Step 3: Verify nothing regressed**

Run: `npm run dev`. Walk through the 12 wired interactions from the spec. Confirm all still work and look clickable. Everything else should now NOT look clickable.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "phase45: remove dead cursor:pointer from unwired charts"
```

---

### Task 20: Cosmetic sweep — hide handler-less buttons

**Files:**
- Modify: `frontend/src/pages/MLAnalytics.jsx`, `frontend/src/components/phase45/PriceOptimizer.jsx`, `frontend/src/components/phase45/FloorPriceTable.jsx`, `frontend/src/components/phase45/SKUDeepDiveSlideOver.jsx`

- [ ] **Step 1: Add FEATURE_WIRED flag**

Create `frontend/src/utils/demoFlags.js`:

```js
export const FEATURE_WIRED = {
  modelDeploy: false,
  priceApply: false,
  floorOverride: false,
  thresholdTuning: false,
};
```

- [ ] **Step 2: Gate the buttons**

For each of these buttons, wrap the render in a flag check. Example in MLAnalytics.jsx:

```jsx
import { FEATURE_WIRED } from '../utils/demoFlags';
// ...
{FEATURE_WIRED.modelDeploy && (
  <button className="...">Deploy</button>
)}
```

Apply to:
- MLAnalytics: Deploy/Undeploy buttons on model cards → `FEATURE_WIRED.modelDeploy`
- PriceOptimizer: "Apply" / "Approve" suggestion buttons → `FEATURE_WIRED.priceApply`
- FloorPriceTable slide-over: cost-override UI if present → `FEATURE_WIRED.floorOverride`
- MLAnalytics Threshold Tuning sliders (if handler-less) → `FEATURE_WIRED.thresholdTuning`

- [ ] **Step 3: Verify**

Run: `npm run dev`. Visit `/ml-analytics`, `/pricing`, any SKU slide-over.
Expected: the listed buttons no longer render. Rest of the UI is unchanged.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/demoFlags.js \
        frontend/src/pages/MLAnalytics.jsx \
        frontend/src/components/phase45/PriceOptimizer.jsx \
        frontend/src/components/phase45/FloorPriceTable.jsx \
        frontend/src/components/phase45/SKUDeepDiveSlideOver.jsx
git commit -m "phase45: hide handler-less action buttons behind FEATURE_WIRED flag"
```

---

### Task 21: Final end-to-end demo walkthrough

**Files:** none modified

- [ ] **Step 1: Run the full demo narrative**

Run: `cd frontend && npm run dev`

Walk this exact sequence:

1. Land on `/` (Dashboard). Every KPI card opens a SKU slide-over on click. Close it.
2. Every alert card opens correct SKU/Customer slide-over. Close.
3. Top-commodities pie slice → Products page shows the commodity filter active in the pill bar.
4. Back to Dashboard. Anomaly row → SKU slide-over on anomalies tab.
5. AI Highlight card → AI Insights, input fills, chat auto-submits, real LLM response streams.
6. Back to Dashboard. "View all high-risk customers" → Customers filtered to high-risk.
7. `/scenario-lab` → adjust sliders → click SKU-impact row → slide-over opens with same shock context.
8. `/forecasting` → quote-to-cash tab → click a quote row → detail slide-over opens.
9. Tour all 5 tabs of any SKU deep-dive. Every tab has content.
10. Visit every page; confirm no phantom-clickable charts remain (per Task 19).

- [ ] **Step 2: Fix any gaps found during walkthrough**

If any of the 12 wired interactions fails, fix in-place with a small commit per fix.

- [ ] **Step 3: Final demo build**

Run: `cd frontend && npm run build:demo`
Expected: build succeeds. Artifacts in `frontend/dist-demo/`.

- [ ] **Step 4: Deploy to demo account**

Follow the demo deploy process from memory (Avanna EC2, `pryzm_avana_demo.pem`, `~/pryzm/frontend/dist-demo/` — NEVER touch `dist/`). Confirm with user before deploying.

---

## Done criteria

- All 21 tasks committed in order
- `npm run build:demo` succeeds
- The 10-step walkthrough in Task 21 completes without "oh that doesn't work yet" moments
- No regressions on pages outside the demo flow
- AI chat internals unchanged (verify `git diff main -- frontend/src/pages/AIInsights.jsx` shows only the `?prompt=` auto-submit effect)
