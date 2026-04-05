import { useMemo } from 'react';
import {
  ComposedChart, Line, Area, BarChart, Bar, LabelList, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  Legend,
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniWave, MiniRange, MiniProgress } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import CustomTooltip from '../components/shared/CustomTooltip';
import forecastingData from '../data/forecasting.json';
import pipelineData from '../data/pipeline.json';
import { formatEUR } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { handleChartContainerClick } from '../utils/pageContextResolver';
import { track } from '../utils/tracker';
import PhaseNotice from '../components/shared/PhaseNotice';

const overall = forecastingData.overall_forecast;
const modelAccuracy = forecastingData.model_accuracy;
const commodityForecasts = forecastingData.commodity_forecasts;
const seasonalPatterns = forecastingData.seasonal_patterns;
const monteCarlo = forecastingData.monte_carlo;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── anonymize model names ── */
const MODEL_LABELS = { ema: 'Model A', linear_trend: 'Model B', seasonal_decomp: 'Model C', ensemble: 'Ensemble' };
const anonModel = (name) => MODEL_LABELS[name] || name;

export default function Forecasting() {
  const { selectItem } = useUI();

  // Commodity margin forecast chart — grouped bars: current, 3m, 6m, 12m per commodity
  const commodityChartData = useMemo(() => {
    return commodityForecasts.map((c) => ({
      commodity: c.commodity_group,
      current: +(c.current_margin * 100).toFixed(1),
      '3m': +(c.forecast_3m * 100).toFixed(1),
      '6m': +(c.forecast_6m * 100).toFixed(1),
      '12m': +(c.forecast_12m * 100).toFixed(1),
    }));
  }, []);

  // Seasonal pattern data — map month numbers to names, color by above/below average
  const seasonalData = useMemo(() => {
    return seasonalPatterns.map((s) => ({
      month: MONTH_NAMES[s.month - 1],
      index: s.seasonal_index,
      fill: s.seasonal_index >= 1.10 ? '#10B981' : s.seasonal_index < 0.95 ? '#EF4444' : '#94A3B8',
    }));
  }, []);

  // Monte Carlo confidence bands for overall margin
  const monteCarloData = useMemo(() => {
    const mc = monteCarlo.overall;
    return [
      { label: 'P5', value: +(mc.p5 * 100).toFixed(1), fill: '#EF4444' },
      { label: 'P25', value: +(mc.p25 * 100).toFixed(1), fill: '#F59E0B' },
      { label: 'Median', value: +(mc.median * 100).toFixed(1), fill: '#0393da' },
      { label: 'P75', value: +(mc.p75 * 100).toFixed(1), fill: '#10B981' },
      { label: 'P95', value: +(mc.p95 * 100).toFixed(1), fill: '#059669' },
    ];
  }, []);

  // Model accuracy comparison
  const modelCompData = useMemo(() => {
    return modelAccuracy.map((m) => ({
      model: anonModel(m.model),
      mae: +(m.mae * 100).toFixed(2),
      rmse: +(m.rmse * 100).toFixed(2),
      directional: +(m.directional_accuracy * 100).toFixed(0),
    }));
  }, []);

  // Pipeline funnel — exclude Won & Lost
  const openFunnelData = useMemo(() => {
    return pipelineData.pipeline_stages
      .filter((s) => s.stage !== 'Won' && s.stage !== 'Lost')
      .sort((a, b) => {
        const order = ['New Quote', 'Under Review', 'Quoted', 'Negotiation'];
        return order.indexOf(a.stage) - order.indexOf(b.stage);
      });
  }, []);

  const pipelineValue = openFunnelData.reduce((s, st) => s + st.value_eur, 0);
  const bestModel = modelAccuracy.reduce((best, m) => m.mae < best.mae ? m : best, modelAccuracy[0]);

  // Margin forecast timeline — show current + 3m/6m/12m with confidence
  const forecastTimelineData = useMemo(() => {
    return [
      {
        label: 'Current',
        margin: +(overall.current_margin * 100).toFixed(1),
        lower: null,
        upper: null,
        band: null,
      },
      {
        label: '3-Month',
        margin: +(overall.forecast_3m.predicted * 100).toFixed(1),
        lower: +(overall.forecast_3m.lower * 100).toFixed(1),
        upper: +(overall.forecast_3m.upper * 100).toFixed(1),
        band: [+(overall.forecast_3m.lower * 100).toFixed(1), +(overall.forecast_3m.upper * 100).toFixed(1)],
      },
      {
        label: '6-Month',
        margin: +(overall.forecast_6m.predicted * 100).toFixed(1),
        lower: +(overall.forecast_6m.lower * 100).toFixed(1),
        upper: +(overall.forecast_6m.upper * 100).toFixed(1),
        band: [+(overall.forecast_6m.lower * 100).toFixed(1), +(overall.forecast_6m.upper * 100).toFixed(1)],
      },
      {
        label: '12-Month',
        margin: +(overall.forecast_12m.predicted * 100).toFixed(1),
        lower: +(overall.forecast_12m.lower * 100).toFixed(1),
        upper: +(overall.forecast_12m.upper * 100).toFixed(1),
        band: [+(overall.forecast_12m.lower * 100).toFixed(1), +(overall.forecast_12m.upper * 100).toFixed(1)],
      },
    ];
  }, []);

  return (
    <>
      <Header title="Forecasting" />
      <div className="p-8 space-y-6 max-w-[1440px] mx-auto">
        {/* KPIs */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard
              label="Current Margin"
              value={`${(overall.current_margin * 100).toFixed(1)}%`}
              change={`12m forecast: ${(overall.forecast_12m.predicted * 100).toFixed(1)}%`}
              changeType="positive"
              infoTooltip={TOOLTIPS.gross_margin}
              formulaId="forecast_margin"
              confidence="forecast"
              bottomContent={<MiniProgress value={overall.current_margin * 100} color="#10b981" />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label="3-Month Forecast"
              value={`${(overall.forecast_3m.predicted * 100).toFixed(1)}%`}
              changeType="neutral"
              infoTooltip={TOOLTIPS.p10_p90_range}
              formulaId="monte_carlo_range"
              confidence="forecast"
              bottomContent={<MiniRange text={`Range: ${(overall.forecast_3m.lower * 100).toFixed(1)}% – ${(overall.forecast_3m.upper * 100).toFixed(1)}%`} />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label="Pipeline Value (Open)"
              value={formatEUR(pipelineValue)}
              tooltip={TOOLTIPS.pipeline_value}
              formulaId="pipeline_stages"
              confidence="verified"
              bottomContent={<MiniWave color="#0393da" />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label="Best Model Accuracy"
              value={`${(bestModel.directional_accuracy * 100).toFixed(0)}%`}
              change={`MAE: ${(bestModel.mae * 100).toFixed(2)}pp | ${modelAccuracy.length} models tested`}
              changeType="neutral"
              tooltip={TOOLTIPS.models_tested}
              formulaId="model_accuracy"
              confidence="forecast"
              bottomContent={<MiniRange text={`Best: ${anonModel(bestModel.model)} (RMSE ${(bestModel.rmse * 100).toFixed(2)}pp)`} />}
            />
          </motion.div>
        </motion.div>

        {/* Confidence Range Explainer */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#c1e8ff]/30 rounded-lg text-xs">
          <div className="size-6 bg-[#0393da] text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0">i</div>
          <p className="text-[#0393da]">
            <span className="font-bold">Current margin: {(overall.current_margin * 100).toFixed(1)}%</span> with forecasts trending upward.{' '}
            <span className="font-bold">Ensemble model</span> achieves {(bestModel.directional_accuracy * 100).toFixed(0)}% directional accuracy with MAE of {(bestModel.mae * 100).toFixed(2)} percentage points.{' '}
            The <span className="font-bold">confidence intervals</span> widen over longer horizons.{' '}
            Monte Carlo simulation shows only {(monteCarlo.overall.prob_below_50pct * 100).toFixed(0)}% probability of margin falling below 50%.
          </p>
        </div>

        {/* Margin Forecast Timeline with Confidence Band */}
        <ChartCard
          title="Margin Forecast Timeline"
          subtitle="Current margin with 3/6/12-month predicted margins and confidence bands"
          tooltip={TOOLTIPS.forecast_vs_actuals}
          formulaId="forecast_margin"
          confidence="forecast"
          headerRight={
            <div className="flex gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#0393da] block" /> Predicted Margin</div>
              <div className="flex items-center gap-1.5"><span className="w-4 h-3 bg-[#c1e8ff] block rounded" /> Confidence Band</div>
            </div>
          }
        >
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecastTimelineData} margin={{ top: 25, right: 30, bottom: 5, left: 15 }} onClick={(s) => handleChartContainerClick('Margin Forecast Timeline', selectItem, forecastTimelineData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip
                  content={({ payload, label }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="border border-slate-100 rounded-xl p-3 shadow-xl text-xs min-w-[180px] backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.95)' }}>
                        <p className="font-bold text-slate-800 mb-2">{label}</p>
                        <div className="flex justify-between gap-6">
                          <span className="text-[#0393da]">Margin</span>
                          <span className="font-bold">{d.margin}%</span>
                        </div>
                        {d.lower != null && d.upper != null && (
                          <>
                            <div className="border-t border-slate-100 my-1.5" />
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-400">Lower Bound</span>
                              <span className="font-semibold">{d.lower}%</span>
                            </div>
                            <div className="flex justify-between gap-6">
                              <span className="text-slate-400">Upper Bound</span>
                              <span className="font-semibold">{d.upper}%</span>
                            </div>
                            <div className="flex justify-between gap-6 mt-1 pt-1 border-t border-slate-100">
                              <span className="text-slate-400">Range</span>
                              <span className="font-semibold text-[#0393da]">{(d.upper - d.lower).toFixed(1)}pp</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }}
                />
                <defs>
                  <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0393da" stopOpacity={0.15} />
                    <stop offset="50%" stopColor="#0393da" stopOpacity={0.04} />
                    <stop offset="100%" stopColor="#0393da" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="band" stroke="none" fill="url(#bandGrad)" fillOpacity={1} animationDuration={1000} onClick={(data) => track.chartClick('Forecast Confidence Band', data)} />
                <ReferenceLine y={50} stroke="#EF4444" strokeDasharray="6 3" strokeWidth={1} label={{ value: '50% floor', position: 'insideTopRight', fill: '#EF4444', fontSize: 9 }} />
                <Line type="monotone" dataKey="margin" stroke="#0393da" strokeWidth={2.5} dot={{ r: 5, stroke: '#0393da', strokeWidth: 2, fill: 'white' }} activeDot={{ r: 7, stroke: '#0393da', strokeWidth: 2, fill: 'white' }} animationDuration={1000} onClick={(data) => track.chartClick('Margin Forecast', data)} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Commodity Margin Forecasts */}
          <ChartCard title="Commodity Margin Forecasts" subtitle="Current vs predicted margins by commodity group" tooltip={TOOLTIPS.category_forecasts} formulaId="forecast_revenue" confidence="forecast">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commodityChartData} margin={{ top: 10, right: 10, bottom: 5, left: 5 }} onClick={(s) => handleChartContainerClick('Commodity Margin Forecasts', selectItem, commodityChartData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="commodity" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={45} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} domain={[50, 'auto']} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="current" name="Current" fill="#94A3B8" radius={[2, 2, 0, 0]} animationDuration={600} />
                  <Bar dataKey="3m" name="3-Month" fill="#0393da" radius={[2, 2, 0, 0]} animationDuration={600} />
                  <Bar dataKey="12m" name="12-Month" fill="#10B981" radius={[2, 2, 0, 0]} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Seasonal Pattern */}
          <ChartCard title="Seasonal Pattern" subtitle="Monthly seasonal indices (>1 = above average, <1 = below)" tooltip={TOOLTIPS.seasonal_indices} formulaId="seasonal_pattern" confidence="derived">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonalData} onClick={(s) => handleChartContainerClick('Seasonal Pattern', selectItem, seasonalData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${v.toFixed(2)}x`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${v.toFixed(3)}x`} />} />
                  <Bar dataKey="index" radius={[6, 6, 0, 0]} animationDuration={600}>
                    {seasonalData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.fill} />
                    ))}
                  </Bar>
                  <ReferenceLine y={1} stroke="#94A3B8" strokeDasharray="3 3" label={{ value: '1.0x (neutral)', position: 'right', fill: '#64748B', fontSize: 9 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monte Carlo Confidence Distribution */}
          <ChartCard
            title="Monte Carlo Margin Distribution"
            subtitle={`Overall: ${(monteCarlo.overall.prob_below_50pct * 100).toFixed(0)}% probability below 50% margin`}
            tooltip={TOOLTIPS.p10_p90_range}
            formulaId="monte_carlo_range"
            confidence="forecast"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monteCarloData} onClick={(s) => handleChartContainerClick('Monte Carlo Distribution', selectItem, monteCarloData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} domain={[50, 'auto']} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
                  <Bar dataKey="value" name="Margin %" radius={[6, 6, 0, 0]} animationDuration={600}>
                    {monteCarloData.map((entry, i) => (
                      <Cell key={`mc-${i}`} fill={entry.fill} />
                    ))}
                    <LabelList dataKey="value" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }} />
                  </Bar>
                  <ReferenceLine y={50} stroke="#EF4444" strokeDasharray="4 2" label={{ value: '50% floor', position: 'insideBottomLeft', fill: '#EF4444', fontSize: 9 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Model Accuracy Comparison */}
          <ChartCard
            title="Model Accuracy Comparison"
            subtitle="MAE, RMSE (in pp), and directional accuracy across models"
            tooltip={TOOLTIPS.model_comparison}
            formulaId="model_accuracy"
            confidence="forecast"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={modelCompData} onClick={(s) => handleChartContainerClick('Model Accuracy', selectItem, modelCompData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="model" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis yAxisId="left" tickFormatter={(v) => `${v}pp`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip formatter={(v, name) => name === 'directional' ? `${v}%` : `${v}pp`} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="mae" name="MAE" fill="#0393da" radius={[4, 4, 0, 0]} animationDuration={600} />
                  <Bar yAxisId="left" dataKey="rmse" name="RMSE" fill="#94A3B8" radius={[4, 4, 0, 0]} animationDuration={600} />
                  <Line yAxisId="right" type="monotone" dataKey="directional" name="Directional %" stroke="#10B981" strokeWidth={2} dot={{ r: 4, fill: '#10B981' }} animationDuration={600} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Pipeline Stages */}
        <ChartCard
          title="Pipeline by Stage"
          subtitle="Open pipeline stages — deal count and value"
          tooltip={TOOLTIPS.pipeline_value}
          formulaId="pipeline_stages"
          confidence="verified"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={openFunnelData} onClick={(s) => handleChartContainerClick('Pipeline Stages', selectItem, openFunnelData, s)}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis dataKey="stage" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                <YAxis yAxisId="left" tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} width={65} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip formatter={(v, name) => name === 'count' ? v : formatEUR(v)} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar yAxisId="left" dataKey="value_eur" name="Value" fill="#0393da" radius={[6, 6, 0, 0]} animationDuration={600}>
                  <LabelList dataKey="value_eur" position="top" formatter={(v) => formatEUR(v)} style={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }} />
                </Bar>
                <Bar yAxisId="right" dataKey="count" name="Deals" fill="#94A3B8" radius={[6, 6, 0, 0]} animationDuration={600} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <PhaseNotice type="forecast" />
      </div>
    </>
  );
}
