import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { findSKUDetail } from '../../utils/mockPhase45';
import { useLanguage } from '../../context/LanguageContext';
import { formatEUR } from '../../utils/formatters';
import { colors } from '../../utils/designTokensV2';

const tabs = ['pricing', 'breakEven', 'shock', 'anomalies', 'crossSell'];

export default function SKUDeepDiveSlideOver({ sku, onClose, initialTab = 'pricing' }) {
  if (!IS_DEMO || !sku) return null;
  const { t } = useLanguage();
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { setTab(initialTab); }, [sku, initialTab]);

  const rawDetail = findSKUDetail(sku);
  const hasData = rawDetail && (rawDetail.floorPrice || rawDetail.optimizer || rawDetail.breakEven);
  const effectiveSku = hasData ? sku : 'PS-1104';
  const detail = hasData ? rawDetail : findSKUDetail('PS-1104');
  if (!detail) return null;

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
        className="fixed right-0 top-0 h-screen w-[640px] max-w-[90vw] z-50 flex flex-col overflow-hidden"
        style={{ background: colors.surface, boxShadow: '0 0 60px rgba(26,26,46,0.12)' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-5 flex items-start justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
          <div>
            <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider" style={{ background: '#eff6ff', color: '#2563eb' }}>
              {t('phase45.skuDeepDive.title')}
            </span>
            <h2 className="text-lg font-bold mt-2" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
              {detail.floorPrice?.name || effectiveSku}
            </h2>
            <p className="text-xs mt-1" style={{ color: '#737373' }}>{effectiveSku}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#f8f9fa] transition-colors" style={{ color: '#a3a3a3' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 px-6 pt-4 flex items-center gap-1" style={{ borderBottom: '1px solid #f8fafc' }}>
          {tabs.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
              style={{
                color: tab === k ? '#0393da' : '#737373',
                borderBottom: tab === k ? '2px solid #0393da' : '2px solid transparent',
              }}
            >
              {t(`phase45.skuDeepDive.tab.${k}`)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'pricing' && (
            <div className="space-y-4">
              {detail.optimizer ? (
                <>
                  <MetricRow label="Current" value={formatEUR(detail.optimizer.current)} />
                  <MetricRow label="Suggested" value={formatEUR(detail.optimizer.suggested)} emphasis />
                  <MetricRow label="Range" value={`${formatEUR(detail.optimizer.min)} – ${formatEUR(detail.optimizer.max)}`} />
                  <MetricRow label="Expected margin" value={`${(detail.optimizer.expectedMargin * 100).toFixed(1)}%`} />
                </>
              ) : <p className="text-sm text-slate-500">No optimizer data for this SKU.</p>}
              {detail.floorPrice && (
                <>
                  <div className="h-px bg-slate-100 my-3" />
                  <MetricRow label="Floor price" value={formatEUR(detail.floorPrice.floor)} />
                  <MetricRow label="Full cost"   value={formatEUR(detail.floorPrice.hkvoll)} />
                </>
              )}
            </div>
          )}

          {tab === 'breakEven' && (
            detail.breakEven ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={detail.breakEven.curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="units" tick={{ fontSize: 11, fill: '#737373' }} />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#737373' }} />
                  <Tooltip formatter={(v) => `€${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" stroke="#0393da" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="cost"    stroke="#dc2626" strokeWidth={2}   dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-slate-500">No break-even data.</p>
          )}

          {tab === 'shock' && (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={[
                { name: 'Material',    delta: -2.1 },
                { name: 'Labor',       delta: -1.4 },
                { name: 'Outsourcing', delta: -0.9 },
                { name: 'Volume',      delta:  1.8 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis tickFormatter={(v) => `${v}pp`} tick={{ fontSize: 11, fill: '#737373' }} />
                <Tooltip formatter={(v) => `${v}pp`} />
                <Bar dataKey="delta" fill="#0393da" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {tab === 'anomalies' && (
            detail.anomalies && detail.anomalies.length ? (
              <ul className="space-y-3">
                {detail.anomalies.map((a) => (
                  <li key={a.id} className="p-3 rounded-lg" style={{ background: '#f8f9fa' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase" style={{ color: a.severity === 'high' ? '#dc2626' : a.severity === 'medium' ? '#d97706' : '#737373' }}>
                        {a.severity}
                      </span>
                      <span className="text-xs font-mono" style={{ color: '#737373' }}>z={a.zscore}</span>
                    </div>
                    <p className="text-sm mt-1">{a.metric}: {a.note}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No anomalies detected.</p>
          )}

          {tab === 'crossSell' && (
            detail.crossSell && detail.crossSell.length ? (
              <ul className="space-y-3">
                {detail.crossSell.map((r) => (
                  <li key={r.customer} className="p-3 rounded-lg" style={{ background: '#f8f9fa' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{r.customer}</span>
                      <span className="text-xs font-bold" style={{ color: '#0393da' }}>{(r.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#737373' }}>{r.reason}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No cross-sell candidates.</p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function MetricRow({ label, value, emphasis }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs uppercase tracking-wider" style={{ color: '#737373' }}>{label}</span>
      <span className="text-sm tabular-nums" style={{ color: emphasis ? '#0393da' : '#1a1a2e', fontWeight: emphasis ? 700 : 500 }}>{value}</span>
    </div>
  );
}
