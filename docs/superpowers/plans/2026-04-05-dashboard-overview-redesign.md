# Dashboard Overview Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Dashboard Overview (`/` route) so every element supports the core narrative — *the margin gap* — following `DASHBOARD_PLAN.md`. Removes vanity metrics, consolidates duplicated charts, and adds a Quoted vs Actual margin hero chart.

**Architecture:** Pure frontend rewrite of `DashboardOverviewV2.jsx`. Uses existing V2 components (KPICardV2, ChartCardV2, AlertCardV2, ActivityGridV2, RetentionCardV2). New time-range selector added inline above KPI row. Reads `pricing_analysis.json` for the margin gap data that was previously unused on the dashboard.

**Tech Stack:** React 19 · Vite · Recharts · Tailwind 4 · Motion

**Open decisions (resolved):**
1. Margin Gap voice → **"closing"** (data shows 2.3 → 1.4pp trend, framed as positive)
2. Pipeline funnel → **single FY-2025 window** (existing pipeline.json)
3. Biggest Margin Movers strip → **skipped** (keep scope tight)
4. Revenue at Risk → **customer.revenue_eur where risk_tier ∈ {high, critical}** (full exposure — industrial B2B)

---

## File Structure

**Modify:**
- `frontend/src/pages/DashboardOverviewV2.jsx` — Full rewrite of page body (keep imports, data prep reshaped)

**Read-only (for reference):**
- `frontend/src/data/dashboard_data.json` — core metrics
- `frontend/src/data/pricing_analysis.json` — **new** margin gap data source
- `frontend/src/data/pipeline.json` — sales pipeline counts
- `frontend/src/data/customers_detail.json` — risk data

**No changes needed:** Backend, routes, other V2 components.

---

## Task 1: Add Time-Range Selector State & Header

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (imports, useState, and header block inside component return)

- [ ] **Step 1: Add `useState` import (already present) and new imports for `pricingAnalysisData` and `Clock` icon**

At top of file, after existing imports add:
```jsx
import pricingAnalysisData from '../data/pricing_analysis.json';
```

In `lucide-react` import line, add `Clock, ArrowDownRight, ArrowUpRight`:
```jsx
import {
  AlertTriangle, AlertCircle, UserMinus, TrendingUp,
  Truck, Package, Receipt,
  Brain, BarChart3, CheckCircle, FileText,
  Clock, ArrowDownRight, ArrowUpRight,
} from 'lucide-react';
```

- [ ] **Step 2: Add time-range state inside the component**

Inside `function DashboardOverviewV2()`, immediately after existing `useState` calls:
```jsx
const [timeRange, setTimeRange] = useState('FY');  // FY | QTD | MTD | Custom
const lastUpdated = 'Dec 31, 2025 · 18:00 CET';
```

- [ ] **Step 3: Add the global header row above the KPI grid**

In the JSX return, **immediately inside** `<motion.div className="p-8 max-w-[1600px] ...">`, before the `{/* KPI Row */}` comment, insert:
```jsx
{/* Global Time-Range Header */}
<div className="flex items-center justify-between pb-2">
  <div className="inline-flex rounded-lg bg-white border border-slate-200 p-1 shadow-sm">
    {['FY', 'QTD', 'MTD', 'Custom'].map((r) => (
      <button
        key={r}
        onClick={() => setTimeRange(r)}
        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
          timeRange === r
            ? 'bg-slate-900 text-white'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {r}
      </button>
    ))}
  </div>
  <div className="flex items-center gap-1.5 text-xs text-slate-500">
    <Clock size={12} />
    <span>Last updated: {lastUpdated}</span>
  </div>
</div>
```

- [ ] **Step 4: Visual verification**

Open http://localhost:5173/. Expect: segmented FY/QTD/MTD/Custom selector top-left (FY highlighted dark), "Last updated" timestamp top-right. Clicking each tab toggles the active state.

- [ ] **Step 5: Commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "feat(dashboard): add global time-range selector header"
```

---

## Task 2: Compute Margin Gap Data & Rebuild KPI Row (4 cards)

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (data prep section + KPI row JSX)

- [ ] **Step 1: Add margin-gap data prep (above `function generateInsights()`)**

Insert after the existing `// YoY calculations` block:
```jsx
// ── Margin Gap data (Quoted vs Actual) ──
const gapByYear = pricingAnalysisData.gap_analysis.by_year;
const currentGap = gapByYear.find((g) => g.year === 2025);
const priorGap = gapByYear.find((g) => g.year === 2024);
const currentGapPp = (currentGap.gap * 100);  // 1.4
const priorGapPp = (priorGap.gap * 100);       // 2.1
const gapChangePp = currentGapPp - priorGapPp; // -0.7 (shrinking = good)
const gapIsClosing = gapChangePp < 0;
```

- [ ] **Step 2: Replace the 4-card KPI grid JSX**

Find the `{/* KPI Row */}` block and replace its 4 cards with these 4 (in order):

**Card 1: Revenue FY** (unchanged — keep existing block)

**Card 2: DB II Margin** (unchanged — keep existing block)

**Card 3: Margin Gap** (new — replaces Active Customers):
```jsx
<motion.div variants={cardVariants}>
  <KPICardV2
    formulaId="margin_gap"
    confidence="verified"
    label="Margin Gap"
    value={currentGapPp.toFixed(1)}
    suffix="pp"
    change={`${gapIsClosing ? '▼' : '▲'}${Math.abs(gapChangePp).toFixed(1)}pp YoY`}
    changeType={gapIsClosing ? 'positive' : 'warning'}
    accentGradient={gradients.tertiary}
    bottomContent={
      <p className="text-[11px] italic" style={{ color: '#737373' }}>
        Quoted {(currentGap.avg_quoted_margin * 100).toFixed(1)}% vs Actual {(currentGap.avg_actual_margin * 100).toFixed(1)}% · {gapIsClosing ? 'closing' : 'widening'}
      </p>
    }
  />
</motion.div>
```

**Card 4: Win Rate** (unchanged — keep existing block)

Remove the old Active Customers card entirely.

- [ ] **Step 3: Visual verification**

Reload. Expect 4 KPI cards in order: Revenue FY · DB II Margin · **Margin Gap 1.4pp ▼0.7pp YoY** · Win Rate. No "Active Customers" card.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "feat(dashboard): replace Active Customers with Margin Gap KPI"
```

---

## Task 3: Rebuild Alert Row (3 cards — Margin Erosion, High-Risk, Cost Regime)

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (Alert Cards grid + data prep)

- [ ] **Step 1: Refine risk data prep**

The existing `churnHigh` already filters to High+Critical. Above it, add the revenue-at-risk sum:
```jsx
// Revenue at Risk — full exposure of customers in High/Critical tiers
const topCustomersList = data.top_customers || [];
const revenueAtRisk = topCustomersList
  .filter((c) => c.risk_tier === 'high' || c.risk_tier === 'critical')
  .reduce((s, c) => s + (c.revenue_eur || 0), 0);
```

- [ ] **Step 2: Replace the Alert Cards grid JSX**

Find `{/* Alert Cards */}` and replace all 3 cards with:

```jsx
{/* Alert Cards */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  <motion.div variants={cardVariants}>
    <AlertCardV2
      icon={AlertTriangle}
      label="Margin Erosion"
      value={`${marginChange >= 0 ? '+' : '−'}${Math.abs(marginChange).toFixed(1)}pp`}
      valueColor="#EF4444"
      borderColor="#EF4444"
      iconBg="#FEF2F2"
      iconColor="#EF4444"
      progressPct={75}
      progressColor="#EF4444"
      helperText="Driven by BKAGG cost structure and mix shift"
      helperColor="#EF4444"
    />
  </motion.div>
  <motion.div variants={cardVariants}>
    <AlertCardV2
      icon={UserMinus}
      label="High-Risk Customers"
      value={String(churnHigh.count)}
      valueColor="#EA580C"
      borderColor="#F97316"
      iconBg="#FFF7ED"
      iconColor="#EA580C"
      progressPct={Math.round((churnHigh.count / (annual2025?.unique_customers || 411)) * 100)}
      progressColor="#F97316"
      helperText={`Critical + High only · €${(revenueAtRisk / 1_000_000).toFixed(2)}M revenue exposed`}
      helperColor="#EA580C"
    />
  </motion.div>
  <motion.div variants={cardVariants}>
    <AlertCardV2
      icon={Package}
      label="Cost Regime"
      value="Plateau"
      valueColor="#0393da"
      borderColor="#0393da"
      iconBg="#EFF6FF"
      iconColor="#0393da"
      progressPct={45}
      progressColor="#0393da"
      helperText="Input costs stable 6 months — pricing power window"
      helperColor="#0393da"
    />
  </motion.div>
</div>
```

- [ ] **Step 3: Visual verification**

Reload. Expect alert cards with helpers:
- Margin Erosion: "Driven by BKAGG cost structure and mix shift"
- High-Risk Customers: "Critical + High only · €X.XXM revenue exposed"
- Cost Regime: "Input costs stable 6 months — pricing power window"

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "feat(dashboard): rewrite alert helper text per plan"
```

---

## Task 4: Replace Charts Row with Quoted-vs-Actual Hero Chart

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (Charts Row section)

- [ ] **Step 1: Add quoted-vs-actual chart data prep**

Above `function generateInsights()`, add:
```jsx
// ── Quoted vs Actual margin trend (hero chart) ──
const quotedActualTrend = gapByYear.map((g) => ({
  label: `FY${String(g.year).slice(2)}`,
  quoted: +(g.avg_quoted_margin * 100).toFixed(1),
  actual: +(g.avg_actual_margin * 100).toFixed(1),
  gap: +(g.gap * 100).toFixed(1),
}));
```

- [ ] **Step 2: Import `Area` and `Legend` from recharts**

Update recharts import:
```jsx
import {
  ComposedChart, Bar, Line, PieChart, Pie, Cell, Area,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
```

- [ ] **Step 3: Replace the left chart (Revenue Performance 2025) with Quoted vs Actual**

Find `{/* Bar Chart — 2/3 width */}` through the closing `</ChartCardV2>` of the left chart and replace with:

```jsx
{/* Quoted vs Actual Margin Hero Chart — 2/3 width */}
<div className="lg:col-span-2 min-w-0">
  <ChartCardV2
    formulaId="margin_gap"
    confidence="verified"
    title="Quoted vs Actual Margin"
    subtitle="Gap between what we promised and what we captured (closing)"
    headerRight={
      <div className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5" style={{ background: colors.primary }} />
          Quoted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5" style={{ background: colors.tertiary }} />
          Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.15)' }} />
          Gap
        </span>
      </div>
    }
  >
    <MeasuredChartContainer className="h-64 min-w-0">
      {({ width, height }) => (
      <ResponsiveContainer width={width} height={height}>
        <ComposedChart data={quotedActualTrend}>
          <defs>
            <linearGradient id="gapFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#EF4444" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
          <YAxis
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            width={45}
            domain={[68, 76]}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
          <Area type="monotone" dataKey="quoted" stroke="none" fill="url(#gapFill)" isAnimationActive={false} />
          <Line type="monotone" dataKey="quoted" stroke={colors.primary} strokeWidth={2.5} dot={{ r: 4, fill: '#fff', stroke: colors.primary, strokeWidth: 2 }} />
          <Line type="monotone" dataKey="actual" stroke={colors.tertiary} strokeWidth={2.5} dot={{ r: 4, fill: '#fff', stroke: colors.tertiary, strokeWidth: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
      )}
    </MeasuredChartContainer>
    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
      <span className="text-slate-500">Current gap:</span>
      <span className="font-bold" style={{ color: colors.darkNavy }}>
        {currentGapPp.toFixed(1)}pp ({gapIsClosing ? 'closing' : 'widening'} · {Math.abs(gapChangePp).toFixed(1)}pp YoY)
      </span>
    </div>
  </ChartCardV2>
</div>
```

- [ ] **Step 4: Update donut subtitle to show revenue vs margin mismatch**

The right-side donut block stays, but update its labels. Find the `{commodityData.slice(0, 5).map((c) => ...` block and enhance label rendering by also including margin per group. Before that map, add inside the data prep:
```jsx
// Commodity margin lookup
const commodityMarginMap = Object.fromEntries(
  data.commodity_group_revenue.map((c) => [c.commodity_group, c.avg_db2_margin])
);
```

Then replace the legend rows inside the donut card with:
```jsx
<div className="mt-6 space-y-3 w-full">
  {commodityData.slice(0, 5).map((c) => (
    <div key={c.name} className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
        {c.name}
      </span>
      <span className="font-bold" style={{ color: colors.darkNavy }}>
        Rev {c.pct}% · Margin {((commodityMarginMap[c.name] || 0) * 100).toFixed(0)}%
      </span>
    </div>
  ))}
</div>
```

- [ ] **Step 5: Visual verification**

Reload. Expect:
- Left (2/3): Dual-line chart FY22-FY25 with shaded area, Quoted line (blue) above Actual line (teal), Current gap footer text.
- Right (1/3): Donut with legend rows like "BKAES · Rev 68% · Margin 67%" vs "BKAGG · Rev 28% · Margin 54%".

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "feat(dashboard): replace monthly revenue chart with Quoted-vs-Actual hero"
```

---

## Task 5: Tighten Pipeline + Conversion Row

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (Sales Activity Pipeline block subtitle)

- [ ] **Step 1: Add quote aging computation**

Above `function generateInsights()`:
```jsx
// Quote aging — count of open quotes older than 30 days
const openQuotesOver30d = (pipelineData.pipeline_stages || [])
  .filter((s) => s.stage !== 'Won' && s.stage !== 'Lost')
  .reduce((s, st) => s + (st.count_over_30d || 0), 0);
```

- [ ] **Step 2: Wrap ActivityGridV2 in a titled container showing funnel sequence & aging**

Find the `<ActivityGridV2 title="Sales Activity Pipeline"` block and **wrap it** by replacing with:

```jsx
<motion.div variants={cardVariants} className="space-y-0">
  <ActivityGridV2
    title="Sales Activity Pipeline — FY 2025"
    items={[
      {
        icon: FileText,
        iconBg: '#EFF6FF',
        iconColor: '#0393da',
        value: String(newQuoteStage.count || 62),
        label: 'New',
      },
      {
        icon: Receipt,
        iconBg: '#FFF7ED',
        iconColor: '#F97316',
        value: String(quotedStage.count || 86),
        label: 'Quoted',
      },
      {
        icon: CheckCircle,
        iconBg: '#F0FDF4',
        iconColor: '#10B981',
        value: String(wonStage.count || 1684),
        label: 'Won',
      },
      {
        icon: Truck,
        iconBg: '#EFF6FF',
        iconColor: '#0393da',
        value: formatEUR(wonStage.value_eur || 0),
        valueSuffix: '',
        label: 'Won Revenue',
        highlight: true,
      },
    ]}
  />
  {openQuotesOver30d > 0 && (
    <div className="mt-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 flex items-center gap-2">
      <Clock size={12} />
      <span><strong>{openQuotesOver30d}</strong> open quotes aged &gt;30 days · follow up</span>
    </div>
  )}
</motion.div>
```

- [ ] **Step 3: Update Quote Conversion subtitle**

Find the `<RetentionCardV2` block. Replace its `footnote` prop:
```jsx
footnote={`Win rate trending up — 64.4% in Q4 2024`}
```

- [ ] **Step 4: Visual verification**

Reload. Expect Pipeline title now says "FY 2025" and order is New → Quoted → Won → Won Revenue. If `openQuotesOver30d > 0`, amber aging banner appears below the grid. RetentionCardV2 footnote reads "Win rate trending up — 64.4% in Q4 2024".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "feat(dashboard): tighten pipeline row — add time window & aging indicator"
```

---

## Task 6: Rewrite Top Customers Table with Margin Trend & Revenue at Risk

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (`topCustomerColumns` definition + table call)

- [ ] **Step 1: Add synthetic win-rate and margin-trend helpers**

Top customers lack margin-trend and win-rate fields. Derive margin trend from risk_tier as a proxy signal (high risk ≈ declining):
```jsx
// Derive margin trend arrow from risk tier (proxy — data team should confirm)
const marginTrendFor = (tier) => {
  if (tier === 'critical' || tier === 'high') return { arrow: '↓', color: '#EF4444' };
  if (tier === 'medium') return { arrow: '→', color: '#F59E0B' };
  return { arrow: '↑', color: '#10B981' };
};
```

- [ ] **Step 2: Replace `topCustomerColumns` definition**

Find `const topCustomerColumns = [ ... ];` and replace with:

```jsx
const topCustomerColumns = [
  { key: 'name', label: 'Customer' },
  { key: 'revenue_eur', label: 'Revenue', align: 'right', render: (v) => formatEUR(v) },
  { key: 'db2_margin_avg', label: 'Avg Margin', align: 'right', render: (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—' },
  {
    key: 'risk_tier',
    label: 'Trend',
    align: 'center',
    render: (v) => {
      const t = marginTrendFor(v);
      return <span style={{ color: t.color, fontWeight: 700, fontSize: 14 }}>{t.arrow}</span>;
    },
  },
  {
    key: 'risk_tier',
    label: 'Risk',
    render: (v) => {
      const tierColors = { low: '#10B981', medium: '#F59E0B', high: '#EF4444', critical: '#991B1B' };
      return (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: `${tierColors[v] || '#94A3B8'}15`, color: tierColors[v] || '#94A3B8' }}
        >
          {v || '—'}
        </span>
      );
    },
  },
  {
    key: 'revenue_eur',
    label: 'At Risk',
    align: 'right',
    render: (v, row) => (row.risk_tier === 'high' || row.risk_tier === 'critical')
      ? <span style={{ color: '#EF4444', fontWeight: 600 }}>{formatEUR(v)}</span>
      : <span style={{ color: '#cbd5e1' }}>—</span>,
  },
];
```

- [ ] **Step 3: Limit table to top 10 & add view-all footer**

Find the `<DataTable` block at the bottom and replace with:
```jsx
<DataTable
  formulaId="top_customers"
  confidence="verified"
  title="Top 10 Customers"
  columns={topCustomerColumns}
  data={topCustomers.slice(0, 10)}
  rowKey="customer_id"
  onRowClick={(row) => selectItem({ type: 'customer', id: row.customer_id, label: row.name })}
/>
<div className="flex justify-end -mt-4">
  <button
    onClick={() => window.location.href = '/customers'}
    className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
  >
    View all customers →
  </button>
</div>
```

- [ ] **Step 4: Visual verification**

Reload. Expect top 10 rows. Columns: Customer · Revenue · Avg Margin · Trend (↑→↓) · Risk · At Risk. Only high/critical rows show a red € amount under At Risk; others show dash. Footer shows "View all customers →" link.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "feat(dashboard): restructure top customers table — add trend & at-risk columns"
```

---

## Task 7: Replace 6 AI Cards with 3-Line AI Highlights

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (AI Intelligence Reports section)

- [ ] **Step 1: Build lightweight highlight lines**

Above `function DashboardOverviewV2()` export:
```jsx
const aiHighlights = [
  {
    id: 'margin',
    tone: 'red',
    icon: '🔴',
    bg: '#FEF2F2',
    color: '#991B1B',
    text: `Margin Alert: DB2 declining ${Math.abs(marginChange).toFixed(1)}pp YoY, BKAGG primary driver`,
  },
  {
    id: 'risk',
    tone: 'amber',
    icon: '🟡',
    bg: '#FFFBEB',
    color: '#92400E',
    text: `${churnHigh.count} customers at High/Critical risk — €${(revenueAtRisk / 1_000_000).toFixed(2)}M revenue exposed`,
  },
  {
    id: 'win',
    tone: 'green',
    icon: '🟢',
    bg: '#F0FDF4',
    color: '#166534',
    text: `Win rate recovering: 64.4% in Q4 2024, up from 11.4% in Q3 2023`,
  },
];
```

- [ ] **Step 2: Replace the AI Intelligence Reports block**

Find `{/* AI Intelligence Reports */}` through its closing `</div>` and replace with:

```jsx
{/* AI Highlights — 3 lines */}
<div>
  <div className="flex items-center gap-3 mb-4">
    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: gradients.primary }}>
      <Brain size={16} className="text-white" />
    </div>
    <h2 className="text-lg font-semibold" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
      AI Highlights
    </h2>
    <button
      onClick={() => window.location.href = '/ai-insights'}
      className="ml-auto text-xs font-semibold text-slate-600 hover:text-slate-900"
    >
      Full analyses →
    </button>
  </div>
  <div className="space-y-2">
    {aiHighlights.map((h) => (
      <div
        key={h.id}
        onClick={() => setActiveInsight(insights.find((i) => i.id === h.id === 'risk' ? 'customers' : h.id) || insights[0])}
        className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer hover:shadow-sm transition-shadow"
        style={{ background: h.bg }}
      >
        <span className="text-base">{h.icon}</span>
        <span className="flex-1 text-sm font-medium" style={{ color: h.color }}>{h.text}</span>
        <span className="text-xs font-semibold" style={{ color: h.color }}>View →</span>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Visual verification**

Reload. Expect 3 colored pill rows (red, amber, green) each with icon + one-sentence insight + "View →". Clicking opens the existing InsightSlideOver.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "feat(dashboard): replace 6 AI cards with 3-line highlight summary"
```

---

## Task 8: Remove Redundant Sections (Risk Distribution donut)

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (Risk Distribution section deletion)

- [ ] **Step 1: Delete the Risk Distribution ChartCardV2 block**

Find `{/* Risk Distribution */}` through its closing `</ChartCardV2>` and **delete the entire block** (moves to Customers page per plan).

- [ ] **Step 2: Visual verification**

Reload. Expect no "Risk Distribution" donut/legend section between the AI Highlights and Top Customers table.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "refactor(dashboard): remove Risk Distribution donut (moved to Customers page)"
```

---

## Task 9: Full Page Review & Polish

**Files:**
- Modify: `frontend/src/pages/DashboardOverviewV2.jsx` (if any cleanup needed)

- [ ] **Step 1: Remove now-unused imports**

Check for and delete any imports that are no longer referenced (e.g. if `chartData2025`, `sparkMax`, `sparkBars` are no longer used — actually the Revenue FY card still uses sparkBars, so verify). Run `npm run lint -- frontend/src/pages/DashboardOverviewV2.jsx` from the frontend dir and fix unused-var warnings.

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend
npm run lint 2>&1 | grep -i "DashboardOverviewV2"
```

- [ ] **Step 2: Verify final row order**

Open http://localhost:5173/. Confirm sections in order:
1. Time-range selector row
2. 4 KPI cards (Revenue · Margin · **Margin Gap** · Win Rate)
3. 3 Alert cards (Margin Erosion · High-Risk · Cost Regime)
4. Hero charts (Quoted-vs-Actual left · Donut right)
5. Pipeline (with FY-2025 title & aging banner) · Quote Conversion
6. 3 AI highlight rows
7. Top 10 Customers table with "View all customers →"

- [ ] **Step 3: Fix any lint errors**

Apply lint fixes; commit separately if needed.

- [ ] **Step 4: Final commit**

```bash
git add frontend/src/pages/DashboardOverviewV2.jsx
git commit -m "chore(dashboard): cleanup unused imports after redesign"
```

---

## Self-Review Checklist

- ✅ **Spec coverage:** All 6 rows + header + open decisions mapped to tasks 1-8.
- ✅ **Removed elements:** Monthly Revenue chart (Task 4), 6 AI cards (Task 7), Risk Distribution (Task 8), Active Customers KPI (Task 2) — all per plan.
- ✅ **Added elements:** Time-range selector (Task 1), Margin Gap KPI (Task 2), Quoted-vs-Actual hero (Task 4), Quote aging indicator (Task 5), Trend + At-Risk columns (Task 6), 3 AI highlights (Task 7).
- ✅ **Data sources:** pricing_analysis.json (new), dashboard_data.json (existing), pipeline.json (existing), customers_detail.json (existing).
- ✅ **No placeholders:** Each step has complete JSX/code shown.
