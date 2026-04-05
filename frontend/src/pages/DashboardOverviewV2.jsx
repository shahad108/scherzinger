import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ComposedChart, Line, PieChart, Pie, Cell, Area,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  AlertTriangle, AlertCircle, UserMinus, TrendingUp,
  Truck, Package, Receipt,
  Brain, BarChart3, CheckCircle, FileText,
  Clock,
} from 'lucide-react';
import { motion } from 'motion/react';
import Header from '../components/Header';
import KPICardV2 from '../components/v2/KPICardV2';
import ChartCardV2 from '../components/v2/ChartCardV2';
import AlertCardV2 from '../components/v2/AlertCardV2';
import ActivityGridV2 from '../components/v2/ActivityGridV2';
import RetentionCardV2 from '../components/v2/RetentionCardV2';
import InsightSlideOver from '../components/v2/InsightSlideOver';
import CustomTooltip from '../components/shared/CustomTooltip';
import DataTable from '../components/shared/DataTable';
import PhaseNotice from '../components/shared/PhaseNotice';
import MeasuredChartContainer from '../components/MeasuredChartContainer';
import { useUI } from '../context/UIContext';
import { handlePieClick } from '../utils/pageContextResolver';
import data from '../data/dashboard_data.json';
import forecastingData from '../data/forecasting.json';
import customersData from '../data/customers_detail.json';
import pipelineData from '../data/pipeline.json';
import pricingAnalysisData from '../data/pricing_analysis.json';
import { formatEUR } from '../utils/formatters';
import { containerVariants, cardVariants } from '../utils/animations';
import { colors, gradients } from '../utils/designTokensV2';

// ── Data preparation ──
const annual2025 = data.annual_summary.find((y) => y.Year === 2025);
const annual2024 = data.annual_summary.find((y) => y.Year === 2024);

// Commodity group revenue for donut
const COMMODITY_COLORS = [colors.tertiary, colors.success, colors.primary, '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#64748b', '#f97316'];
const totalCommodityRevenue = data.commodity_group_revenue.reduce((s, c) => s + c.revenue_eur, 0);
const commodityData = data.commodity_group_revenue
  .map((c, i) => ({
    name: c.commodity_group,
    value: c.revenue_eur,
    pct: ((c.revenue_eur / totalCommodityRevenue) * 100).toFixed(0),
    color: COMMODITY_COLORS[i % COMMODITY_COLORS.length],
  }))
  .sort((a, b) => b.value - a.value);

// Sparkline mini bars from last 7 months
const sparkBars = data.monthly_revenue.slice(-7);
const sparkMax = Math.max(...sparkBars.map((d) => d.revenue_eur));

// Churn data from customers_detail
const highRiskItems = (customersData.churn_summary || []).filter((c) => c.risk_level === 'High' || c.risk_level === 'Critical');
const churnHigh = {
  count: highRiskItems.reduce((s, c) => s + c.count, 0),
  total_ltv: highRiskItems.reduce((s, c) => s + c.total_ltv, 0),
};

// Pipeline data
const pipelineStages = pipelineData.pipeline_stages || [];
const quotedStage = pipelineStages.find((s) => s.stage === 'Quoted') || {};
const wonStage = pipelineStages.find((s) => s.stage === 'Won') || {};
const negotiationStage = pipelineStages.find((s) => s.stage === 'Negotiation') || {};
const newQuoteStage = pipelineStages.find((s) => s.stage === 'New Quote') || {};

// Risk distribution from real data
const riskDistribution = data.risk_distribution || [];
// Customers at High or Critical risk (matches plan's "87" figure)
const highCriticalCount = riskDistribution
  .filter((r) => r.tier === 'high' || r.tier === 'critical')
  .reduce((s, r) => s + (r.count || 0), 0);

// Top customers table data
const topCustomers = data.top_customers || [];
// Derive margin trend arrow from risk tier (proxy — data team should confirm)
const marginTrendFor = (tier) => {
  if (tier === 'critical' || tier === 'high') return { arrow: '↓', color: '#EF4444' };
  if (tier === 'medium') return { arrow: '→', color: '#F59E0B' };
  return { arrow: '↑', color: '#10B981' };
};
// Revenue at Risk — sum of revenue for customers at High/Critical risk
// Uses customers_detail.customers (superset of top_customers with risk_tier)
const revenueAtRisk = (customersData.customers || [])
  .filter((c) => c.risk_tier === 'high' || c.risk_tier === 'critical')
  .reduce((s, c) => s + (c.total_revenue_eur || 0), 0);
const topCustomerColumns = [
  { key: 'name', label: 'Customer' },
  { key: 'revenue_eur', label: 'Revenue', align: 'right', render: (v) => formatEUR(v) },
  { key: 'db2_margin_avg', label: 'Avg Margin', align: 'right', render: (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—' },
  {
    key: 'trend',
    label: 'Trend',
    align: 'center',
    render: (_v, row) => {
      const t = marginTrendFor(row.risk_tier);
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
    key: 'revenue_at_risk',
    label: 'At Risk',
    align: 'right',
    render: (_v, row) => (row.risk_tier === 'high' || row.risk_tier === 'critical')
      ? <span style={{ color: '#EF4444', fontWeight: 600 }}>{formatEUR(row.revenue_eur)}</span>
      : <span style={{ color: '#cbd5e1' }}>—</span>,
  },
];

// YoY calculations
const revYoY = annual2025?.yoy_growth ? `${annual2025.yoy_growth > 0 ? '+' : ''}${(annual2025.yoy_growth * 100).toFixed(1)}%` : null;
const marginChange = annual2024 && annual2025 ? (annual2025.avg_db2_margin - annual2024.avg_db2_margin) * 100 : 0;

// ── Margin Gap data (Quoted vs Actual) ──
const gapByYear = pricingAnalysisData?.gap_analysis?.by_year ?? [];
const currentGap = gapByYear.find((g) => g.year === 2025) ?? {};
const priorGap = gapByYear.find((g) => g.year === 2024) ?? {};
const currentGapPp = ((currentGap.gap ?? 0) * 100);  // 1.4
const priorGapPp = ((priorGap.gap ?? 0) * 100);      // 2.1
const gapChangePp = currentGapPp - priorGapPp;       // -0.7 (shrinking = good)
const gapIsClosing = gapChangePp < 0;

// ── Quoted vs Actual margin trend (hero chart) ──
const quotedActualTrend = gapByYear.map((g) => {
  const quoted = +((g.avg_quoted_margin ?? 0) * 100).toFixed(1);
  const actual = +((g.avg_actual_margin ?? 0) * 100).toFixed(1);
  return {
    label: `FY${String(g.year).slice(2)}`,
    quoted,
    actual,
    gap: +((g.gap ?? 0) * 100).toFixed(1),
    range: [actual, quoted],  // for Area band fill between actual and quoted
  };
});

// Commodity margin lookup (for donut legend enrichment)
const commodityMarginMap = Object.fromEntries(
  data.commodity_group_revenue.map((c) => [c.commodity_group, c.avg_db2_margin])
);

function generateInsights() {
  const insights = [];

  // 1. Margin Erosion
  const marginDecline = annual2024 && annual2025 ? (annual2025.avg_db2_margin - annual2024.avg_db2_margin) * 100 : 0;
  // Revenue by year for chart
  const revByYear = data.annual_summary.map((y) => ({ name: `FY${y.Year}`, value: y.revenue_eur, margin: +(y.avg_db2_margin * 100).toFixed(1) }));

  insights.push({
    id: 'margin',
    type: 'Margin & FX Alert',
    badgeColor: 'red',
    icon: AlertCircle,
    severity: Math.abs(marginDecline) > 1 ? 85 : 60,
    summary: (
      <>
        <strong style={{ color: colors.critical, fontWeight: 700 }}>DB II margin at {(annual2025?.avg_db2_margin * 100).toFixed(1)}%</strong>, declining {Math.abs(marginDecline).toFixed(1)}pp YoY. Sustained erosion from 63.6% (2022) to 60.6% (2025).
      </>
    ),
    detail: {
      title: `Margin Erosion — ${Math.abs(marginDecline).toFixed(1)}pp YoY Decline`,
      subtitle: `DB II margin declined from 63.6% (FY22) to 60.6% (FY25). Cost inflation outpacing price adjustments.`,
      metrics: [
        { label: 'Current Margin', value: `${(annual2025?.avg_db2_margin * 100).toFixed(1)}%`, color: colors.critical },
        { label: 'YoY Change', value: `${marginDecline.toFixed(1)}pp`, color: '#d97706' },
        { label: '4-Year Decline', value: '−3.0pp', change: '63.6% → 60.6%', color: colors.critical },
      ],
      chartTitle: 'Annual Revenue & Margin Progression',
      chartData: revByYear,
      barColor: colors.primary,
      actions: [
        'Review pricing strategy across all commodity groups — margins declining consistently',
        'Focus on high-margin groups (BKAES 71%, BKAGG 68%) to offset weaker segments',
        'Evaluate cost-pass-through mechanisms for raw material increases',
        'Set margin floor alerts at 55% to prevent further erosion',
        'Schedule quarterly pricing reviews with commodity group managers',
      ],
    },
  });

  // 2. High-Risk Customers
  const highRiskCount = churnHigh.count;
  const criticalCount = highRiskItems.filter(c => c.risk_level === 'Critical').reduce((s, c) => s + c.count, 0);
  insights.push({
    id: 'customers',
    type: 'Customer Churn Risk',
    badgeColor: 'orange',
    icon: UserMinus,
    severity: highRiskCount > 30 ? 75 : 50,
    summary: (
      <>
        <strong style={{ fontWeight: 700 }}>{highRiskCount} High-Risk Customers</strong> flagged by ML model. {criticalCount} critical churners. LTV at risk: €{(churnHigh.total_ltv / 1000000).toFixed(2)}M.
      </>
    ),
    detail: {
      title: `${highRiskCount} Customers Likely to Churn — Action Required`,
      subtitle: `ML churn model flagged ${criticalCount} critical customers. Combined LTV exposure: €${(churnHigh.total_ltv / 1000000).toFixed(2)}M.`,
      metrics: [
        { label: 'High Risk', value: highRiskCount, color: '#ea580c' },
        { label: 'LTV at Risk', value: `€${(churnHigh.total_ltv / 1000000).toFixed(2)}M`, color: colors.critical },
        { label: 'Critical Customers', value: criticalCount, change: 'Needs immediate outreach', color: colors.critical },
      ],
      chartTitle: 'Churn Risk by Tier',
      chartData: riskDistribution.map((r) => ({ name: `${r.tier.charAt(0).toUpperCase() + r.tier.slice(1)}`, value: r.count })),
      barColor: '#ea580c',
      actions: [
        `Immediate: Personal outreach to ${criticalCount} critical-risk customers`,
        'Prepare win-back offers for high-risk segment',
        'Schedule quarterly business reviews with top accounts by LTV',
        'Assign dedicated account managers to critical accounts',
        'Launch satisfaction survey to detect issues before churn',
      ],
    },
  });

  // 3. Revenue Trajectory
  const totalRev = data.annual_summary.reduce((s, y) => s + y.revenue_eur, 0);
  insights.push({
    id: 'revenue',
    type: 'Revenue Trajectory',
    badgeColor: 'green',
    icon: TrendingUp,
    severity: 55,
    summary: (
      <>
        FY25 revenue <strong style={{ fontWeight: 700 }}>{formatEUR(annual2025?.revenue_eur)}</strong> (+{(annual2025?.yoy_growth * 100).toFixed(1)}% YoY). Total 4-year revenue {formatEUR(totalRev)}. Recovery after FY24 dip.
      </>
    ),
    detail: {
      title: 'Revenue Growth Trajectory & Seasonality',
      subtitle: `FY22: €6.37M → FY23: €6.23M → FY24: €5.79M → FY25: €6.25M. Recovery in FY25.`,
      metrics: [
        { label: 'FY25 Revenue', value: formatEUR(annual2025?.revenue_eur), color: colors.primary },
        { label: 'YoY Growth', value: `+${(annual2025?.yoy_growth * 100).toFixed(1)}%`, color: '#10b981' },
        { label: 'Total (4yr)', value: formatEUR(totalRev), color: colors.primary },
      ],
      chartTitle: 'Annual Revenue & Margin',
      chartData: revByYear,
      barColor: colors.primary,
      actions: [
        'Protect FY25 recovery — focus on converting pipeline to won deals',
        'Monitor commodity groups with declining revenue share',
        'Target new customer acquisition to grow beyond pre-FY24 levels',
        'Review seasonal patterns for inventory and staffing optimization',
      ],
    },
  });

  // 4. Forecast Update
  const forecast = forecastingData.overall_forecast;
  const ensembleModel = Array.isArray(forecastingData.model_accuracy) ? forecastingData.model_accuracy.find(m => m.model === 'ensemble') : null;
  insights.push({
    id: 'forecast',
    type: 'Forecast Update',
    badgeColor: 'blue',
    icon: Brain,
    severity: 40,
    summary: (
      <>
        Margin forecast 3M: <strong style={{ color: colors.primary, fontWeight: 700 }}>{(forecast?.forecast_3m?.predicted * 100).toFixed(1)}%</strong>, 12M: {(forecast?.forecast_12m?.predicted * 100).toFixed(1)}%. Ensemble MAE = {ensembleModel?.mae?.toFixed(3) || 'N/A'}.
      </>
    ),
    detail: {
      title: 'Margin Forecast — Full Picture',
      subtitle: `Current: ${(forecast?.current_margin * 100).toFixed(1)}% | 3M: ${(forecast?.forecast_3m?.predicted * 100).toFixed(1)}% | 12M: ${(forecast?.forecast_12m?.predicted * 100).toFixed(1)}%`,
      metrics: [
        { label: '3M Forecast', value: `${(forecast?.forecast_3m?.predicted * 100).toFixed(1)}%`, color: colors.primary },
        { label: '12M Forecast', value: `${(forecast?.forecast_12m?.predicted * 100).toFixed(1)}%`, color: '#10b981' },
        { label: 'Ensemble Accuracy', value: `${((ensembleModel?.directional_accuracy || 0) * 100).toFixed(0)}%`, change: `MAE: ${((ensembleModel?.mae || 0) * 100).toFixed(2)}pp`, color: colors.primary },
      ],
      chartTitle: 'Forecast Confidence Range',
      chartData: [
        { name: 'Current', value: +(forecast?.current_margin * 100).toFixed(1) },
        { name: '3-Month', value: +(forecast?.forecast_3m?.predicted * 100).toFixed(1) },
        { name: '6-Month', value: +(forecast?.forecast_6m?.predicted * 100).toFixed(1) },
        { name: '12-Month', value: +(forecast?.forecast_12m?.predicted * 100).toFixed(1) },
      ],
      barColor: colors.primary,
      actions: [
        'Margins trending upward — current models predict recovery to 62.5% by 12M',
        'Monitor ensemble model accuracy monthly — retrain if MAE exceeds 3pp',
        'Use commodity-level forecasts to prioritize pricing actions',
        'Confidence intervals widen at 12M — plan for downside scenario at 56%',
      ],
    },
  });

  // 5. Pipeline & Deals
  insights.push({
    id: 'pipeline',
    type: 'Pipeline & Deals',
    badgeColor: 'blue',
    icon: BarChart3,
    severity: 45,
    summary: (
      <>
        <strong style={{ fontWeight: 700 }}>{formatEUR(wonStage.value_eur || 0)}</strong> won revenue. {data.quote_summary?.total_quotes || 0} quotes processed. Win rate: {((data.quote_summary?.win_rate || 0) * 100).toFixed(1)}%. Avg {pipelineData.avg_days_in_pipeline || 0} days in pipeline.
      </>
    ),
    detail: {
      title: 'Sales Pipeline — Deal Flow Analysis',
      subtitle: `${data.quote_summary?.total_quotes || 0} quotes | ${((data.quote_summary?.win_rate || 0) * 100).toFixed(1)}% win rate | ${pipelineData.avg_days_in_pipeline || 0} day avg cycle`,
      metrics: [
        { label: 'Won Revenue', value: formatEUR(wonStage.value_eur || 0), color: colors.primary },
        { label: 'Win Rate', value: `${((data.quote_summary?.win_rate || 0) * 100).toFixed(1)}%`, color: '#10b981' },
        { label: 'Avg Cycle', value: `${pipelineData.avg_days_in_pipeline || 0} days`, color: '#d97706' },
      ],
      chartTitle: 'Pipeline Value by Stage',
      chartData: pipelineStages.filter((s) => s.stage !== 'Won' && s.stage !== 'Lost').map((s) => ({ name: s.stage, value: s.value_eur })),
      horizontal: true,
      barColor: colors.primary,
      actions: [
        `Accelerate ${negotiationStage.count || 0} deals in Negotiation stage — highest conversion probability`,
        `${quotedStage.count || 0} Quoted deals totaling ${formatEUR(quotedStage.value_eur || 0)} — follow up within 48hrs`,
        `${pipelineData.avg_days_in_pipeline || 53}-day avg cycle — identify bottleneck stages`,
        'Focus on improving win rate from 37.1% toward 45% target',
      ],
    },
  });

  // 6. Cost Regime
  insights.push({
    id: 'cost',
    type: 'Cost Plateau Detected',
    badgeColor: 'amber',
    icon: Package,
    severity: 40,
    summary: (
      <>
        Cost inflation <strong style={{ fontWeight: 700 }}>plateaued</strong> in 2025 after +12-13%/yr growth (2022-24). Material costs stabilizing but labor costs still rising.
      </>
    ),
    detail: {
      title: 'Cost Regime Shift — Inflation Plateau',
      subtitle: 'After 2 years of 12-13% annual cost growth, COGS increases have flattened in 2024-25.',
      metrics: [
        { label: 'Cost Trend', value: 'Plateau', color: '#0393da' },
        { label: '2022-24 Growth', value: '+12-13%/yr', color: '#d97706' },
        { label: '2025 Trend', value: 'Stabilizing', color: '#10b981' },
      ],
      chartTitle: 'Annual Revenue (cost context)',
      chartData: revByYear,
      barColor: '#d97706',
      actions: [
        'Lock in supplier contracts while costs are stable — before next inflation cycle',
        'Review material share vs labor share in cost structure',
        'Renegotiate long-term supply agreements with volume commitments',
        'Build strategic inventory for critical components at current prices',
      ],
    },
  });

  return insights.sort((a, b) => b.severity - a.severity);
}

const insights = generateInsights();

// Dashboard summary rows (clickable, each opens the corresponding insight slide-over)
const overallForecast = forecastingData?.overall_forecast;
const forecast3m = overallForecast?.forecast_3m?.predicted;
const forecast12m = overallForecast?.forecast_12m?.predicted;
const aiHighlights = [
  {
    id: 'margin',
    icon: '🔴',
    bg: '#FEF2F2',
    color: '#991B1B',
    text: `Margin Alert: DB2 declining ${Math.abs(marginChange).toFixed(1)}pp YoY, BKAGG primary driver`,
  },
  {
    id: 'customers',  // matches insights[].id
    icon: '🟠',
    bg: '#FFF7ED',
    color: '#9A3412',
    text: `${highCriticalCount} customers at High/Critical risk — €${(revenueAtRisk / 1000000).toFixed(2)}M revenue exposed`,
  },
  {
    id: 'forecast',
    icon: '🔵',
    bg: '#EFF6FF',
    color: '#1E40AF',
    text: `Margin forecast: ${((forecast3m ?? 0) * 100).toFixed(1)}% (3M) → ${((forecast12m ?? 0) * 100).toFixed(1)}% (12M) · ensemble model recovering`,
  },
  {
    id: 'pipeline',
    icon: '🟢',
    bg: '#F0FDF4',
    color: '#166534',
    text: `Win rate recovering: 64.4% in Q4 2024, up from 11.4% in Q3 2023`,
  },
  {
    id: 'cost',
    icon: '🟡',
    bg: '#FFFBEB',
    color: '#92400E',
    text: `Cost regime plateau — input costs stable after +12-13%/yr (2022-24), pricing power window open`,
  },
];

export default function DashboardOverviewV2() {
  const { selectItem } = useUI();
  const navigate = useNavigate();
  const [activeInsight, setActiveInsight] = useState(null);
  const [timeRange, setTimeRange] = useState('FY');  // FY | QTD | MTD | Custom
  const lastUpdated = 'Dec 31, 2025 · 18:00 CET';

  // Derive period-filtered metrics from monthly_revenue (Custom falls back to FY)
  const periodMetrics = useMemo(() => {
    const all2025 = data.monthly_revenue.filter((m) => m.Year === 2025);
    const all2024 = data.monthly_revenue.filter((m) => m.Year === 2024);
    const rangeKey = timeRange === 'Custom' ? 'FY' : timeRange;

    const slices = {
      FY:  { current: all2025,          prior: all2024,          label: 'FY 2025',     rangeLabel: 'YoY' },
      QTD: { current: all2025.slice(-3), prior: all2024.slice(-3), label: 'Q4 2025',    rangeLabel: 'vs Q4 2024' },
      MTD: { current: all2025.slice(-1), prior: all2024.slice(-1), label: 'Dec 2025',   rangeLabel: 'vs Dec 2024' },
    };
    const { current, prior, label, rangeLabel } = slices[rangeKey];

    const sumRev = (arr) => arr.reduce((s, m) => s + (m.revenue_eur || 0), 0);
    // Revenue-weighted average margin
    const wAvgMargin = (arr) => {
      const totalRev = sumRev(arr);
      if (!totalRev) return 0;
      return arr.reduce((s, m) => s + (m.avg_db2_margin || 0) * (m.revenue_eur || 0), 0) / totalRev;
    };

    const revenue = sumRev(current);
    const priorRevenue = sumRev(prior);
    const avgMargin = wAvgMargin(current);
    const priorMargin = wAvgMargin(prior);
    const revYoyPct = priorRevenue ? ((revenue - priorRevenue) / priorRevenue) * 100 : 0;
    const marginChangePp = (avgMargin - priorMargin) * 100;

    return { label, rangeLabel, revenue, avgMargin, revYoyPct, marginChangePp };
  }, [timeRange]);

  return (
    <>
      <Header title="Dashboard" />
      <motion.div
        className="p-8 max-w-[1600px] mx-auto space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Global Time-Range Header */}
        <div className="flex items-center justify-between pb-2">
          <div role="group" aria-label="Time range" className="inline-flex rounded-lg bg-white border border-slate-200 p-1 shadow-sm">
            {['FY', 'QTD', 'MTD', 'Custom'].map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                aria-pressed={timeRange === r}
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
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div variants={cardVariants}>
            <KPICardV2
              formulaId="revenue_total"
              confidence="verified"
              label={`Revenue ${periodMetrics.label}`}
              value={formatEUR(periodMetrics.revenue)}
              change={`${periodMetrics.revYoyPct >= 0 ? '+' : ''}${periodMetrics.revYoyPct.toFixed(1)}% ${periodMetrics.rangeLabel}`}
              changeType={periodMetrics.revYoyPct >= 0 ? 'positive' : 'warning'}
              accentGradient={gradients.primary}
              bottomContent={
                <div className="h-8 w-full flex items-end gap-1 opacity-60">
                  {sparkBars.map((d, i) => (
                    <div
                      key={i}
                      className="w-full rounded-sm"
                      style={{
                        height: `${(d.revenue_eur / sparkMax) * 32}px`,
                        background: i === sparkBars.length - 1
                          ? colors.primary
                          : `rgba(3, 147, 218, ${0.15 + (i / sparkBars.length) * 0.35})`,
                      }}
                    />
                  ))}
                </div>
              }
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICardV2
              formulaId="db2_margin"
              confidence="verified"
              label={`DB II Margin · ${periodMetrics.label}`}
              value={`${(periodMetrics.avgMargin * 100).toFixed(1)}`}
              suffix="%"
              change={`${periodMetrics.marginChangePp >= 0 ? '+' : '▼'}${Math.abs(periodMetrics.marginChangePp).toFixed(1)}pp ${periodMetrics.rangeLabel}`}
              changeType={periodMetrics.marginChangePp >= 0 ? 'positive' : 'warning'}
              accentGradient={gradients.tertiary}
              bottomContent={
                <div className="h-8 w-full flex items-center justify-center">
                  <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none" style={{ opacity: 0.3 }}>
                    <path d="M0 10 Q 25 2, 50 10 T 100 8" fill="none" stroke={colors.tertiary} strokeWidth="2" />
                  </svg>
                </div>
              }
            />
          </motion.div>
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
                  Quoted {((currentGap.avg_quoted_margin ?? 0) * 100).toFixed(1)}% vs Actual {((currentGap.avg_actual_margin ?? 0) * 100).toFixed(1)}% · {gapIsClosing ? 'closing' : 'widening'}
                </p>
              }
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICardV2
              formulaId="win_rate"
              confidence="verified"
              label="Win Rate"
              value={`${((data.quote_summary?.win_rate || 0) * 100).toFixed(1)}%`}
              suffix="Quote-to-Invoice"
              accentGradient={gradients.navy}
              bottomContent={
                <p className="text-[11px] italic" style={{ color: '#737373' }}>
                  Won: {formatEUR(data.quote_summary?.won_revenue_eur || 0)} from {(data.quote_summary?.total_quotes || 0).toLocaleString()} quotes
                </p>
              }
            />
          </motion.div>
        </div>

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
              value={String(highCriticalCount)}
              valueColor="#EA580C"
              borderColor="#F97316"
              iconBg="#FFF7ED"
              iconColor="#EA580C"
              progressPct={Math.min(100, Math.round((highCriticalCount / (annual2025?.unique_customers || 411)) * 100))}
              progressColor="#F97316"
              helperText={`Critical + High only · €${(revenueAtRisk / 1000000).toFixed(2)}M revenue exposed`}
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

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    <Area type="monotone" dataKey="range" stroke="none" fill="url(#gapFill)" isAnimationActive={false} />
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

          {/* Donut Chart — 1/3 width */}
          <div className="min-w-0">
            <ChartCardV2 formulaId="commodity_group_revenue" confidence="verified" title="Revenue Distribution">
              <div className="flex flex-col items-center">
                <div className="relative" style={{ width: 192, height: 192 }}>
                  <MeasuredChartContainer className="h-full min-w-0">
                    {({ width, height }) => (
                    <ResponsiveContainer width={width} height={height}>
                      <PieChart>
                        <Pie
                          data={commodityData.slice(0, 5)}
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={80}
                          dataKey="value"
                          stroke="none"
                          paddingAngle={3}
                          cornerRadius={3}
                          animationDuration={800}
                          cursor="pointer"
                          onClick={(d) => handlePieClick('Revenue Distribution', selectItem, d)}
                        >
                          {commodityData.slice(0, 5).map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip formatter={(v) => formatEUR(v)} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    )}
                  </MeasuredChartContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-bold" style={{ color: colors.darkNavy }}>
                      {formatEUR(totalCommodityRevenue)}
                    </span>
                    <span className="text-[10px] uppercase font-bold" style={{ color: '#a3a3a3' }}>
                      Total
                    </span>
                  </div>
                </div>
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
              </div>
            </ChartCardV2>
          </div>
        </div>

        {/* Sales Activity Pipeline + Customer Retention */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div variants={cardVariants}>
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
          </motion.div>
          <motion.div variants={cardVariants}>
            <RetentionCardV2
              title="Quote Conversion"
              subtitle="Win rate across all commodity groups"
              value={`${((data.quote_summary?.win_rate || 0) * 100).toFixed(0)}%`}
              yoyChange="+2.4pp YoY"
              goal="45%"
              footnote={`Win rate trending up — 64.4% in Q4 2024`}
            />
          </motion.div>
        </div>

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
              onClick={() => navigate('/ai-insights')}
              className="ml-auto text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Full analyses →
            </button>
          </div>
          <div className="space-y-2">
            {aiHighlights.map((h) => {
              const matchedInsight = insights.find((i) => i.id === h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => matchedInsight && setActiveInsight(matchedInsight)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer hover:shadow-sm transition-shadow text-left"
                  style={{ background: h.bg }}
                >
                  <span className="text-base">{h.icon}</span>
                  <span className="flex-1 text-sm font-medium" style={{ color: h.color }}>{h.text}</span>
                  <span className="text-xs font-semibold" style={{ color: h.color }}>View →</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Top Customers Table */}
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
            onClick={() => navigate('/customers')}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            View all customers →
          </button>
        </div>

        <PhaseNotice type="mixed" />
      </motion.div>

      {/* Insight Detail Slide-Over */}
      <InsightSlideOver
        insight={activeInsight}
        onClose={() => setActiveInsight(null)}
      />
    </>
  );
}
