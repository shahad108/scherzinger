import { useMemo } from 'react';
import {
  BarChart, Bar, ScatterChart, Scatter, ComposedChart, Line,
  ResponsiveContainer, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, Cell,
  Legend,
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';

import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniProgress, MiniWave, MiniRange, MiniAvatars } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import DataTable from '../components/shared/DataTable';
import StatusBadge from '../components/shared/StatusBadge';
import CustomTooltip from '../components/shared/CustomTooltip';
import { formatEUR, formatPct, formatMonth } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { handleScatterClick, handleChartContainerClick } from '../utils/pageContextResolver';
import { track } from '../utils/tracker';
import PhaseNotice from '../components/shared/PhaseNotice';

import ml from '../data/ml_analytics.json';
import forecastingData from '../data/forecasting.json';
import dashboardData from '../data/dashboard_data.json';

/* ── anonymize forecast model names ── */
const MODEL_LABELS = { ema: 'Model A', linear_trend: 'Model B', seasonal_decomp: 'Model C', ensemble: 'Ensemble' };
const anonModel = (name) => MODEL_LABELS[name] || name;
const anonModelAccuracy = forecastingData.model_accuracy.map(m => ({ ...m, model: anonModel(m.model) }));

/* ── color maps ── */
const MARGIN_COLORS = { high_margin: '#10B981', standard_margin: '#0393da', low_margin: '#F59E0B' };
const QUADRANT_COLORS = { Star: '#10B981', 'Cash Cow': '#0393da', 'Question Mark': '#F59E0B', Dog: '#EF4444' };
const SEVERITY_COLORS = { critical: '#EF4444', high: '#F59E0B', medium: '#0393da', low: '#94A3B8' };

export default function MLAnalytics() {
  const { selectItem, selectedItem } = useUI();

  // Row 1 KPIs
  const revenueAtRisk = ml.churn_prediction.revenue_at_risk_eur;

  // Row 2 left — margin classification bar data
  const marginClassData = useMemo(() => {
    const mc = ml.margin_classification;
    return [
      { category: 'High Margin', count: mc.high_margin.count, avg_margin: mc.high_margin.avg_margin, revenue_pct: mc.high_margin.revenue_pct, key: 'high_margin' },
      { category: 'Standard Margin', count: mc.standard_margin.count, avg_margin: mc.standard_margin.avg_margin, revenue_pct: mc.standard_margin.revenue_pct, key: 'standard_margin' },
      { category: 'Low Margin', count: mc.low_margin.count, avg_margin: mc.low_margin.avg_margin, revenue_pct: mc.low_margin.revenue_pct, key: 'low_margin' },
    ];
  }, []);

  // Row 2 right — anomaly detection
  const anomalyData = useMemo(() => {
    return ml.anomaly_detection.types.map(t => ({
      name: t.type,
      count: t.count,
      severity: t.severity,
    }));
  }, []);

  // Row 3 — BCG Matrix scatter data
  const bcgData = useMemo(() => {
    return ml.bcg_matrix.map(item => ({
      commodity_group: item.commodity_group,
      growth: item.growth,
      margin: item.margin,
      revenue: item.revenue,
      quadrant: item.quadrant,
    }));
  }, []);

  // Monthly revenue comparison YoY
  const yoyData = useMemo(() => {
    const byMonth = {};
    dashboardData.monthly_revenue.forEach(m => {
      const key = m.Month;
      if (!byMonth[key]) byMonth[key] = { month: formatMonth(m.Month) };
      byMonth[key][`y${m.Year}`] = m.revenue_eur;
    });
    return Object.values(byMonth).sort((a, b) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months.indexOf(a.month) - months.indexOf(b.month);
    });
  }, []);

  const modelAccuracyColumns = [
    { key: 'model', label: 'Model' },
    { key: 'mae', label: 'MAE', align: 'right', render: (v) => v.toFixed(3) },
    { key: 'rmse', label: 'RMSE', align: 'right', render: (v) => v.toFixed(3) },
    { key: 'directional_accuracy', label: 'Dir. Accuracy', align: 'right', render: (v) => formatPct(v) },
  ];

  const churnPredictions = ml.churn_prediction.predictions.slice(0, 10).map((p, i) => ({
    id: i,
    customer_id: p.customer_id,
    name: p.name,
    churn_probability: p.churn_probability,
    ltv_eur: p.ltv_eur,
    risk_tier: p.risk_tier,
  }));

  const churnColumns = [
    { key: 'customer_id', label: 'Customer ID', render: (v) => <span className="font-semibold">{v}</span> },
    { key: 'name', label: 'Name' },
    { key: 'risk_tier', label: 'Risk Tier', render: (v) => <StatusBadge label={v} variant={v === 'critical' ? 'danger' : v === 'high' ? 'warning' : 'info'} /> },
    { key: 'churn_probability', label: 'Churn Prob.', align: 'right', render: (v) => <span className={`font-bold ${v > 0.7 ? 'text-red-600' : v > 0.4 ? 'text-amber-600' : 'text-green-600'}`}>{formatPct(v)}</span> },
    { key: 'ltv_eur', label: 'LTV (EUR)', align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
  ];

  return (
    <>
      <Header title="ML Analytics" />
      <motion.div className="p-8 space-y-6 max-w-[1440px] mx-auto" variants={containerVariants} initial="hidden" animate="visible">
        {/* KPI Row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div variants={cardVariants}>
            <KPICard label="Churn Model Accuracy" value={formatPct(ml.churn_prediction.accuracy)} change="on hold-out set" changeType="positive" infoTooltip={TOOLTIPS.model_accuracy} bottomContent={<MiniProgress value={ml.churn_prediction.accuracy * 100} color="#10b981" />} formulaId="churn_probability" confidence="forecast" />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="At-Risk Customers" value={ml.churn_prediction.total_at_risk} change={`${ml.churn_prediction.high_value_at_risk} high-value`} changeType="negative" tooltip={TOOLTIPS.churn_warnings} bottomContent={<MiniWave color="#ef4444" />} formulaId="churn_probability" confidence="forecast" />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Revenue at Risk" value={formatEUR(revenueAtRisk)} change={`From ${ml.churn_prediction.total_at_risk} customers`} changeType="negative" tooltip={TOOLTIPS.revenue_at_risk} bottomContent={<MiniRange text="Next 12 months" />} formulaId="churn_probability" confidence="forecast" />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Anomalies Detected" value={ml.anomaly_detection.total_anomalies} change={`${ml.anomaly_detection.types.length} types`} changeType="neutral" bottomContent={<MiniAvatars count={ml.anomaly_detection.total_anomalies} shown={3} />} formulaId="anomaly_detection" confidence="derived" />
          </motion.div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Margin Classification Bar Chart */}
          <ChartCard title="Margin Classification" subtitle="Product margin tier distribution" tooltip={TOOLTIPS.margin_distribution} formulaId="margin_classification" confidence="derived">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marginClassData} onClick={(s) => handleChartContainerClick('Margin Classification', selectItem, marginClassData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={600}>
                    {marginClassData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={MARGIN_COLORS[entry.key] || '#94A3B8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Anomaly Detection */}
          <ChartCard title="Anomaly Detection" subtitle={`${ml.anomaly_detection.total_anomalies} anomalies detected`} formulaId="anomaly_detection" confidence="derived">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={anomalyData} onClick={(s) => handleChartContainerClick('Anomaly Detection', selectItem, anomalyData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={600}>
                    {anomalyData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={SEVERITY_COLORS[entry.severity] || '#94A3B8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* BCG Matrix */}
          <ChartCard title="BCG Portfolio Matrix" subtitle="Commodity groups by growth and margin" tooltip={TOOLTIPS.bcg_portfolio} formulaId="bcg_matrix" confidence="derived">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart onClick={(s) => handleChartContainerClick('BCG Matrix', selectItem, bcgData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis type="number" dataKey="margin" name="Margin" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} tickFormatter={(v) => formatPct(v)} />
                  <YAxis type="number" dataKey="growth" name="Growth" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatPct(v)} />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                  <Tooltip content={<CustomTooltip formatter={(v, name) => name === 'Revenue' ? formatEUR(v) : formatPct(v)} />} />
                  <Scatter name="Commodity Groups" data={bcgData}>
                    {bcgData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={QUADRANT_COLORS[entry.quadrant] || '#94A3B8'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Revenue YoY */}
          <ChartCard title="Revenue YoY Comparison" subtitle="Monthly revenue by year" tooltip={TOOLTIPS.yoy_comparison} formulaId="revenue_by_year" confidence="verified">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={yoyData} onClick={(s) => handleChartContainerClick('Revenue YoY', selectItem, yoyData, s)}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} width={65} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip formatter={(v) => formatEUR(v)} />} />
                  <Line type="monotone" dataKey="y2022" stroke="#94A3B8" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="y2023" stroke="#F59E0B" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="y2024" stroke="#0393da" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="y2025" stroke="#10B981" strokeWidth={2.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Model Accuracy Table */}
        <DataTable
          title="Forecast Model Accuracy"
          columns={modelAccuracyColumns}
          data={anonModelAccuracy}
          rowKey="model"
          formulaId="churn_probability"
          confidence="forecast"
        />

        {/* Churn Predictions Table */}
        <DataTable
          title="Churn Risk Predictions"
          columns={churnColumns}
          data={churnPredictions}
          rowKey="id"
          selectedRowId={selectedItem?.id}
          onRowClick={(row) => selectItem({ type: 'customer', id: row.customer_id, label: `${row.name} (${row.customer_id})`, data: row })}
          formulaId="churn_probability"
          confidence="forecast"
        />
        <PhaseNotice type="forecast" />
      </motion.div>
    </>
  );
}
