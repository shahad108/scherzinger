import { useState, useMemo } from 'react';
import {
  BarChart, Bar,
  ResponsiveContainer, XAxis, YAxis,
  Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle,
  Filter, Info, FlaskConical, Bell,
} from 'lucide-react';
import { containerVariants, cardVariants, chartVariants, tableVariants, cardHover, viewportOnce } from '../utils/animations';

import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniProgress, MiniWave, MiniRange, MiniAvatars } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import DataTable from '../components/shared/DataTable';
import StatusBadge from '../components/shared/StatusBadge';
import CustomTooltip from '../components/shared/CustomTooltip';
import LastUpdated from '../components/shared/LastUpdated';
import { Info } from 'lucide-react';
import { formatEUR, formatPct } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { useLanguage } from '../context/LanguageContext';
import { track } from '../utils/tracker';
import { colors, shadows, radius } from '../utils/designTokensV2';

import ml from '../data/ml_analytics.json';
import forecastingData from '../data/forecasting.json';

/* ── anonymize forecast model names ── */
const MODEL_LABELS = { ema: 'Model A', linear_trend: 'Model B', seasonal_decomp: 'Model C', ensemble: 'Ensemble' };
const anonModel = (name) => MODEL_LABELS[name] || name;

/* ── color maps ── */
const SEVERITY_COLORS = { critical: '#EF4444', high: '#F59E0B', medium: '#0393da', low: '#94A3B8' };
const STATUS_ICONS = {
  deployed: <CheckCircle2 size={14} className="text-emerald-500" />,
  below: <AlertTriangle size={14} className="text-amber-500" />,
  not_deployed: <XCircle size={14} className="text-red-500" />,
};

/* ── Margin trend arrows ── */
const TREND_MAP = {
  declining: { label: 'Declining', icon: '↓', color: '#EF4444' },
  flat: { label: 'Flat', icon: '→', color: '#94A3B8' },
  improving: { label: 'Improving', icon: '↑', color: '#10B981' },
};

/* ── Feature importance bar color ── */
const IMPORTANCE_COLOR = '#0393da';
const IMPORTANCE_COLOR_FORECAST = '#10B981';

/* ── LTV filter options ── */
const LTV_FILTERS = [
  { label: '>€50K LTV', min: 50000 },
  { label: '>€10K LTV', min: 10000 },
  { label: 'All', min: 0 },
];

export default function MLAnalytics() {
  const { selectItem, selectedItem, openCustomerDetail } = useUI();
  const { t } = useLanguage();
  const [techDrawerOpen, setTechDrawerOpen] = useState(false);
  const [ltvFilter, setLtvFilter] = useState(1); // default to >€10K
  const [activeModel, setActiveModel] = useState('all'); // 'all', 'churn', 'forecast', 'anomaly'

  // ── Forecast model data with status flags ──
  const forecastModels = useMemo(() => {
    return forecastingData.model_accuracy.map(m => {
      const name = anonModel(m.model);
      let status, statusLabel;
      if (name === 'Model B') {
        status = 'deployed';
        statusLabel = 'Best — used for 3M projections';
      } else if (m.directional_accuracy >= 0.45) {
        status = 'below';
        statusLabel = 'Below threshold';
      } else {
        status = 'not_deployed';
        statusLabel = 'Not deployed — worse than random';
      }
      return { ...m, model: name, status, statusLabel };
    });
  }, []);

  // ── Churn predictions filtered and sorted by revenue at risk ──
  const churnPredictions = useMemo(() => {
    const minLtv = LTV_FILTERS[ltvFilter].min;
    return ml.churn_prediction.predictions
      .filter(p => p.ltv_eur >= minLtv)
      .sort((a, b) => b.revenue_at_risk_eur - a.revenue_at_risk_eur);
  }, [ltvFilter]);

  const churnColumns = [
    { key: 'customer_id', label: 'Customer', render: (v) => <span className="font-semibold text-[#1a1a2e]">{v}</span> },
    { key: 'ltv_eur', label: 'Revenue', align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
    { key: 'churn_probability', label: 'Churn Prob.', align: 'right', render: (v) => <span className={`font-bold ${v > 0.7 ? 'text-red-600' : v > 0.4 ? 'text-amber-600' : 'text-green-600'}`}>{formatPct(v)}</span> },
    { key: 'revenue_at_risk_eur', label: 'Revenue at Risk', align: 'right', render: (v) => <span className="font-bold text-red-600">{formatEUR(v)}</span> },
    { key: 'last_order_months_ago', label: 'Last Order', align: 'right', render: (v) => <span className={v > 6 ? 'text-red-600 font-semibold' : ''}>{v}mo ago</span> },
    { key: 'margin_trend', label: 'Margin Trend', render: (v) => {
      const t = TREND_MAP[v] || TREND_MAP.flat;
      return <span className="inline-flex items-center gap-1 font-medium" style={{ color: t.color }}>{t.icon} {t.label}</span>;
    }},
    { key: 'product_count', label: 'Products', align: 'right', render: (v) => <span className={v <= 2 ? 'text-amber-600 font-semibold' : ''}>{v}</span> },
    { key: 'recommended_action', label: 'Action', render: (v) => {
      const variant = v === 'Win-back campaign' ? 'danger' : v === 'Reprice conversation' ? 'warning' : v === 'Cross-sell opportunity' ? 'info' : v === 'Account review' ? 'warning' : 'neutral';
      return <StatusBadge label={v} variant={variant} />;
    }},
    { key: 'action_reason', label: 'Why', render: (v) => <span className="text-xs text-slate-500">{v}</span> },
  ];

  // ── Feature importance data ──
  const churnFeatures = ml.feature_importance.churn_model;
  const forecastFeatures = ml.feature_importance.forecast_model;

  // ── Anomaly summary counts ──
  const negMarginCount = ml.anomaly_detection.types.find(t => t.type === 'Negative margin')?.count || 0;
  const negMarginRevenue = ml.anomaly_detection.types.find(t => t.type === 'Negative margin')?.revenue_eur || 0;
  const missingCount = ml.anomaly_detection.types.find(t => t.type === 'Missing margin data')?.count || 0;
  const costAnomalyCount = ml.anomaly_detection.cost_anomalies.length;
  const quoteAnomalyCount = ml.anomaly_detection.quote_anomalies.length;

  // ── Inline table component ──
  const InlineTable = ({ headers, rows, className = '' }) => (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#737373' }}>
            {headers.map((h, i) => (
              <th key={i} className={`px-4 py-3 ${h.align === 'right' ? 'text-right' : 'text-left'}`} style={{ borderBottom: '1px solid #f0f0f0' }}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid #f8fafc' }}>
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-3 ${headers[j]?.align === 'right' ? 'text-right' : ''}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ── Section card wrapper ──
  const SectionCard = ({ children, className = '' }) => (
    <motion.div
      variants={chartVariants}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className={`overflow-hidden ${className}`}
      style={{ background: colors.surface, borderRadius: radius.card, boxShadow: shadows.card }}
    >
      {children}
    </motion.div>
  );

  return (
    <>
      <Header title={t('ml.title')} />
      <motion.div className="p-8 space-y-6 max-w-[1440px] mx-auto" variants={containerVariants} initial="hidden" animate="visible">

        {/* ── 7.1: Page-level purpose statement ── */}
        <div className="p-4 rounded-xl border border-[#0393da]/20" style={{ background: 'linear-gradient(135deg, rgba(3,147,218,0.04), rgba(3,147,218,0.01))' }}>
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(3,147,218,0.12)' }}>
              <Info size={16} style={{ color: '#0393da' }} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-800">{t('ml.purpose.title')}</h3>
              <p className="text-xs text-slate-600 leading-relaxed mt-1">{t('ml.purpose.body')}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-[11px]">
                <div><span className="block text-slate-400 uppercase tracking-wide text-[10px] font-semibold">{t('ml.purpose.for')}</span><span className="font-semibold text-slate-700">{t('ml.purpose.for.value')}</span></div>
                <div><span className="block text-slate-400 uppercase tracking-wide text-[10px] font-semibold">{t('ml.purpose.audience')}</span><span className="font-semibold text-slate-700">{t('ml.purpose.audience.value')}</span></div>
                <div><span className="block text-slate-400 uppercase tracking-wide text-[10px] font-semibold">{t('ml.purpose.when')}</span><span className="font-semibold text-slate-700">{t('ml.purpose.when.value')}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Global Header: Model Selector + Last Updated ── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {['all', 'churn', 'forecast', 'anomaly'].map(key => (
              <button
                key={key}
                onClick={() => setActiveModel(key)}
                className="px-4 py-2 text-xs font-bold rounded-full transition-all"
                style={{
                  background: activeModel === key ? colors.primary : '#f0f0f0',
                  color: activeModel === key ? '#fff' : '#737373',
                }}
              >
                {key === 'all' ? t('ml.tab.all') : key === 'churn' ? t('ml.tab.churn') : key === 'forecast' ? t('ml.tab.forecast') : t('ml.tab.anomaly')}
              </button>
            ))}
          </div>
          {/* 7.4: split Daten-Stand / Modell-Stand */}
          <LastUpdated dashboardKey="ml" />
        </div>

        {/* ═══════════════════════════════════════════════════════════
            ROW 1 — KPI Cards (reframed for honesty)
        ═══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('ml.kpi.churn')}
              value={formatPct(ml.churn_prediction.accuracy)}
              change={`Base rate: ${formatPct(ml.churn_prediction.base_rate)}. Lift: +${ml.churn_prediction.lift_pp}pp`}
              changeType="positive"
              infoTooltip="Model accuracy vs predicting majority class. A 'predict everyone churns' model gets 58% for free."
              bottomContent={<MiniProgress value={ml.churn_prediction.accuracy * 100} color="#10b981" />}
              confidence="forecast"
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('ml.kpi.highRisk')}
              value={ml.churn_prediction.high_confidence_at_risk}
              change={`>€${(ml.churn_prediction.high_confidence_threshold.min_ltv / 1000).toFixed(0)}K LTV AND >${formatPct(ml.churn_prediction.high_confidence_threshold.min_probability)} prob`}
              changeType="negative"
              tooltip={`Model precision at this threshold: ${formatPct(ml.churn_prediction.high_confidence_precision)}`}
              bottomContent={<MiniWave color="#ef4444" />}
              confidence="forecast"
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('ml.kpi.materialRev')}
              value={formatEUR(ml.churn_prediction.material_revenue_at_risk_eur)}
              change={`From top ${ml.churn_prediction.material_revenue_top_accounts} at-risk accounts`}
              changeType="negative"
              tooltip="Concentrated on customers that matter — not micro-accounts inflating the total."
              bottomContent={<MiniRange text="Top accounts only" />}
              confidence="forecast"
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('ml.kpi.anomalies')}
              value={ml.anomaly_detection.total_anomalies}
              change={`${negMarginCount} negative-margin · ${missingCount} missing-data`}
              changeType="neutral"
              bottomContent={<MiniAvatars count={ml.anomaly_detection.total_anomalies} shown={3} />}
              confidence="derived"
            />
          </motion.div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            ROW 2 — Model Performance (Churn left, Forecast right)
        ═══════════════════════════════════════════════════════════ */}
        {(activeModel === 'all' || activeModel === 'churn' || activeModel === 'forecast') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Left: Churn Model Performance ── */}
            {(activeModel === 'all' || activeModel === 'churn') && (
              <SectionCard>
                <div className="p-6">
                  <h3 className="font-bold text-base mb-1" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>{t('ml.section.churnPerf')}</h3>
                  <p className="text-xs mb-4" style={{ color: '#737373' }}>{t('ml.section.churnPerf.subtitle')}</p>

                  {/* Summary metrics */}
                  <InlineTable
                    headers={[{ label: 'Metric' }, { label: 'Value', align: 'right' }]}
                    rows={[
                      ['Accuracy', formatPct(ml.churn_prediction.accuracy)],
                      [<span className="text-slate-400">Base Rate</span>, <span className="text-slate-400">{formatPct(ml.churn_prediction.base_rate)} <span className="text-[10px]">(predict-all-churn baseline)</span></span>],
                      ['Lift over Baseline', <span className="font-semibold text-emerald-600">+{ml.churn_prediction.lift_pp}pp</span>],
                      ['Precision (overall)', formatPct(ml.churn_prediction.precision)],
                      ['Recall (overall)', formatPct(ml.churn_prediction.recall)],
                      ['F1 Score', formatPct(ml.churn_prediction.f1)],
                    ]}
                  />

                  {/* Segment accuracy */}
                  <h4 className="text-xs font-bold uppercase tracking-wider mt-6 mb-3" style={{ color: '#737373' }}>{t('ml.section.segmentAcc')}</h4>
                  <InlineTable
                    headers={[{ label: 'Segment' }, { label: 'Accuracy', align: 'right' }, { label: 'Precision', align: 'right' }, { label: 'Note' }]}
                    rows={ml.churn_prediction.segment_accuracy.map(s => [
                      <span className="font-medium">{s.segment}</span>,
                      formatPct(s.accuracy),
                      formatPct(s.precision),
                      <span className="text-xs italic text-slate-400">{s.note}</span>,
                    ])}
                  />

                  {/* Precision at top-K */}
                  <div className="mt-4 p-3 rounded-xl" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                    <p className="text-xs font-semibold" style={{ color: '#0369a1' }}>
                      Precision at top-20 (&gt;€50K LTV): <span className="font-bold">{formatPct(ml.churn_prediction.precision_top20_high_ltv)}</span>
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: '#0c4a6e' }}>
                      Of the top 20 predicted churners with &gt;€50K LTV, {Math.round(ml.churn_prediction.precision_top20_high_ltv * 20)} actually churned.
                    </p>
                  </div>

                  {/* Expandable technical drawer */}
                  <button
                    onClick={() => setTechDrawerOpen(!techDrawerOpen)}
                    className="mt-4 flex items-center gap-2 text-xs font-semibold transition-colors w-full justify-center py-2 rounded-lg hover:bg-slate-50"
                    style={{ color: colors.primary }}
                  >
                    {techDrawerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    Technical Details
                  </button>
                  <AnimatePresence>
                    {techDrawerOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pt-4 space-y-4">
                          {/* Confusion matrix */}
                          <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#737373' }}>{t('ml.section.confusionMatrix')}</h4>
                          <div className="grid grid-cols-2 gap-2 max-w-xs">
                            <div className="p-3 rounded-lg text-center" style={{ background: '#f0fdf4' }}>
                              <div className="text-lg font-bold text-emerald-700">524</div>
                              <div className="text-[10px] text-emerald-600">{t('ml.label.tp')}</div>
                            </div>
                            <div className="p-3 rounded-lg text-center" style={{ background: '#fef2f2' }}>
                              <div className="text-lg font-bold text-red-600">123</div>
                              <div className="text-[10px] text-red-500">{t('ml.label.fp')}</div>
                            </div>
                            <div className="p-3 rounded-lg text-center" style={{ background: '#fef2f2' }}>
                              <div className="text-lg font-bold text-red-600">59</div>
                              <div className="text-[10px] text-red-500">{t('ml.label.fn')}</div>
                            </div>
                            <div className="p-3 rounded-lg text-center" style={{ background: '#f0fdf4' }}>
                              <div className="text-lg font-bold text-emerald-700">121</div>
                              <div className="text-[10px] text-emerald-600">{t('ml.label.tn')}</div>
                            </div>
                          </div>
                          <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                            ROC curve and threshold calibration plots available in model documentation.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </SectionCard>
            )}

            {/* ── Right: Forecast Model Performance ── */}
            {(activeModel === 'all' || activeModel === 'forecast') && (
              <SectionCard>
                <div className="p-6">
                  <h3 className="font-bold text-base mb-1" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>{t('ml.section.forecastPerf')}</h3>
                  <p className="text-xs mb-3" style={{ color: '#737373' }}>{t('ml.section.forecastPerf.subtitle')}</p>

                  {/* 7.2: plain-language reading + banded classification */}
                  <div className="mb-4 p-3 rounded-lg border border-slate-100 bg-slate-50 text-[11px] text-slate-600 space-y-1.5">
                    <div><span className="font-semibold text-slate-700">{t('ml.perf.units')}:</span> {t('ml.perf.units.body')}</div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{t('ml.perf.band.good')}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />{t('ml.perf.band.ok')}</span>
                      <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />{t('ml.perf.band.bad')}</span>
                    </div>
                  </div>

                  <InlineTable
                    headers={[
                      { label: 'Model' },
                      { label: 'MAE', align: 'right' },
                      { label: 'RMSE', align: 'right' },
                      { label: 'Dir. %', align: 'right' },
                      { label: 'Status' },
                    ]}
                    rows={forecastModels.map(m => [
                      <span className="font-medium">{m.model}</span>,
                      m.mae.toFixed(3),
                      m.rmse.toFixed(3),
                      <span className={`font-bold ${m.directional_accuracy >= 0.5 ? 'text-emerald-600' : m.directional_accuracy >= 0.2 ? 'text-amber-600' : 'text-red-600'}`}>
                        {formatPct(m.directional_accuracy)}
                      </span>,
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        {STATUS_ICONS[m.status]}
                        <span className={m.status === 'deployed' ? 'text-emerald-600' : m.status === 'below' ? 'text-amber-600' : 'text-red-500'}>
                          {m.statusLabel}
                        </span>
                      </span>,
                    ])}
                  />

                  {/* Deployment threshold notice */}
                  <div className="mt-5 p-4 rounded-xl" style={{ background: '#fffbeb', border: '1px solid #fed7aa' }}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-amber-800">{t('ml.label.deployThreshold')}</p>
                        <p className="text-[11px] mt-1 text-amber-700 leading-relaxed">
                          Minimum for production use: <strong>60% directional accuracy</strong>. No model currently meets this bar.
                          Forecasting page uses trend projections, not ML, until models improve.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            ROW 3 — Churn Predictions Table (MAJOR FIX)
        ═══════════════════════════════════════════════════════════ */}
        {(activeModel === 'all' || activeModel === 'churn') && (
          <DataTable
            title={t('ml.section.churnPredictions')}
            columns={churnColumns}
            data={churnPredictions}
            rowKey="customer_id"
            selectedRowId={selectedItem?.id}
            onRowClick={(row) => { selectItem({ type: 'customer', id: row.customer_id, label: `${row.name} (${row.customer_id})`, data: row }); openCustomerDetail(row.customer_id); }}
            confidence="forecast"
            headerRight={
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-slate-400" />
                {LTV_FILTERS.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => { setLtvFilter(i); track.tableSearch('Churn Predictions', f.label); }}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-full transition-all"
                    style={{
                      background: ltvFilter === i ? colors.primary : '#f0f0f0',
                      color: ltvFilter === i ? '#fff' : '#737373',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            }
          />
        )}

        {/* ═══════════════════════════════════════════════════════════
            ROW 4 — Anomaly Detection (expanded)
        ═══════════════════════════════════════════════════════════ */}
        {(activeModel === 'all' || activeModel === 'anomaly') && (
          <SectionCard>
            <div className="p-6">
              <h3 className="font-bold text-base mb-1" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>{t('ml.section.anomalyDetection')}</h3>
              <p className="text-xs mb-5" style={{ color: '#737373' }}>{t('ml.section.anomalyDetection.subtitle')}</p>

              {/* Summary strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                  { label: 'Negative-margin invoices', value: negMarginCount, sub: formatEUR(negMarginRevenue) + ' revenue', color: '#EF4444', bg: '#fef2f2' },
                  { label: 'Missing-margin records', value: missingCount, sub: 'Data quality gap', color: '#F59E0B', bg: '#fffbeb' },
                  { label: 'Cost anomalies', value: costAnomalyCount, sub: 'Deviant cost ratios', color: '#0393da', bg: '#f0f9ff' },
                  { label: 'Quote anomalies', value: quoteAnomalyCount, sub: 'Margin outliers', color: '#8b5cf6', bg: '#f5f3ff' },
                ].map((item, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ background: item.bg }}>
                    <div className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</div>
                    <div className="text-xs font-semibold mt-1" style={{ color: item.color }}>{item.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#737373' }}>{item.sub}</div>
                  </div>
                ))}
              </div>

              {/* Cost anomalies table */}
              <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#737373' }}>{t('ml.section.costAnomalies')}</h4>
              <InlineTable
                headers={[
                  { label: 'Article' },
                  { label: 'Cost/Rev Ratio', align: 'right' },
                  { label: 'Group Avg', align: 'right' },
                  { label: 'Deviation', align: 'right' },
                  { label: 'Revenue', align: 'right' },
                ]}
                rows={ml.anomaly_detection.cost_anomalies.map(a => [
                  <span className="font-medium">{a.article}</span>,
                  <span className="font-bold text-red-600">{formatPct(a.cost_revenue_ratio)}</span>,
                  <span>{formatPct(a.group_average)} <span className="text-[10px] text-slate-400">({a.commodity_group})</span></span>,
                  <span className="font-semibold text-red-600">+{a.deviation_pp.toFixed(1)}pp</span>,
                  formatEUR(a.revenue_eur),
                ])}
                className="mb-6"
              />

              {/* Quote anomalies table */}
              <h4 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#737373' }}>{t('ml.section.quoteAnomalies')}</h4>
              <p className="text-[11px] mb-3" style={{ color: '#94a3b8' }}>
                Quotes where margin is &gt;20pp from customer's historical average. Flags pricing errors before submission.
              </p>
              <InlineTable
                headers={[
                  { label: 'Quote' },
                  { label: 'Customer' },
                  { label: 'Quoted Margin', align: 'right' },
                  { label: 'Hist. Avg', align: 'right' },
                  { label: 'Deviation', align: 'right' },
                  { label: 'Value', align: 'right' },
                  { label: 'Status' },
                ]}
                rows={ml.anomaly_detection.quote_anomalies.map(q => [
                  <span className="font-medium">{q.quote_id}</span>,
                  q.customer_name,
                  <span className="font-bold text-red-600">{formatPct(q.quoted_margin)}</span>,
                  formatPct(q.historical_avg_margin),
                  <span className="font-semibold text-red-600">{q.deviation_pp > 0 ? '+' : ''}{q.deviation_pp.toFixed(1)}pp</span>,
                  formatEUR(q.value_eur),
                  <StatusBadge label={q.status} variant={q.status === 'pending' ? 'warning' : 'info'} />,
                ])}
              />
            </div>
          </SectionCard>
        )}

        {/* ═══════════════════════════════════════════════════════════
            ROW 5 — Feature Importance (Churn + Forecast)
        ═══════════════════════════════════════════════════════════ */}
        {(activeModel === 'all' || activeModel === 'churn' || activeModel === 'forecast') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Churn Model Feature Importance */}
            {(activeModel === 'all' || activeModel === 'churn') && (
              <ChartCard
                title={t('ml.section.churnFeatures')}
                subtitle={t('ml.section.churnFeatures.subtitle')}
                tooltip="Builds trust and gives actionable insight. Single-product customers churn 3x more — so cross-sell."
                confidence="forecast"
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={churnFeatures} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                      <YAxis type="category" dataKey="feature" width={200} tick={{ fontSize: 10, fill: '#4b5563' }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip formatter={(v) => formatPct(v)} />} />
                      <Bar dataKey="importance" radius={[0, 6, 6, 0]} animationDuration={600} fill={IMPORTANCE_COLOR} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            )}

            {/* Forecast Model Feature Importance */}
            {(activeModel === 'all' || activeModel === 'forecast') && (
              <ChartCard
                title={t('ml.section.forecastFeatures')}
                subtitle={t('ml.section.forecastFeatures.subtitle')}
                tooltip="Key drivers behind forecast model predictions"
                confidence="forecast"
              >
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={forecastFeatures} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                      <YAxis type="category" dataKey="feature" width={200} tick={{ fontSize: 10, fill: '#4b5563' }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip formatter={(v) => formatPct(v)} />} />
                      <Bar dataKey="importance" radius={[0, 6, 6, 0]} animationDuration={600} fill={IMPORTANCE_COLOR_FORECAST} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            ROW 6 — Model Changelog & Data Coverage
        ═══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Training History */}
          <SectionCard>
            <div className="p-6">
              <h3 className="font-bold text-base mb-1" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>{t('ml.section.trainingHistory')}</h3>
              <p className="text-xs mb-4" style={{ color: '#737373' }}>{t('ml.section.trainingHistory.subtitle')}</p>

              <InlineTable
                headers={[
                  { label: 'Model' },
                  { label: 'Last Trained' },
                  { label: 'Window' },
                  { label: 'Data Points', align: 'right' },
                  { label: 'Next' },
                ]}
                rows={ml.training_history.map(t => [
                  <span className="font-medium">{t.model}</span>,
                  t.last_trained,
                  <span className="text-xs">{t.training_window}</span>,
                  t.data_points,
                  <StatusBadge label={t.next_scheduled} variant="info" />,
                ])}
              />

              <div className="mt-4 p-3 rounded-xl" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-amber-700">
                    If the churn model was trained on 2022-2023 data and hasn't seen 2024, its predictions on 2024 customers are extrapolations. Plan retraining accordingly.
                  </p>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Data Coverage */}
          <SectionCard>
            <div className="p-6">
              <h3 className="font-bold text-base mb-1" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>{t('ml.section.dataCoverage')}</h3>
              <p className="text-xs mb-4" style={{ color: '#737373' }}>{t('ml.section.dataCoverage.subtitle')}</p>

              <InlineTable
                headers={[
                  { label: 'Feature Category' },
                  { label: 'Coverage', align: 'right' },
                  { label: '' },
                  { label: 'Note' },
                ]}
                rows={ml.data_coverage.map(d => [
                  <span className="font-medium">{d.category}</span>,
                  <span className={`font-bold ${d.coverage >= 0.95 ? 'text-emerald-600' : d.coverage >= 0.85 ? 'text-amber-600' : 'text-red-600'}`}>
                    {formatPct(d.coverage)}
                  </span>,
                  <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: '#f0f0f0' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${d.coverage * 100}%`,
                        background: d.coverage >= 0.95 ? '#10b981' : d.coverage >= 0.85 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>,
                  <span className="text-xs text-slate-400">{d.note}</span>,
                ])}
              />

              <div className="mt-4 p-3 rounded-xl" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                <p className="text-[11px]" style={{ color: '#0369a1' }}>
                  {ml.data_coverage_summary}
                </p>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            ROW 7 — Backtesting Panel (Phase 4 placeholder)
        ═══════════════════════════════════════════════════════════ */}
        <motion.div
          variants={tableVariants}
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          className="overflow-hidden"
          style={{
            background: colors.surface,
            borderRadius: radius.card,
            boxShadow: shadows.card,
            border: '2px dashed #e2e8f0',
          }}
        >
          <div className="p-8 text-center">
            <div className="inline-flex items-center gap-2 mb-4">
              <FlaskConical size={24} style={{ color: colors.primary }} />
              <h3 className="font-bold text-lg" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
                Model Backtesting
              </h3>
              <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 uppercase tracking-wider">
                Coming Soon
              </span>
            </div>
            <p className="text-sm max-w-lg mx-auto mb-2" style={{ color: '#4b5563' }}>
              "How would this model have performed on last quarter's actual churn?"
            </p>
            <p className="text-xs max-w-md mx-auto mb-6" style={{ color: '#94a3b8' }}>
              Backtest results are the gold standard for model trust. Walk-forward validation on quarterly holdout sets — available in future phases.
            </p>
            <button
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-full transition-all hover:opacity-90"
              style={{ background: '#f0f0f0', color: '#737373' }}
              onClick={() => track.tableRowClick('Backtesting', 'notify_interest')}
            >
              <Bell size={14} />
              Notify me when available
            </button>
          </div>
        </motion.div>

      </motion.div>
    </>
  );
}
