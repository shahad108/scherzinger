import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingDown, TrendingUp, AlertTriangle, ChevronRight, Activity, Clock, Target } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, BarChart, Bar, Cell } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getAnomalies, findSKUDetail } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';
import { useUI } from '../../context/UIContext';
import { colors } from '../../utils/designTokensV2';

const SEVERITY_BADGE = {
  high:   { bg: '#fee2e2', color: '#dc2626' },
  medium: { bg: '#fef3c7', color: '#d97706' },
  low:    { bg: '#e0f2fe', color: '#0393da' },
};

const SEVERITY_ICON = {
  high:   AlertTriangle,
  medium: Activity,
  low:    TrendingDown,
};

// Deterministic mock z-score timeline for a SKU — 12 months of noise ending
// with a spike in the direction of the current anomaly.
function buildTimeline(anomaly) {
  const seed = anomaly.sku.charCodeAt(0) + anomaly.sku.charCodeAt(3 || 0);
  const months = ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'];
  const noise = months.map((m, i) => {
    const n = (Math.sin((seed + i) * 1.37) + Math.cos((seed + i) * 0.71)) * 0.6;
    return { month: m, z: Number(n.toFixed(2)) };
  });
  // Force last 2 months toward the anomaly's current z-score
  noise[10].z = Number((anomaly.zscore * 0.7).toFixed(2));
  noise[11].z = anomaly.zscore;
  return noise;
}

function suggestedActionKey(anomaly) {
  const m = anomaly.metric.toLowerCase();
  if (m.includes('material'))  return 'procurement';
  if (m.includes('margin'))    return 'invoice';
  if (m.includes('volume'))    return 'volume';
  if (m.includes('price'))     return 'override';
  if (m.includes('rejection')) return 'rejection';
  return 'generic';
}

export default function AnomalyFeedCard() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const { selectItem } = useUI();
  const rows = getAnomalies();
  const [selected, setSelected] = useState(null);
  if (!rows.length) return null;

  const handleAnomalyClick = (a) => {
    setSelected(a);
    selectItem({
      type: 'sku',
      id: a.sku,
      label: `${a.sku} · ${a.metric} · z=${a.zscore.toFixed(1)}σ (${a.severity})`,
      data: {
        sku: a.sku,
        metric: a.metric,
        zscore: a.zscore,
        severity: a.severity,
        note: a.note,
      },
    });
  };

  return (
    <>
      <ChartCard
        title={t('phase45.anomalies.title')}
        subtitle={t('phase45.anomalies.subtitle')}
      >
        <div className="divide-y" style={{ borderColor: '#f1f5f9' }}>
          {rows.map((a) => {
            const sev = SEVERITY_BADGE[a.severity] || SEVERITY_BADGE.low;
            const zPos = a.zscore >= 0;
            return (
              <button
                key={a.id}
                onClick={() => handleAnomalyClick(a)}
                className="w-full text-left flex items-center gap-4 py-3 transition-colors hover:bg-slate-50 group cursor-pointer"
              >
                <span
                  className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: sev.bg, color: sev.color }}
                >
                  {t(`phase45.anomalies.severity.${a.severity}`)}
                </span>
                <span className="font-mono text-xs font-semibold flex-shrink-0 w-20" style={{ color: '#1a1a2e' }}>
                  {a.sku}
                </span>
                <span className="text-xs flex-shrink-0 w-32" style={{ color: '#737373' }}>
                  {a.metric}
                </span>
                <span
                  className="font-mono text-xs font-bold tabular-nums flex-shrink-0 w-16 text-right"
                  style={{ color: zPos ? '#dc2626' : '#0393da' }}
                >
                  {zPos ? '+' : ''}{a.zscore.toFixed(1)}σ
                </span>
                <span className="text-xs flex-1 truncate" style={{ color: '#1a1a2e' }}>
                  {a.note}
                </span>
                <ChevronRight
                  size={16}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: '#0393da' }}
                />
              </button>
            );
          })}
        </div>
      </ChartCard>

      <AnomalyDetailPanel anomaly={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function AnomalyDetailPanel({ anomaly, onClose }) {
  const { t } = useLanguage();
  const timeline = useMemo(() => (anomaly ? buildTimeline(anomaly) : []), [anomaly]);
  const related = useMemo(() => {
    if (!anomaly) return [];
    return getAnomalies().filter((a) => a.sku === anomaly.sku && a.id !== anomaly.id);
  }, [anomaly]);
  const sku = useMemo(() => (anomaly ? findSKUDetail(anomaly.sku) : null), [anomaly]);

  if (!anomaly) return null;

  const sev = SEVERITY_BADGE[anomaly.severity] || SEVERITY_BADGE.low;
  const SevIcon = SEVERITY_ICON[anomaly.severity] || Activity;
  const zPos = anomaly.zscore >= 0;
  const actionKey = suggestedActionKey(anomaly);
  const zAbs = Math.abs(anomaly.zscore);
  const zHintKey = zAbs >= 2.5 ? 'extreme' : zAbs >= 1.5 ? 'moderate' : 'mild';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-screen w-[560px] max-w-[92vw] z-50 flex flex-col overflow-hidden"
        style={{ background: colors.surface, boxShadow: '0 0 60px rgba(26,26,46,0.12)' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-5 flex items-start justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: sev.bg, color: sev.color }}
              >
                <SevIcon size={11} />
                {t(`phase45.anomalies.severity.${anomaly.severity}`)}
              </span>
              <span className="font-mono text-xs font-semibold" style={{ color: '#1a1a2e' }}>{anomaly.sku}</span>
            </div>
            <h2 className="text-lg font-bold mt-2" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
              {anomaly.metric}
            </h2>
            <p className="text-sm mt-1" style={{ color: '#525252' }}>{anomaly.note}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#f8f9fa] transition-colors flex-shrink-0" style={{ color: '#a3a3a3' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-3">
            <KpiTile
              label={t('phase45.anomalies.panel.zscore')}
              value={`${zPos ? '+' : ''}${anomaly.zscore.toFixed(1)}σ`}
              hint={t(`phase45.anomalies.panel.zscoreHint.${zHintKey}`)}
              color={zPos ? '#dc2626' : '#0393da'}
            />
            <KpiTile
              label={t('phase45.anomalies.panel.severity')}
              value={t(`phase45.anomalies.severity.${anomaly.severity}`)}
              hint={t(`phase45.anomalies.panel.severityHint.${anomaly.severity}`)}
              color={sev.color}
            />
            <KpiTile
              label={t('phase45.anomalies.panel.direction')}
              value={zPos ? t('phase45.anomalies.panel.direction.above') : t('phase45.anomalies.panel.direction.below')}
              hint={t('phase45.anomalies.panel.directionHint')}
              color={zPos ? '#dc2626' : '#0393da'}
              icon={zPos ? TrendingUp : TrendingDown}
            />
          </div>

          {/* Timeline */}
          <div>
            <SectionHeading icon={Clock} label={t('phase45.anomalies.panel.timelineTitle')} />
            <div className="mt-3 rounded-xl p-4" style={{ background: '#f8fafc' }}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[-4, 4]} tickFormatter={(v) => `${v}σ`} />
                  <Tooltip formatter={(v) => `${v}σ`} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <ReferenceArea y1={-1.5} y2={1.5} fill="#0393da" fillOpacity={0.06} />
                  <Bar dataKey="z" radius={[3, 3, 3, 3]}>
                    {timeline.map((p, i) => (
                      <Cell key={i} fill={Math.abs(p.z) >= 2 ? '#dc2626' : Math.abs(p.z) >= 1.5 ? '#d97706' : '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] mt-2" style={{ color: '#94a3b8' }}>
                {t('phase45.anomalies.panel.timelineHint')}
              </p>
            </div>
          </div>

          {/* Suggested action */}
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)', border: '1px solid #e0f2fe' }}
          >
            <div
              className="size-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(3,147,218,0.12)', color: '#0393da' }}
            >
              <Target size={16} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0393da' }}>
                {t('phase45.anomalies.panel.actionTitle')}
              </p>
              <p className="text-sm font-semibold mt-1" style={{ color: '#1a1a2e' }}>
                {t(`phase45.anomalies.panel.action.${actionKey}.title`)}
              </p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#525252' }}>
                {t(`phase45.anomalies.panel.action.${actionKey}.detail`)}
              </p>
            </div>
          </div>

          {/* Related anomalies on same SKU */}
          {related.length > 0 && (
            <div>
              <SectionHeading icon={Activity} label={t('phase45.anomalies.panel.otherFlags', { sku: anomaly.sku })} />
              <ul className="mt-3 space-y-2">
                {related.map((r) => {
                  const rsev = SEVERITY_BADGE[r.severity] || SEVERITY_BADGE.low;
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ background: '#f8fafc' }}
                    >
                      <span
                        className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: rsev.bg, color: rsev.color }}
                      >
                        {t(`phase45.anomalies.severity.${r.severity}`)}
                      </span>
                      <span className="text-xs font-semibold flex-shrink-0 w-28" style={{ color: '#525252' }}>{r.metric}</span>
                      <span className="font-mono text-xs tabular-nums flex-shrink-0 w-12 text-right" style={{ color: r.zscore >= 0 ? '#dc2626' : '#0393da' }}>
                        {r.zscore >= 0 ? '+' : ''}{r.zscore.toFixed(1)}σ
                      </span>
                      <span className="text-xs flex-1 truncate" style={{ color: '#737373' }}>{r.note}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* SKU context */}
          {sku && (sku.floorPrice || sku.optimizer) && (
            <div>
              <SectionHeading icon={Activity} label={t('phase45.anomalies.panel.skuContext')} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                {sku.floorPrice && (
                  <ContextRow label={t('phase45.anomalies.panel.ctx.fullCost')}   value={`€${sku.floorPrice.hkvoll.toLocaleString()}`} />
                )}
                {sku.floorPrice && (
                  <ContextRow label={t('phase45.anomalies.panel.ctx.floor')} value={`€${sku.floorPrice.floor.toLocaleString()}`} />
                )}
                {sku.optimizer && (
                  <ContextRow label={t('phase45.anomalies.panel.ctx.current')}   value={`€${sku.optimizer.current.toLocaleString()}`} />
                )}
                {sku.optimizer && (
                  <ContextRow label={t('phase45.anomalies.panel.ctx.suggested')} value={`€${sku.optimizer.suggested.toLocaleString()}`} emphasis />
                )}
                {sku.optimizer && (
                  <ContextRow label={t('phase45.anomalies.panel.ctx.expectedMargin')} value={`${(sku.optimizer.expectedMargin * 100).toFixed(1)}%`} />
                )}
                {sku.competitive && (
                  <ContextRow label={t('phase45.anomalies.panel.ctx.marketPosition')} value={sku.competitive.position} />
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function SectionHeading({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} style={{ color: '#94a3b8' }} />
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#525252' }}>{label}</span>
    </div>
  );
}

function KpiTile({ label, value, hint, color, icon: Icon }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#f8fafc' }}>
      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{label}</p>
      <div className="flex items-center gap-1 mt-1">
        {Icon && <Icon size={14} style={{ color }} />}
        <span className="text-base font-bold tabular-nums" style={{ color, fontFamily: "'Manrope', sans-serif" }}>{value}</span>
      </div>
      {hint && <p className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>{hint}</p>}
    </div>
  );
}

function ContextRow({ label, value, emphasis }) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: '#f8fafc' }}>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: '#94a3b8' }}>{label}</span>
      <span
        className="text-xs tabular-nums"
        style={{ color: emphasis ? '#0393da' : '#1a1a2e', fontWeight: emphasis ? 700 : 500 }}
      >
        {value}
      </span>
    </div>
  );
}
