import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceArea, BarChart, Bar, Cell, LabelList,
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniBars, MiniWave } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import DataTable from '../components/shared/DataTable';
import productsData from '../data/products.json';
import productsDetail from '../data/products_detail.json';
import { formatEUR, formatPct } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { useLanguage } from '../context/LanguageContext';
import { handleScatterClick } from '../utils/pageContextResolver';
import { track } from '../utils/tracker';
import PhaseNotice from '../components/shared/PhaseNotice';
import { IS_DEMO } from '../utils/brand';
import FloorPriceTable from '../components/phase45/FloorPriceTable';
import BreakEvenChart from '../components/phase45/BreakEvenChart';
import ProfitabilityQuadrant from '../components/phase45/ProfitabilityQuadrant';
import SKUDeepDiveSlideOver from '../components/phase45/SKUDeepDiveSlideOver';

const products = productsData.products;
const { kpis: kpiData, product_type_performance, commodity_scorecard, declining_fast, article_enrichment } = productsDetail;

const COMMODITY_COLORS = {
  BKAES: '#0393da',
  BKAGG: '#10B981',
  SOPU: '#F59E0B',
  BKAIZ: '#8B5CF6',
  SOPUZK: '#06B6D4',
  OFRSCR: '#EC4899',
  MBKUEHL: '#6366F1',
  MBDIV: '#64748B',
  OFRLMG: '#EAB308',
};

const commodities = ['All', ...new Set(products.map((p) => p.commodity_group))];
const TARGET_MARGIN = 0.60;
const FLOOR_MARGIN = 0.25;

const severityColor = (margin) => {
  if (margin < 0.15) return 'border-l-red-500';
  if (margin < 0.20) return 'border-l-red-400';
  return 'border-l-amber-500';
};

function productTypeColor(m) {
  if (m < 0.50) return '#ba1a1a';
  if (m < 0.60) return '#e7a019';
  if (m < 0.70) return '#0393da';
  return '#10b981';
}

export default function ProductsSKUs() {
  const { selectItem, selectedItem, openSKUDetail } = useUI();
  const { t } = useLanguage();
  const [selectedCommodity, setSelectedCommodity] = useState('All');
  const [selectedYear, setSelectedYear] = useState(2025);
  const [phase45SKU, setPhase45SKU] = useState(null);
  const [articleSearch, setArticleSearch] = useState('');
  const [marginFilter, setMarginFilter] = useState('all');
  const [sidebarTab, setSidebarTab] = useState('at_risk'); // 'at_risk' | 'declining'
  const [tablePreset, setTablePreset] = useState('margin'); // 'margin' | 'competitiveness' | 'portfolio'

  const revKey = `revenue_${selectedYear}`;
  const marginKey = `margin_${selectedYear}`;
  const unitsKey = `units_${selectedYear}`;

  // ---------- KPI values, filtered by commodity ----------
  const kpis = useMemo(() => {
    const total = selectedCommodity === 'All'
      ? kpiData.total_active_skus
      : (kpiData.skus_by_commodity[selectedCommodity] ?? 0);
    const avgDb2 = selectedCommodity === 'All'
      ? kpiData.avg_db2_margin
      : (kpiData.avg_db2_by_commodity[selectedCommodity] ?? 0);
    const below = selectedCommodity === 'All'
      ? kpiData.skus_below_target
      : (kpiData.skus_below_target_by_commodity[selectedCommodity] ?? { warning: 0, critical: 0 });
    return { total, avgDb2, below, newProduct: kpiData.new_product, top10: kpiData.top10_concentration_pct };
  }, [selectedCommodity]);

  // ---------- Scatter data ----------
  const scatterData = useMemo(() => {
    const grouped = {};
    let filtered = selectedCommodity === 'All' ? products : products.filter((p) => p.commodity_group === selectedCommodity);

    if (articleSearch.trim()) {
      const q = articleSearch.toLowerCase();
      filtered = filtered.filter((p) =>
        p.article_id.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      );
    }

    if (marginFilter !== 'all') {
      filtered = filtered.filter((p) => {
        const m = p[marginKey];
        if (m == null) return false;
        if (marginFilter === 'below_floor') return m < 0.25;
        if (marginFilter === 'at_risk') return m >= 0.25 && m < 0.30;
        if (marginFilter === 'healthy') return m >= 0.30;
        return true;
      });
    }

    filtered.forEach((p) => {
      const rev = p[revKey];
      const margin = p[marginKey];
      const units = p[unitsKey];
      if (!rev || !margin) return;
      const commodity = p.commodity_group || 'Other';
      if (!grouped[commodity]) grouped[commodity] = [];
      grouped[commodity].push({ x: rev, y: margin, z: units || 1, name: p.description, article_id: p.article_id });
    });
    return grouped;
  }, [selectedCommodity, selectedYear, revKey, marginKey, unitsKey, articleSearch, marginFilter]);

  // ---------- At Risk sidebar data ----------
  const atRiskProducts = useMemo(() => {
    let list = products.filter((p) => p.is_at_risk === true);
    if (selectedCommodity !== 'All') list = list.filter((p) => p.commodity_group === selectedCommodity);
    return list.map((p) => {
      const margin = p[marginKey] ?? p.margin_2025 ?? 0;
      const rev = p[revKey] ?? p.total_revenue ?? 0;
      const impact = Math.max(0, (TARGET_MARGIN - margin) * rev);
      return { ...p, _margin: margin, _revenue: rev, _impact: impact };
    }).sort((a, b) => b._impact - a._impact);
  }, [selectedCommodity, marginKey, revKey]);

  const totalAtRisk = useMemo(() =>
    atRiskProducts.reduce((s, p) => s + p._impact, 0),
    [atRiskProducts]);

  // ---------- Declining Fast sidebar data ----------
  const decliningList = useMemo(() => {
    if (selectedCommodity === 'All') return declining_fast;
    return declining_fast.filter((d) => d.commodity_group === selectedCommodity);
  }, [selectedCommodity]);

  // ---------- Product Type Performance ----------
  const productTypeBars = useMemo(() => {
    // sorted desc by revenue
    return [...product_type_performance].sort((a, b) => b.revenue_eur - a.revenue_eur);
  }, []);

  // ---------- Scorecard data (filter by commodity not needed — always shows all) ----------
  const scorecardRows = useMemo(() =>
    [...commodity_scorecard].sort((a, b) => b.revenue_eur - a.revenue_eur),
    []);

  // ---------- Product table with enrichment + view presets ----------
  const filteredProducts = useMemo(() => {
    let list = selectedCommodity === 'All' ? products : products.filter((p) => p.commodity_group === selectedCommodity);

    if (articleSearch.trim()) {
      const q = articleSearch.toLowerCase();
      list = list.filter((p) => p.article_id.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }

    if (marginFilter !== 'all') {
      list = list.filter((p) => {
        const m = p[marginKey];
        if (m == null) return false;
        if (marginFilter === 'below_floor') return m < 0.25;
        if (marginFilter === 'at_risk') return m >= 0.25 && m < 0.30;
        if (marginFilter === 'healthy') return m >= 0.30;
        return true;
      });
    }

    return list.map((p) => {
      const enrich = article_enrichment[p.article_id] || {};
      return {
        ArticleID: p.article_id,
        description: p.description,
        commodity_group: p.commodity_group,
        margin_2023: p.margin_2023,
        margin_2024: p.margin_2024,
        margin_2025: p.margin_2025,
        margin_trend: p.margin_trend,
        revenue: p[revKey],
        units: p[unitsKey],
        margin: p[marginKey],
        product_type: enrich.product_type || p.description,
        win_rate: enrich.win_rate,
        lost_revenue_eur: enrich.lost_revenue_eur,
        customer_count: enrich.customer_count,
      };
    });
  }, [selectedCommodity, selectedYear, revKey, marginKey, unitsKey, articleSearch, marginFilter]);

  const singleCustomerCount = useMemo(() =>
    filteredProducts.filter((p) => p.customer_count === 1).length,
    [filteredProducts]);

  // Auto-open slide-over when search narrows to a single match
  useEffect(() => {
    if (articleSearch && filteredProducts.length === 1) {
      const match = filteredProducts[0];
      openSKUDetail(match.ArticleID);
    }
  }, [articleSearch, filteredProducts, openSKUDetail]);

  // Table columns per preset
  const marginCol = (v) => {
    if (v == null) return '—';
    const color = v < 0.50 ? 'text-red-500' : '';
    return <span className={`font-semibold ${color}`}>{(v * 100).toFixed(1)}%</span>;
  };

  const columnPresets = {
    margin: [
      { key: 'ArticleID', label: t('products.col.articleId'), render: (v) => <span className="font-mono text-xs font-semibold text-[#0393da]">{v}</span> },
      { key: 'description', label: t('products.col.description'), render: (v) => <span className="font-medium max-w-[200px] truncate block" title={v}>{v}</span> },
      { key: 'commodity_group', label: t('products.col.group') },
      { key: 'margin_2023', label: t('products.col.m2023'), align: 'right', render: marginCol },
      { key: 'margin_2024', label: t('products.col.m2024'), align: 'right', render: marginCol },
      { key: 'margin_2025', label: t('products.col.m2025'), align: 'right', render: marginCol },
      {
        key: 'margin_trend', label: t('products.col.trend'), render: (v) => {
          if (v === 'up' || v === 'increasing') return <span className="text-green-500 font-bold">↑</span>;
          if (v === 'down' || v === 'declining') return <span className="text-red-500 font-bold">↓</span>;
          return <span className="text-slate-400">→</span>;
        },
      },
      { key: 'revenue', label: t('products.col.revenue'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
    ],
    competitiveness: [
      { key: 'ArticleID', label: t('products.col.articleId'), render: (v) => <span className="font-mono text-xs font-semibold text-[#0393da]">{v}</span> },
      { key: 'description', label: t('products.col.description'), render: (v) => <span className="font-medium max-w-[220px] truncate block" title={v}>{v}</span> },
      { key: 'revenue', label: t('products.col.revenue'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
      {
        key: 'win_rate', label: t('products.col.winRate'), align: 'right', tooltip: TOOLTIPS.win_rate,
        render: (v) => {
          if (v == null) return '—';
          const color = v < 0.30 ? 'text-red-600' : v < 0.50 ? 'text-amber-600' : 'text-green-600';
          return <span className={`font-semibold ${color}`}>{(v * 100).toFixed(1)}%</span>;
        },
      },
      {
        key: 'lost_revenue_eur', label: t('products.col.lostRevenue'), align: 'right', tooltip: TOOLTIPS.lost_revenue,
        render: (v) => <span className="font-semibold text-red-600">{formatEUR(v)}</span>,
      },
      { key: 'margin', label: t('products.col.margin'), align: 'right', render: marginCol },
    ],
    portfolio: [
      { key: 'ArticleID', label: t('products.col.articleId'), render: (v) => <span className="font-mono text-xs font-semibold text-[#0393da]">{v}</span> },
      { key: 'description', label: t('products.col.description'), render: (v) => <span className="font-medium max-w-[200px] truncate block" title={v}>{v}</span> },
      {
        key: 'product_type', label: t('products.col.productType'),
        render: (v) => <span className="text-xs font-semibold text-slate-700">{v}</span>,
      },
      {
        key: 'customer_count', label: t('products.col.customers'), align: 'right', tooltip: TOOLTIPS.customer_count,
        render: (v) => {
          const cls = v === 1 ? 'text-red-600 font-bold' : 'font-semibold';
          return <span className={cls}>{v}{v === 1 && ' ⚠️'}</span>;
        },
      },
      { key: 'revenue', label: t('products.col.revenue'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
      { key: 'margin', label: t('products.col.margin'), align: 'right', render: marginCol },
    ],
  };

  const productColumns = columnPresets[tablePreset];

  // Convert monthly trend into sparkline data
  const newProductSpark = kpis.newProduct.monthly_trend;

  return (
    <>
      <Header title={t('products.title')} />
      <motion.div className="p-8 space-y-6 max-w-[1440px] mx-auto" variants={containerVariants} initial="hidden" animate="visible">
        {/* Commodity Filters + Year Selector */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-2">
            {commodities.map((commodity) => (
              <button
                key={commodity}
                onClick={() => setSelectedCommodity(commodity)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all active:scale-[0.97] ${
                  selectedCommodity === commodity
                    ? 'bg-[#0393da] text-white'
                    : 'bg-white border border-slate-200 hover:border-[#0393da]'
                }`}
              >
                {commodity === 'All' ? t('products.filter.allGroups') : commodity}
              </button>
            ))}
          </div>
          <div className="flex gap-1 p-1 bg-slate-100 rounded-lg ml-auto">
            {[2023, 2024, 2025].map((y) => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${
                  selectedYear === y
                    ? 'bg-white text-[#0393da] shadow-sm font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Article Search + Margin Filter */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder={t('products.search.placeholder')}
              value={articleSearch}
              onChange={(e) => setArticleSearch(e.target.value)}
              className="w-full px-4 py-2 pl-10 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0393da]/30 focus:border-[#0393da]"
            />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {articleSearch && (
              <button onClick={() => setArticleSearch('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {[
              { key: 'all', label: t('products.marginFilter.all') },
              { key: 'below_floor', label: t('products.marginFilter.belowFloor'), color: 'bg-red-500' },
              { key: 'at_risk', label: t('products.marginFilter.atRisk'), color: 'bg-amber-500' },
              { key: 'healthy', label: t('products.marginFilter.healthy'), color: 'bg-green-500' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setMarginFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                  marginFilter === f.key
                    ? 'bg-[#0393da] text-white'
                    : 'bg-white border border-slate-200 hover:border-[#0393da]'
                }`}
              >
                {f.color && <span className={`size-2 rounded-full ${f.color}`} />}
                {f.label}
              </button>
            ))}
          </div>
          {(articleSearch || marginFilter !== 'all') && (
            <button
              onClick={() => { setArticleSearch(''); setMarginFilter('all'); }}
              className="text-xs text-[#0393da] font-medium hover:underline"
            >
              {t('products.filter.clear')}
            </button>
          )}
        </div>

        {/* Row 0 — KPI Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('products.kpi.totalSkus')}
              value={kpis.total.toLocaleString()}
              tooltip={TOOLTIPS.total_skus}
              formulaId="top_products_revenue"
              confidence="verified"
              bottomContent={
                <div className="text-[10px] italic" style={{ color: '#737373' }}>
                  {t('products.kpi.totalSkus.bottom', { pct: (kpis.top10 * 100).toFixed(0) })}
                </div>
              }
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('products.kpi.avgDb2')}
              value={(kpis.avgDb2 * 100).toFixed(1) + '%'}
              tooltip={TOOLTIPS.gross_margin}
              formulaId="db2_margin"
              confidence="verified"
              bottomContent={<MiniWave color={kpis.avgDb2 >= 0.60 ? '#10b981' : '#e7a019'} />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('products.kpi.skusBelow')}
              value={
                <span>
                  <span className="text-amber-600">{kpis.below.warning}</span>
                  <span className="text-slate-400 text-xl font-normal px-2">·</span>
                  <span className="text-red-600">{kpis.below.critical}</span>
                </span>
              }
              tooltip={TOOLTIPS.skus_below_target}
              formulaId="db2_margin"
              confidence="verified"
              changeType="warning"
              bottomContent={
                <div className="text-[10px]" style={{ color: '#737373' }}>
                  {t('products.kpi.skusBelow.bottom')}
                </div>
              }
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('products.kpi.newProduct')}
              value={formatEUR(kpis.newProduct.revenue_eur)}
              change={t('products.kpi.newProduct.change', { pct: (kpis.newProduct.pct_of_total_revenue * 100).toFixed(1) })}
              changeType="positive"
              tooltip={TOOLTIPS.new_product_revenue}
              formulaId="revenue_total"
              confidence="verified"
              bottomContent={<MiniBars data={newProductSpark} color="#10b981" />}
            />
          </motion.div>
        </motion.div>

        {(articleSearch || marginFilter !== 'all') && (
          <p className="text-sm text-slate-500">
            {t('products.results.showing', { n: filteredProducts.length, total: products.length })}
          </p>
        )}

        {/* Row 1 — Scatter + Margin at Risk */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <ChartCard
              title={t('products.scatter.title')}
              subtitle={t('products.scatter.subtitle', { year: selectedYear })}
              tooltip={TOOLTIPS.sku_margin_vs_revenue}
              formulaId="top_products_revenue"
              confidence="verified"
              headerRight={
                <div className="flex items-center gap-4 text-xs font-semibold flex-wrap">
                  {Object.entries(COMMODITY_COLORS).slice(0, 4).map(([name, color]) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                      {name}
                    </div>
                  ))}
                </div>
              }
            >
              <div className="h-[440px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 16, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Revenue"
                      tickFormatter={(v) => formatEUR(v)}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      label={{ value: t('products.scatter.axis.revenue'), position: 'bottom', fontSize: 10 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Margin"
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 1]}
                      ticks={[0, 0.25, 0.5, 0.75, 1]}
                      label={{ value: t('products.scatter.axis.margin'), angle: -90, position: 'insideLeft', fontSize: 10 }}
                    />
                    <ZAxis type="number" dataKey="z" range={[30, 500]} />
                    {/* Below-floor red zone */}
                    <ReferenceArea y1={0} y2={FLOOR_MARGIN} fill="#fef2f2" fillOpacity={0.6} />
                    {/* Between floor and target — amber attention zone */}
                    <ReferenceArea y1={FLOOR_MARGIN} y2={TARGET_MARGIN} fill="#fffbeb" fillOpacity={0.5} />
                    {/* Target line (60%) */}
                    <ReferenceLine
                      y={TARGET_MARGIN}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: t('products.scatter.target60'), position: 'insideTopRight', fill: '#10b981', fontSize: 10, fontWeight: 700 }}
                    />
                    {/* Floor line (25%) */}
                    <ReferenceLine
                      y={FLOOR_MARGIN}
                      stroke="#EF4444"
                      strokeDasharray="5 5"
                      label={{ value: t('products.scatter.floor25'), position: 'insideBottomRight', fill: '#EF4444', fontSize: 10, fontWeight: 700 }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="border border-slate-100 rounded-xl p-3 shadow-xl text-xs backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.95)' }}>
                            <p className="font-bold text-slate-900 mb-1">{d.name}</p>
                            <p className="font-mono text-[10px] text-slate-400 mb-2 pb-2 border-b border-slate-100">{d.article_id}</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4"><span className="text-slate-500">{t('products.scatter.tip.revenue')}</span><span className="font-bold">{formatEUR(d.x)}</span></div>
                              <div className="flex justify-between gap-4"><span className="text-slate-500">{t('products.scatter.tip.margin')}</span><span className={`font-bold ${d.y < FLOOR_MARGIN ? 'text-red-500' : d.y < TARGET_MARGIN ? 'text-amber-600' : 'text-green-600'}`}>{formatPct(d.y)}</span></div>
                              <div className="flex justify-between gap-4"><span className="text-slate-500">{t('products.scatter.tip.units')}</span><span className="font-bold">{d.z}</span></div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    {Object.entries(scatterData).map(([commodity, points]) => (
                      <Scatter
                        key={commodity}
                        name={commodity}
                        data={points}
                        fill={COMMODITY_COLORS[commodity] || '#64748B'}
                        fillOpacity={0.65}
                        stroke={COMMODITY_COLORS[commodity] || '#64748B'}
                        strokeWidth={1.5}
                        isAnimationActive={true}
                        animationDuration={600}
                        cursor="pointer"
                        onClick={(data) => { handleScatterClick('Article Margin vs Revenue', selectItem, data); track.chartClick('Article Margin vs Revenue', data); }}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
                {/* Quadrant labels — positioned inside plot area to avoid axis collisions */}
                <div className="pointer-events-none absolute top-6 left-[70px] text-[10px] font-bold uppercase tracking-wider text-slate-400/70">{t('products.scatter.q.niche')}</div>
                <div className="pointer-events-none absolute top-6 right-6 text-[10px] font-bold uppercase tracking-wider text-emerald-600/80">{t('products.scatter.q.stars')}</div>
                <div className="pointer-events-none absolute bottom-14 left-[70px] text-[10px] font-bold uppercase tracking-wider text-slate-400/70">{t('products.scatter.q.review')}</div>
                <div className="pointer-events-none absolute bottom-14 right-6 text-[10px] font-bold uppercase tracking-wider text-red-600/80">{t('products.scatter.q.fix')}</div>
              </div>
            </ChartCard>
          </div>

          {/* Margin at Risk / Declining Fast tabbed sidebar */}
          <div className="col-span-12 lg:col-span-4">
            <div className="p-6 rounded-2xl shadow-sm h-full flex flex-col" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-4">
                <button
                  onClick={() => setSidebarTab('at_risk')}
                  className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    sidebarTab === 'at_risk' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {t('products.sidebar.atRisk')}
                </button>
                <button
                  onClick={() => setSidebarTab('declining')}
                  className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                    sidebarTab === 'declining' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {t('products.sidebar.declining')}
                </button>
              </div>

              {sidebarTab === 'at_risk' ? (
                <>
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('products.sidebar.unrealized')}</p>
                    <p className="text-3xl font-bold">{formatEUR(totalAtRisk)}</p>
                    <p className="text-xs text-slate-500">{t('products.sidebar.belowTarget', { n: atRiskProducts.length, pct: (TARGET_MARGIN * 100).toFixed(0) })}</p>
                  </div>
                  <div className="space-y-3 overflow-y-auto flex-1 pr-2 max-h-[340px]">
                    {atRiskProducts.length === 0 && (
                      <p className="text-xs text-slate-400 italic">{t('products.sidebar.noAtRisk')}</p>
                    )}
                    {atRiskProducts.map((item) => (
                      <div key={item.article_id} className={`p-3 bg-slate-50 rounded-lg border-l-4 ${severityColor(item._margin)}`}>
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-bold font-mono">{item.article_id}</span>
                          <span className={`text-xs font-bold ${item._margin < 0.20 ? 'text-red-500' : 'text-amber-500'}`}>
                            {formatPct(item._margin)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 truncate" title={item.description}>{item.description}</p>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t('products.sidebar.impact')}</span>
                          <span className="text-xs font-bold text-red-600">{formatEUR(item._impact)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('products.sidebar.steepest')}</p>
                    <p className="text-3xl font-bold">{decliningList.length}</p>
                    <p className="text-xs text-slate-500">{t('products.sidebar.erosion')}</p>
                  </div>
                  <div className="space-y-3 overflow-y-auto flex-1 pr-2 max-h-[340px]">
                    {decliningList.length === 0 && (
                      <p className="text-xs text-slate-400 italic">{t('products.sidebar.noDeclining')}</p>
                    )}
                    {decliningList.map((item) => {
                      const isCritical = item.margin_2024 < 0.10;
                      return (
                        <div
                          key={item.article}
                          className={`p-3 rounded-lg border-l-4 ${isCritical ? 'bg-red-50 border-l-red-600' : 'bg-slate-50 border-l-red-400'}`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-bold font-mono">{item.article}</span>
                            <span className="text-xs font-bold text-red-600">{item.drop_pp.toFixed(1)}pp</span>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate" title={item.description}>{item.description} · {item.commodity_group}</p>
                          <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200/60">
                            <span className="text-[10px] text-slate-500">
                              {(item.margin_2022 * 100).toFixed(1)}% → <span className={`font-bold ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>{(item.margin_2024 * 100).toFixed(1)}%</span>
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">{formatEUR(item.revenue_eur)}</span>
                          </div>
                          {isCritical && (
                            <p className="text-[10px] font-bold text-red-700 mt-1 italic">{t('products.sidebar.losingFullCost')}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <Link
                to="/pricing"
                className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 bg-[#c1e8ff]/30 text-[#0393da] text-xs font-bold rounded-lg hover:bg-[#c1e8ff]/50 transition-colors"
              >
                {t('products.sidebar.viewPricing')}
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Row 2 — Product Type Performance */}
        <ChartCard
          title={t('products.typePerf.title')}
          subtitle={t('products.typePerf.subtitle')}
          tooltip={TOOLTIPS.product_type_performance}
          formulaId="db2_margin"
          confidence="verified"
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productTypeBars} layout="vertical" margin={{ top: 8, right: 160, left: 8, bottom: 8 }}>
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
                  dataKey="type"
                  tick={{ fontSize: 11, fill: '#1a1a2e', fontWeight: 600 }}
                  width={150}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="px-3 py-2 rounded-lg shadow-lg text-xs" style={{ background: '#fff', border: '1px solid #e5e5e5' }}>
                        <div className="font-bold mb-1">{d.type} <span className="text-slate-400 font-normal">({d.type_en})</span></div>
                        <div>{t('products.typePerf.tip.db2')} <span className="font-semibold">{(d.db2_margin * 100).toFixed(1)}%</span></div>
                        <div>{t('products.typePerf.tip.revenue')} <span className="font-semibold">{formatEUR(d.revenue_eur)}</span></div>
                        <div>{t('products.typePerf.tip.articles')} <span className="font-semibold">{d.articles}</span> · {t('products.typePerf.tip.orders')} <span className="font-semibold">{d.orders.toLocaleString()}</span></div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine x={0.60} stroke="#94a3b8" strokeDasharray="4 4" />
                <Bar dataKey="db2_margin" radius={[0, 6, 6, 0]} animationDuration={800}>
                  {productTypeBars.map((entry, i) => (
                    <Cell key={i} fill={productTypeColor(entry.db2_margin)} />
                  ))}
                  <LabelList
                    dataKey="db2_margin"
                    position="right"
                    formatter={(v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '')}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#1a1a2e' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Revenue labels */}
          <div className="mt-3 pt-3 grid gap-1" style={{ borderTop: '1px solid #f0f0f0' }}>
            {productTypeBars.map((p) => (
              <div key={p.type} className="flex justify-between text-[10px]">
                <span className="font-semibold text-slate-600">{p.type}</span>
                <span className="text-slate-500">
                  {t('products.typePerf.row', { articles: p.articles, orders: p.orders.toLocaleString() })} <span className="font-semibold text-slate-700">{formatEUR(p.revenue_eur)}</span>
                </span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Row 3 — Commodity Group Scorecard */}
        <motion.div
          variants={cardVariants}
          className="overflow-hidden rounded-2xl shadow-sm"
          style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}
        >
          <div className="p-6 pb-4">
            <h3 className="font-bold text-base" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>{t('products.scorecard.title')}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#737373' }}>{t('products.scorecard.subtitle')}</p>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-widest" style={{ background: 'rgba(248,250,252,0.5)', color: '#737373' }}>
                <th className="px-6 py-3">{t('products.scorecard.col.group')}</th>
                <th className="px-6 py-3 text-right">{t('products.scorecard.col.revenue')}</th>
                <th className="px-6 py-3 text-right">{t('products.scorecard.col.db2')}</th>
                <th className="px-6 py-3 text-right">{t('products.scorecard.col.winRate')}</th>
                <th className="px-6 py-3 text-right">{t('products.scorecard.col.skus')}</th>
                <th className="px-6 py-3 text-right">{t('products.scorecard.col.orders')}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {scorecardRows.map((row) => {
                const isSelected = selectedCommodity === row.group;
                return (
                  <tr
                    key={row.group}
                    onClick={() => setSelectedCommodity(row.group)}
                    className="cursor-pointer transition-colors"
                    style={{
                      borderBottom: '1px solid #f8fafc',
                      borderLeft: isSelected ? '3px solid #0393da' : '3px solid transparent',
                      background: isSelected ? '#eef6ff' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8f9fa'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#eef6ff' : 'transparent'; }}
                  >
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: COMMODITY_COLORS[row.group] || '#64748B' }} />
                        <span className="font-mono font-bold text-[#0393da]">{row.group}</span>
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right font-semibold">{formatEUR(row.revenue_eur)}</td>
                    <td className="px-6 py-3 text-right">
                      <span className={`font-bold ${row.db2_margin < 0.50 ? 'text-red-600' : row.db2_margin < 0.60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {(row.db2_margin * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {row.win_rate == null ? <span className="text-slate-400">—</span> : <span className="font-semibold">{(row.win_rate * 100).toFixed(1)}%</span>}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold">{row.skus.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right font-semibold">{row.orders.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>

        {/* Row 4 — Product Table with View Presets */}
        <motion.div variants={cardVariants}>
          {/* Single-customer concentration callout */}
          {singleCustomerCount > 0 && tablePreset === 'portfolio' && (
            <div className="mb-3 px-4 py-2 bg-amber-50 border-l-4 border-amber-400 text-xs rounded-r-lg">
              <span className="font-bold text-amber-800">{t('products.singleCust.warning', { n: singleCustomerCount, s: singleCustomerCount !== 1 ? 's' : '' })}</span>
            </div>
          )}
          <DataTable
            title={t('products.table.title')}
            columns={productColumns}
            data={filteredProducts}
            rowKey="ArticleID"
            formulaId="top_products_revenue"
            confidence="verified"
            selectedRowId={selectedItem?.id}
            onRowClick={(row) => {
              if (IS_DEMO) {
                setPhase45SKU(row.ArticleID);
                return;
              }
              selectItem({ type: 'article', id: row.ArticleID, label: row.description, data: row });
              openSKUDetail(row.ArticleID);
            }}
            headerRight={
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {[
                  { key: 'margin', label: t('products.preset.margin') },
                  { key: 'competitiveness', label: t('products.preset.competitiveness') },
                  { key: 'portfolio', label: t('products.preset.portfolio') },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setTablePreset(p.key)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      tablePreset === p.key
                        ? 'bg-white text-[#0393da] shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            }
          />
        </motion.div>
        {IS_DEMO && (
          <motion.div variants={cardVariants} className="space-y-6 mt-6">
            <FloorPriceTable />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BreakEvenChart />
              <ProfitabilityQuadrant />
            </div>
          </motion.div>
        )}
        <PhaseNotice type="derived" />
      </motion.div>
      {IS_DEMO && <SKUDeepDiveSlideOver sku={phase45SKU} onClose={() => setPhase45SKU(null)} />}
    </>
  );
}
