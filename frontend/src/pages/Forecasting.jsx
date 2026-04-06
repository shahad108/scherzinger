import { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Area, BarChart, Bar, LineChart, LabelList, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  Legend,
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants, chartVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniProgress, MiniRange } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import CustomTooltip from '../components/shared/CustomTooltip';
import forecastingData from '../data/forecasting.json';
import pipelineData from '../data/pipeline.json';
import { formatEUR } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { handleChartContainerClick } from '../utils/pageContextResolver';
import { track } from '../utils/tracker';
import { TrendingDown, TrendingUp, ChevronDown, ChevronUp, Bell, BarChart3, Users, FlaskConical } from 'lucide-react';
import { colors, shadows, radius } from '../utils/designTokensV2';

/* ── Data references ── */
const quarterlyMargins = forecastingData.quarterly_margins;
const quarterlyRevenue = forecastingData.quarterly_revenue;
const costTrajectory = forecastingData.cost_trajectory;
const commodityQuarterly = forecastingData.commodity_quarterly_margins;
const seasonalPatterns = forecastingData.seasonal_patterns;
const revenueProjections = forecastingData.revenue_projections;
const pipelineSummary = forecastingData.pipeline_summary;
const assumptions = forecastingData.assumptions;
const dataThrough = forecastingData.data_through;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── Helper: Weighted Moving Average ── */
function computeWMA(data, window = 4) {
  if (data.length < window) return [];
  const weights = Array.from({ length: window }, (_, i) => i + 1);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const result = [];
  for (let i = window - 1; i < data.length; i++) {
    let val = 0;
    for (let j = 0; j < window; j++) {
      val += data[i - window + 1 + j].margin * weights[j];
    }
    result.push({ ...data[i], wma: val / wSum });
  }
  return result;
}

/* ── Helper: Simple linear slope (pp per year) ── */
function computeSlope(data) {
  const n = data.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = data.reduce((s, d) => s + d.margin, 0) / n;
  let num = 0, den = 0;
  data.forEach((d, i) => {
    num += (i - meanX) * (d.margin - meanY);
    den += (i - meanX) ** 2;
  });
  const slopePerQ = num / den;
  return slopePerQ * 4; // per year (4 quarters)
}

/* ── Helper: Project WMA forward ── */
function projectWMA(wmaValues, quarters = 4) {
  const last4 = wmaValues.slice(-4);
  const projected = [];
  const buffer = [...last4.map(v => v.wma)];
  const weights = [1, 2, 3, 4];
  const wSum = 10;

  for (let q = 1; q <= quarters; q++) {
    let val = 0;
    for (let j = 0; j < 4; j++) {
      val += buffer[buffer.length - 4 + j] * weights[j];
    }
    const wma = val / wSum;
    buffer.push(wma);
    projected.push({
      label: `2025-Q${q}`,
      margin: null,
      wma,
      projected: true,
      uncertainty: q * 0.8, // widening band in pp
    });
  }
  return projected;
}

/* ── Year range filter options ── */
const YEAR_RANGES = [
  { label: 'Last 2Y', startYear: 2023 },
  { label: 'Last 3Y', startYear: 2022 },
  { label: 'All', startYear: 0 },
];

export default function Forecasting() {
  const { selectItem } = useUI();
  const [yearRange, setYearRange] = useState('Last 3Y');
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  const startYear = YEAR_RANGES.find(r => r.label === yearRange)?.startYear || 0;

  /* ── Filter data by year range ── */
  const filteredMargins = useMemo(() =>
    quarterlyMargins.filter(d => d.year >= startYear),
    [startYear]
  );

  const filteredRevenue = useMemo(() =>
    quarterlyRevenue.filter(d => d.year >= startYear),
    [startYear]
  );

  const filteredCosts = useMemo(() =>
    costTrajectory.filter(d => d.year >= startYear),
    [startYear]
  );

  /* ── KPI Calculations ── */
  const trailing4Q = useMemo(() => {
    const last4 = quarterlyMargins.slice(-4);
    return last4.reduce((s, d) => s + d.margin, 0) / last4.length;
  }, []);

  const prior4Q = useMemo(() => {
    const prior = quarterlyMargins.slice(-8, -4);
    return prior.reduce((s, d) => s + d.margin, 0) / prior.length;
  }, []);

  const trailing4QRevenue = useMemo(() => {
    const last4 = quarterlyRevenue.slice(-4);
    return last4.reduce((s, d) => s + d.revenue, 0);
  }, []);

  const prior4QRevenue = useMemo(() => {
    const prior = quarterlyRevenue.slice(-8, -4);
    return prior.reduce((s, d) => s + d.revenue, 0);
  }, []);

  const annualizedRevenue = trailing4QRevenue;
  const priorAnnualizedRevenue = prior4QRevenue;

  const marginSlope = useMemo(() => computeSlope(quarterlyMargins), []);
  const marginSlopePP = +(marginSlope * 100).toFixed(1);

  // Calculate when margin reaches 60% at current trajectory
  const quartersTo60 = useMemo(() => {
    const currentAvg = trailing4Q * 100;
    if (marginSlopePP >= 0 || currentAvg <= 60) return null;
    return Math.ceil((currentAvg - 60) / Math.abs(marginSlopePP) * 4);
  }, [trailing4Q, marginSlopePP]);

  const crossDate = useMemo(() => {
    if (!quartersTo60) return null;
    const now = new Date(dataThrough);
    now.setMonth(now.getMonth() + quartersTo60 * 3);
    const qtr = Math.ceil((now.getMonth() + 1) / 3);
    return `${now.getFullYear()}-Q${qtr}`;
  }, [quartersTo60]);

  /* ── Row 4: Margin Trajectory Chart Data ── */
  const marginTrajectoryData = useMemo(() => {
    const wma = computeWMA(filteredMargins, 4);
    const historical = filteredMargins.map(d => {
      const wmaEntry = wma.find(w => w.label === d.label);
      return {
        label: d.label,
        margin: +(d.margin * 100).toFixed(1),
        wma: wmaEntry ? +(wmaEntry.wma * 100).toFixed(1) : null,
        projected: false,
      };
    });
    const projected = projectWMA(wma).map(p => ({
      label: p.label,
      margin: null,
      wma: +(p.wma * 100).toFixed(1),
      projected: true,
      upper: +((p.wma + p.uncertainty / 100) * 100).toFixed(1),
      lower: +((p.wma - p.uncertainty / 100) * 100).toFixed(1),
      band: [+((p.wma - p.uncertainty / 100) * 100).toFixed(1), +((p.wma + p.uncertainty / 100) * 100).toFixed(1)],
    }));
    return [...historical, ...projected];
  }, [filteredMargins]);

  /* ── Row 5L: Commodity Group Trajectories ── */
  const commodityTrajectoryData = useMemo(() => {
    const labels = (commodityQuarterly.BKAES || [])
      .filter(d => d.year >= startYear)
      .map(d => d.label);
    return labels.map((label, i) => {
      const entry = { label };
      Object.entries(commodityQuarterly).forEach(([group, data]) => {
        const filtered = data.filter(d => d.year >= startYear);
        if (filtered[i]) {
          entry[group] = +(filtered[i].margin * 100).toFixed(1);
        }
      });
      return entry;
    });
  }, [startYear]);

  /* ── Row 5R: Enhanced Seasonal ── */
  const seasonalData = useMemo(() =>
    seasonalPatterns.map(s => ({
      month: MONTH_NAMES[s.month - 1],
      expected: s.seasonal_index,
      actual: s.recent_actual,
      deviation: +((s.recent_actual - s.seasonal_index) * 100).toFixed(1),
      fill: s.seasonal_index >= 1.02 ? '#10B981' : s.seasonal_index < 0.97 ? '#EF4444' : '#94A3B8',
    })),
    []
  );

  /* ── Row 6: Cost Trajectory ── */
  const costChartData = useMemo(() =>
    filteredCosts.map(d => ({
      label: d.label,
      material: d.material_pct,
      directMfg: d.direct_mfg_pct,
      fullMfg: d.full_mfg_pct,
    })),
    [filteredCosts]
  );

  // Cost projections (simple 4Q extension using last 4Q trend)
  const costProjectionData = useMemo(() => {
    const last4 = costTrajectory.slice(-4);
    const materialSlope = (last4[3].material_pct - last4[0].material_pct) / 3;
    const directSlope = (last4[3].direct_mfg_pct - last4[0].direct_mfg_pct) / 3;
    const fullSlope = (last4[3].full_mfg_pct - last4[0].full_mfg_pct) / 3;
    return [1, 2, 3, 4].map(q => ({
      label: `2025-Q${q}`,
      material: +(last4[3].material_pct + materialSlope * q).toFixed(1),
      directMfg: +(last4[3].direct_mfg_pct + directSlope * q).toFixed(1),
      fullMfg: +(last4[3].full_mfg_pct + fullSlope * q).toFixed(1),
      projected: true,
    }));
  }, []);

  const fullCostData = useMemo(() => {
    const data = costChartData.map((d, i) => {
      const isLast = i === costChartData.length - 1;
      return {
        ...d,
        // Bridge: last historical point also gets projected keys so dashed lines connect
        materialProj: isLast ? d.material : null,
        directMfgProj: isLast ? d.directMfg : null,
        fullMfgProj: isLast ? d.fullMfg : null,
      };
    });
    const projected = costProjectionData.map(d => ({
      label: d.label,
      material: null,
      directMfg: null,
      fullMfg: null,
      materialProj: d.material,
      directMfgProj: d.directMfg,
      fullMfgProj: d.fullMfg,
      projected: true,
    }));
    return [...data, ...projected];
  }, [costChartData, costProjectionData]);

  /* ── Row 7: Revenue Projection ── */
  const revenueChartData = useMemo(() => {
    const historical = filteredRevenue.map(d => ({
      label: d.label,
      revenue: d.revenue,
      projected: false,
    }));
    const projected = revenueProjections.map(d => ({
      label: d.label,
      revenue: d.projection,
      lower: d.lower,
      upper: d.upper,
      band: [d.lower, d.upper],
      projected: true,
    }));
    return [...historical, ...projected];
  }, [filteredRevenue]);

  const marginDiff = +((trailing4Q - prior4Q) * 100).toFixed(1);
  const revYoY = (((annualizedRevenue - priorAnnualizedRevenue) / priorAnnualizedRevenue) * 100).toFixed(1);

  return (
    <>
      <Header title="Forecasting" />
      <div className="p-8 space-y-6 max-w-[1440px] mx-auto">

        {/* ── Global Header: Year Range + Freshness ── */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: colors.surfaceContainerLow }}>
            {YEAR_RANGES.map(r => (
              <button
                key={r.label}
                onClick={() => setYearRange(r.label)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  yearRange === r.label
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-xs font-medium" style={{ color: '#737373' }}>
            Data through: <span className="font-bold text-slate-700">{new Date(dataThrough).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </p>
        </div>

        {/* ── Row 1: KPI Cards ── */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* KPI 1: Trailing 4Q DB2 Margin */}
          <motion.div variants={cardVariants}>
            <KPICard
              label="Trailing 4Q DB2 Margin"
              value={`${(trailing4Q * 100).toFixed(1)}%`}
              change={`vs 4Q prior: ${(prior4Q * 100).toFixed(1)}% ${marginDiff >= 0 ? '▲' : '▼'}${Math.abs(marginDiff)}pp`}
              changeType={marginDiff >= 0 ? 'positive' : 'negative'}
              infoTooltip="Weighted average of most recent 4 quarters of DB2 margin"
              formulaId="forecast_margin"
              confidence="verified"
              bottomContent={<MiniProgress value={trailing4Q * 100} max={100} color={colors.primary} />}
            />
          </motion.div>

          {/* KPI 2: Revenue Run Rate */}
          <motion.div variants={cardVariants}>
            <KPICard
              label="Revenue Run Rate"
              value={formatEUR(annualizedRevenue)}
              change={`vs prior year: ${revYoY >= 0 ? '+' : ''}${revYoY}%`}
              changeType={Number(revYoY) >= 0 ? 'positive' : 'negative'}
              infoTooltip="Trailing 4-quarter total revenue, annualized"
              confidence="verified"
              bottomContent={<MiniRange text="Trailing 4Q annualized" />}
            />
          </motion.div>

          {/* KPI 3: Open Pipeline (Expected) */}
          <motion.div variants={cardVariants}>
            <KPICard
              label="Open Pipeline (Expected)"
              value={`${formatEUR(pipelineSummary.open_value)} open`}
              change={`Expected: ${formatEUR(pipelineSummary.expected_value)} (${(pipelineSummary.win_rate * 100).toFixed(1)}% win rate)`}
              changeType="neutral"
              infoTooltip="Open pipeline value x trailing win rate = expected revenue"
              formulaId="pipeline_stages"
              confidence="derived"
              bottomContent={
                <div className="flex gap-3 text-[10px]" style={{ color: '#737373' }}>
                  <span>30d: {formatEUR(pipelineSummary.closing_horizons['30d'].expected)}</span>
                  <span>60d: {formatEUR(pipelineSummary.closing_horizons['60d'].expected)}</span>
                  <span>90d: {formatEUR(pipelineSummary.closing_horizons['90d'].expected)}</span>
                </div>
              }
            />
          </motion.div>

          {/* KPI 4: Margin Trend */}
          <motion.div variants={cardVariants}>
            <KPICard
              label="Margin Trend"
              value={`${marginSlopePP >= 0 ? '▲' : '▼'}${Math.abs(marginSlopePP)}pp/yr`}
              change={crossDate ? `At current trajectory, margin reaches 60% by ${crossDate}` : 'Margin stable above 60%'}
              changeType={marginSlopePP >= 0 ? 'positive' : 'warning'}
              infoTooltip="Simple slope computed from 12 quarters of DB2 margin data"
              confidence="derived"
              bottomContent={<MiniRange text={`Slope over ${quarterlyMargins.length} quarters`} />}
            />
          </motion.div>
        </motion.div>

        {/* ── Row 2: Quote-to-Revenue Bridge ── */}
        <motion.div
          variants={chartVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          style={{
            background: colors.surface,
            borderRadius: radius.card,
            boxShadow: shadows.card,
            padding: '1.5rem 2rem',
          }}
        >
          <h3 className="font-bold text-sm mb-3" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
            Quote-to-Revenue Bridge
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Open Quotes</span>
              <span className="text-lg font-bold" style={{ color: colors.darkNavy }}>{formatEUR(pipelineSummary.open_value)}</span>
            </div>
            <span className="text-slate-300 text-lg font-light">&times;</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Win Rate</span>
              <span className="text-lg font-bold" style={{ color: colors.darkNavy }}>{(pipelineSummary.win_rate * 100).toFixed(1)}%</span>
            </div>
            <span className="text-slate-300 text-lg font-light">&times;</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Avg Margin</span>
              <span className="text-lg font-bold" style={{ color: colors.darkNavy }}>{(pipelineSummary.avg_margin * 100).toFixed(1)}%</span>
            </div>
            <span className="text-slate-300 text-lg font-light">=</span>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: `${colors.primary}10` }}>
              <span className="text-xs font-medium" style={{ color: colors.primary }}>Expected Gross Profit</span>
              <span className="text-xl font-bold" style={{ color: colors.primary }}>~{formatEUR(pipelineSummary.expected_gross_profit)}</span>
            </div>
          </div>
          <p className="text-[11px] mt-2" style={{ color: '#a3a3a3' }}>
            What the current pipeline is worth in margin terms. Updates live as quotes move.
          </p>
        </motion.div>

        {/* ── Row 3: Info Banner ── */}
        <div className="flex items-start gap-3 px-5 py-4 bg-[#c1e8ff]/20 rounded-2xl text-xs leading-relaxed">
          <div className="size-7 bg-[#0393da] text-white rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">i</div>
          <p className="text-slate-600">
            <span className="font-bold text-slate-800">DB2 margin has declined ~{Math.abs(marginSlopePP)}pp/year over 3 years.</span>{' '}
            {crossDate && <>At this rate, margin reaches the 60% floor by {crossDate}. </>}
            Primary driver: rising full manufacturing cost ({costTrajectory[0].full_mfg_pct}% &rarr; {costTrajectory[costTrajectory.length - 1].full_mfg_pct}% of revenue).
            Material costs are stabilizing, but fixed overhead allocation is growing &mdash; investigate capacity utilization.
          </p>
        </div>

        {/* ── Row 4: Margin Trajectory (full width) ── */}
        <ChartCard
          title="Margin Trend Projection"
          subtitle="Historical quarterly DB2 margin with weighted moving average projection"
          tooltip={TOOLTIPS.forecast_vs_actuals}
          formulaId="forecast_margin"
          confidence="derived"
          headerRight={
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400" /> Actual</div>
              <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#0393da] block" /> WMA Trend</div>
              <div className="flex items-center gap-1.5"><span className="w-4 h-3 bg-[#c1e8ff] block rounded" /> Projection Band</div>
              <span className="text-[10px] italic text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">Based on 3-year quarterly data &middot; trend projection, not ML model</span>
            </div>
          }
        >
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={marginTrajectoryData} margin={{ top: 25, right: 30, bottom: 5, left: 15 }} onClick={(s) => handleChartContainerClick('Margin Trajectory', selectItem, marginTrajectoryData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} interval={1} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} domain={[56, 72]} />
                <Tooltip
                  content={({ payload, label }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="border border-slate-100 rounded-xl p-3 shadow-xl text-xs min-w-[180px] backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.95)' }}>
                        <p className="font-bold text-slate-800 mb-2">{label} {d.projected ? '(Projected)' : ''}</p>
                        {d.margin != null && (
                          <div className="flex justify-between gap-6">
                            <span className="text-slate-500">Actual Margin</span>
                            <span className="font-bold">{d.margin}%</span>
                          </div>
                        )}
                        {d.wma != null && (
                          <div className="flex justify-between gap-6">
                            <span className="text-[#0393da]">WMA Trend</span>
                            <span className="font-bold">{d.wma}%</span>
                          </div>
                        )}
                        {d.upper != null && d.lower != null && (
                          <div className="flex justify-between gap-6 mt-1 pt-1 border-t border-slate-100">
                            <span className="text-slate-400">Range</span>
                            <span className="font-semibold text-[#0393da]">{d.lower}% – {d.upper}%</span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <defs>
                  <linearGradient id="projBandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0393da" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#0393da" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="band" stroke="none" fill="url(#projBandGrad)" fillOpacity={1} animationDuration={1000} />
                <ReferenceLine y={60} stroke="#EF4444" strokeDasharray="6 3" strokeWidth={1} label={{ value: '60% floor', position: 'insideTopRight', fill: '#EF4444', fontSize: 9 }} />
                {crossDate && (
                  <ReferenceLine y={60} stroke="none" label={{ value: `Crosses 60% by ~${crossDate}`, position: 'insideBottomRight', fill: '#94a3b8', fontSize: 9 }} />
                )}
                <Line type="monotone" dataKey="margin" stroke="#94a3b8" strokeWidth={0} dot={{ r: 4, stroke: '#94a3b8', strokeWidth: 2, fill: 'white' }} activeDot={{ r: 6, stroke: '#94a3b8', strokeWidth: 2, fill: 'white' }} animationDuration={800} connectNulls={false} />
                <Line type="monotone" dataKey="wma" stroke="#0393da" strokeWidth={2.5} dot={false} activeDot={{ r: 5, stroke: '#0393da', strokeWidth: 2, fill: 'white' }} animationDuration={1000} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ── Row 5: Two charts side by side ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Commodity Group Margin Trajectories */}
          <ChartCard
            title="Commodity Group Margin Trajectories"
            subtitle="Quarterly margins by group with trend direction"
            tooltip={TOOLTIPS.category_forecasts}
            confidence="derived"
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={commodityTrajectoryData} margin={{ top: 10, right: 20, bottom: 5, left: 5 }} onClick={(s) => handleChartContainerClick('Commodity Trajectories', selectItem, commodityTrajectoryData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} interval={2} />
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} domain={[48, 72]} />
                  <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="BKAES" name="BKAES" stroke="#0393da" strokeWidth={2} dot={{ r: 2 }} animationDuration={800} />
                  <Line type="monotone" dataKey="BKAGG" name="BKAGG" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} animationDuration={800} />
                  <Line type="monotone" dataKey="BKAIZ" name="BKAIZ" stroke="#e7a019" strokeWidth={2} dot={{ r: 2 }} animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-6 mt-2 text-[10px] font-medium px-2">
              <span className="text-[#0393da]">BKAES: ~68% &rarr; ~66% <TrendingDown size={10} className="inline" /></span>
              <span className="text-[#10B981]">BKAGG: ~53&ndash;55% volatile &harr;</span>
              <span className="text-[#e7a019]">BKAIZ: improving <TrendingUp size={10} className="inline" /></span>
            </div>
          </ChartCard>

          {/* Seasonal Pattern (enhanced) */}
          <ChartCard
            title="Seasonal Pattern"
            subtitle="Monthly seasonal indices with actual recent performance overlay"
            tooltip={TOOLTIPS.seasonal_indices}
            formulaId="seasonal_pattern"
            confidence="derived"
            headerRight={
              <div className="flex items-center gap-3 text-xs font-medium">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-slate-300" /> Expected</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#0393da]" /> Actual</div>
              </div>
            }
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonalData} onClick={(s) => handleChartContainerClick('Seasonal Pattern', selectItem, seasonalData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tickFormatter={v => `${v.toFixed(2)}x`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} domain={[0.94, 1.06]} />
                  <Tooltip
                    content={({ payload, label }) => {
                      if (!payload?.length) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="border border-slate-100 rounded-xl p-3 shadow-xl text-xs min-w-[160px] backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.95)' }}>
                          <p className="font-bold text-slate-800 mb-2">{label}</p>
                          <div className="flex justify-between gap-4">
                            <span className="text-slate-500">Expected</span>
                            <span className="font-bold">{d.expected.toFixed(3)}x</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-[#0393da]">Actual</span>
                            <span className="font-bold">{d.actual.toFixed(3)}x</span>
                          </div>
                          <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-slate-100">
                            <span className="text-slate-400">Deviation</span>
                            <span className={`font-semibold ${d.deviation >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {d.deviation >= 0 ? '+' : ''}{d.deviation}pp
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="expected" name="Expected" fill="#e2e8f0" radius={[4, 4, 0, 0]} animationDuration={600} barSize={16} />
                  <Bar dataKey="actual" name="Actual" fill="#0393da" radius={[4, 4, 0, 0]} animationDuration={600} barSize={16} />
                  <ReferenceLine y={1} stroke="#94A3B8" strokeDasharray="3 3" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* ── Row 6: Cost Trajectory (full width) ── */}
        <ChartCard
          title="Cost Trajectory"
          subtitle="Cost layers as % of revenue — material, direct manufacturing, and full manufacturing cost"
          tooltip={TOOLTIPS.gross_margin}
          confidence="derived"
          headerRight={
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#10B981] block" /> Material</div>
              <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#0393da] block" /> Direct Mfg</div>
              <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#EF4444] block" /> Full Mfg Cost</div>
              <span className="text-[10px] italic text-slate-400">Dotted = projected</span>
            </div>
          }
        >
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fullCostData} margin={{ top: 15, right: 30, bottom: 5, left: 15 }} onClick={(s) => handleChartContainerClick('Cost Trajectory', selectItem, fullCostData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} interval={1} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} domain={[8, 40]} />
                <Tooltip content={<CustomTooltip formatter={v => `${v}%`} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {/* Historical lines (solid) */}
                <Line type="monotone" dataKey="material" name="Material %" stroke="#10B981" strokeWidth={2} dot={{ r: 3, fill: '#10B981' }} animationDuration={800} />
                <Line type="monotone" dataKey="directMfg" name="Direct Mfg %" stroke="#0393da" strokeWidth={2} dot={{ r: 3, fill: '#0393da' }} animationDuration={800} />
                <Line type="monotone" dataKey="fullMfg" name="Full Mfg Cost %" stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: '#EF4444' }} animationDuration={800} />
                {/* Projected lines (dotted) */}
                <Line type="monotone" dataKey="materialProj" stroke="#10B981" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#10B981', strokeDasharray: '' }} animationDuration={800} connectNulls legendType="none" />
                <Line type="monotone" dataKey="directMfgProj" stroke="#0393da" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#0393da', strokeDasharray: '' }} animationDuration={800} connectNulls legendType="none" />
                <Line type="monotone" dataKey="fullMfgProj" stroke="#EF4444" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#EF4444', strokeDasharray: '' }} animationDuration={800} connectNulls legendType="none" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] italic mt-2 px-2" style={{ color: '#737373' }}>
            Material costs declining, but full manufacturing cost trend rising &mdash; suggests fixed overhead growing. Investigate capacity utilization.
          </p>
        </ChartCard>

        {/* ── Row 7: Revenue Projection (full width) ── */}
        <ChartCard
          title="Revenue Projection"
          subtitle="Quarterly revenue with seasonal + growth-adjusted projection"
          confidence="derived"
          headerRight={
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#0393da]" /> Historical</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#0393da]/40" /> Projected</div>
              <div className="flex items-center gap-1.5"><span className="w-4 h-3 bg-[#c1e8ff] block rounded" /> &plusmn;15% Band</div>
            </div>
          }
        >
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={revenueChartData} margin={{ top: 25, right: 30, bottom: 5, left: 15 }} onClick={(s) => handleChartContainerClick('Revenue Projection', selectItem, revenueChartData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} interval={1} />
                <YAxis tickFormatter={v => formatEUR(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ payload, label }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="border border-slate-100 rounded-xl p-3 shadow-xl text-xs min-w-[180px] backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.95)' }}>
                        <p className="font-bold text-slate-800 mb-2">{label} {d.projected ? '(Projected)' : ''}</p>
                        <div className="flex justify-between gap-6">
                          <span className="text-slate-500">Revenue</span>
                          <span className="font-bold">{formatEUR(d.revenue)}</span>
                        </div>
                        {d.lower && d.upper && (
                          <div className="flex justify-between gap-6 mt-1 pt-1 border-t border-slate-100">
                            <span className="text-slate-400">Range</span>
                            <span className="font-semibold text-[#0393da]">{formatEUR(d.lower)} – {formatEUR(d.upper)}</span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <defs>
                  <linearGradient id="revBandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0393da" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#0393da" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="band" stroke="none" fill="url(#revBandGrad)" fillOpacity={1} animationDuration={800} />
                <Bar dataKey="revenue" animationDuration={600} radius={[4, 4, 0, 0]}>
                  {revenueChartData.map((entry, i) => (
                    <Cell key={`rev-${i}`} fill={entry.projected ? 'rgba(3,147,218,0.4)' : '#0393da'} />
                  ))}
                  <LabelList dataKey="revenue" position="top" formatter={v => formatEUR(v)} style={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Collapsible Methodology Panel */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <button
              onClick={() => setMethodologyOpen(!methodologyOpen)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
            >
              How is this calculated?
              {methodologyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {methodologyOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 overflow-hidden"
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 font-semibold text-slate-600">Quarter</th>
                      <th className="text-right py-2 font-semibold text-slate-600">Base</th>
                      <th className="text-right py-2 font-semibold text-slate-600">Seasonal</th>
                      <th className="text-right py-2 font-semibold text-slate-600">Growth</th>
                      <th className="text-right py-2 font-semibold text-slate-600">Projection</th>
                      <th className="text-right py-2 font-semibold text-slate-600">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueProjections.map(p => (
                      <tr key={p.label} className="border-b border-slate-50">
                        <td className="py-1.5 font-medium text-slate-700">{p.label}</td>
                        <td className="py-1.5 text-right text-slate-500">{formatEUR(p.base)}</td>
                        <td className="py-1.5 text-right text-slate-500">&times;{p.seasonal_factor.toFixed(2)}</td>
                        <td className="py-1.5 text-right text-slate-500">&times;{p.growth_factor.toFixed(3)}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-700">{formatEUR(p.projection)}</td>
                        <td className="py-1.5 text-right text-slate-400">{formatEUR(p.lower)}–{formatEUR(p.upper)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}
          </div>
        </ChartCard>

        {/* ── Row 8: Phase 4 — Advanced Analytics Placeholder ── */}
        <div>
          <h3 className="font-bold text-base mb-4" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
            Phase 4: Advanced Analytics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Scenario Simulator */}
            <motion.div
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              className="relative overflow-hidden"
              style={{
                background: colors.surface,
                borderRadius: radius.card,
                boxShadow: shadows.card,
                padding: '2rem',
                border: '1px dashed #e2e8f0',
              }}
            >
              <div className="size-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${colors.primary}10` }}>
                <FlaskConical size={20} style={{ color: colors.primary }} />
              </div>
              <h4 className="font-bold text-sm mb-2" style={{ color: colors.darkNavy }}>Scenario Simulator</h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                "What if material costs rise 10%?" "What if we reprice BKAGG by +5%?"
              </p>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full w-fit">
                <span>Available in future phases</span>
              </div>
              <button className="mt-4 flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors" style={{ color: colors.primary, background: `${colors.primary}08` }}>
                <Bell size={12} /> Notify me
              </button>
            </motion.div>

            {/* Monte Carlo Engine */}
            <motion.div
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              className="relative overflow-hidden"
              style={{
                background: colors.surface,
                borderRadius: radius.card,
                boxShadow: shadows.card,
                padding: '2rem',
                border: '1px dashed #e2e8f0',
              }}
            >
              <div className="size-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${colors.success}10` }}>
                <BarChart3 size={20} style={{ color: colors.success }} />
              </div>
              <h4 className="font-bold text-sm mb-2" style={{ color: colors.darkNavy }}>Monte Carlo Engine</h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                P5/P25/P50/P75/P95 margin distribution from validated ML models.
              </p>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full w-fit">
                <span>Available when model accuracy exceeds 70%</span>
              </div>
              <a href="/ml-analytics" className="mt-4 flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors" style={{ color: colors.success, background: `${colors.success}08` }}>
                View current model performance &rarr;
              </a>
            </motion.div>

            {/* Customer-Level Prediction */}
            <motion.div
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              className="relative overflow-hidden"
              style={{
                background: colors.surface,
                borderRadius: radius.card,
                boxShadow: shadows.card,
                padding: '2rem',
                border: '1px dashed #e2e8f0',
              }}
            >
              <div className="size-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${colors.tertiary}15` }}>
                <Users size={20} style={{ color: colors.tertiary }} />
              </div>
              <h4 className="font-bold text-sm mb-2" style={{ color: colors.darkNavy }}>Customer-Level Prediction</h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                Per-customer margin forecast with churn probability scoring.
              </p>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full w-fit">
                <span>Available in future phases</span>
              </div>
              <button className="mt-4 flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors" style={{ color: colors.tertiary, background: `${colors.tertiary}08` }}>
                <Bell size={12} /> Notify me
              </button>
            </motion.div>
          </div>
        </div>

        {/* ── Footer: Assumptions ── */}
        <div className="border-t border-slate-100 pt-4 pb-2">
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-[11px]" style={{ color: '#a3a3a3' }}>
            <span>Growth rate: based on {assumptions.growth_rate_source} ({(assumptions.growth_rate * 100).toFixed(1)}%)</span>
            <span>Seasonality: {assumptions.seasonality_source}</span>
            <span>Cost trends: {assumptions.cost_trend_source}</span>
            <span>Win rate: {assumptions.win_rate_source} ({(assumptions.win_rate * 100).toFixed(1)}%)</span>
            <span>Data through: {new Date(dataThrough).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>
      </div>
    </>
  );
}
