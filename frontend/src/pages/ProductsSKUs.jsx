import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceArea,
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import ChartCard from '../components/shared/ChartCard';
import DataTable from '../components/shared/DataTable';
import productsData from '../data/products.json';
import { formatEUR, formatPct } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { handleScatterClick } from '../utils/pageContextResolver';
import { track } from '../utils/tracker';
import PhaseNotice from '../components/shared/PhaseNotice';

const products = productsData.products;

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

const severityColor = (margin) => {
  if (margin < 0.15) return 'border-l-red-500';
  if (margin < 0.20) return 'border-l-red-400';
  return 'border-l-amber-500';
};

const actionText = (margin, item) => {
  if (margin < 0.15) return 'URGENT: RENEGOTIATE SUPPLIER COST';
  if (margin < 0.20) return 'RAISE PRICE OR CUT LOGISTICS COST';
  if (margin < 0.22) return 'PRICE ADJUSTMENT NEEDED';
  if (item?.margin_trend === 'declining') return 'MARGIN DECLINING — REVIEW PRICING';
  if (margin < 0.24) return 'APPROACHING FLOOR — MONITOR';
  return 'CHECK FX EXPOSURE & PRICING';
};

export default function ProductsSKUs() {
  const { selectItem, selectedItem } = useUI();
  const [selectedCommodity, setSelectedCommodity] = useState('All');
  const [selectedYear, setSelectedYear] = useState(2025);
  const [articleSearch, setArticleSearch] = useState('');
  const [marginFilter, setMarginFilter] = useState('all');

  const revKey = `revenue_${selectedYear}`;
  const marginKey = `margin_${selectedYear}`;
  const unitsKey = `units_${selectedYear}`;

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

  const atRiskProducts = useMemo(() =>
    products.filter((p) => p.is_at_risk === true),
  []);

  const totalAtRisk = useMemo(() =>
    atRiskProducts.reduce((s, p) => s + (p[revKey] || 0), 0),
  [atRiskProducts, revKey]);

  const filteredProducts = useMemo(() => {
    let list = selectedCommodity === 'All' ? products : products.filter((p) => p.commodity_group === selectedCommodity);

    if (articleSearch.trim()) {
      const q = articleSearch.toLowerCase();
      list = list.filter((p) =>
        p.article_id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
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

    return list.map((p) => ({
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
    }));
  }, [selectedCommodity, selectedYear, revKey, marginKey, unitsKey, articleSearch, marginFilter]);

  const productColumns = [
    { key: 'ArticleID', label: 'Article ID', render: (v) => <span className="font-mono text-xs font-semibold text-[#0393da]">{v}</span> },
    { key: 'description', label: 'Description', render: (v) => <span className="font-medium max-w-[250px] truncate block" title={v}>{v}</span> },
    { key: 'commodity_group', label: 'Commodity Group' },
    {
      key: 'margin_2023', label: 'M 2023', align: 'right', render: (v) => {
        if (v == null) return '—';
        const color = v < 0.50 ? 'text-red-500' : '';
        return <span className={`font-semibold ${color}`}>{(v * 100).toFixed(1)}%</span>;
      },
    },
    {
      key: 'margin_2024', label: 'M 2024', align: 'right', render: (v) => {
        if (v == null) return '—';
        const color = v < 0.50 ? 'text-red-500' : '';
        return <span className={`font-semibold ${color}`}>{(v * 100).toFixed(1)}%</span>;
      },
    },
    {
      key: 'margin_2025', label: 'M 2025', align: 'right', render: (v) => {
        if (v == null) return '—';
        const color = v < 0.50 ? 'text-red-500' : '';
        return <span className={`font-semibold ${color}`}>{(v * 100).toFixed(1)}%</span>;
      },
    },
    {
      key: 'margin_trend', label: 'Trend', tooltip: TOOLTIPS.margin_trend, render: (v) => {
        if (v === 'up' || v === 'increasing') return <span className="text-green-500 font-bold">↑</span>;
        if (v === 'down' || v === 'declining') return <span className="text-red-500 font-bold">↓</span>;
        return <span className="text-slate-400">→</span>;
      },
    },
    { key: 'revenue', label: 'Revenue', align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
    { key: 'units', label: 'Units', align: 'right' },
  ];

  return (
    <>
      <Header title="Products & Articles" />
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
                {commodity === 'All' ? 'All Groups' : commodity}
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
              placeholder="Search article ID or description..."
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
              { key: 'all', label: 'All Margins' },
              { key: 'below_floor', label: '< 25% (Below Floor)', color: 'bg-red-500' },
              { key: 'at_risk', label: '25-30% (At Risk)', color: 'bg-amber-500' },
              { key: 'healthy', label: '> 30% (Healthy)', color: 'bg-green-500' },
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
              Clear filters
            </button>
          )}
        </div>

        {(articleSearch || marginFilter !== 'all') && (
          <p className="text-sm text-slate-500">
            Showing <span className="font-bold text-slate-800">{filteredProducts.length}</span> of {products.length} articles
          </p>
        )}

        {/* Scatter + Margin at Risk */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <ChartCard
              title="Article Margin vs Revenue"
              subtitle={`Bubble size by Units | FY ${selectedYear} | Colored by Commodity Group`}
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
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Revenue"
                      tickFormatter={(v) => formatEUR(v)}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      label={{ value: 'Revenue (€)', position: 'bottom', fontSize: 10 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Margin"
                      tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 'auto']}
                      label={{ value: 'Margin (%)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                    />
                    <ZAxis type="number" dataKey="z" range={[30, 500]} />
                    <ReferenceArea y1={0} y2={0.25} fill="#fef2f2" fillOpacity={0.5} />
                    <ReferenceLine y={0.25} stroke="#EF4444" strokeDasharray="5 5" label={{ value: '25% Floor', position: 'right', fill: '#EF4444', fontSize: 10 }} />
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
                              <div className="flex justify-between gap-4"><span className="text-slate-500">Revenue</span><span className="font-bold">{formatEUR(d.x)}</span></div>
                              <div className="flex justify-between gap-4"><span className="text-slate-500">Margin</span><span className={`font-bold ${d.y < 0.25 ? 'text-red-500' : 'text-green-600'}`}>{formatPct(d.y)}</span></div>
                              <div className="flex justify-between gap-4"><span className="text-slate-500">Units</span><span className="font-bold">{d.z}</span></div>
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
              </div>
            </ChartCard>
          </div>

          {/* Margin at Risk Panel */}
          <div className="col-span-12 lg:col-span-4">
            <div className="p-6 rounded-2xl shadow-sm h-full" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Margin at Risk</h3>
                <span className="bg-red-100 text-red-600 text-[11px] font-bold px-2 py-0.5 rounded uppercase">Critical</span>
              </div>
              <div className="mb-6">
                <p className="text-3xl font-bold">{formatEUR(totalAtRisk)}</p>
                <p className="text-sm text-slate-500">{atRiskProducts.length} articles currently below 25% margin</p>
              </div>
              <div className="space-y-3 overflow-y-auto max-h-[350px] pr-2">
                {atRiskProducts.map((item) => (
                  <div key={item.article_id} className={`p-3 bg-slate-50 rounded-lg border-l-4 ${severityColor(item[marginKey] ?? item.margin_2025)}`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold font-mono">{item.article_id}</span>
                      <span className={`text-xs font-bold ${(item[marginKey] ?? item.margin_2025) < 0.2 ? 'text-red-500' : 'text-amber-500'}`}>
                        {formatPct(item[marginKey] ?? item.margin_2025)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{item.description}</p>
                    <p className="text-[10px] font-bold text-[#0393da] mt-1">{actionText(item[marginKey] ?? item.margin_2025, item)}</p>
                  </div>
                ))}
              </div>
              <Link
                to="/pricing"
                className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 bg-[#c1e8ff]/30 text-[#0393da] text-xs font-bold rounded-lg hover:bg-[#c1e8ff]/50 transition-colors"
              >
                View Price Recommendations
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Product Table */}
        <motion.div variants={cardVariants}>
          <DataTable
            title="Product Performance Details"
            columns={productColumns}
            data={filteredProducts}
            rowKey="ArticleID"
            formulaId="top_products_revenue"
            confidence="verified"
            selectedRowId={selectedItem?.id}
            onRowClick={(row) => selectItem({ type: 'article', id: row.ArticleID, label: row.description, data: row })}
          />
        </motion.div>
        <PhaseNotice type="derived" />
      </motion.div>
    </>
  );
}
