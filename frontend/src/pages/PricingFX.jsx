import React, { useState, useMemo } from 'react';
import {
  ComposedChart, BarChart as RechartsBarChart, Bar, Line, Area, PieChart, Pie, Cell,
  LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants, chartVariants } from '../utils/animations';
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
import { colors, shadows, radius } from '../utils/designTokensV2';
import { TrendingDown, TrendingUp, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════════
   DATA EXTRACTION
   ══════════════════════════════════════════════════════════════════════════ */
const {
  gap_analysis: gapAnalysis,
  catalog_vs_quoted: catalogVsQuoted,
  win_rate_by_margin_band: winRateByBand,
  rejection_codes: rejectionCodes,
  price_sensitivity: priceSensitivity,
  overall_win_rate: overallWinRate,
  pricing_related_loss: pricingRelatedLoss,
  pipeline_summary: pipelineSummary,
  quarterly_win_rates: quarterlyWinRates,
  win_rate_by_commodity: winRateByCommodity,
  win_rate_margin_band_emc: winRateBandEMC,
  monthly_win_rates: monthlyWinRates,
  commodity_margin_heatmap: commodityHeatmap,
  response_time_buckets: responseTimeBuckets,
  lost_by_deal_size: lostByDealSize,
  customer_win_rates: customerWinRates,
  persistent_losses: persistentLosses,
  discount_distribution: discountDistribution,
  quarterly_margin_gap: quarterlyMarginGap,
  product_type_elasticity: productTypeElasticity,
} = analysis;

const conversionTiming = governance.conversion_timing || {};
const priceHistoryWithMargin = governance.price_history_with_margin || governance.price_history || [];

/* ══════════════════════════════════════════════════════════════════════════
   CHART DATA TRANSFORMS
   ══════════════════════════════════════════════════════════════════════════ */

/* Win Rate Trend by Quarter (1.1) */
const winRateTrendData = (quarterlyWinRates || []).map(d => ({
  quarter: d.quarter,
  overall: +(d.overall * 100).toFixed(1),
  bkaes: +(d.bkaes * 100).toFixed(1),
  bkagg: +(d.bkagg * 100).toFixed(1),
}));

/* Win Rate by Commodity Group (1.2L) */
const commodityWinRateData = (winRateByCommodity || []).map(d => ({
  group: d.group,
  winRate: +(d.win_rate * 100).toFixed(1),
  count: d.count,
}));

/* Win Rate by Margin Band with EMC (1.2R) */
const emcChartData = (winRateBandEMC || []).map(d => ({
  band: d.band,
  winRate: +(d.win_rate * 100).toFixed(1),
  emc: +(d.emc * 100).toFixed(1),
  count: d.count,
}));

/* Win Rate Seasonality (1.3) */
const seasonalWinRateData = (monthlyWinRates || []).map(d => ({
  month: d.name,
  winRate: +(d.win_rate * 100).toFixed(1),
}));

/* Response Time vs Win Rate (1.5) */
const responseTimeData = (responseTimeBuckets || []).map(d => ({
  bucket: d.bucket,
  winRate: +(d.win_rate * 100).toFixed(1),
  count: d.count,
}));

/* Rejection Codes pie data (2.1) */
const rejectionPieData = (rejectionCodes || []).map(d => ({
  name: `${d.code} — ${d.description}`,
  code: d.code,
  value: d.revenue_lost,
  count: d.count,
  pct: d.pct_of_lost,
}));
const PIE_COLORS = ['#0393da', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];
const totalRevenueLost = (rejectionCodes || []).reduce((s, r) => s + (r.revenue_lost || 0), 0);

/* Rejection code grouping */
const PRICING_CODES = ['PA', 'PR'];
const PROCESS_CODES = ['KA', 'KR', 'KE', 'KD', 'KN'];
const MARKET_CODES = ['TE', 'LZ', 'RZ'];

/* Deal Size breakdown (2.2) */
const dealSizeData = (lostByDealSize || []).map(d => ({
  size: d.size,
  lostQuotes: d.lost_quotes,
  lostRevenue: d.lost_revenue,
  pct: +(d.pct_of_total * 100).toFixed(1),
}));

/* Won vs Lost comparison (2.4) */
const sensitivityCompareData = [
  { label: 'Won Quotes', margin: +((priceSensitivity?.won_avg_margin || 0) * 100).toFixed(1) },
  { label: 'Lost Quotes', margin: +((priceSensitivity?.lost_avg_margin || 0) * 100).toFixed(1) },
];

/* Discount Distribution (3.2) */
const discountChartData = (discountDistribution || []).map(d => ({
  bucket: d.bucket,
  count: d.count,
  pct: +(d.pct * 100).toFixed(1),
}));

/* Price History with Margin (3.3) */
const priceHistoryData = (priceHistoryWithMargin).map(d => ({
  year: String(d.year),
  listPrice: d.avg_list_price,
  quotedPrice: d.avg_quoted_price,
  discountPct: +(d.avg_discount_pct * 100).toFixed(1),
  marginPct: d.margin_pct ? +(d.margin_pct * 100).toFixed(1) : null,
}));

/* Quarterly Margin Gap (3.4) */
const qMarginGapData = (quarterlyMarginGap || []).map(d => ({
  quarter: d.quarter,
  quoted: +(d.quoted * 100).toFixed(1),
  actual: +(d.actual * 100).toFixed(1),
  gap: +(d.gap * 100).toFixed(1),
}));

/* Gap by Year (kept for toggle) */
const gapByYearData = (gapAnalysis?.by_year || []).map(d => ({
  year: String(d.year),
  quoted: +(d.avg_quoted_margin * 100).toFixed(1),
  actual: +(d.avg_actual_margin * 100).toFixed(1),
  gap: +(d.gap * 100).toFixed(1),
  count: d.count,
}));

/* ══════════════════════════════════════════════════════════════════════════
   TABLE COLUMN DEFINITIONS
   ══════════════════════════════════════════════════════════════════════════ */

const rejectionColumns = [
  { key: 'code', label: 'Code', render: v => <span className="font-mono font-semibold">{v}</span> },
  { key: 'description', label: 'Reason' },
  { key: 'group', label: 'Category', render: v => {
    const color = v === 'Pricing' ? 'bg-red-100 text-red-700' : v === 'Process' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{v}</span>;
  }},
  { key: 'count', label: 'Count', align: 'right' },
  { key: 'revenue_lost', label: 'Revenue Lost', align: 'right', render: v => formatEUR(v) },
  { key: 'pct_of_lost', label: '% of Lost', align: 'right', render: v => formatPct(v) },
];

const customerColumns = [
  { key: 'customer', label: 'Customer', render: v => <span className="font-mono font-semibold">{v}</span> },
  { key: 'quotes', label: 'Quotes', align: 'right' },
  { key: 'win_rate', label: 'Win Rate', align: 'right', render: v => {
    const color = v >= 0.4 ? 'text-green-600' : v >= 0.3 ? 'text-amber-600' : 'text-red-600';
    return <span className={`font-bold ${color}`}>{(v * 100).toFixed(1)}%</span>;
  }},
  { key: 'lost_revenue', label: 'Lost Revenue', align: 'right', render: v => formatEUR(v) },
  { key: 'won_margin', label: 'Won Margin', align: 'right', render: v => <span className="text-green-600 font-semibold">{(v * 100).toFixed(1)}%</span> },
  { key: 'lost_margin', label: 'Lost Margin', align: 'right', render: v => <span className="text-red-600 font-semibold">{(v * 100).toFixed(1)}%</span> },
  { key: 'gap', label: 'Gap', align: 'right', render: v => <span className="font-bold">{(v * 100).toFixed(1)}pp</span> },
];

const govRuleColumns = [
  { key: 'rule', label: 'Rule', render: v => <span className="font-semibold">{v}</span> },
  { key: 'status', label: 'Status', render: v => {
    const color = v === 'active' ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-500';
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${color}`}>{v}</span>;
  }},
  { key: 'violations', label: 'Violations', align: 'right', render: v => {
    const color = v > 10 ? 'text-red-600 font-bold' : v > 0 ? 'text-amber-600 font-semibold' : 'text-green-600';
    return <span className={color}>{v}</span>;
  }},
];

const enrichedRecColumns = [
  { key: 'article_id', label: 'Article ID', render: v => <span className="font-mono text-slate-500 text-[11px]">{v}</span> },
  { key: 'description', label: 'Description' },
  { key: 'commodity_group', label: 'Commodity Group' },
  { key: 'current_margin', label: 'Current Margin', align: 'right', render: v => {
    const color = v < 0.25 ? 'text-red-600 font-bold' : v < 0.30 ? 'text-amber-600 font-semibold' : 'text-green-600 font-semibold';
    return <span className={color}>{formatPct(v)}</span>;
  }},
  { key: 'riskScore', label: 'Risk Score', align: 'right', render: v => {
    const color = v >= 70 ? 'bg-red-100 text-red-700' : v >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
    return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${color}`}>{v}</span>;
  }},
  { key: 'action', label: 'Action', render: (v) => {
    if (!v) return <span className="text-slate-300">--</span>;
    const styles = {
      'Increase': 'bg-red-100 text-red-700',
      'Stop Quoting': 'bg-red-200 text-red-900',
      'Strategic Review': 'bg-purple-100 text-purple-700',
      'Volume Discount': 'bg-blue-100 text-blue-700',
      'Hold': 'bg-green-100 text-green-700',
      'Monitor': 'bg-amber-100 text-amber-700',
      'OK': 'bg-green-100 text-green-700',
    };
    const labels = {
      'Increase': 'Increase Price',
      'Stop Quoting': 'Stop Quoting',
      'Strategic Review': 'Renegotiate / Sunset',
      'Volume Discount': 'Volume Restructure',
      'Hold': 'Hold — Optimal',
      'Monitor': 'Monitor',
      'OK': 'OK',
    };
    const color = styles[v] || 'bg-slate-100 text-slate-700';
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{labels[v] || v}</span>;
  }},
  { key: 'priority', label: 'Priority', render: v => {
    const color = v === 'Critical' ? 'bg-red-50 text-red-600' : v === 'High' ? 'bg-orange-50 text-orange-600' : v === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600';
    return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>{v}</span>;
  }},
  { key: 'approval', label: 'Approval Level', render: v => {
    if (!v) return <span className="text-slate-300">--</span>;
    const level = typeof v === 'object' ? v.level : v;
    return <span className="text-xs font-medium text-slate-700">{level}</span>;
  }},
];

/* ══════════════════════════════════════════════════════════════════════════
   HEATMAP COLOR SCALE
   ══════════════════════════════════════════════════════════════════════════ */
function heatColor(value) {
  if (value >= 65) return { bg: '#dcfce7', text: '#166534' };
  if (value >= 55) return { bg: '#d1fae5', text: '#047857' };
  if (value >= 45) return { bg: '#fef9c3', text: '#854d0e' };
  if (value >= 35) return { bg: '#fed7aa', text: '#9a3412' };
  return { bg: '#fecaca', text: '#991b1b' };
}

/* ══════════════════════════════════════════════════════════════════════════
   PRICING COMMAND CENTER (kept, empty-state aware)
   ══════════════════════════════════════════════════════════════════════════ */
function PricingCommandCenter({ commodityFilter = 'All' }) {
  const { selectItem } = useUI();
  const enriched = useMemo(() => {
    const all = buildEnrichedRecommendations();
    return commodityFilter === 'All' ? all : all.filter(r => r.commodity_group === commodityFilter);
  }, [commodityFilter]);
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
      <motion.div id="pricing-command-center" variants={cardVariants} initial="hidden" animate="visible"
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-8 text-center">
          <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Pricing Command Center</h3>
          <p className="text-sm text-slate-400 mt-2">No enriched SKU-level recommendations available.</p>
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
    <motion.div id="pricing-command-center" variants={cardVariants} initial="hidden" animate="visible"
      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Pricing Command Center</h3>
            <div className="flex items-center gap-4 mt-2 text-[11px]">
              <span className="flex items-center gap-1 text-red-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> {summary.criticalCount} Critical</span>
              <span className="flex items-center gap-1 text-amber-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {summary.highCount} High</span>
              <span className="text-slate-400">Avg Risk: <span className="font-semibold text-slate-600">{summary.avgRisk}</span></span>
              <span className="text-slate-400">At Risk: <span className="font-semibold text-slate-600">{formatEUR(summary.revenueAtRisk)}</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden text-[11px] font-semibold" style={{ border: '1px solid #e5e5e5' }}>
              <button onClick={() => { setActiveTab('reactive'); setShowAll(false); setExpandedSku(null); }}
                className={`px-3 py-1.5 transition-colors ${activeTab === 'reactive' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                Reactive ({reactive.length})
              </button>
              <button onClick={() => { setActiveTab('proactive'); setShowAll(false); setExpandedSku(null); }}
                className={`px-3 py-1.5 transition-colors ${activeTab === 'proactive' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
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
                <tr className="cursor-pointer transition-colors duration-100"
                  style={{ background: expandedSku === (item.sku || item.article_id) ? '#f8f9fa' : idx % 2 === 0 ? '#ffffff' : '#fcfcfc', borderBottom: '1px solid #f5f5f5' }}
                  onClick={() => { const id = item.sku || item.article_id; const next = expandedSku === id ? null : id; setExpandedSku(next); next ? selectItem({ type: 'article', id, label: item.description, data: item }) : selectItem(null); }}
                  onMouseEnter={e => { if (expandedSku !== (item.sku || item.article_id)) e.currentTarget.style.background = '#f8f9fa'; }}
                  onMouseLeave={e => { if (expandedSku !== (item.sku || item.article_id)) e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fcfcfc'; }}
                >
                  <td className="px-3 py-2.5 text-slate-300 text-[10px]">
                    <span className={`inline-block transition-transform duration-150 ${expandedSku === (item.sku || item.article_id) ? 'rotate-90' : ''}`}>&#9658;</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">{item.sku || item.article_id}</td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[220px] truncate" title={item.description}>{item.description}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{formatEUR(item.revenue)}</td>
                  <td className="px-3 py-2.5"><MarginBar current={item.current_margin} target={item.target_margin} /></td>
                  <td className="px-3 py-2.5"><RiskBar score={item.riskScore} /></td>
                  <td className="px-3 py-2.5 text-right"><span className="font-semibold text-green-600 text-sm">{formatEUR(item.recovery_inr)}</span></td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${item.priority === 'Critical' ? 'bg-red-50 text-red-600' : item.priority === 'High' ? 'bg-orange-50 text-orange-600' : item.priority === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>{item.priority}</span>
                  </td>
                </tr>
                {expandedSku === (item.sku || item.article_id) && (
                  <tr><td colSpan={8} className="px-6 py-4" style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <ExpandedDetailPanel item={item} />
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > 15 && (
        <div className="px-6 py-3 flex items-center justify-between" style={{ borderTop: '1px solid #f0f0f0' }}>
          <span className="text-[11px] text-slate-400">{displayed.length} of {sorted.length}</span>
          <button onClick={() => setShowAll(!showAll)} className="text-[11px] font-semibold text-slate-600 hover:text-slate-800 transition-colors">
            {showAll ? 'Show Top 15' : `Show All ${sorted.length}`}
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   EXPANDED DETAIL PANEL — 4-Tab Overhaul
   ══════════════════════════════════════════════════════════════════════════ */
function ExpandedDetailPanel({ item }) {
  const [detailTab, setDetailTab] = useState('summary');

  const costPerUnit = item.hkvoll_per_unit || 0;
  const currentPrice = costPerUnit > 0 && item.current_margin < 1 ? Math.round(costPerUnit / (1 - item.current_margin)) : 0;
  const recommendedPrice = costPerUnit > 0 && item.target_margin < 1 ? Math.round(costPerUnit / (1 - item.target_margin)) : 0;
  const priceDiff = recommendedPrice - currentPrice;
  const priceDiffPct = currentPrice > 0 ? ((priceDiff / currentPrice) * 100).toFixed(1) : 0;
  const unitsLatest = item.units_latest || 0;
  const annualRecovery = priceDiff > 0 ? priceDiff * unitsLatest : 0;

  // Status Label: 2x2 matrix
  const revTrend = item.revenue_latest > (item.revenue || 0) * 0.5 ? 'growing' : 'declining';
  const marginTrend = item.marginTrend || 'stable';
  const statusLabel = marginTrend === 'declining' && revTrend === 'declining' ? 'Sunset Candidate'
    : marginTrend === 'declining' && revTrend === 'growing' ? 'Cash Trap'
    : marginTrend !== 'declining' && revTrend === 'growing' ? 'Star'
    : 'Optimize';
  const statusColor = statusLabel === 'Star' ? 'bg-green-100 text-green-700' : statusLabel === 'Cash Trap' ? 'bg-red-100 text-red-700' : statusLabel === 'Sunset Candidate' ? 'bg-slate-200 text-slate-600' : 'bg-blue-100 text-blue-700';

  const approvalLevel = typeof item.approval === 'object' ? item.approval.level : item.approval || '--';
  const approvalColor = approvalLevel === 'VP' ? 'text-red-600' : approvalLevel === 'Director' ? 'text-orange-600' : 'text-green-600';

  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'cost', label: 'Cost Deep-Dive' },
    { key: 'quotes', label: 'Quote & Competition' },
    { key: 'customer', label: 'Customer Context' },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setDetailTab(t.key)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors ${detailTab === t.key ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {detailTab === 'summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <DetailBox label="ARTICLE / GROUP" value={`${item.article_id} / ${item.commodity_group || '--'}`} />
            <DetailBox label="CURRENT PRICE" value={formatEUR(currentPrice)} />
            <DetailBox label="RECOMMENDED" value={`${formatEUR(recommendedPrice)} (+${formatEUR(priceDiff)}, +${priceDiffPct}%)`} valueColor="text-green-600" />
            <DetailBox label="ANNUAL RECOVERY" value={formatEUR(annualRecovery)} valueColor="text-green-600" />
            <DetailBox label="STATUS" value={statusLabel} valueColor="" custom={<span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}`}>{statusLabel}</span>} />
            <DetailBox label="APPROVAL" value={approvalLevel} valueColor={approvalColor} />
          </div>
          {costPerUnit > 0 && (
            <div className="text-[11px] text-slate-500 px-1 bg-slate-50 rounded-lg p-3">
              <span className="font-semibold text-slate-700">Methodology:</span>{' '}
              Target margin ({(item.target_margin * 100).toFixed(1)}%) at current cost ({formatEUR(costPerUnit)}) = {formatEUR(costPerUnit)} / (1 − {item.target_margin.toFixed(3)}) = {formatEUR(recommendedPrice)}
            </div>
          )}
          {priceDiff > 0 && (
            <div className="text-[11px] text-slate-500 px-1 bg-blue-50 rounded-lg p-3">
              <span className="font-semibold text-blue-700">Suggested Approach:</span>{' '}
              Phase 1: +{Math.round(priceDiff / 2)} ({formatEUR(currentPrice + Math.round(priceDiff / 2))}). Monitor win rate for 2 quarters.
              Phase 2: +{priceDiff - Math.round(priceDiff / 2)} if retained.
            </div>
          )}
        </div>
      )}

      {detailTab === 'cost' && (
        <div className="space-y-4">
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
                    {item.costDeepDive.trend.map((t) => (
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

      {detailTab === 'quotes' && (
        <div className="space-y-3">
          {item.quoteStats && item.quoteStats.total >= 3 ? (
            <>
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

      {detailTab === 'customer' && (
        <div className="space-y-3">
          {item.customerData?.customers ? (
            <>
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

              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-slate-500">Concentration:</span>
                <span className="font-bold text-slate-700">{item.customerData.customer_count} customer{item.customerData.customer_count !== 1 ? 's' : ''}</span>
                <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                  item.customerData.concentration === 'Single customer (critical)' ? 'bg-red-100 text-red-700' :
                  item.customerData.concentration === 'HIGH' ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'
                }`}>{item.customerData.concentration}</span>
              </div>

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
    </div>
  );
}

/* ── Detail Box ── */
function DetailBox({ label, value, valueColor = '', custom }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
      {custom || <p className={`text-sm font-bold ${valueColor || 'text-slate-800'}`}>{value}</p>}
    </div>
  );
}

const MARGIN_FLOOR = 0.50;
const MARGIN_TARGET = 0.55;

/* ── Margin Bar visual ── */
function MarginBar({ current, target = MARGIN_TARGET, floor = MARGIN_FLOOR }) {
  const pct = Math.min(current / 1.0, 1) * 100;
  const floorPct = (floor / 1.0) * 100;
  const targetPct = (target / 1.0) * 100;
  const isBelow = current < floor;
  return (
    <div className="relative w-full h-5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`absolute left-0 top-0 h-full rounded-full transition-all ${isBelow ? 'bg-red-400' : current < target ? 'bg-amber-400' : 'bg-green-400'}`} style={{ width: `${pct}%` }} />
      <div className="absolute top-0 h-full border-l-2 border-dashed border-slate-400" style={{ left: `${floorPct}%` }} />
      <div className="absolute top-0 h-full border-l-2 border-dashed border-green-600" style={{ left: `${targetPct}%` }} />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">{(current * 100).toFixed(1)}%</span>
    </div>
  );
}

/* ── Risk Bar ── */
function RiskBar({ score }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-400' : 'bg-green-400';
  const label = score >= 70 ? 'Critical' : score >= 40 ? 'Elevated' : 'Low';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} /></div>
      <span className="text-[10px] font-bold text-slate-500">{score}</span>
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${score >= 70 ? 'bg-red-100 text-red-700' : score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{label}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   TAB CONFIG
   ══════════════════════════════════════════════════════════════════════════ */
const PAGE_TABS = [
  { key: 'winrate', label: 'Win Rate Intelligence' },
  { key: 'loss', label: 'Loss Analysis' },
  { key: 'governance', label: 'Price Governance' },
];

const COMMODITY_FILTERS = ['All', 'BKAES', 'BKAGG', 'BKAIZ', 'SOPU'];

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */
export default function PricingFX() {
  const { selectItem, selectedItem } = useUI();

  /* State */
  const [pageTab, setPageTab] = useState('winrate');
  const [excludeAN, setExcludeAN] = useState(false);
  const [commodityFilter, setCommodityFilter] = useState('All');

  /* Enriched recommendations */
  const enrichedAll = useMemo(() => buildEnrichedRecommendations(), []);
  const enrichedFiltered = useMemo(() =>
    commodityFilter === 'All' ? enrichedAll : enrichedAll.filter(r => r.commodity_group === commodityFilter),
    [enrichedAll, commodityFilter]
  );
  const reactiveAll = useMemo(() => getReactiveRecommendations(enrichedFiltered), [enrichedFiltered]);
  const proactiveAll = useMemo(() => getProactiveAlerts(enrichedFiltered), [enrichedFiltered]);
  const recSummary = useMemo(() => getRecommendationSummary(reactiveAll, proactiveAll), [reactiveAll, proactiveAll]);

  const overall = gapAnalysis?.overall || {};
  const totalViolations = (governance.price_rules || []).reduce((s, r) => s + (r.violations || 0), 0);

  /* Rejection data with AN exclusion */
  const filteredRejections = useMemo(() => {
    if (!excludeAN) return rejectionCodes || [];
    return (rejectionCodes || []).filter(r => r.code !== 'AN');
  }, [excludeAN]);

  const filteredTotalLost = useMemo(() =>
    filteredRejections.reduce((s, r) => s + (r.revenue_lost || 0), 0),
    [filteredRejections]
  );

  /* Grouped rejection data for enhanced table */
  const groupedRejections = useMemo(() =>
    filteredRejections.map(r => ({
      ...r,
      group: PRICING_CODES.includes(r.code) ? 'Pricing' : PROCESS_CODES.includes(r.code) ? 'Process' : MARKET_CODES.includes(r.code) ? 'Market' : 'Other',
    })),
    [filteredRejections]
  );

  /* Enriched recommendations for DataTable */
  const enrichedRecTableData = useMemo(() =>
    [...enrichedFiltered].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0)).slice(0, 25),
    [enrichedFiltered]
  );

  /* Heatmap data transform */
  const heatmapRows = useMemo(() => {
    if (!commodityHeatmap?.data) return [];
    const bands = commodityHeatmap.bands || [];
    const groups = commodityHeatmap.groups || [];
    return groups.map(g => {
      const row = { group: g };
      bands.forEach(b => {
        const cell = commodityHeatmap.data.find(d => d.group === g && d.band === b);
        row[b] = cell ? +(cell.win_rate * 100).toFixed(1) : null;
      });
      return row;
    });
  }, []);

  return (
    <>
      <Header title="Pricing & Quotes" />
      <div className="p-8 space-y-6 max-w-[1440px] mx-auto">

        {/* ══════════════════════════════════════════════════════════════
           GLOBAL HEADER: Filters
           ══════════════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
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
        </div>

        {/* ══════════════════════════════════════════════════════════════
           ROW 1: KPI CARDS (4 main)
           ══════════════════════════════════════════════════════════════ */}
        <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" variants={containerVariants} initial="hidden" animate="visible">
          {/* KPI 1: Win Rate */}
          <motion.div variants={cardVariants}>
            <KPICard
              label="Win Rate"
              value={`${((overallWinRate?.current || 0.371) * 100).toFixed(1)}%`}
              change={`+${((overallWinRate?.yoy_change || 0.024) * 100).toFixed(1)}pp YoY`}
              changeType="positive"
              infoTooltip="Overall quote win rate — headline metric for pricing performance"
              formulaId="win_rate"
              confidence="verified"
              bottomContent={<MiniProgress value={(overallWinRate?.current || 0.371) * 100} max={100} color={colors.primary} />}
            />
          </motion.div>

          {/* KPI 2: Revenue Lost (Pricing-Related) */}
          <motion.div variants={cardVariants}>
            <KPICard
              label="Revenue Lost (Pricing)"
              value={formatEUR(pricingRelatedLoss?.total || 971267)}
              change={`PA: ${formatEUR(pricingRelatedLoss?.pa_competitor_cheaper?.revenue || 793893)} + PR: ${formatEUR(pricingRelatedLoss?.pr_price_too_high?.revenue || 177374)}`}
              changeType="negative"
              infoTooltip="Only competitor-cheaper (PA) and price-too-high (PR) losses — the ones pricing changes can fix"
              confidence="derived"
              bottomContent={<MiniWave color="#EF4444" />}
            />
          </motion.div>

          {/* KPI 3: Open Pipeline */}
          <motion.div variants={cardVariants}>
            <KPICard
              label="Open Pipeline"
              value={`${formatEUR(pipelineSummary?.open_value || 957800)} open`}
              change={`Expected: ${formatEUR(pipelineSummary?.expected_value || 355343)} (${((pipelineSummary?.win_rate || 0.371) * 100).toFixed(1)}% win rate)`}
              changeType="neutral"
              infoTooltip="Pipeline × trailing win rate = expected revenue"
              confidence="derived"
              bottomContent={
                <div className="flex gap-3 text-[10px]" style={{ color: '#737373' }}>
                  <span>30d: {formatEUR(71067)}</span>
                  <span>60d: {formatEUR(159819)}</span>
                  <span>90d: {formatEUR(355343)}</span>
                </div>
              }
            />
          </motion.div>

          {/* KPI 4: Price Sensitivity */}
          <motion.div variants={cardVariants}>
            <KPICard
              label="Price Sensitivity"
              value={`${((priceSensitivity?.margin_diff || 0.018) * 100).toFixed(1)}%`}
              change={`p=${(priceSensitivity?.p_value || 0.006).toFixed(3)} — ${priceSensitivity?.significant ? 'Statistically significant' : 'Not significant'}`}
              changeType={priceSensitivity?.significant ? 'negative' : 'neutral'}
              infoTooltip="Margin difference between won and lost quotes with statistical significance"
              formulaId="price_sensitivity"
              confidence="verified"
              bottomContent={<MiniProgress value={priceSensitivity?.significant ? 85 : 40} color={priceSensitivity?.significant ? '#EF4444' : '#10b981'} />}
            />
          </motion.div>
        </motion.div>

        {/* ── Secondary KPI Strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Avg Margin Gap', value: formatPct(overall.mean_gap), sub: `Median: ${formatPct(overall.median_gap)}` },
            { label: 'Linked Records', value: (overall.linked_records || 0).toLocaleString(), sub: 'Quote-to-actual matched' },
            { label: 'Avg Conversion Time', value: `${conversionTiming.mean_days || 67} days`, sub: `Range: ${conversionTiming.p25_days || 26}–${conversionTiming.p75_days || 80}` },
            { label: 'Total Rule Violations', value: totalViolations.toLocaleString(), sub: `Across ${(governance.price_rules || []).length} rules` },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3" style={{ boxShadow: '0 2px 8px rgba(26,26,46,0.03)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{kpi.label}</p>
              <p className="text-lg font-bold mt-1" style={{ color: colors.darkNavy }}>{kpi.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Pipeline Compact Card ── */}
        <motion.div variants={chartVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
          style={{ background: colors.surface, borderRadius: radius.card, boxShadow: shadows.card, padding: '1.25rem 1.5rem' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-bold text-sm" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>Pipeline Funnel</h3>
            <div className="flex items-center gap-2 text-xs">
              {(pipelineSummary?.stages || []).map((stage, i) => (
                <React.Fragment key={stage.stage}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: i === 2 ? `${colors.primary}10` : '#f8f9fa' }}>
                    <span className="font-bold" style={{ color: i === 2 ? colors.primary : colors.darkNavy }}>{stage.count}</span>
                    <span className="text-slate-500">{stage.stage}</span>
                    {stage.value > 0 && <span className="text-slate-400 text-[10px]">({formatEUR(stage.value)})</span>}
                  </div>
                  {i < (pipelineSummary?.stages || []).length - 1 && <span className="text-slate-300">&rarr;</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Pricing Command Center ── */}
        <PricingCommandCenter commodityFilter={commodityFilter} />

        {/* ══════════════════════════════════════════════════════════════
           TAB NAVIGATION
           ══════════════════════════════════════════════════════════════ */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: colors.surfaceContainerLow }}>
          {PAGE_TABS.map(t => (
            <button key={t.key} onClick={() => setPageTab(t.key)}
              className={`px-5 py-2 text-xs font-semibold rounded-md transition-all ${pageTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
           TAB 1: WIN RATE INTELLIGENCE
           ══════════════════════════════════════════════════════════════ */}
        {pageTab === 'winrate' && (
          <div className="space-y-6">

            {/* 1.1 — Win Rate Trend by Quarter */}
            <ChartCard
              title="Win Rate Trend by Quarter"
              subtitle="Quarterly win rate with BKAES and BKAGG overlays — 2022-Q1 through 2024-Q4"
              confidence="verified"
              headerRight={
                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-slate-700 block" /> Overall</div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#0393da] block" /> BKAES</div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#10B981] block" /> BKAGG</div>
                </div>
              }
            >
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={winRateTrendData} margin={{ top: 15, right: 30, bottom: 5, left: 15 }} onClick={s => handleChartContainerClick('Win Rate Trend', selectItem, winRateTrendData, s)}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} interval={1} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, 75]} />
                    <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                    <ReferenceLine y={50} stroke="#EF4444" strokeDasharray="6 3" strokeWidth={1} label={{ value: '50% baseline', position: 'insideTopRight', fill: '#EF4444', fontSize: 9 }} />
                    <Line type="monotone" dataKey="overall" name="Overall" stroke="#1a1a2e" strokeWidth={2.5} dot={{ r: 3 }} animationDuration={800} />
                    <Line type="monotone" dataKey="bkaes" name="BKAES" stroke="#0393da" strokeWidth={2} dot={{ r: 2 }} animationDuration={800} />
                    <Line type="monotone" dataKey="bkagg" name="BKAGG" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} animationDuration={800} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-start gap-2 mt-2 px-2 py-2 bg-amber-50 rounded-lg text-[11px] text-amber-800">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>Q3 2023: Win rate collapsed to 11.4% (BKAGG: 11.1%). Investigate: competitive pressure? Pricing error? Market event? Recovery by Q4 2023 suggests temporary disruption.</span>
              </div>
            </ChartCard>

            {/* 1.2 — Two side-by-side: Commodity bars + Margin Band with EMC */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Win Rate by Commodity Group */}
              <ChartCard title="Win Rate by Commodity Group" subtitle="Overall win rates by product group" confidence="verified">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={commodityWinRateData} layout="vertical" onClick={s => handleChartContainerClick('Commodity Win Rate', selectItem, commodityWinRateData, s)}>
                      <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[0, 70]} />
                      <YAxis type="category" dataKey="group" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                      <Bar dataKey="winRate" name="Win Rate %" radius={[0, 6, 6, 0]} barSize={28}>
                        {commodityWinRateData.map((entry, i) => (
                          <Cell key={i} fill={entry.winRate >= 55 ? '#10B981' : entry.winRate >= 45 ? '#F59E0B' : '#EF4444'} />
                        ))}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              {/* Win Rate by Margin Band + EMC */}
              <ChartCard title="Win Rate by Margin Band + EMC" subtitle="Win rate and Expected Margin Contribution by pricing band"
                confidence="verified"
                headerRight={
                  <div className="flex items-center gap-3 text-xs font-medium">
                    <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#0393da] rounded-sm" /> Win Rate</div>
                    <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#F59E0B] block" /> EMC</div>
                  </div>
                }
              >
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={emcChartData} onClick={s => handleChartContainerClick('EMC by Band', selectItem, emcChartData, s)}>
                      <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                      <XAxis dataKey="band" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[0, 70]} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[0, 55]} />
                      <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                      <Bar yAxisId="left" dataKey="winRate" name="Win Rate %" fill="#0393da" radius={[4, 4, 0, 0]} barSize={32} />
                      <Line yAxisId="right" type="monotone" dataKey="emc" name="EMC %" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] italic mt-2 px-2 text-slate-500">
                  EMC keeps climbing with margin band. Higher margins win often enough that expected return per quote is maximized above 80%. The math says: don't discount.
                </p>
              </ChartCard>
            </div>

            {/* 1.3 — Win Rate Seasonality */}
            <ChartCard title="Win Rate Seasonality" subtitle="Monthly win rate patterns — seasonal pricing aggression opportunities" confidence="derived">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={seasonalWinRateData} onClick={s => handleChartContainerClick('Seasonal Win Rate', selectItem, seasonalWinRateData, s)}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[25, 75]} />
                    <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                    <Bar dataKey="winRate" name="Win Rate %" radius={[4, 4, 0, 0]} barSize={28}>
                      {seasonalWinRateData.map((entry, i) => (
                        <Cell key={i} fill={entry.winRate >= 55 ? '#10B981' : entry.winRate >= 40 ? '#F59E0B' : '#EF4444'} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] italic mt-2 px-2 text-slate-500">
                Summer crash (Jun–Aug: 33–38%) vs winter peak (Nov–Dec: 60–67%). Adjust pricing aggression seasonally.
              </p>
            </ChartCard>

            {/* 1.4 — Commodity × Margin Band Heatmap */}
            <ChartCard title="Commodity Group × Margin Band Heatmap" subtitle="Win rate % by group and margin band — reveals group-specific pricing strategies" confidence="derived">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Group</th>
                      {(commodityHeatmap?.bands || []).map(b => (
                        <th key={b} className="text-center py-2 px-3 font-semibold text-slate-600">{b}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapRows.map(row => (
                      <tr key={row.group} className="border-t border-slate-100">
                        <td className="py-2 px-3 font-bold text-slate-700">{row.group}</td>
                        {(commodityHeatmap?.bands || []).map(b => {
                          const val = row[b];
                          const c = val != null ? heatColor(val) : { bg: '#f8f9fa', text: '#94a3b8' };
                          return (
                            <td key={b} className="py-2 px-3 text-center">
                              <span className="inline-flex items-center justify-center w-14 h-8 rounded-md text-xs font-bold" style={{ background: c.bg, color: c.text }}>
                                {val != null ? `${val}%` : '--'}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] italic mt-3 px-2 text-slate-500">
                BKAGG needs a completely different pricing strategy than BKAES — high win rate at &gt;80% band (69.6%) but weak at 60–70% (41.9%).
              </p>
            </ChartCard>

            {/* 1.5 — Quote Response Time vs Win Rate */}
            <ChartCard title="Quote Response Time vs Win Rate" subtitle="Faster responses correlate with higher win rates — a process fix worth more than pricing changes" confidence="derived">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={responseTimeData} onClick={s => handleChartContainerClick('Response Time', selectItem, responseTimeData, s)}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[0, 60]} />
                    <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                    <Bar dataKey="winRate" name="Win Rate %" radius={[4, 4, 0, 0]} barSize={36}>
                      {responseTimeData.map((entry, i) => (
                        <Cell key={i} fill={entry.winRate >= 45 ? '#10B981' : entry.winRate >= 35 ? '#F59E0B' : '#EF4444'} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
           TAB 2: LOSS ANALYSIS
           ══════════════════════════════════════════════════════════════ */}
        {pageTab === 'loss' && (
          <div className="space-y-6">

            {/* 2.1 — Revenue Lost by Reason (enhanced with groups) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="rounded-xl overflow-hidden" style={{ background: '#ffffff', boxShadow: '0 2px 12px rgba(26,26,46,0.06)' }}>
                <div className="px-6 pt-5 pb-2">
                  <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Revenue Lost by Reason</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Grouped by pricing / process / market{excludeAN ? ' (AN excluded)' : ''}</p>
                </div>
                <div className="flex items-center justify-center px-4 py-4">
                  <div className="h-56 w-full max-w-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={rejectionPieData.filter(r => r.value > 0 && (!excludeAN || r.code !== 'AN'))} cx="50%" cy="50%" outerRadius={90} innerRadius={52} dataKey="value" cornerRadius={4} paddingAngle={3} cursor="pointer"
                          onClick={data => { handlePieClick('Rejection Revenue', selectItem, data); track.chartClick('Rejection Revenue', data); }}>
                          {rejectionPieData.filter(r => r.value > 0 && (!excludeAN || r.code !== 'AN')).map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip formatter={v => formatEUR(v)} />} />
                        <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 18, fontWeight: 700, fill: '#1a1a2e' }}>{formatEUR(filteredTotalLost)}</text>
                        <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 10, fill: '#737373' }}>Total Lost</text>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {/* Category summary */}
                <div className="px-5 pb-4 space-y-1">
                  {[
                    { label: 'Pricing-Related', codes: PRICING_CODES, color: '#EF4444' },
                    { label: 'Process-Related', codes: PROCESS_CODES, color: '#F59E0B' },
                    { label: 'Market-Related', codes: MARKET_CODES, color: '#0393da' },
                  ].map(cat => {
                    const catLoss = groupedRejections.filter(r => cat.codes.includes(r.code)).reduce((s, r) => s + r.revenue_lost, 0);
                    const catCount = groupedRejections.filter(r => cat.codes.includes(r.code)).reduce((s, r) => s + r.count, 0);
                    return (
                      <div key={cat.label} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                        <span className="flex-1 text-xs font-semibold text-slate-700">{cat.label}</span>
                        <span className="text-xs font-bold text-slate-800">{formatEUR(catLoss)}</span>
                        <span className="text-[10px] text-slate-400">{catCount} quotes</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="lg:col-span-2">
                <DataTable
                  title="Rejection Codes Detail"
                  columns={rejectionColumns}
                  data={groupedRejections}
                  rowKey="code"
                  confidence="derived"
                  selectedRowId={selectedItem?.id}
                  onRowClick={row => selectItem({ type: 'rejection', id: row.code, label: `${row.code} — ${row.description}`, data: row })}
                />
              </div>
            </div>

            {/* 2.2 — Lost Revenue by Deal Size */}
            <ChartCard title="Lost Revenue by Deal Size" subtitle="Concentration of losses in large deals" confidence="derived"
              headerRight={
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 rounded-lg text-[11px] font-semibold text-red-700">
                  37 lost quotes &gt;€50K = €4.37M (48% of all lost revenue)
                </div>
              }
            >
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={dealSizeData} onClick={s => handleChartContainerClick('Deal Size Loss', selectItem, dealSizeData, s)}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis dataKey="size" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => formatEUR(v)} />
                    <Tooltip content={<CustomTooltip formatter={v => formatEUR(v)} />} />
                    <Bar dataKey="lostRevenue" name="Lost Revenue" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={36}>
                      {dealSizeData.map((entry, i) => (
                        <Cell key={i} fill={entry.pct >= 40 ? '#991B1B' : entry.pct >= 20 ? '#EF4444' : '#FCA5A5'} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] italic mt-2 px-2 text-slate-500">
                Win 5 more &gt;€50K deals = ~+€590K. These are worth fighting for.
              </p>
            </ChartCard>

            {/* 2.3 — Customer Win Rate Table */}
            <DataTable
              title="Customer Win Rate Analysis (Top 15 by Lost Revenue)"
              columns={customerColumns}
              data={customerWinRates || []}
              rowKey="customer"
              confidence="derived"
              selectedRowId={selectedItem?.id}
              onRowClick={row => selectItem({ type: 'customer', id: row.customer, label: `Customer ${row.customer}`, data: row })}
            />
            <div className="flex items-start gap-2 px-5 py-3 bg-blue-50 rounded-xl text-[11px] text-blue-800">
              <div className="size-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">i</div>
              <p>Customer 101580 alone = 29% of all lost quote revenue. Won margins (83.7%) far exceed lost margins (72.5%) — they lose on competitive deals where they're still quoting 72.5%.</p>
            </div>

            {/* 2.4 — Won vs Lost Margin Comparison */}
            <ChartCard title="Won vs Lost: Average Margin Comparison" subtitle="Side-by-side comparison of average margins"
              confidence="verified"
              headerRight={
                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#10B981] rounded-full" /> Won</div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#EF4444] rounded-full" /> Lost</div>
                </div>
              }
            >
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={sensitivityCompareData} layout="vertical" onClick={s => handleChartContainerClick('Price Sensitivity', selectItem, sensitivityCompareData, s)}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[60, 80]} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="margin" name="Avg Margin %" radius={[0, 6, 6, 0]} barSize={28}>
                      {sensitivityCompareData.map((_, i) => <Cell key={i} fill={i === 0 ? '#10B981' : '#EF4444'} />)}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* 2.5 — Persistent Losses Alert */}
            <PersistentLossesAlert />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
           TAB 3: PRICE GOVERNANCE & STRATEGY
           ══════════════════════════════════════════════════════════════ */}
        {pageTab === 'governance' && (
          <div className="space-y-6">

            {/* 3.1 — Price Governance Rules */}
            <DataTable
              title="Price Governance Rules"
              columns={govRuleColumns}
              data={governance.price_rules || []}
              rowKey="rule"
              confidence="derived"
              selectedRowId={selectedItem?.id}
              onRowClick={row => selectItem({ type: 'governance-rule', id: row.rule, label: row.rule, data: row })}
            />

            {/* 3.2 — Discount Distribution */}
            <ChartCard title="Discount Distribution" subtitle="Percentage of quotes by discount level off list price" confidence="derived">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={discountChartData} onClick={s => handleChartContainerClick('Discount Distribution', selectItem, discountChartData, s)}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                    <Bar dataKey="pct" name="% of Quotes" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={36}>
                      {discountChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.pct >= 20 ? '#7C3AED' : entry.pct >= 15 ? '#8B5CF6' : '#A78BFA'} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] italic mt-2 px-2 text-slate-500">
                {discountChartData.filter(d => d.bucket === '>30%')[0]?.pct || 0}% of quotes get &gt;30% discount. If widespread, the issue is list price, not sales discipline.
              </p>
            </ChartCard>

            {/* 3.3 — Price History (enhanced with margin overlay) */}
            <ChartCard title="Price History (2022–2025)" subtitle="List price, quoted price, discount % with margin overlay"
              confidence="derived"
              headerRight={
                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#0393da] rounded-full" /> List Price</div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#10B981] rounded-full" /> Quoted Price</div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#F59E0B] block" /> Discount %</div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#8B5CF6] block" /> Margin %</div>
                </div>
              }
            >
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={priceHistoryData} onClick={s => handleChartContainerClick('Price History', selectItem, priceHistoryData, s)}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                    <YAxis yAxisId="price" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[0, 80]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar yAxisId="price" dataKey="listPrice" name="List Price" fill="#0393da" radius={[4, 4, 0, 0]} barSize={28} />
                    <Bar yAxisId="price" dataKey="quotedPrice" name="Quoted Price" fill="#10B981" radius={[4, 4, 0, 0]} barSize={28} />
                    <Line yAxisId="pct" type="monotone" dataKey="discountPct" name="Discount %" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 4 }} />
                    {priceHistoryData[0]?.marginPct != null && (
                      <Line yAxisId="pct" type="monotone" dataKey="marginPct" name="Margin %" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] italic mt-2 px-2 text-slate-500">
                Discounts declining (32.4% → 17.4%) while margin holds steady (~70%). Cost improvements are being passed to bottom line, not given away.
              </p>
            </ChartCard>

            {/* 3.4 — Margin Gap Trend (quarterly) */}
            <MarginGapTrend />

            {/* 3.5 — SKU Recommendations */}
            <SkuRecommendationsSection enrichedAll={enrichedAll} recSummary={recSummary} enrichedRecTableData={enrichedRecTableData} selectedItem={selectedItem} selectItem={selectItem} />

            {/* 3.6 — Price Elasticity by Product Type */}
            <ChartCard title="Price Elasticity by Product Type" subtitle="Margin, win rate, and pricing power by product category" confidence="derived">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Product Type</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Avg Margin</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Win Rate</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-slate-600">Pricing Power</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(productTypeElasticity || []).map(p => (
                      <tr key={p.product_type} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-700">{p.product_type}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">{(p.avg_margin * 100).toFixed(1)}%</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`font-bold ${p.win_rate >= 0.45 ? 'text-green-600' : p.win_rate >= 0.35 ? 'text-amber-600' : 'text-red-600'}`}>
                            {(p.win_rate * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            p.pricing_power === 'Strong' ? 'bg-green-100 text-green-700' : p.pricing_power === 'Moderate' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                          }`}>{p.pricing_power}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] italic mt-3 px-2 text-slate-500">
                Pumpenkopf has strong pricing power (74.3% margin, 58.2% win rate). Innenzahnringpumpe faces competitive pressure — different strategy needed.
              </p>
            </ChartCard>
          </div>
        )}

        <PhaseNotice type="derived" />
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PERSISTENT LOSSES ALERT (2.5)
   ══════════════════════════════════════════════════════════════════════════ */
function PersistentLossesAlert() {
  const [expanded, setExpanded] = useState(false);
  const data = persistentLosses || { total_pairs: 0, top_10: [] };

  return (
    <motion.div variants={chartVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}
      className="border-l-4 border-red-400 rounded-xl overflow-hidden"
      style={{ background: '#FEF2F2', boxShadow: shadows.card }}>
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-500" />
            <div>
              <h3 className="font-bold text-sm text-red-800">Persistent Losses Alert</h3>
              <p className="text-[11px] text-red-600 mt-0.5">{data.total_pairs} customer-product pairs quoted multiple times with 0% win rate. Review pricing or stop quoting.</p>
            </div>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="text-[11px] font-semibold text-red-700 hover:text-red-900 flex items-center gap-1">
            {expanded ? 'Hide' : 'Show Top 10'}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-red-200">
                  <th className="text-left py-2 font-semibold text-red-700">Customer</th>
                  <th className="text-left py-2 font-semibold text-red-700">Article</th>
                  <th className="text-right py-2 font-semibold text-red-700">Quotes</th>
                  <th className="text-right py-2 font-semibold text-red-700">Lost Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(data.top_10 || []).map((row, i) => (
                  <tr key={i} className="border-b border-red-100">
                    <td className="py-1.5 font-mono text-red-800">{row.customer}</td>
                    <td className="py-1.5 font-mono text-red-800">{row.article}</td>
                    <td className="py-1.5 text-right font-semibold text-red-700">{row.quotes}</td>
                    <td className="py-1.5 text-right font-bold text-red-800">{formatEUR(row.lost_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MARGIN GAP TREND (3.4) — quarterly with annual toggle
   ══════════════════════════════════════════════════════════════════════════ */
function MarginGapTrend() {
  const { selectItem } = useUI();
  const [viewMode, setViewMode] = useState('quarterly');

  const data = viewMode === 'quarterly' ? qMarginGapData : gapByYearData;
  const xKey = viewMode === 'quarterly' ? 'quarter' : 'year';

  return (
    <ChartCard title="Margin Gap Trend" subtitle="Quoted vs actual margin with gap — canonical pricing accuracy view"
      confidence="derived"
      headerRight={
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden text-[10px] font-semibold" style={{ border: '1px solid #e5e5e5' }}>
            {[['quarterly', 'Quarterly'], ['annual', 'Annual']].map(([key, label]) => (
              <button key={key} onClick={() => setViewMode(key)}
                className={`px-2.5 py-1 transition-colors ${viewMode === key ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs font-medium">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#0393da] rounded-full" /> Quoted</div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#10B981] rounded-full" /> Actual</div>
          </div>
        </div>
      }
    >
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} onClick={s => handleChartContainerClick('Margin Gap', selectItem, data, s)}>
            <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
            <XAxis dataKey={xKey} tick={{ fontSize: viewMode === 'quarterly' ? 9 : 11, fill: '#94a3b8' }} tickLine={false} interval={viewMode === 'quarterly' ? 1 : 0} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" domain={[55, 80]} />
            <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
            <defs>
              <linearGradient id="gapGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Line type="monotone" dataKey="quoted" name="Quoted %" stroke="#0393da" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="actual" name="Actual %" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="gap" name="Gap pp" stroke="#F59E0B" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SKU RECOMMENDATIONS SECTION (3.5)
   ══════════════════════════════════════════════════════════════════════════ */
function SkuRecommendationsSection({ enrichedAll, recSummary, enrichedRecTableData, selectedItem, selectItem }) {
  return (
    <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true }}>
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6" variants={containerVariants}>
        <motion.div variants={cardVariants}>
          <KPICard label="Total Recommendations" value={recSummary.reactiveCount + recSummary.proactiveCount}
            change={`${recSummary.reactiveCount} reactive, ${recSummary.proactiveCount} proactive`} changeType="neutral" confidence="derived"
            bottomContent={<MiniWave color="#0393da" />} />
        </motion.div>
        <motion.div variants={cardVariants}>
          <KPICard label="Critical Count" value={recSummary.criticalCount}
            change={`${recSummary.highCount} high priority`} changeType={recSummary.criticalCount > 0 ? 'negative' : 'neutral'} confidence="derived"
            bottomContent={<MiniProgress value={recSummary.criticalCount} max={Math.max(recSummary.reactiveCount + recSummary.proactiveCount, 1)} color="#EF4444" />} />
        </motion.div>
        <motion.div variants={cardVariants}>
          <KPICard label="Avg Risk Score" value={recSummary.avgRisk}
            change={recSummary.avgRisk >= 70 ? 'Critical range' : recSummary.avgRisk >= 40 ? 'Elevated range' : 'Acceptable range'}
            changeType={recSummary.avgRisk >= 40 ? 'negative' : 'positive'} confidence="derived"
            bottomContent={<MiniProgress value={recSummary.avgRisk} color={recSummary.avgRisk >= 70 ? '#EF4444' : recSummary.avgRisk >= 40 ? '#F59E0B' : '#10b981'} />} />
        </motion.div>
        <motion.div variants={cardVariants}>
          <KPICard label="Revenue at Risk" value={formatEUR(recSummary.revenueAtRisk)}
            change="From reactive recommendations" changeType={recSummary.revenueAtRisk > 0 ? 'negative' : 'neutral'} confidence="derived"
            bottomContent={<MiniWave color="#EF4444" />} />
        </motion.div>
      </motion.div>

      {enrichedRecTableData.length > 0 ? (
        <DataTable title="Top SKU Recommendations (by Risk Score)" columns={enrichedRecColumns}
          data={enrichedRecTableData} rowKey="article_id" confidence="derived"
          selectedRowId={selectedItem?.id}
          onRowClick={row => selectItem({ type: 'article', id: row.article_id || row.sku, label: row.description, data: row })} />
      ) : (
        <motion.div variants={cardVariants} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-8 text-center">
            <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>SKU Recommendations</h3>
            <p className="text-sm text-slate-400 mt-2">No enriched SKU-level recommendations available.</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
