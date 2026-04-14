import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, Area, BarChart,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, Cell,
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniBars, MiniWave, MiniRange } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import DataTable from '../components/shared/DataTable';
import CustomTooltip from '../components/shared/CustomTooltip';
import PhaseNotice from '../components/shared/PhaseNotice';
import { useUI } from '../context/UIContext';
import { useLanguage } from '../context/LanguageContext';
import { handleChartContainerClick } from '../utils/pageContextResolver';
import monthlyData from '../data/monthly_detail.json';
import productsData from '../data/products.json';
import revenueMarginsDetail from '../data/revenue_margins_detail.json';
import { formatEUR, formatPct, formatMonth } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { track } from '../utils/tracker';
import { IS_DEMO } from '../utils/brand';
import NLHeaderCard from '../components/phase45/NLHeaderCard';

const monthlyTotals = Array.isArray(monthlyData) ? monthlyData : monthlyData.monthly_totals || [];
const products = productsData.products;
const quarterlyGap = revenueMarginsDetail.quarterly_quoted_vs_actual;
const commodityMargins = revenueMarginsDetail.commodity_group_margins;
const customerGaps = revenueMarginsDetail.customer_margin_gaps;
const LAST_UPDATED = revenueMarginsDetail.last_updated;

const years = [2022, 2023, 2024, 2025, 'All'];
const commodityGroups = ['All', ...commodityMargins.map((c) => c.group)];
const DEMAND_SHOCK_MONTHS = [
  { year: 2025, month: 5 },
  { year: 2025, month: 10 },
];
const TARGET_MARGIN = 0.60;

// Histogram with revenue weighting support
function binMarginsRich(productList, marginKey, revKey) {
  const buckets = [
    { range: '0–15%', min: 0, max: 0.15, count: 0, revenue: 0, color: '#ba1a1a' },
    { range: '15–25%', min: 0.15, max: 0.25, count: 0, revenue: 0, color: '#ba1a1a' },
    { range: '25–35%', min: 0.25, max: 0.35, count: 0, revenue: 0, color: '#ba1a1a' },
    { range: '35–45%', min: 0.35, max: 0.45, count: 0, revenue: 0, color: '#e7a019' },
    { range: '45–55%', min: 0.45, max: 0.55, count: 0, revenue: 0, color: '#e7a019' },
    { range: '55–75%', min: 0.55, max: 0.75, count: 0, revenue: 0, color: '#0393da' },
    { range: '75%+', min: 0.75, max: 1.1, count: 0, revenue: 0, color: '#10b981' },
  ];
  productList.forEach((p) => {
    const m = p[marginKey];
    if (m == null) return;
    const bucket = buckets.find((b) => m >= b.min && m < b.max);
    if (bucket) {
      bucket.count++;
      bucket.revenue += p[revKey] || 0;
    }
  });
  return buckets;
}

// Commodity margin color bands: red <50%, orange 50-55%, green >60% (per plan)
function commodityBarColor(db2) {
  if (db2 < 0.50) return '#ba1a1a';
  if (db2 < 0.55) return '#e7a019';
  if (db2 > 0.60) return '#10b981';
  return '#0393da';
}

const TrendArrow = ({ trend }) => {
  if (trend === 'up') return <span className="text-green-600 font-bold">↑</span>;
  if (trend === 'down') return <span className="text-red-600 font-bold">↓</span>;
  return <span className="text-slate-400 font-bold">→</span>;
};

// Custom tooltip for hero chart with negative-gap note (curried so we can inject t)
function makeHeroTooltip(t) {
  return function HeroTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    const isNegative = data.gap_pp < 0;
    return (
      <div className="px-4 py-3 rounded-lg shadow-lg text-xs" style={{ background: '#fff', border: '1px solid #e5e5e5' }}>
        <div className="font-bold text-[13px] mb-2" style={{ color: '#1a1a2e' }}>{label}</div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-sm bg-[#0393da]" />
          <span className="text-slate-500">{t('revenue.tip.quoted')}</span>
          <span className="font-semibold ml-auto">{(data.quoted * 100).toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-sm bg-[#10b981]" />
          <span className="text-slate-500">{t('revenue.tip.actual')}</span>
          <span className="font-semibold ml-auto">{(data.actual * 100).toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid #f0f0f0' }}>
          <span className="text-slate-500">{t('revenue.tip.gap')}</span>
          <span className={`font-bold ml-auto ${isNegative ? 'text-green-700' : 'text-red-600'}`}>
            {data.gap_pp > 0 ? '+' : ''}{data.gap_pp.toFixed(1)}pp
          </span>
        </div>
        {isNegative && (
          <div className="mt-2 pt-2 text-[10px] italic text-slate-500" style={{ borderTop: '1px solid #f0f0f0', maxWidth: '200px' }}>
            {t('revenue.tip.negative')}
          </div>
        )}
      </div>
    );
  };
}

export default function RevenueMargins() {
  const { selectItem, selectedItem } = useUI();
  const { t, lang } = useLanguage();
  const HeroTooltip = useMemo(() => makeHeroTooltip(t), [t]);
  const [selectedYear, setSelectedYear] = useState(2025);
  const [selectedCommodity, setSelectedCommodity] = useState('All');
  const [histogramMode, setHistogramMode] = useState('count'); // 'count' | 'revenue'

  // Filter products by commodity for sections 3R, 4, 6 cascades
  const filteredProducts = useMemo(() => {
    if (selectedCommodity === 'All') return products;
    return products.filter((p) => p.commodity_group === selectedCommodity);
  }, [selectedCommodity]);

  // KPIs
  const kpis = useMemo(() => {
    const yearMonths = selectedYear === 'All'
      ? monthlyTotals
      : monthlyTotals.filter((m) => m.Year === selectedYear);
    const priorMonths = selectedYear === 'All'
      ? []
      : monthlyTotals.filter((m) => m.Year === selectedYear - 1);

    const totalRev = yearMonths.reduce((s, m) => s + (m.revenue_eur || 0), 0);
    const avgDb2 = yearMonths.reduce((s, m) => s + (m.db2_margin || 0), 0) / (yearMonths.length || 1);
    const avgDb1 = yearMonths.reduce((s, m) => s + (m.db1_margin || 0), 0) / (yearMonths.length || 1);
    const priorRev = priorMonths.reduce((s, m) => s + (m.revenue_eur || 0), 0);
    const priorDb2 = priorMonths.length
      ? priorMonths.reduce((s, m) => s + (m.db2_margin || 0), 0) / priorMonths.length
      : null;
    const priorDb1 = priorMonths.length
      ? priorMonths.reduce((s, m) => s + (m.db1_margin || 0), 0) / priorMonths.length
      : null;
    const yoyGrowth = priorRev > 0 ? (totalRev - priorRev) / priorRev : null;
    const db2DeltaPp = priorDb2 != null ? (avgDb2 - priorDb2) * 100 : null;
    const db1DeltaPp = priorDb1 != null ? (avgDb1 - priorDb1) * 100 : null;

    // Margin Gap — avg of quarterly gaps for selected commodity + year
    const commodityQuarters = quarterlyGap[selectedCommodity] || quarterlyGap.All;
    const priorCommodityQuarters = quarterlyGap[selectedCommodity] || quarterlyGap.All;
    const yearQuarters = selectedYear === 'All'
      ? commodityQuarters
      : commodityQuarters.filter((q) => q.year === selectedYear);
    const priorQuarters = selectedYear === 'All'
      ? []
      : priorCommodityQuarters.filter((q) => q.year === selectedYear - 1);
    const avgGap = yearQuarters.length
      ? yearQuarters.reduce((s, q) => s + q.gap_pp, 0) / yearQuarters.length
      : 0;
    const priorAvgGap = priorQuarters.length
      ? priorQuarters.reduce((s, q) => s + q.gap_pp, 0) / priorQuarters.length
      : null;
    const gapDeltaPp = priorAvgGap != null ? avgGap - priorAvgGap : null;

    return {
      totalRev, avgDb2, avgDb1, yoyGrowth,
      db2DeltaPp, db1DeltaPp,
      avgGap, gapDeltaPp,
      fixedSpreadPp: (avgDb1 - avgDb2) * 100,
    };
  }, [selectedYear, selectedCommodity]);

  // Monthly chart data
  const monthlyFiltered = useMemo(() => {
    const items = selectedYear === 'All'
      ? monthlyTotals
      : monthlyTotals.filter((d) => d.Year === selectedYear);
    return items.map((d) => ({
      ...d,
      avg_margin_pct: d.db2_margin,
      label: selectedYear === 'All' ? formatMonth(d.Month, d.Year) : formatMonth(d.Month),
      isDemandShock: DEMAND_SHOCK_MONTHS.some((s) => s.year === d.Year && s.month === d.Month),
    }));
  }, [selectedYear]);

  // Row 2 hero chart: quarterly quoted vs actual for selected commodity, filtered by year
  const quarterlyChartData = useMemo(() => {
    const src = quarterlyGap[selectedCommodity] || quarterlyGap.All;
    const filtered = selectedYear === 'All' ? src : src.filter((q) => q.year === selectedYear);
    return filtered.map((q) => ({
      ...q,
      range: [q.actual, q.quoted],
    }));
  }, [selectedCommodity, selectedYear]);

  // Row 3R: commodity margin data, filtered and sorted by revenue desc
  const commodityChartData = useMemo(() => {
    const list = selectedCommodity === 'All'
      ? commodityMargins
      : commodityMargins.filter((c) => c.group === selectedCommodity);
    return [...list].sort((a, b) => b.revenue_eur - a.revenue_eur);
  }, [selectedCommodity]);

  // Row 4: DB1/DB2 breakdown (same source, sorted by revenue)
  const db1Db2Data = useMemo(() =>
    [...commodityChartData].map((c) => ({
      group: c.group,
      description: c.description,
      db1_pct: c.db1_margin * 100,
      db2_pct: c.db2_margin * 100,
      fixed_overhead_pp: c.fixed_overhead_pp,
      revenue_eur: c.revenue_eur,
    })),
    [commodityChartData]);

  // Row 5: customer table data — filter by commodity, pick yearly or all_time metrics
  const customerTableData = useMemo(() => {
    const filtered = selectedCommodity === 'All'
      ? customerGaps
      : customerGaps.filter((c) => c.primary_commodity === selectedCommodity);
    const rows = filtered.map((c) => {
      const metrics = selectedYear === 'All' ? c.all_time : (c.yearly?.[selectedYear] || c.all_time);
      return {
        customer_id: c.customer_id,
        name: c.name,
        primary_commodity: c.primary_commodity,
        revenue_eur: metrics.revenue_eur,
        actual_margin: metrics.actual_margin,
        quoted_margin: metrics.quoted_margin,
        gap_pp: metrics.gap_pp,
        impact_eur: metrics.impact_eur,
        trend: metrics.trend,
      };
    });
    return rows.sort((a, b) => b.impact_eur - a.impact_eur).slice(0, 15);
  }, [selectedCommodity, selectedYear]);

  const customerColumns = [
    {
      key: 'customer_id', label: t('revenue.col.customer'),
      render: (v, row) => (
        <span className="font-mono font-medium text-[#0393da]">{v}</span>
      ),
    },
    ...(selectedCommodity === 'All' ? [{
      key: 'primary_commodity', label: t('revenue.col.commodity'),
      render: (v) => (
        <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-600">{v}</span>
      ),
    }] : []),
    {
      key: 'revenue_eur', label: t('revenue.col.revenue'), align: 'right',
      render: (v) => <span className="font-semibold">{formatEUR(v)}</span>,
    },
    {
      key: 'actual_margin', label: t('revenue.col.actual'), align: 'right',
      render: (v) => <span>{(v * 100).toFixed(1)}%</span>,
    },
    {
      key: 'quoted_margin', label: t('revenue.col.quoted'), align: 'right',
      render: (v) => <span className="text-slate-500">{(v * 100).toFixed(1)}%</span>,
    },
    {
      key: 'gap_pp', label: t('revenue.col.gap'), align: 'right',
      render: (v) => {
        const color = v >= 15 ? 'text-red-600' : v >= 10 ? 'text-amber-600' : 'text-slate-700';
        return <span className={`font-bold ${color}`}>{v.toFixed(1)}pp</span>;
      },
    },
    {
      key: 'impact_eur', label: t('revenue.col.impact'), align: 'right',
      render: (v) => <span className="font-bold text-red-600">{formatEUR(v)}</span>,
      tooltip: t('revenue.col.impact.tip'),
    },
    {
      key: 'trend', label: t('revenue.col.trend'), align: 'right',
      render: (v) => <TrendArrow trend={v} />,
      tooltip: t('revenue.col.trend.tip'),
    },
  ];

  // Row 6: histogram
  const marginBins = useMemo(() => {
    const mKey = selectedYear === 'All' ? 'margin_2025' : `margin_${selectedYear}`;
    const rKey = selectedYear === 'All' ? 'revenue_2025' : `revenue_${selectedYear}`;
    return binMarginsRich(filteredProducts, mKey, rKey);
  }, [selectedYear, filteredProducts]);

  // Format last updated
  const lastUpdatedStr = useMemo(() => {
    const d = new Date(LAST_UPDATED);
    return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [lang]);

  return (
    <>
      <Header title={t('revenue.title')} />
      <div className="p-8 space-y-6 max-w-[1440px] mx-auto">
        {IS_DEMO && <NLHeaderCard />}
        {/* Global Filter Row */}
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-4">
            {/* Year Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
              {years.map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all active:scale-[0.97] ${
                    selectedYear === y
                      ? 'bg-white text-[#0393da] shadow-sm font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {y === 'All' ? t('revenue.filter.year.all') : y}
                </button>
              ))}
            </div>
            {/* Commodity Filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('revenue.filter.commodity')}</span>
              <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                {commodityGroups.map((g) => (
                  <button
                    key={g}
                    onClick={() => setSelectedCommodity(g)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all active:scale-[0.97] ${
                      selectedCommodity === g
                        ? 'bg-white text-[#0393da] shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {g === 'All' ? t('revenue.filter.year.all') : g}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-500">
            {t('revenue.lastUpdated')} <span className="font-semibold text-slate-700">{lastUpdatedStr}</span>
          </div>
        </div>

        {/* Row 1 — KPI Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('revenue.kpi.totalRevenue')}
              value={formatEUR(kpis.totalRev)}
              change={kpis.yoyGrowth != null ? `${kpis.yoyGrowth >= 0 ? '+' : ''}${(kpis.yoyGrowth * 100).toFixed(1)}% YoY` : undefined}
              changeType={kpis.yoyGrowth >= 0 ? 'positive' : 'negative'}
              tooltip={TOOLTIPS.revenue_ytd}
              formulaId="revenue_total"
              confidence="verified"
              bottomContent={<MiniBars data={monthlyFiltered.slice(-7).map(d => d.revenue_eur)} />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('revenue.kpi.db2')}
              value={formatPct(kpis.avgDb2)}
              change={kpis.db2DeltaPp != null ? `${kpis.db2DeltaPp >= 0 ? '▲' : '▼'}${Math.abs(kpis.db2DeltaPp).toFixed(1)}pp YoY` : undefined}
              changeType={kpis.db2DeltaPp >= 0 ? 'positive' : 'warning'}
              tooltip={TOOLTIPS.gross_margin}
              formulaId="db2_margin"
              confidence="verified"
              bottomContent={<MiniWave color="#e7a019" />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('revenue.kpi.gap')}
              value={`${kpis.avgGap.toFixed(1)}pp`}
              change={kpis.gapDeltaPp != null ? `${kpis.gapDeltaPp >= 0 ? '▲' : '▼'}${Math.abs(kpis.gapDeltaPp).toFixed(1)}pp YoY` : undefined}
              changeType={kpis.gapDeltaPp != null && kpis.gapDeltaPp < 0 ? 'positive' : 'warning'}
              tooltip={TOOLTIPS.margin_gap}
              formulaId="db2_margin"
              confidence="verified"
              bottomContent={
                <div className="text-[10px] italic" style={{ color: '#737373' }}>
                  {t('revenue.kpi.gapBottom')}
                </div>
              }
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('revenue.kpi.db1')}
              value={formatPct(kpis.avgDb1)}
              change={kpis.db1DeltaPp != null ? `${kpis.db1DeltaPp >= 0 ? '▲' : '▼'}${Math.abs(kpis.db1DeltaPp).toFixed(1)}pp YoY` : undefined}
              changeType={kpis.db1DeltaPp >= 0 ? 'positive' : 'warning'}
              tooltip={TOOLTIPS.db1_margin}
              formulaId="db2_margin"
              confidence="verified"
              bottomContent={
                <div className="text-[10px] italic" style={{ color: '#737373' }}>
                  {t('revenue.kpi.spreadBottom', { pp: kpis.fixedSpreadPp.toFixed(1) })}
                </div>
              }
            />
          </motion.div>
        </motion.div>

        {/* Row 2 — Hero Chart: Quoted vs Actual Margin Trend */}
        <ChartCard
          title={`${t('revenue.hero.title')}${selectedCommodity !== 'All' ? ` · ${selectedCommodity}` : ''}`}
          subtitle={t('revenue.hero.subtitle', { period: selectedYear === 'All' ? t('revenue.hero.period.all') : t('revenue.hero.period.year', { year: selectedYear }) })}
          tooltip={TOOLTIPS.quoted_vs_actual_trend}
          formulaId="db2_margin"
          confidence="derived"
          headerRight={
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-[#0393da] block" />
                <span className="text-xs font-medium text-slate-500">{t('revenue.tip.quoted')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-0.5 bg-[#10b981] block" />
                <span className="text-xs font-medium text-slate-500">{t('revenue.tip.actual')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ background: '#ef4444', opacity: 0.15 }} />
                <span className="text-xs font-medium text-slate-500">{t('revenue.tip.gap')}</span>
              </div>
            </div>
          }
        >
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={quarterlyChartData} onClick={(s) => handleChartContainerClick('Quoted vs Actual Trend', selectItem, quarterlyChartData, s)}>
                <defs>
                  <linearGradient id="gapBandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis
                  dataKey="quarter"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  width={50}
                  domain={['auto', 'auto']}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<HeroTooltip />} />
                {/* Year dividers — only when showing multiple years */}
                {selectedYear === 'All' && (
                  <>
                    <ReferenceLine x="2023-Q1" stroke="#e2e8f0" strokeDasharray="4 4" />
                    <ReferenceLine x="2024-Q1" stroke="#e2e8f0" strokeDasharray="4 4" />
                    <ReferenceLine x="2025-Q1" stroke="#e2e8f0" strokeDasharray="4 4" />
                  </>
                )}
                {/* Shaded gap band */}
                <Area
                  type="monotone"
                  dataKey="range"
                  fill="url(#gapBandGrad)"
                  stroke="none"
                  connectNulls
                  activeDot={false}
                />
                {/* Quoted line */}
                <Line
                  type="monotone"
                  dataKey="quoted"
                  stroke="#0393da"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#0393da' }}
                  activeDot={{ r: 5 }}
                  animationDuration={800}
                  onClick={(data) => track.chartClick('Quoted Margin Trend', data)}
                />
                {/* Actual line */}
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#10b981' }}
                  activeDot={{ r: 5 }}
                  animationDuration={800}
                  onClick={(data) => track.chartClick('Actual Margin Trend', data)}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Row 3 — Two side-by-side charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Row 3L — Monthly Revenue & Margin (kept) */}
          <ChartCard
            title={t('revenue.monthly.title')}
            subtitle={selectedYear === 'All' ? t('revenue.monthly.subtitle.all') : t('revenue.monthly.subtitle.year', { year: selectedYear })}
            tooltip={TOOLTIPS.revenue_margin_performance}
            formulaId="monthly_revenue"
            confidence="verified"
            headerRight={
              <div className="flex gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#0393da] rounded-sm" />
                  <span className="text-[10px] font-medium text-slate-500">{t('revenue.legend.revenue')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-green-500 block" />
                  <span className="text-[10px] font-medium text-slate-500">{t('revenue.legend.margin')}</span>
                </div>
              </div>
            }
          >
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyFiltered} onClick={(s) => handleChartContainerClick('Monthly Revenue & Margin', selectItem, monthlyFiltered, s)}>
                  <defs>
                    <linearGradient id="barGradBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0393da" />
                      <stop offset="100%" stopColor="#0393da" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="barGradRed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#EF4444" />
                      <stop offset="100%" stopColor="#EF4444" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis yAxisId="revenue" tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="margin" orientation="right" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={40} domain={[0, 'auto']} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip formatter={(v, name) => {
                    if (name === 'revenue_eur') return formatEUR(v);
                    if (name === 'avg_margin_pct') return formatPct(v);
                    return v;
                  }} />} />
                  <ReferenceLine yAxisId="margin" y={TARGET_MARGIN} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1} />
                  <Bar yAxisId="revenue" dataKey="revenue_eur" radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={800}>
                    {monthlyFiltered.map((entry, i) => (
                      <Cell key={i} fill={entry.isDemandShock ? 'url(#barGradRed)' : 'url(#barGradBlue)'} />
                    ))}
                  </Bar>
                  <Line yAxisId="margin" type="monotone" dataKey="avg_margin_pct" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} animationDuration={800} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Row 3R — Margin by Commodity Group (NEW) */}
          <ChartCard
            title={t('revenue.byCommodity.title')}
            subtitle={t('revenue.byCommodity.subtitle')}
            tooltip={TOOLTIPS.margin_by_commodity}
            formulaId="db2_margin"
            confidence="verified"
          >
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={commodityChartData}
                  layout="vertical"
                  margin={{ top: 24, right: 80, left: 8, bottom: 8 }}
                  onClick={(s) => handleChartContainerClick('Margin by Commodity', selectItem, commodityChartData, s)}
                >
                  <CartesianGrid stroke="#f0f0f0" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 1]}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="group"
                    tick={{ fontSize: 11, fill: '#1a1a2e', fontWeight: 600 }}
                    width={60}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="px-3 py-2 rounded-lg shadow-lg text-xs" style={{ background: '#fff', border: '1px solid #e5e5e5' }}>
                          <div className="font-bold mb-1">{d.group} — {d.description}</div>
                          <div>DB II: <span className="font-semibold">{(d.db2_margin * 100).toFixed(1)}%</span></div>
                          <div>Revenue: <span className="font-semibold">{formatEUR(d.revenue_eur)}</span></div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine x={0.60} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: t('revenue.target60'), position: 'top', fill: '#64748b', fontSize: 10, fontWeight: 600, offset: 8 }} />
                  <Bar dataKey="db2_margin" radius={[0, 6, 6, 0]} animationDuration={800}
                       label={{
                         position: 'right',
                         formatter: (v) => {
                           // Recharts may pass a value or object
                           if (typeof v === 'number') return `${(v * 100).toFixed(1)}%`;
                           return '';
                         },
                         fontSize: 11,
                         fontWeight: 700,
                         fill: '#1a1a2e',
                       }}
                  >
                    {commodityChartData.map((entry, i) => (
                      <Cell key={i} fill={commodityBarColor(entry.db2_margin)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Revenue labels row (since Recharts bar label can't show two values cleanly) */}
            <div className="mt-3 pt-3 grid gap-1" style={{ borderTop: '1px solid #f0f0f0' }}>
              {commodityChartData.map((c) => (
                <div key={c.group} className="flex justify-between text-[10px]">
                  <span className="font-mono font-semibold text-slate-600">{c.group}</span>
                  <span className="text-slate-500">{t('revenue.rev')} <span className="font-semibold text-slate-700">{formatEUR(c.revenue_eur)}</span></span>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* Row 4 — DB1 vs DB2 Breakdown by Commodity Group */}
        <ChartCard
          title={t('revenue.db1Db2.title')}
          subtitle={t('revenue.db1Db2.subtitle')}
          tooltip={TOOLTIPS.db1_db2_breakdown}
          formulaId="db2_margin"
          confidence="derived"
          headerRight={
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-[#0393da] rounded-sm" />
                <span className="text-xs font-medium text-slate-500">{t('revenue.db1Db2.legend.db1')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-[#e7a019] rounded-sm" />
                <span className="text-xs font-medium text-slate-500">{t('revenue.db1Db2.legend.db2')}</span>
              </div>
            </div>
          }
        >
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={db1Db2Data}
                layout="vertical"
                margin={{ top: 8, right: 110, left: 8, bottom: 8 }}
                onClick={(s) => handleChartContainerClick('DB1 vs DB2 Breakdown', selectItem, db1Db2Data, s)}
              >
                <CartesianGrid stroke="#f0f0f0" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="group"
                  tick={{ fontSize: 11, fill: '#1a1a2e', fontWeight: 600 }}
                  width={60}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="px-3 py-2 rounded-lg shadow-lg text-xs" style={{ background: '#fff', border: '1px solid #e5e5e5' }}>
                        <div className="font-bold mb-1">{d.group} — {d.description}</div>
                        <div>{t('revenue.db1Db2.legend.db1')}: <span className="font-semibold text-[#0393da]">{d.db1_pct.toFixed(1)}%</span></div>
                        <div>{t('revenue.db1Db2.legend.db2')}: <span className="font-semibold text-[#e7a019]">{d.db2_pct.toFixed(1)}%</span></div>
                        <div className="mt-1 pt-1" style={{ borderTop: '1px solid #f0f0f0' }}>
                          {t('revenue.db1Db2.fixed')} <span className="font-bold">{d.fixed_overhead_pp.toFixed(1)}pp</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="db1_pct" fill="#0393da" radius={[0, 4, 4, 0]} animationDuration={800} />
                <Bar dataKey="db2_pct" fill="#e7a019" radius={[0, 4, 4, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Fixed overhead labels */}
          <div className="mt-4 pt-3 grid grid-cols-2 md:grid-cols-5 gap-3" style={{ borderTop: '1px solid #f0f0f0' }}>
            {db1Db2Data.map((d) => (
              <div key={d.group} className="text-center">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{d.group}</div>
                <div className="text-sm font-bold text-slate-800 mt-1">{d.fixed_overhead_pp.toFixed(1)}pp</div>
                <div className="text-[9px] text-slate-400">{t('revenue.db1Db2.fixedOh')}</div>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Row 5 — Customer Margin Gap Table */}
        <DataTable
          title={`${t('revenue.customers.title')}${selectedCommodity !== 'All' ? ` · ${selectedCommodity}` : ''}${selectedYear !== 'All' ? ` · ${t('revenue.hero.period.year', { year: selectedYear })}` : ''}`}
          columns={customerColumns}
          data={customerTableData}
          rowKey="customer_id"
          selectedRowId={selectedItem?.id}
          onRowClick={(row) => selectItem({ type: 'customer', id: row.customer_id, label: row.name, data: row })}
          tooltip={TOOLTIPS.customer_margin_gaps}
          formulaId="db2_margin"
          confidence="derived"
        />

        {/* Row 6 — Margin Distribution Histogram (enhanced) */}
        <ChartCard
          title={t('revenue.histogram.title')}
          subtitle={t('revenue.histogram.subtitle', {
            count: selectedCommodity === 'All' ? (productsData.summary?.total_active_skus ?? filteredProducts.length).toLocaleString() : filteredProducts.length.toLocaleString(),
            commodity: selectedCommodity !== 'All' ? t('revenue.histogram.subtitle.in', { group: selectedCommodity }) : '',
            pct: (TARGET_MARGIN * 100).toFixed(0),
          })}
          tooltip={TOOLTIPS.margin_distribution}
          formulaId="db2_margin"
          confidence="verified"
          headerRight={
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                onClick={() => setHistogramMode('count')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  histogramMode === 'count'
                    ? 'bg-white text-[#0393da] shadow-sm font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {t('revenue.histogram.count')}
              </button>
              <button
                onClick={() => setHistogramMode('revenue')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  histogramMode === 'revenue'
                    ? 'bg-white text-[#0393da] shadow-sm font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {t('revenue.histogram.revenue')}
              </button>
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marginBins} margin={{ top: 24, right: 16, left: 0, bottom: 0 }} onClick={(s) => handleChartContainerClick('Margin Distribution', selectItem, marginBins, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => histogramMode === 'revenue' ? formatEUR(v) : v}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="px-3 py-2 rounded-lg shadow-lg text-xs" style={{ background: '#fff', border: '1px solid #e5e5e5' }}>
                        <div className="font-bold mb-1">{t('revenue.histogram.tip.title', { label })}</div>
                        <div>{t('revenue.histogram.tip.skus')} <span className="font-semibold">{d.count.toLocaleString()}</span></div>
                        <div>{t('revenue.histogram.tip.revenue')} <span className="font-semibold">{formatEUR(d.revenue)}</span></div>
                      </div>
                    );
                  }}
                />
                {/* Target margin reference (60%) — falls between "55–75%" bucket, display as label above chart area */}
                <ReferenceLine
                  x="55–75%"
                  stroke="#1a1a2e"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: t('revenue.target', { pct: (TARGET_MARGIN * 100).toFixed(0) }), position: 'top', fill: '#1a1a2e', fontSize: 10, fontWeight: 700 }}
                />
                <Bar
                  dataKey={histogramMode === 'revenue' ? 'revenue' : 'count'}
                  radius={[6, 6, 0, 0]}
                  animationDuration={800}
                  onClick={(data) => track.chartClick('Margin Distribution', data)}
                >
                  {marginBins.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <PhaseNotice type="derived" />
      </div>
    </>
  );
}
