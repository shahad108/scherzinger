import React, { useState, useMemo } from 'react';
import {
  ComposedChart, BarChart as RechartsBarChart, Bar, Line, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniWave, MiniProgress, MiniRange } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import DataTable from '../components/shared/DataTable';
import CustomTooltip from '../components/shared/CustomTooltip';
import analysis from '../data/pricing_analysis.json';
import governance from '../data/price_governance.json';
import { formatEUR, formatPct } from '../utils/formatters';
import { useUI } from '../context/UIContext';
import PhaseNotice from '../components/shared/PhaseNotice';
import { handleChartContainerClick, handlePieClick } from '../utils/pageContextResolver';
import { track } from '../utils/tracker';
import {
  buildEnrichedRecommendations,
  getReactiveRecommendations,
  getProactiveAlerts,
  getRecommendationSummary,
} from '../utils/pricingEngine';

const {
  gap_analysis: gapAnalysis,
  catalog_vs_quoted: catalogVsQuoted,
  win_rate_by_margin_band: winRateByBand,
  rejection_codes: rejectionCodes,
  price_sensitivity: priceSensitivity,
} = analysis;

/* ── Gap Analysis by Year chart data ── */
const gapByYearData = (gapAnalysis?.by_year || []).map((d) => ({
  year: String(d.year),
  quoted: +(d.avg_quoted_margin * 100).toFixed(1),
  actual: +(d.avg_actual_margin * 100).toFixed(1),
  gap: +(d.gap * 100).toFixed(1),
  count: d.count,
}));

/* ── Win Rate by Margin Band chart data ── */
const winRateData = (winRateByBand || []).map((d) => ({
  band: d.band,
  winRate: +(d.win_rate * 100).toFixed(1),
  count: d.count,
}));

/* ── Rejection Codes pie data ── */
const rejectionPieData = (rejectionCodes || []).map((d) => ({
  name: `${d.code} — ${d.description}`,
  value: d.revenue_lost,
  count: d.count,
  pct: d.pct_of_lost,
}));
const PIE_COLORS = ['#0393da', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

/* ── Rejection Codes table columns ── */
const rejectionColumns = [
  { key: 'code', label: 'Code', render: (v) => <span className="font-mono font-semibold">{v}</span> },
  { key: 'description', label: 'Reason' },
  { key: 'count', label: 'Count', align: 'right' },
  { key: 'revenue_lost', label: 'Revenue Lost', align: 'right', render: (v) => formatEUR(v) },
  { key: 'pct_of_lost', label: '% of Lost', align: 'right', render: (v) => formatPct(v) },
];

/* ── Governance: Price Rules table columns ── */
const govRuleColumns = [
  { key: 'rule', label: 'Rule', render: (v) => <span className="font-semibold">{v}</span> },
  {
    key: 'status', label: 'Status', render: (v) => {
      const color = v === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-500';
      return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${color}`}>{v}</span>;
    },
  },
  {
    key: 'violations', label: 'Violations', align: 'right', render: (v) => {
      const color = v > 10 ? 'text-red-600 font-bold' : v > 0 ? 'text-amber-600 font-semibold' : 'text-green-600';
      return <span className={color}>{v}</span>;
    },
  },
];

/* ── Governance: Price History chart data ── */
const priceHistoryData = (governance.price_history || []).map((d) => ({
  year: String(d.year),
  listPrice: d.avg_list_price,
  quotedPrice: d.avg_quoted_price,
  discountPct: +(d.avg_discount_pct * 100).toFixed(1),
}));

/* ── Governance: Conversion Timing ── */
const conversionTiming = governance.conversion_timing || {};

/* ── Enriched SKU Recommendations table columns ── */
const enrichedRecColumns = [
  { key: 'article_id', label: 'Article ID', render: (v) => <span className="font-mono text-slate-500 text-[11px]">{v}</span> },
  { key: 'description', label: 'Description' },
  { key: 'commodity_group', label: 'Commodity Group' },
  { key: 'current_margin', label: 'Current Margin', align: 'right', render: (v) => {
    const color = v < 0.25 ? 'text-red-600 font-bold' : v < 0.30 ? 'text-amber-600 font-semibold' : 'text-green-600 font-semibold';
    return <span className={color}>{formatPct(v)}</span>;
  }},
  { key: 'riskScore', label: 'Risk Score', align: 'right', render: (v) => {
    const color = v >= 70 ? 'bg-red-100 text-red-700' : v >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
    return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${color}`}>{v}</span>;
  }},
  { key: 'action', label: 'Action', render: (v) => {
    if (!v) return <span className="text-slate-300">--</span>;
    const color = v === 'Increase' ? 'bg-red-100 text-red-700' : v === 'Monitor' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{v}</span>;
  }},
  { key: 'priority', label: 'Priority', render: (v) => {
    const color = v === 'Critical' ? 'bg-red-50 text-red-600' : v === 'High' ? 'bg-orange-50 text-orange-600' : v === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600';
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{v}</span>;
  }},
  { key: 'approval', label: 'Approval Level', render: (v) => {
    if (!v) return <span className="text-slate-300">--</span>;
    const level = typeof v === 'object' ? v.level : v;
    return <span className="text-xs font-medium text-slate-700">{level}</span>;
  }},
];

/* ── Price Sensitivity comparison chart data ── */
const sensitivityCompareData = [
  { label: 'Won Quotes', margin: +((priceSensitivity?.won_avg_margin || 0) * 100).toFixed(1) },
  { label: 'Lost Quotes', margin: +((priceSensitivity?.lost_avg_margin || 0) * 100).toFixed(1) },
];

/* ── Pricing Command Center (empty-state aware) ── */
function PricingCommandCenter() {
  const { selectItem } = useUI();
  const enriched = useMemo(() => buildEnrichedRecommendations(), []);
  const reactive = useMemo(() => getReactiveRecommendations(enriched), [enriched]);
  const proactive = useMemo(() => getProactiveAlerts(enriched), [enriched]);
  const summary = useMemo(() => getRecommendationSummary(reactive, proactive), [reactive, proactive]);

  const [activeTab, setActiveTab] = useState('reactive');
  const [sortBy, setSortBy] = useState('risk');
  const [showAll, setShowAll] = useState(false);
  const [expandedSku, setExpandedSku] = useState(null);

  const hasData = enriched.length > 0;

  if (!hasData) {
    return (
      <motion.div
        id="pricing-command-center"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="px-6 py-8 text-center">
          <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Pricing Command Center</h3>
          <p className="text-sm text-slate-400 mt-2">No enriched SKU-level recommendations available. The underlying product, inventory, or COGS data may not be present.</p>
        </div>
      </motion.div>
    );
  }

  const skus = activeTab === 'reactive' ? reactive : proactive;

  const sorted = [...skus].sort((a, b) => {
    if (sortBy === 'recovery') return (b.recovery_inr || 0) - (a.recovery_inr || 0);
    if (sortBy === 'margin') return a.current_margin - b.current_margin;
    return b.riskScore - a.riskScore;
  });

  const displayed = showAll ? sorted : sorted.slice(0, 15);

  return (
    <motion.div
      id="pricing-command-center"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
    >
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Pricing Command Center</h3>
            <div className="flex items-center gap-4 mt-2 text-[11px]">
              <span className="flex items-center gap-1 text-red-600 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {summary.criticalCount} Critical
              </span>
              <span className="flex items-center gap-1 text-amber-600 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {summary.highCount} High
              </span>
              <span className="text-slate-400">Avg Risk: <span className="font-semibold text-slate-600">{summary.avgRisk}</span></span>
              <span className="text-slate-400">At Risk: <span className="font-semibold text-slate-600">{formatEUR(summary.revenueAtRisk)}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden text-[11px] font-semibold" style={{ border: '1px solid #e5e5e5' }}>
              <button
                onClick={() => { setActiveTab('reactive'); setShowAll(false); setExpandedSku(null); }}
                className={`px-3 py-1.5 transition-colors ${activeTab === 'reactive' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                Reactive ({reactive.length})
              </button>
              <button
                onClick={() => { setActiveTab('proactive'); setShowAll(false); setExpandedSku(null); }}
                className={`px-3 py-1.5 transition-colors ${activeTab === 'proactive' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                Proactive ({proactive.length})
              </button>
            </div>
            <div className="flex rounded-lg overflow-hidden text-[10px] font-semibold" style={{ border: '1px solid #e5e5e5' }}>
              {[['risk', 'Risk'], ['recovery', 'Recovery'], ['margin', 'Margin']].map(([key, label]) => (
                <button key={key} onClick={() => setSortBy(key)}
                  className={`px-2.5 py-1.5 transition-colors ${sortBy === key ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >{label}</button>
              ))}
            </div>
            <div className="relative overflow-hidden rounded-lg px-3 py-1.5 ml-1" style={{ background: '#ffffff', boxShadow: '0 2px 8px rgba(26,26,46,0.06)', border: '1px solid #e5e5e5' }}>
              <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: 'linear-gradient(to right, #22c55e, #86efac)' }} />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recovery</p>
              <p className="text-sm font-bold" style={{ color: '#1a1a2e' }}>{formatEUR(summary.totalRecovery)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr style={{ background: '#fafafa', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
              <th className="px-3 py-2.5 w-6" />
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Article ID</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Description</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 w-32">Margin</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Risk</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Recovery</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-center">Priority</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {displayed.map((item, idx) => (
              <React.Fragment key={item.sku || item.article_id || idx}>
                <tr
                  className="cursor-pointer transition-colors duration-100"
                  style={{
                    background: expandedSku === (item.sku || item.article_id) ? '#f8f9fa' : idx % 2 === 0 ? '#ffffff' : '#fcfcfc',
                    borderBottom: '1px solid #f5f5f5',
                  }}
                  onClick={() => {
                    const id = item.sku || item.article_id;
                    const next = expandedSku === id ? null : id;
                    setExpandedSku(next);
                    next ? selectItem({ type: 'article', id, label: item.description, data: item }) : selectItem(null);
                  }}
                  onMouseEnter={(e) => { if (expandedSku !== (item.sku || item.article_id)) e.currentTarget.style.background = '#f8f9fa'; }}
                  onMouseLeave={(e) => { if (expandedSku !== (item.sku || item.article_id)) e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fcfcfc'; }}
                >
                  <td className="px-3 py-2.5 text-slate-300 text-[10px]">
                    <span className={`inline-block transition-transform duration-150 ${expandedSku === (item.sku || item.article_id) ? 'rotate-90' : ''}`}>&#9658;</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">{item.sku || item.article_id}</td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[220px] truncate" title={item.description}>{item.description}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{formatEUR(item.revenue)}</td>
                  <td className="px-3 py-2.5">
                    <MarginBar current={item.current_margin} target={item.target_margin} />
                  </td>
                  <td className="px-3 py-2.5">
                    <RiskBar score={item.riskScore} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-semibold text-green-600 text-sm">{formatEUR(item.recovery_inr)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.priority === 'Critical' ? 'bg-red-50 text-red-600' :
                      item.priority === 'High' ? 'bg-orange-50 text-orange-600' :
                      item.priority === 'Medium' ? 'bg-amber-50 text-amber-600' :
                      'bg-green-50 text-green-600'
                    }`}>{item.priority}</span>
                  </td>
                </tr>
                {expandedSku === (item.sku || item.article_id) && (
                  <tr>
                    <td colSpan={8} className="px-6 py-4" style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <ExpandedDetailPanel item={item} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length > 15 && (
        <div className="px-6 py-3 flex items-center justify-between" style={{ borderTop: '1px solid #f0f0f0' }}>
          <span className="text-[11px] text-slate-400">
            {displayed.length} of {sorted.length}
          </span>
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-800 transition-colors"
          >
            {showAll ? 'Show Top 15' : `Show All ${sorted.length}`}
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ── Expanded Detail Panel ── */
function ExpandedDetailPanel({ item }) {
  const costPerUnit = item.hkvoll_per_unit || 0;
  const currentPrice = costPerUnit > 0 && item.current_margin < 1
    ? Math.round(costPerUnit / (1 - item.current_margin))
    : 0;
  const recommendedPrice = costPerUnit > 0 && item.target_margin < 1
    ? Math.round(costPerUnit / (1 - item.target_margin))
    : 0;

  const unitsLatest = item.units_latest || 0;
  const inventoryStatus = unitsLatest <= 10 ? 'Critical' : unitsLatest <= 50 ? 'Low' : 'Normal';
  const inventoryColor = inventoryStatus === 'Critical' ? 'text-red-600' : inventoryStatus === 'Low' ? 'text-amber-600' : 'text-green-600';

  const demandClass = item.revenue >= 200000 ? 'A' : item.revenue >= 100000 ? 'B' : 'C';

  const costChangePct = Math.abs(item.cost_change_pct || 0);
  const fxRisk = costChangePct > 0.3 ? 'HIGH' : costChangePct > 0.15 ? 'MEDIUM' : 'LOW';
  const fxRiskColor = fxRisk === 'HIGH' ? 'text-red-600' : fxRisk === 'MEDIUM' ? 'text-amber-600' : 'text-green-600';

  const approvalLevel = typeof item.approval === 'object' ? item.approval.level : item.approval || '--';
  const approvalColor = approvalLevel === 'VP' ? 'text-red-600' : approvalLevel === 'Director' ? 'text-orange-600' : approvalLevel === 'Manager' ? 'text-green-600' : 'text-green-600';

  const trendLabel = item.marginTrend === 'declining' ? '↓ Declining' : item.marginTrend === 'rising' ? '↑ Rising' : '→ Stable';
  const trendColor = item.marginTrend === 'declining' ? 'text-red-500' : item.marginTrend === 'rising' ? 'text-green-500' : 'text-slate-500';

  return (
    <div className="space-y-3">
      {/* Row 1: Key metrics */}
      <div className="grid grid-cols-5 gap-3">
        <DetailBox label="CATEGORY" value={item.commodity_group || '--'} />
        <DetailBox label="INVENTORY" value={`${inventoryStatus} (${unitsLatest} units)`} valueColor={inventoryColor} />
        <DetailBox label="LANDED COST" value={formatEUR(costPerUnit)} />
        <DetailBox label="CURRENT PRICE" value={formatEUR(currentPrice)} />
        <DetailBox label="RECOMMENDED" value={formatEUR(recommendedPrice)} valueColor="text-green-600" />
      </div>

      {/* Row 2: Classification */}
      <div className="grid grid-cols-4 gap-3">
        <DetailBox label="BCG QUADRANT" value={item.bcgQuadrant || '--'} />
        <DetailBox label="DEMAND CLASS" value={demandClass} />
        <DetailBox label="FX RISK" value={fxRisk} valueColor={fxRiskColor} />
        <DetailBox label="APPROVAL" value={approvalLevel} valueColor={approvalColor} />
      </div>

      {/* Row 3: Margin trajectory */}
      <div className="flex items-center gap-4 text-[11px] px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Margin</span>
        {item.margin_2023 != null && (
          <span>2023: <span className="font-semibold text-slate-700">{(item.margin_2023 * 100).toFixed(1)}%</span></span>
        )}
        {item.margin_2024 != null && (
          <span>2024: <span className="font-semibold text-slate-700">{(item.margin_2024 * 100).toFixed(1)}%</span></span>
        )}
        {item.margin_2025 != null && (
          <span>2025: <span className="font-semibold text-slate-700">{(item.margin_2025 * 100).toFixed(1)}%</span></span>
        )}
        <span className={`font-semibold ${trendColor}`}>{trendLabel}</span>
      </div>
    </div>
  );
}

/* ── Detail Box (used inside expanded panel) ── */
function DetailBox({ label, value, valueColor = '' }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      <p className={`text-sm font-bold ${valueColor || 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

const MARGIN_FLOOR = 0.50;
const MARGIN_TARGET = 0.55;

/* ── Margin Bar visual ── */
function MarginBar({ current, target = MARGIN_TARGET, floor = MARGIN_FLOOR }) {
  const pct = Math.min(current / 1.0, 1) * 100; // scale to 100% max
  const floorPct = (floor / 1.0) * 100;
  const targetPct = (target / 1.0) * 100;
  const isBelow = current < floor;
  return (
    <div className="relative w-full h-5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`absolute left-0 top-0 h-full rounded-full transition-all ${isBelow ? 'bg-red-400' : current < target ? 'bg-amber-400' : 'bg-green-400'}`}
        style={{ width: `${pct}%` }}
      />
      <div className="absolute top-0 h-full border-l-2 border-dashed border-slate-400" style={{ left: `${floorPct}%` }} title="25% Floor" />
      <div className="absolute top-0 h-full border-l-2 border-dashed border-green-600" style={{ left: `${targetPct}%` }} title="30% Target" />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">
        {(current * 100).toFixed(1)}%
      </span>
    </div>
  );
}

/* ── Risk Bar (colored segment for risk score) ── */
function RiskBar({ score }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-400' : 'bg-green-400';
  const label = score >= 70 ? 'Critical' : score >= 40 ? 'Elevated' : 'Low';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-500">{score}</span>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${score >= 70 ? 'bg-red-100 text-red-700' : score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{label}</span>
    </div>
  );
}

export default function PricingFX() {
  const { selectItem, selectedItem } = useUI();

  const enrichedAll = useMemo(() => buildEnrichedRecommendations(), []);
  const reactiveAll = useMemo(() => getReactiveRecommendations(enrichedAll), [enrichedAll]);
  const proactiveAll = useMemo(() => getProactiveAlerts(enrichedAll), [enrichedAll]);
  const recSummary = useMemo(() => getRecommendationSummary(reactiveAll, proactiveAll), [reactiveAll, proactiveAll]);

  const overall = gapAnalysis?.overall || {};
  const totalRevenueLost = (rejectionCodes || []).reduce((sum, r) => sum + (r.revenue_lost || 0), 0);
  const totalViolations = (governance.price_rules || []).reduce((sum, r) => sum + (r.violations || 0), 0);

  /* Enriched recommendations sorted by risk score for the DataTable */
  const enrichedRecTableData = useMemo(() => {
    return [...enrichedAll]
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .slice(0, 25);
  }, [enrichedAll]);

  return (
    <>
      <Header title="Pricing & Quotes" />
      <div className="p-8 space-y-6 max-w-[1440px] mx-auto">

        {/* ── 1. KPI Row ── */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard
              label="Avg Margin Gap"
              value={formatPct(overall.mean_gap)}
              change={`Median: ${formatPct(overall.median_gap)}`}
              changeType={overall.mean_gap > 0.05 ? 'negative' : 'neutral'}
              infoTooltip="Average difference between quoted and actual margin"
              formulaId="price_cost_gap"
              confidence="derived"
              bottomContent={<MiniRange text={`Std: ${formatPct(overall.std_gap)}`} />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label="Linked Records"
              value={overall.linked_records?.toLocaleString() || '0'}
              change="Quote-to-actual matched"
              changeType="neutral"
              formulaId="price_cost_gap"
              confidence="derived"
              bottomContent={<MiniWave color="#0393da" />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label="Win Rate Sensitivity"
              value={priceSensitivity?.significant ? 'Significant' : 'Not Significant'}
              formulaId="win_rate"
              confidence="verified"
              change={`Won: ${formatPct(priceSensitivity?.won_avg_margin)} vs Lost: ${formatPct(priceSensitivity?.lost_avg_margin)}`}
              changeType={priceSensitivity?.significant ? 'negative' : 'neutral'}
              infoTooltip={`p-value: ${priceSensitivity?.p_value?.toFixed(3)}`}
              bottomContent={<MiniProgress value={priceSensitivity?.significant ? 85 : 40} color={priceSensitivity?.significant ? '#EF4444' : '#10b981'} />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label="Revenue Lost (Rejections)"
              value={formatEUR(totalRevenueLost)}
              change={`${(rejectionCodes || []).reduce((s, r) => s + r.count, 0)} rejected quotes`}
              changeType="negative"
              formulaId="price_cost_gap"
              confidence="derived"
              bottomContent={<MiniWave color="#F59E0B" />}
            />
          </motion.div>
        </motion.div>

        {/* ── 1b. Pricing Command Center ── */}
        <PricingCommandCenter />

        {/* ── 2. Gap Analysis by Year ── */}
        <ChartCard
          title="Margin Gap by Year"
          subtitle="Quoted vs actual margin with gap trend"
          formulaId="price_cost_gap"
          confidence="derived"
          headerRight={
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#0393da] rounded-full" /> Quoted Margin</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#10B981] rounded-full" /> Actual Margin</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#F59E0B] rounded-full" /> Gap</div>
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={gapByYearData} onClick={(s) => handleChartContainerClick('Margin Gap by Year', selectItem, gapByYearData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 'auto']} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="quoted" name="Quoted %" fill="#0393da" radius={[4, 4, 0, 0]} barSize={28} onClick={(data) => track.chartClick('Quoted Margin', data)} />
                <Bar dataKey="actual" name="Actual %" fill="#10B981" radius={[4, 4, 0, 0]} barSize={28} onClick={(data) => track.chartClick('Actual Margin', data)} />
                <Line type="monotone" dataKey="gap" name="Gap %" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6, stroke: '#F59E0B', strokeWidth: 2, fill: 'white' }} onClick={(data) => track.chartClick('Margin Gap', data)} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ── 3. Catalog vs Quoted Margin ── */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.div variants={cardVariants}
            className="relative overflow-hidden h-full flex flex-col"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(135deg, #0393da, #c1e8ff)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Catalog Avg Margin</p>
            <p className="text-3xl font-bold mt-2" style={{ color: '#1a1a2e' }}>{formatPct(catalogVsQuoted?.catalog_margin_avg)}</p>
            <p className="text-sm font-medium mt-1" style={{ color: '#a3a3a3' }}>{formatPct(catalogVsQuoted?.catalog_pct_revenue)} of revenue</p>
          </motion.div>
          <motion.div variants={cardVariants}
            className="relative overflow-hidden h-full flex flex-col"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(135deg, #10b981, #2dd4bf)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Quoted Avg Margin</p>
            <p className="text-3xl font-bold mt-2" style={{ color: '#1a1a2e' }}>{formatPct(catalogVsQuoted?.quoted_margin_avg)}</p>
            <p className="text-sm font-medium mt-1" style={{ color: '#a3a3a3' }}>{formatPct(catalogVsQuoted?.quoted_pct_revenue)} of revenue</p>
          </motion.div>
          <motion.div variants={cardVariants}
            className="relative overflow-hidden h-full flex flex-col"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(135deg, #8B5CF6, #c4b5fd)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Margin Uplift (Quoted)</p>
            <p className="text-3xl font-bold mt-2" style={{ color: '#8B5CF6' }}>
              +{formatPct((catalogVsQuoted?.quoted_margin_avg || 0) - (catalogVsQuoted?.catalog_margin_avg || 0))}
            </p>
            <p className="text-sm font-medium mt-1" style={{ color: '#a3a3a3' }}>Quoted over catalog</p>
          </motion.div>
          <motion.div variants={cardVariants}
            className="relative overflow-hidden h-full flex flex-col"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: priceSensitivity?.significant ? 'linear-gradient(135deg, #EF4444, #fca5a5)' : 'linear-gradient(135deg, #10b981, #2dd4bf)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Price Sensitivity</p>
            <p className="text-3xl font-bold mt-2" style={{ color: priceSensitivity?.significant ? '#EF4444' : '#10b981' }}>
              {formatPct(priceSensitivity?.margin_diff)}
            </p>
            <p className="text-sm font-medium mt-1" style={{ color: '#a3a3a3' }}>
              {priceSensitivity?.significant ? 'Statistically significant' : 'Not significant'} (p={priceSensitivity?.p_value?.toFixed(3)})
            </p>
          </motion.div>
        </motion.div>

        {/* ── 4. Win Rate by Margin Band ── */}
        <ChartCard
          title="Win Rate by Margin Band"
          subtitle="How pricing aggressiveness affects win rates"
          formulaId="win_rate_by_margin"
          confidence="verified"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={winRateData} onClick={(s) => handleChartContainerClick('Win Rate by Margin Band', selectItem, winRateData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="band" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 'auto']} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="winRate" name="Win Rate %" fill="#0393da" radius={[6, 6, 0, 0]} barSize={40} onClick={(data) => track.chartClick('Win Rate', data)}>
                  {winRateData.map((entry, i) => (
                    <Cell key={i} fill={entry.winRate >= 40 ? '#10B981' : entry.winRate >= 35 ? '#F59E0B' : '#EF4444'} />
                  ))}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ── 5. Rejection Codes Breakdown ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Donut chart */}
          <div className="rounded-xl overflow-hidden" style={{ background: '#ffffff', boxShadow: '0 2px 12px rgba(26,26,46,0.06)' }}>
            <div className="px-6 pt-5 pb-2">
              <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Revenue Lost by Reason</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Rejection code distribution</p>
            </div>
            <div className="flex items-center justify-center px-4 py-4">
              <div className="h-56 w-full max-w-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={rejectionPieData.filter(r => r.value > 0)} cx="50%" cy="50%" outerRadius={90} innerRadius={52} dataKey="value" cornerRadius={4} paddingAngle={3} cursor="pointer" onClick={(data) => { handlePieClick('Rejection Revenue', selectItem, data); track.chartClick('Rejection Revenue', data); }}>
                      {rejectionPieData.filter(r => r.value > 0).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip formatter={(v) => formatEUR(v)} />} />
                    <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 18, fontWeight: 700, fill: '#1a1a2e', fontFamily: "'Inter', sans-serif" }}>
                      {formatEUR(totalRevenueLost)}
                    </text>
                    <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 10, fill: '#737373', fontWeight: 500 }}>
                      Total Lost
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Legend */}
            <div className="px-4 pb-4 space-y-1">
              {rejectionPieData.map((r, i) => {
                const pct = totalRevenueLost > 0 ? (r.value / totalRevenueLost) * 100 : 0;
                return (
                  <div key={r.name} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50/80 transition-colors">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1 text-xs text-slate-700 truncate">{r.name}</span>
                    <span className="text-xs font-bold text-slate-800 tabular-nums">{formatEUR(r.value)}</span>
                    <span className="text-[10px] text-slate-400 w-10 text-right tabular-nums">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Table */}
          <div className="lg:col-span-2">
            <DataTable
              title="Rejection Codes Detail"
              columns={rejectionColumns}
              data={rejectionCodes || []}
              rowKey="code"
              formulaId="price_cost_gap"
              confidence="derived"
              selectedRowId={selectedItem?.id}
              onRowClick={(row) => selectItem({ type: 'rejection', id: row.code, label: `${row.code} — ${row.description}`, data: row })}
            />
          </div>
        </div>

        {/* ── 6. Price Sensitivity Detail ── */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.div variants={cardVariants}
            className="relative overflow-hidden"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(135deg, #10b981, #2dd4bf)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Won Quotes Avg Margin</p>
            <p className="text-3xl font-bold mt-2 text-green-600">{formatPct(priceSensitivity?.won_avg_margin)}</p>
            <p className="text-sm font-medium mt-3 text-slate-500">Quotes that were accepted by the customer had this average margin</p>
          </motion.div>
          <motion.div variants={cardVariants}
            className="relative overflow-hidden"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(135deg, #EF4444, #fca5a5)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Lost Quotes Avg Margin</p>
            <p className="text-3xl font-bold mt-2 text-red-500">{formatPct(priceSensitivity?.lost_avg_margin)}</p>
            <p className="text-sm font-medium mt-3 text-slate-500">Quotes that were rejected had this average margin — {formatPct(priceSensitivity?.margin_diff)} higher than won</p>
          </motion.div>
        </motion.div>

        {/* ── 6b. Price Sensitivity Bar Comparison ── */}
        <ChartCard
          title="Won vs Lost: Average Margin Comparison"
          subtitle="Side-by-side comparison of average margins for won and lost quotes"
          formulaId="price_sensitivity"
          confidence="verified"
          headerRight={
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#10B981] rounded-full" /> Won Quotes</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#EF4444] rounded-full" /> Lost Quotes</div>
            </div>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={sensitivityCompareData} layout="vertical" onClick={(s) => handleChartContainerClick('Price Sensitivity', selectItem, sensitivityCompareData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[0, 'auto']} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="margin" name="Avg Margin %" radius={[0, 6, 6, 0]} barSize={36} onClick={(data) => track.chartClick('Price Sensitivity Bar', data)}>
                  {sensitivityCompareData.map((entry, i) => (
                    <Cell key={i} fill={i === 0 ? '#10B981' : '#EF4444'} />
                  ))}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ── 7. Governance Compliance ── */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.div variants={cardVariants}
            className="relative overflow-hidden h-full flex flex-col"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: totalViolations > 20 ? 'linear-gradient(135deg, #EF4444, #fca5a5)' : totalViolations > 5 ? 'linear-gradient(135deg, #e7a019, #ffddb0)' : 'linear-gradient(135deg, #10b981, #2dd4bf)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Total Rule Violations</p>
            <p className={`text-3xl font-bold mt-2 ${totalViolations > 20 ? 'text-red-500' : totalViolations > 5 ? 'text-amber-500' : 'text-green-600'}`}>
              {totalViolations}
            </p>
            <p className="text-sm font-medium mt-1" style={{ color: '#a3a3a3' }}>Across {(governance.price_rules || []).length} active rules</p>
          </motion.div>
          <motion.div variants={cardVariants}
            className="relative overflow-hidden h-full flex flex-col"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(135deg, #0393da, #c1e8ff)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Avg Conversion Time</p>
            <p className="text-3xl font-bold mt-2" style={{ color: '#1a1a2e' }}>{conversionTiming.mean_days || 53} days</p>
            <p className="text-sm font-medium mt-1" style={{ color: '#a3a3a3' }}>Median: {conversionTiming.median_days || 45} days</p>
          </motion.div>
          <motion.div variants={cardVariants}
            className="relative overflow-hidden h-full flex flex-col"
            style={{ background: '#ffffff', borderRadius: '1.5rem', boxShadow: '0 8px 32px rgba(26,26,46,0.04)', padding: '1.5rem', minHeight: '160px' }}
          >
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: 'linear-gradient(135deg, #8B5CF6, #c4b5fd)' }} />
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>Conversion Range</p>
            <p className="text-3xl font-bold mt-2" style={{ color: '#8B5CF6' }}>{conversionTiming.p25_days || 22}–{conversionTiming.p75_days || 78} days</p>
            <p className="text-sm font-medium mt-1" style={{ color: '#a3a3a3' }}>P25–P75 interquartile range</p>
          </motion.div>
        </motion.div>

        <DataTable
          title="Price Governance Rules"
          columns={govRuleColumns}
          data={governance.price_rules || []}
          rowKey="rule"
          formulaId="governance_rules"
          confidence="derived"
          selectedRowId={selectedItem?.id}
          onRowClick={(row) => selectItem({ type: 'governance-rule', id: row.rule, label: row.rule, data: row })}
        />

        {/* ── 7b. Price History (2022–2025) ── */}
        <ChartCard
          title="Price History (2022–2025)"
          subtitle="Average list price, quoted price, and discount percentage over time"
          formulaId="governance_rules"
          confidence="derived"
          headerRight={
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#0393da] rounded-full" /> List Price</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#10B981] rounded-full" /> Quoted Price</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#F59E0B] rounded-full" /> Discount %</div>
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={priceHistoryData} onClick={(s) => handleChartContainerClick('Price History', selectItem, priceHistoryData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                <YAxis yAxisId="price" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="discount" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[0, 15]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar yAxisId="price" dataKey="listPrice" name="List Price" fill="#0393da" radius={[4, 4, 0, 0]} barSize={28} onClick={(data) => track.chartClick('List Price', data)} />
                <Bar yAxisId="price" dataKey="quotedPrice" name="Quoted Price" fill="#10B981" radius={[4, 4, 0, 0]} barSize={28} onClick={(data) => track.chartClick('Quoted Price', data)} />
                <Line yAxisId="discount" type="monotone" dataKey="discountPct" name="Discount %" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6, stroke: '#F59E0B', strokeWidth: 2, fill: 'white' }} onClick={(data) => track.chartClick('Discount %', data)} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ── 8. Enriched SKU Recommendations ── */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6"
            variants={containerVariants}
          >
            <motion.div variants={cardVariants}>
              <KPICard
                label="Total Recommendations"
                value={recSummary.reactiveCount + recSummary.proactiveCount}
                change={`${recSummary.reactiveCount} reactive, ${recSummary.proactiveCount} proactive`}
                changeType="neutral"
                formulaId="price_cost_gap"
                confidence="derived"
                bottomContent={<MiniWave color="#0393da" />}
              />
            </motion.div>
            <motion.div variants={cardVariants}>
              <KPICard
                label="Critical Count"
                value={recSummary.criticalCount}
                change={`${recSummary.highCount} high priority`}
                changeType={recSummary.criticalCount > 0 ? 'negative' : 'neutral'}
                formulaId="price_cost_gap"
                confidence="derived"
                bottomContent={<MiniProgress value={recSummary.criticalCount} max={Math.max(recSummary.reactiveCount + recSummary.proactiveCount, 1)} color="#EF4444" />}
              />
            </motion.div>
            <motion.div variants={cardVariants}>
              <KPICard
                label="Avg Risk Score"
                value={recSummary.avgRisk}
                change={recSummary.avgRisk >= 70 ? 'Critical range' : recSummary.avgRisk >= 40 ? 'Elevated range' : 'Acceptable range'}
                changeType={recSummary.avgRisk >= 70 ? 'negative' : recSummary.avgRisk >= 40 ? 'negative' : 'positive'}
                formulaId="price_cost_gap"
                confidence="derived"
                bottomContent={<MiniProgress value={recSummary.avgRisk} color={recSummary.avgRisk >= 70 ? '#EF4444' : recSummary.avgRisk >= 40 ? '#F59E0B' : '#10b981'} />}
              />
            </motion.div>
            <motion.div variants={cardVariants}>
              <KPICard
                label="Revenue at Risk"
                value={formatEUR(recSummary.revenueAtRisk)}
                change="From reactive recommendations"
                changeType={recSummary.revenueAtRisk > 0 ? 'negative' : 'neutral'}
                formulaId="price_cost_gap"
                confidence="derived"
                bottomContent={<MiniWave color="#EF4444" />}
              />
            </motion.div>
          </motion.div>

          {enrichedRecTableData.length > 0 ? (
            <DataTable
              title="Top SKU Recommendations (by Risk Score)"
              columns={enrichedRecColumns}
              data={enrichedRecTableData}
              rowKey="article_id"
              formulaId="price_cost_gap"
              confidence="derived"
              selectedRowId={selectedItem?.id}
              onRowClick={(row) => selectItem({ type: 'article', id: row.article_id || row.sku, label: row.description, data: row })}
            />
          ) : (
            <motion.div
              variants={cardVariants}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="px-6 py-8 text-center">
                <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>SKU Recommendations</h3>
                <p className="text-sm text-slate-400 mt-2">No enriched SKU-level recommendations available. The underlying product, inventory, or COGS data may not be present in the current dataset.</p>
              </div>
            </motion.div>
          )}
        </motion.div>

        <PhaseNotice type="derived" />

      </div>
    </>
  );
}
