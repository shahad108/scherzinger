import { useState } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { Sparkles, AlertTriangle, AlertCircle, UserMinus, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import ChartCard from '../components/shared/ChartCard';
import CustomTooltip from '../components/shared/CustomTooltip';
import data from '../data/dashboard_data.json';
import forecastingData from '../data/forecasting.json';
import customersData from '../data/customers_detail.json';
import { formatEUR, formatPct, formatMonth } from '../utils/formatters';
import { TOOLTIPS, CATEGORY_DESCRIPTIONS } from '../utils/tooltipContent';
import { containerVariants, cardVariants } from '../utils/animations';

const annual2025 = data.annual_summary.find((y) => y.Year === 2025);
const annual2024 = data.annual_summary.find((y) => y.Year === 2024);
const monthlyData = data.monthly_revenue.map((d) => ({
  ...d,
  label: formatMonth(d.Month, d.Year),
}));

const CATEGORY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1', '#64748b'];
const totalCatRevenue = data.commodity_group_revenue.reduce((s, c) => s + c.revenue_eur, 0);
const catData = data.commodity_group_revenue.map((c, i) => ({
  name: c.commodity_group,
  value: c.revenue_eur,
  pct: ((c.revenue_eur / totalCatRevenue) * 100).toFixed(0),
  color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
}));

// Sparkline data from last 8 months of monthly revenue
const sparklineRevenue = data.monthly_revenue.slice(-8).map((d) => d.revenue_eur);

const overallForecast = forecastingData.overall_forecast;
const bestModel = forecastingData.model_accuracy.reduce((best, m) => (m.mae < best.mae ? m : best), forecastingData.model_accuracy[0]);

// Churn data from customers_detail.json
const HIGH_RISK_SEGMENTS = ['High', 'Critical'];
const highRiskChurn = customersData.churn_summary.filter((c) => HIGH_RISK_SEGMENTS.includes(c.risk_level));
const highRiskCount = highRiskChurn.reduce((s, c) => s + c.count, 0);
const highRiskLtv = highRiskChurn.reduce((s, c) => s + c.total_ltv, 0);

// Risk distribution from dashboard_data
const criticalRisk = data.risk_distribution.find((r) => r.tier === 'critical');
const highRisk = data.risk_distribution.find((r) => r.tier === 'high');

const insights = [
  {
    type: 'Forecast Update', color: 'blue', title: `Margin Forecast: ${formatPct(overallForecast.forecast_12m.predicted)} in 12 months`,
    desc: `Ensemble model (MAE ${bestModel.mae}, directional accuracy ${formatPct(bestModel.directional_accuracy, 0)}) predicts margin improvement from ${formatPct(overallForecast.current_margin)} to ${formatPct(overallForecast.forecast_12m.predicted)}.`,
    time: 'Today', action: 'View Forecast',
    detail: `Current DB2 margin is ${formatPct(overallForecast.current_margin)}. 3-month forecast: ${formatPct(overallForecast.forecast_3m.predicted)} (range ${formatPct(overallForecast.forecast_3m.lower)} - ${formatPct(overallForecast.forecast_3m.upper)}). 12-month forecast: ${formatPct(overallForecast.forecast_12m.predicted)} (range ${formatPct(overallForecast.forecast_12m.lower)} - ${formatPct(overallForecast.forecast_12m.upper)}). Monte Carlo simulation shows only ${formatPct(forecastingData.monte_carlo.overall.prob_below_50pct, 0)} probability of margin falling below 50%.`,
    steps: ['Review commodity group margin forecasts on Forecasting page', 'Monitor quarterly actuals vs forecast', 'Focus on BKAES and BKAGG groups with strongest margins', 'Track seasonal patterns - Q4 is historically strongest'],
  },
  {
    type: 'Risk Alert', color: 'amber', title: `${criticalRisk?.count || 5} Critical-Risk Customers Identified`,
    desc: `${criticalRisk?.count || 5} customers at critical risk level (avg score ${criticalRisk?.avg_score || 0.91}). ${highRisk?.count || 33} more at high risk.`,
    time: '1h ago', action: 'Review Risks',
    detail: `Risk distribution: ${data.risk_distribution.map(r => `${r.count} ${r.tier} (${formatPct(r.pct)})`).join(', ')}. Critical-risk customers have an average risk score of ${criticalRisk?.avg_score || 0.91} and require immediate attention to prevent churn.`,
    steps: ['Prioritize outreach to critical-risk customers immediately', 'Review high-risk customer accounts for early intervention', 'Schedule quarterly business reviews with at-risk accounts', 'Develop retention offers for customers showing declining activity'],
  },
  {
    type: 'Margin Alert', color: 'amber', title: `DB2 Margin Trending Down: ${formatPct(annual2025?.avg_db2_margin)}`,
    desc: `Average DB2 margin declined from 63.8% (2023) to ${formatPct(annual2025?.avg_db2_margin)} in 2025. Multiple commodity groups under pressure.`,
    time: '3h ago', action: 'Fix Pricing',
    detail: `Margin has been declining year-over-year: 2022 (63.6%), 2023 (63.8%), 2024 (62.2%), 2025 (${formatPct(annual2025?.avg_db2_margin)}). The weakest commodity groups are OFRLMG (56%) and MBDIV (57%). Strongest are BKAES (71%) and BKAGG (68%). Forecast models suggest gradual recovery to ${formatPct(overallForecast.forecast_12m.predicted)} over 12 months.`,
    steps: ['Review pricing strategy for low-margin commodity groups', 'Implement price adjustments for OFRLMG and MBDIV categories', 'Evaluate cost reduction opportunities across supply chain', 'Set margin floor alerts at 60% early-warning threshold'],
  },
  {
    type: 'Churn Risk', color: 'green', title: `${highRiskCount} High-Risk Customers Flagged`,
    desc: `Churn model identified high-risk and critical customers. Total LTV at risk: ${formatEUR(highRiskLtv)}.`,
    time: '5h ago', action: 'Engage Now',
    detail: `Churn summary: ${customersData.churn_summary.map(c => `${c.count} ${c.risk_level} (LTV ${formatEUR(c.total_ltv)})`).join(', ')}. Top customers like Bosch Rexroth AG (${formatEUR(345000)}) and Siemens AG (${formatEUR(312450)}) remain low-risk, but losing even one enterprise customer has outsized revenue impact.`,
    steps: ['Prioritize outreach to critical-risk customers', 'Prepare win-back offers for high-risk segment', 'Schedule quarterly business reviews with top accounts', 'Diversify customer base to reduce concentration risk'],
  },
  {
    type: 'Seasonal Alert', color: 'blue', title: 'Q4 Seasonal Strength Expected',
    desc: `Seasonal index peaks at ${forecastingData.seasonal_patterns.find(s => s.month === 12)?.seasonal_index}x in December - historically the strongest month. Ensure stock and sales coverage.`,
    time: '1d ago', action: 'Prepare',
    detail: `December has a seasonal index of ${forecastingData.seasonal_patterns.find(s => s.month === 12)?.seasonal_index} (${((forecastingData.seasonal_patterns.find(s => s.month === 12)?.seasonal_index - 1) * 100).toFixed(0)}% above average), making it the strongest revenue month. Last December 2025 revenue was ${formatEUR(data.monthly_revenue.find(m => m.Month === 12 && m.Year === 2025)?.revenue_eur || 614920)}. October-December consistently outperforms other quarters.`,
    steps: ['Pre-position inventory for high-demand commodity groups', 'Activate all sales reps on pipeline deals nearing close', 'Fast-track open quotes in negotiation stage', 'Prepare expedited delivery options for large orders'],
  },
];

const insightBorder = { blue: 'border-l-blue-500', amber: 'border-l-amber-400', green: 'border-l-green-400', slate: 'border-l-slate-400' };
const insightText = { blue: 'text-blue-500', amber: 'text-amber-500', green: 'text-green-500', slate: 'text-slate-500' };

export default function DashboardOverview() {
  const churnHigh = {
    count: highRiskCount,
    total_ltv: highRiskLtv,
  };
  const [expandedInsight, setExpandedInsight] = useState(null);

  // Top customer concentration: top customer revenue / total revenue
  const topCustomerRevenue = data.top_customers[0]?.revenue_eur || 0;
  const totalRevenue = annual2025?.revenue_eur || 1;
  const topCustomerPct = topCustomerRevenue / totalRevenue;

  return (
    <>
      <Header title="Dashboard" />
      <div className="p-8 space-y-8 max-w-[1440px] mx-auto">
        {/* KPI Row */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard label="Revenue YTD 2025" value={formatEUR(annual2025?.revenue_eur)} change={`${annual2025?.yoy_growth >= 0 ? '+' : ''}${formatPct(annual2025?.yoy_growth)}`} changeType={annual2025?.yoy_growth >= 0 ? 'positive' : 'negative'} sparklineData={sparklineRevenue} tooltip={TOOLTIPS.revenue_ytd} />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="DB2 Margin" value={formatPct(annual2025?.avg_db2_margin)} change={`vs ${formatPct(annual2024?.avg_db2_margin)} prior year`} changeType="warning" tooltip={TOOLTIPS.gross_margin} />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Active Customers" value={annual2025?.unique_customers} change={`${annual2025?.invoices} invoices`} changeType="positive" tooltip={TOOLTIPS.active_customers} />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="12m Margin Forecast" value={formatPct(overallForecast.forecast_12m.predicted)} change={`Range: ${formatPct(overallForecast.forecast_12m.lower)} - ${formatPct(overallForecast.forecast_12m.upper)}`} changeType="neutral" tooltip={TOOLTIPS.fy26_forecast_p50} infoTooltip={TOOLTIPS.p10_p90_range} />
          </motion.div>
        </motion.div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          {/* Area Chart */}
          <div className="lg:col-span-6">
            <ChartCard
              title="Monthly Revenue"
              subtitle="Historical performance 2022-2025"
              tooltip={TOOLTIPS.monthly_revenue_trend}
              headerRight={
                <div className="flex items-center gap-2">
                  <span className="w-3 h-1 rounded-full bg-blue-500" />
                  <span className="text-xs font-medium text-slate-600">Actual Revenue</span>
                </div>
              }
            >
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.15} />
                        <stop offset="60%" stopColor="#3b82f6" stopOpacity={0.04} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={5} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip formatter={(v) => formatEUR(v)} />} />
                    <Area type="natural" dataKey="revenue_eur" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} strokeLinecap="round" activeDot={{ r: 4, stroke: '#3b82f6', strokeWidth: 2, fill: 'white' }} animationDuration={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Donut Chart */}
          <div className="lg:col-span-4">
            <ChartCard title="Revenue by Commodity Group" tooltip={TOOLTIPS.category_revenue_mix}>
              <div className="flex flex-col items-center">
                <div className="relative size-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={catData}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={78}
                        dataKey="value"
                        stroke="none"
                        paddingAngle={4}
                        cornerRadius={3}
                        animationDuration={800}
                        animationBegin={200}
                      >
                        {catData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip formatter={(v) => formatEUR(v)} descriptions={CATEGORY_DESCRIPTIONS} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">{formatEUR(totalCatRevenue)}</span>
                    <span className="text-[10px] text-slate-400 uppercase">Total</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-6 w-full">
                  {catData.slice(0, 4).map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className="size-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                      <span className="text-[11px] font-medium text-slate-600 truncate">
                        {c.name} ({c.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>
        </div>

        {/* Status Alerts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl border border-slate-200/80 shadow-sm" style={{ background: '#fafafa' }}>
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
                <AlertTriangle size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Top Customer Share</p>
                <h4 className="text-2xl font-bold">{formatPct(topCustomerPct)}</h4>
              </div>
            </div>
            <div className="mt-4 w-full bg-slate-100 h-1.5 rounded-full">
              <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${Math.min(topCustomerPct * 100 * 5, 100)}%` }} />
            </div>
            <p className="text-[11px] text-amber-600 font-medium mt-2">{data.top_customers[0]?.name} leads revenue</p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-200/80 shadow-sm" style={{ background: '#fafafa' }}>
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-lg bg-red-50 flex items-center justify-center text-red-500">
                <AlertCircle size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Risk Distribution</p>
                <h4 className="text-2xl font-bold text-red-500">{criticalRisk?.count || 0} Critical</h4>
              </div>
            </div>
            <div className="mt-4 flex gap-1">
              <div className="h-1 flex-1 rounded-full bg-red-500" />
              <div className="h-1 flex-1 rounded-full bg-red-500" />
              <div className="h-1 flex-1 rounded-full bg-red-200" />
            </div>
            <p className="text-[11px] text-red-600 font-medium mt-2">{highRisk?.count || 0} high-risk customers need attention</p>
          </div>

          <div className="p-6 rounded-2xl border border-slate-200/80 shadow-sm" style={{ background: '#fafafa' }}>
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-lg bg-rose-50 flex items-center justify-center text-rose-500">
                <UserMinus size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Churn Risk</p>
                <h4 className="text-2xl font-bold">
                  {churnHigh.count} <span className="text-sm font-normal text-slate-400">High Risk</span>
                </h4>
              </div>
            </div>
            <p className="text-[11px] text-rose-600 font-medium mt-5 bg-rose-50 py-1 px-2 rounded-lg inline-block">
              Impact: {formatEUR(churnHigh.total_ltv)} potential loss
            </p>
          </div>
        </div>

        {/* AI Insights */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Sparkles size={20} className="text-blue-500" />
              Recent AI Insights
            </h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={`p-5 rounded-2xl border-l-4 ${insightBorder[ins.color]} border border-slate-200/80`}
                style={{ background: '#fafafa' }}
              >
                <button
                  onClick={() => setExpandedInsight(expandedInsight === i ? null : i)}
                  className="w-full text-left"
                >
                  <div className="flex justify-between mb-3">
                    <span className={`text-[10px] font-bold uppercase ${insightText[ins.color]}`}>{ins.type}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">{ins.time}</span>
                      <ChevronDown
                        size={14}
                        className={`text-slate-400 transition-transform duration-300 ${expandedInsight === i ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </div>
                  <p className="text-sm font-semibold mb-2">{ins.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{ins.desc}</p>
                </button>

                <AnimatePresence>
                  {expandedInsight === i && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-slate-100 pt-4 mt-4 mb-4">
                        <p className="text-xs text-slate-600 leading-relaxed mb-3">{ins.detail}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Recommended Actions</p>
                        <ol className="space-y-1.5">
                          {ins.steps.map((step, j) => (
                            <li key={j} className="text-xs text-slate-600 flex gap-2">
                              <span className="text-slate-400 font-bold flex-shrink-0">{j + 1}.</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <button
                        onClick={() => setExpandedInsight(null)}
                        className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Collapse
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
