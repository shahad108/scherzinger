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
import { useLanguage } from '../context/LanguageContext';
import { handlePieClick } from '../utils/pageContextResolver';
import data from '../data/dashboard_data.json';
import forecastingData from '../data/forecasting.json';
import customersData from '../data/customers_detail.json';
import pipelineData from '../data/pipeline.json';
import pricingAnalysisData from '../data/pricing_analysis.json';
import { formatEUR } from '../utils/formatters';
import { containerVariants, cardVariants } from '../utils/animations';
import { colors, gradients } from '../utils/designTokensV2';
import { IS_DEMO } from '../utils/brand';
import LiveAlertStrip from '../components/phase45/LiveAlertStrip';
import AnomalyFeedCard from '../components/phase45/AnomalyFeedCard';

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
const buildTopCustomerColumns = (t) => [
  { key: 'name', label: t('dashboard.col.customer') },
  { key: 'revenue_eur', label: t('dashboard.col.revenue'), align: 'right', render: (v) => formatEUR(v) },
  { key: 'db2_margin_avg', label: t('dashboard.col.avgMargin'), align: 'right', render: (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—' },
  {
    key: 'trend',
    label: t('dashboard.col.trend'),
    align: 'center',
    render: (_v, row) => {
      const tr = marginTrendFor(row.risk_tier);
      return <span style={{ color: tr.color, fontWeight: 700, fontSize: 14 }}>{tr.arrow}</span>;
    },
  },
  {
    key: 'risk_tier',
    label: t('dashboard.col.risk'),
    render: (v) => {
      const tierColors = { low: '#10B981', medium: '#F59E0B', high: '#EF4444', critical: '#991B1B' };
      const tierLabel = v ? t(`dashboard.tier.${v}`) : '—';
      return (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: `${tierColors[v] || '#94A3B8'}15`, color: tierColors[v] || '#94A3B8' }}
        >
          {tierLabel}
        </span>
      );
    },
  },
  {
    key: 'revenue_at_risk',
    label: t('dashboard.col.atRisk'),
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

function generateInsights(t) {
  const insights = [];

  const marginDecline = annual2024 && annual2025 ? (annual2025.avg_db2_margin - annual2024.avg_db2_margin) * 100 : 0;
  const revByYear = data.annual_summary.map((y) => ({ name: `FY${y.Year}`, value: y.revenue_eur, margin: +(y.avg_db2_margin * 100).toFixed(1) }));

  insights.push({
    id: 'margin',
    type: t('dashboard.insight.margin.type'),
    badgeColor: 'red',
    icon: AlertCircle,
    severity: Math.abs(marginDecline) > 1 ? 85 : 60,
    summary: (
      <>
        <strong style={{ color: colors.critical, fontWeight: 700 }}>{t('dashboard.insight.margin.summaryStrong', { curr: (annual2025?.avg_db2_margin * 100).toFixed(1) })}</strong>{t('dashboard.insight.margin.summaryRest', { pp: Math.abs(marginDecline).toFixed(1) })}
      </>
    ),
    detail: {
      title: t('dashboard.insight.margin.title', { pp: Math.abs(marginDecline).toFixed(1) }),
      subtitle: t('dashboard.insight.margin.subtitle'),
      metrics: [
        { label: t('dashboard.insight.margin.metric.curr'), value: `${(annual2025?.avg_db2_margin * 100).toFixed(1)}%`, color: colors.critical },
        { label: t('dashboard.insight.margin.metric.yoy'), value: `${marginDecline.toFixed(1)}pp`, color: '#d97706' },
        { label: t('dashboard.insight.margin.metric.4yr'), value: '−3.0pp', change: '63.6% → 60.6%', color: colors.critical },
      ],
      chartTitle: t('dashboard.insight.margin.chartTitle'),
      chartData: revByYear,
      barColor: colors.primary,
      actions: [
        t('dashboard.insight.margin.action.1'),
        t('dashboard.insight.margin.action.2'),
        t('dashboard.insight.margin.action.3'),
        t('dashboard.insight.margin.action.4'),
        t('dashboard.insight.margin.action.5'),
      ],
    },
  });

  const highRiskCount = churnHigh.count;
  const criticalCount = highRiskItems.filter(c => c.risk_level === 'Critical').reduce((s, c) => s + c.count, 0);
  const ltvM = (churnHigh.total_ltv / 1000000).toFixed(2);
  insights.push({
    id: 'customers',
    type: t('dashboard.insight.customers.type'),
    badgeColor: 'orange',
    icon: UserMinus,
    severity: highRiskCount > 30 ? 75 : 50,
    summary: (
      <>
        <strong style={{ fontWeight: 700 }}>{t('dashboard.insight.customers.summaryStrong', { n: highRiskCount })}</strong>{t('dashboard.insight.customers.summaryRest', { crit: criticalCount, ltv: ltvM })}
      </>
    ),
    detail: {
      title: t('dashboard.insight.customers.title', { n: highRiskCount }),
      subtitle: t('dashboard.insight.customers.subtitle', { crit: criticalCount, ltv: ltvM }),
      metrics: [
        { label: t('dashboard.insight.customers.metric.high'), value: highRiskCount, color: '#ea580c' },
        { label: t('dashboard.insight.customers.metric.ltv'), value: `€${ltvM}M`, color: colors.critical },
        { label: t('dashboard.insight.customers.metric.crit'), value: criticalCount, change: t('dashboard.insight.customers.metric.crit.note'), color: colors.critical },
      ],
      chartTitle: t('dashboard.insight.customers.chartTitle'),
      chartData: riskDistribution.map((r) => ({ name: t(`dashboard.tier.${r.tier}`), value: r.count })),
      barColor: '#ea580c',
      actions: [
        t('dashboard.insight.customers.action.1', { n: criticalCount }),
        t('dashboard.insight.customers.action.2'),
        t('dashboard.insight.customers.action.3'),
        t('dashboard.insight.customers.action.4'),
        t('dashboard.insight.customers.action.5'),
      ],
    },
  });

  const totalRev = data.annual_summary.reduce((s, y) => s + y.revenue_eur, 0);
  insights.push({
    id: 'revenue',
    type: t('dashboard.insight.revenue.type'),
    badgeColor: 'green',
    icon: TrendingUp,
    severity: 55,
    summary: (
      <>
        {t('dashboard.insight.revenue.summaryPre')}<strong style={{ fontWeight: 700 }}>{formatEUR(annual2025?.revenue_eur)}</strong>{t('dashboard.insight.revenue.summaryPost', { yoy: (annual2025?.yoy_growth * 100).toFixed(1), total: formatEUR(totalRev) })}
      </>
    ),
    detail: {
      title: t('dashboard.insight.revenue.title'),
      subtitle: t('dashboard.insight.revenue.subtitle'),
      metrics: [
        { label: t('dashboard.insight.revenue.metric.fy25'), value: formatEUR(annual2025?.revenue_eur), color: colors.primary },
        { label: t('dashboard.insight.revenue.metric.yoy'), value: `+${(annual2025?.yoy_growth * 100).toFixed(1)}%`, color: '#10b981' },
        { label: t('dashboard.insight.revenue.metric.total'), value: formatEUR(totalRev), color: colors.primary },
      ],
      chartTitle: t('dashboard.insight.revenue.chartTitle'),
      chartData: revByYear,
      barColor: colors.primary,
      actions: [
        t('dashboard.insight.revenue.action.1'),
        t('dashboard.insight.revenue.action.2'),
        t('dashboard.insight.revenue.action.3'),
        t('dashboard.insight.revenue.action.4'),
      ],
    },
  });

  const forecast = forecastingData.overall_forecast;
  const ensembleModel = Array.isArray(forecastingData.model_accuracy) ? forecastingData.model_accuracy.find(m => m.model === 'ensemble') : null;
  const f3 = (forecast?.forecast_3m?.predicted * 100).toFixed(1);
  const f12 = (forecast?.forecast_12m?.predicted * 100).toFixed(1);
  const fCurr = (forecast?.current_margin * 100).toFixed(1);
  const ensembleMae = ensembleModel?.mae?.toFixed(3) || 'N/A';
  insights.push({
    id: 'forecast',
    type: t('dashboard.insight.forecast.type'),
    badgeColor: 'blue',
    icon: Brain,
    severity: 40,
    summary: (
      <>
        {t('dashboard.insight.forecast.summaryPre')}<strong style={{ color: colors.primary, fontWeight: 700 }}>{f3}%</strong>{t('dashboard.insight.forecast.summaryPost', { p12: f12, mae: ensembleMae })}
      </>
    ),
    detail: {
      title: t('dashboard.insight.forecast.title'),
      subtitle: t('dashboard.insight.forecast.subtitle', { curr: fCurr, p3: f3, p12: f12 }),
      metrics: [
        { label: t('dashboard.insight.forecast.metric.3m'), value: `${f3}%`, color: colors.primary },
        { label: t('dashboard.insight.forecast.metric.12m'), value: `${f12}%`, color: '#10b981' },
        { label: t('dashboard.insight.forecast.metric.acc'), value: `${((ensembleModel?.directional_accuracy || 0) * 100).toFixed(0)}%`, change: t('dashboard.insight.forecast.metric.acc.note', { mae: ((ensembleModel?.mae || 0) * 100).toFixed(2) }), color: colors.primary },
      ],
      chartTitle: t('dashboard.insight.forecast.chartTitle'),
      chartData: [
        { name: t('dashboard.insight.forecast.label.curr'), value: +(forecast?.current_margin * 100).toFixed(1) },
        { name: t('dashboard.insight.forecast.label.3m'), value: +(forecast?.forecast_3m?.predicted * 100).toFixed(1) },
        { name: t('dashboard.insight.forecast.label.6m'), value: +(forecast?.forecast_6m?.predicted * 100).toFixed(1) },
        { name: t('dashboard.insight.forecast.label.12m'), value: +(forecast?.forecast_12m?.predicted * 100).toFixed(1) },
      ],
      barColor: colors.primary,
      actions: [
        t('dashboard.insight.forecast.action.1'),
        t('dashboard.insight.forecast.action.2'),
        t('dashboard.insight.forecast.action.3'),
        t('dashboard.insight.forecast.action.4'),
      ],
    },
  });

  const wonValue = formatEUR(wonStage.value_eur || 0);
  const totalQuotes = data.quote_summary?.total_quotes || 0;
  const winRate = ((data.quote_summary?.win_rate || 0) * 100).toFixed(1);
  const avgDays = pipelineData.avg_days_in_pipeline || 0;
  insights.push({
    id: 'pipeline',
    type: t('dashboard.insight.pipeline.type'),
    badgeColor: 'blue',
    icon: BarChart3,
    severity: 45,
    summary: (
      <>
        <strong style={{ fontWeight: 700 }}>{wonValue}</strong>{t('dashboard.insight.pipeline.summaryRest', { n: totalQuotes, wr: winRate, days: avgDays })}
      </>
    ),
    detail: {
      title: t('dashboard.insight.pipeline.title'),
      subtitle: t('dashboard.insight.pipeline.subtitle', { n: totalQuotes, wr: winRate, days: avgDays }),
      metrics: [
        { label: t('dashboard.insight.pipeline.metric.won'), value: wonValue, color: colors.primary },
        { label: t('dashboard.insight.pipeline.metric.wr'), value: `${winRate}%`, color: '#10b981' },
        { label: t('dashboard.insight.pipeline.metric.cycle'), value: t('dashboard.insight.pipeline.metric.cycle.value', { n: avgDays }), color: '#d97706' },
      ],
      chartTitle: t('dashboard.insight.pipeline.chartTitle'),
      chartData: pipelineStages.filter((s) => s.stage !== 'Won' && s.stage !== 'Lost').map((s) => ({ name: s.stage, value: s.value_eur })),
      horizontal: true,
      barColor: colors.primary,
      actions: [
        t('dashboard.insight.pipeline.action.1', { n: negotiationStage.count || 0 }),
        t('dashboard.insight.pipeline.action.2', { n: quotedStage.count || 0, value: formatEUR(quotedStage.value_eur || 0) }),
        t('dashboard.insight.pipeline.action.3', { n: pipelineData.avg_days_in_pipeline || 53 }),
        t('dashboard.insight.pipeline.action.4'),
      ],
    },
  });

  insights.push({
    id: 'cost',
    type: t('dashboard.insight.cost.type'),
    badgeColor: 'amber',
    icon: Package,
    severity: 40,
    summary: (
      <>
        {t('dashboard.insight.cost.summaryPre')}<strong style={{ fontWeight: 700 }}>{t('dashboard.insight.cost.summaryStrong')}</strong>{t('dashboard.insight.cost.summaryRest')}
      </>
    ),
    detail: {
      title: t('dashboard.insight.cost.title'),
      subtitle: t('dashboard.insight.cost.subtitle'),
      metrics: [
        { label: t('dashboard.insight.cost.metric.trend'), value: t('dashboard.insight.cost.metric.trend.value'), color: '#0393da' },
        { label: t('dashboard.insight.cost.metric.growth'), value: t('dashboard.insight.cost.metric.growth.value'), color: '#d97706' },
        { label: t('dashboard.insight.cost.metric.2025'), value: t('dashboard.insight.cost.metric.2025.value'), color: '#10b981' },
      ],
      chartTitle: t('dashboard.insight.cost.chartTitle'),
      chartData: revByYear,
      barColor: '#d97706',
      actions: [
        t('dashboard.insight.cost.action.1'),
        t('dashboard.insight.cost.action.2'),
        t('dashboard.insight.cost.action.3'),
        t('dashboard.insight.cost.action.4'),
      ],
    },
  });

  return insights.sort((a, b) => b.severity - a.severity);
}

const overallForecast = forecastingData?.overall_forecast;
const forecast3m = overallForecast?.forecast_3m?.predicted;
const forecast12m = overallForecast?.forecast_12m?.predicted;

const buildAiHighlights = (t) => [
  {
    id: 'margin',
    icon: '🔴',
    bg: '#FEF2F2',
    color: '#991B1B',
    text: t('dashboard.hl.margin', { pp: Math.abs(marginChange).toFixed(1) }),
  },
  {
    id: 'customers',
    icon: '🟠',
    bg: '#FFF7ED',
    color: '#9A3412',
    text: t('dashboard.hl.customers', { n: highCriticalCount, rev: (revenueAtRisk / 1000000).toFixed(2) }),
  },
  {
    id: 'forecast',
    icon: '🔵',
    bg: '#EFF6FF',
    color: '#1E40AF',
    text: t('dashboard.hl.forecast', { p3: ((forecast3m ?? 0) * 100).toFixed(1), p12: ((forecast12m ?? 0) * 100).toFixed(1) }),
  },
  {
    id: 'pipeline',
    icon: '🟢',
    bg: '#F0FDF4',
    color: '#166534',
    text: t('dashboard.hl.pipeline'),
  },
  {
    id: 'cost',
    icon: '🟡',
    bg: '#FFFBEB',
    color: '#92400E',
    text: t('dashboard.hl.cost'),
  },
];

export default function DashboardOverviewV2() {
  const { selectItem, openSKUDetail, openCustomerDetail } = useUI();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeInsight, setActiveInsight] = useState(null);
  const [timeRange, setTimeRange] = useState('FY');  // FY | QTD | MTD | Custom
  const lastUpdated = 'Dec 31, 2025 · 18:00 CET';

  const insights = useMemo(() => generateInsights(t), [t]);
  const aiHighlights = useMemo(() => buildAiHighlights(t), [t]);
  const topCustomerColumns = useMemo(() => buildTopCustomerColumns(t), [t]);

  // Derive period-filtered metrics from monthly_revenue (Custom falls back to FY)
  const periodMetrics = useMemo(() => {
    const all2025 = data.monthly_revenue.filter((m) => m.Year === 2025);
    const all2024 = data.monthly_revenue.filter((m) => m.Year === 2024);
    const rangeKey = timeRange === 'Custom' ? 'FY' : timeRange;

    const slices = {
      FY:  { current: all2025,          prior: all2024,          label: t('dashboard.period.fy', { year: 2025 }),  rangeLabel: t('dashboard.range.yoy') },
      QTD: { current: all2025.slice(-3), prior: all2024.slice(-3), label: t('dashboard.period.q4', { year: 2025 }), rangeLabel: t('dashboard.range.vsQ4', { year: 2024 }) },
      MTD: { current: all2025.slice(-1), prior: all2024.slice(-1), label: t('dashboard.period.dec', { year: 2025 }), rangeLabel: t('dashboard.range.vsDec', { year: 2024 }) },
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
  }, [timeRange, t]);

  return (
    <>
      <Header title={t('dashboard.title')} />
      <motion.div
        className="p-8 max-w-[1600px] mx-auto space-y-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {IS_DEMO && <LiveAlertStrip />}
        {/* Global Time-Range Header */}
        <div className="flex items-center justify-between pb-2">
          <div role="group" aria-label={t('dashboard.range.yoy')} className="inline-flex rounded-lg bg-white border border-slate-200 p-1 shadow-sm">
            {[
              { key: 'FY', label: t('dashboard.timeRange.fy') },
              { key: 'QTD', label: t('dashboard.timeRange.qtd') },
              { key: 'MTD', label: t('dashboard.timeRange.mtd') },
              { key: 'Custom', label: t('dashboard.timeRange.custom') },
            ].map((r) => (
              <button
                key={r.key}
                onClick={() => setTimeRange(r.key)}
                aria-pressed={timeRange === r.key}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  timeRange === r.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock size={12} />
            <span>{t('dashboard.lastUpdated', { date: lastUpdated })}</span>
          </div>
        </div>
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            variants={cardVariants}
            onClick={() => openSKUDetail('SKU-1201')}
            className="cursor-pointer hover:ring-2 hover:ring-blue-400/40 rounded transition"
          >
            <KPICardV2
              formulaId="revenue_total"
              confidence="verified"
              label={t('dashboard.kpi.revenue', { period: periodMetrics.label })}
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
          <motion.div
            variants={cardVariants}
            onClick={() => openSKUDetail('SKU-1042')}
            className="cursor-pointer hover:ring-2 hover:ring-blue-400/40 rounded transition"
          >
            <KPICardV2
              formulaId="db2_margin"
              confidence="verified"
              label={t('dashboard.kpi.db2Margin', { period: periodMetrics.label })}
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
          <motion.div
            variants={cardVariants}
            onClick={() => openSKUDetail('SKU-1087')}
            className="cursor-pointer hover:ring-2 hover:ring-blue-400/40 rounded transition"
          >
            <KPICardV2
              formulaId="margin_gap"
              confidence="verified"
              label={t('dashboard.kpi.marginGap')}
              value={currentGapPp.toFixed(1)}
              suffix="pp"
              change={`${gapIsClosing ? '▼' : '▲'}${Math.abs(gapChangePp).toFixed(1)}pp YoY`}
              changeType={gapIsClosing ? 'positive' : 'warning'}
              accentGradient={gradients.tertiary}
              bottomContent={
                <p className="text-[11px] italic" style={{ color: '#737373' }}>
                  {t('dashboard.kpi.gapBottom', {
                    quoted: ((currentGap.avg_quoted_margin ?? 0) * 100).toFixed(1),
                    actual: ((currentGap.avg_actual_margin ?? 0) * 100).toFixed(1),
                    state: gapIsClosing ? t('dashboard.gap.closing') : t('dashboard.gap.widening'),
                  })}
                </p>
              }
            />
          </motion.div>
          <motion.div
            variants={cardVariants}
            onClick={() => openSKUDetail('SKU-1234')}
            className="cursor-pointer hover:ring-2 hover:ring-blue-400/40 rounded transition"
          >
            <KPICardV2
              formulaId="win_rate"
              confidence="verified"
              label={t('dashboard.kpi.winRate')}
              value={`${((data.quote_summary?.win_rate || 0) * 100).toFixed(1)}%`}
              suffix={t('dashboard.kpi.winRate.suffix')}
              accentGradient={gradients.navy}
              bottomContent={
                <p className="text-[11px] italic" style={{ color: '#737373' }}>
                  {t('dashboard.kpi.winBottom', {
                    won: formatEUR(data.quote_summary?.won_revenue_eur || 0),
                    count: (data.quote_summary?.total_quotes || 0).toLocaleString(),
                  })}
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
              label={t('dashboard.alert.marginErosion')}
              value={`${marginChange >= 0 ? '+' : '−'}${Math.abs(marginChange).toFixed(1)}pp`}
              valueColor="#EF4444"
              borderColor="#EF4444"
              iconBg="#FEF2F2"
              iconColor="#EF4444"
              progressPct={75}
              progressColor="#EF4444"
              helperText={t('dashboard.alert.marginErosion.helper')}
              helperColor="#EF4444"
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <AlertCardV2
              icon={UserMinus}
              label={t('dashboard.alert.highRisk')}
              value={String(highCriticalCount)}
              valueColor="#EA580C"
              borderColor="#F97316"
              iconBg="#FFF7ED"
              iconColor="#EA580C"
              progressPct={Math.min(100, Math.round((highCriticalCount / (annual2025?.unique_customers || 411)) * 100))}
              progressColor="#F97316"
              helperText={t('dashboard.alert.highRisk.helper', { revenue: (revenueAtRisk / 1000000).toFixed(2) })}
              helperColor="#EA580C"
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <AlertCardV2
              icon={Package}
              label={t('dashboard.alert.costRegime')}
              value={t('dashboard.alert.plateau')}
              valueColor="#0393da"
              borderColor="#0393da"
              iconBg="#EFF6FF"
              iconColor="#0393da"
              progressPct={45}
              progressColor="#0393da"
              helperText={t('dashboard.alert.costRegime.helper')}
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
              title={t('dashboard.chart.quotedVsActual')}
              subtitle={t('dashboard.chart.quotedVsActual.subtitle', { state: gapIsClosing ? t('dashboard.gap.closing') : t('dashboard.gap.widening') })}
              headerRight={
                <div className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5" style={{ background: colors.primary }} />
                    {t('dashboard.legend.quoted')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5" style={{ background: colors.tertiary }} />
                    {t('dashboard.legend.actual')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.15)' }} />
                    {t('dashboard.legend.gap')}
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
                <span className="text-slate-500">{t('dashboard.gap.current')}</span>
                <span className="font-bold" style={{ color: colors.darkNavy }}>
                  {t('dashboard.gap.summary', {
                    value: currentGapPp.toFixed(1),
                    state: gapIsClosing ? t('dashboard.gap.closing') : t('dashboard.gap.widening'),
                    delta: Math.abs(gapChangePp).toFixed(1),
                  })}
                </span>
              </div>
            </ChartCardV2>
          </div>

          {/* Donut Chart — 1/3 width */}
          <div className="min-w-0">
            <ChartCardV2 formulaId="commodity_group_revenue" confidence="verified" title={t('dashboard.chart.revenueDist')}>
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
                      {t('common.total')}
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
                        {t('dashboard.donut.legend', { pct: c.pct, margin: ((commodityMarginMap[c.name] || 0) * 100).toFixed(0) })}
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
              title={t('dashboard.activity.title', { year: 2025 })}
              items={[
                {
                  icon: FileText,
                  iconBg: '#EFF6FF',
                  iconColor: '#0393da',
                  value: String(newQuoteStage.count || 62),
                  label: t('dashboard.activity.new'),
                },
                {
                  icon: Receipt,
                  iconBg: '#FFF7ED',
                  iconColor: '#F97316',
                  value: String(quotedStage.count || 86),
                  label: t('dashboard.activity.quoted'),
                },
                {
                  icon: CheckCircle,
                  iconBg: '#F0FDF4',
                  iconColor: '#10B981',
                  value: String(wonStage.count || 1684),
                  label: t('dashboard.activity.won'),
                },
                {
                  icon: Truck,
                  iconBg: '#EFF6FF',
                  iconColor: '#0393da',
                  value: formatEUR(wonStage.value_eur || 0),
                  valueSuffix: '',
                  label: t('dashboard.activity.wonRevenue'),
                  highlight: true,
                },
              ]}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <RetentionCardV2
              title={t('dashboard.retention.title')}
              subtitle={t('dashboard.retention.subtitle')}
              value={`${((data.quote_summary?.win_rate || 0) * 100).toFixed(0)}%`}
              yoyChange={t('dashboard.retention.yoy')}
              goal="45%"
              footnote={t('dashboard.retention.footnote')}
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
              {t('dashboard.aiHighlights.title')}
            </h2>
            <button
              onClick={() => navigate('/ai-insights')}
              className="ml-auto text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              {t('dashboard.aiHighlights.full')}
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
                  <span className="text-xs font-semibold" style={{ color: h.color }}>{t('common.viewArrow')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Top Customers Table */}
        <DataTable
          formulaId="top_customers"
          confidence="verified"
          title={t('dashboard.topCustomers.title')}
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
            {t('dashboard.topCustomers.viewAll')}
          </button>
        </div>

        {IS_DEMO && <AnomalyFeedCard />}

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
