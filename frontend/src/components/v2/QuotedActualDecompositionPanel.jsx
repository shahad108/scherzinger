import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../../context/LanguageContext';
import MeasureCreateModal from '../measures/MeasureCreateModal';

// Driver decomposition — breaks down the quoted-vs-actual margin gap.
// Values are expressed as percentage-points (pp) and must sum to `totalGapPp`.
// In production this comes from the backend; for now we derive a plausible
// split from the period gap and expose it as an editable prop.
function buildDrivers(totalGapPp, t) {
  // Split heuristic: 45% discount, 20% rebates, 15% material, 5% fx, 15% mix
  const split = [
    { id: 'discount', share: 0.45, dashboard: 'pricing',   key: 'dashboard.decomp.drivers.discount' },
    { id: 'rebates',  share: 0.20, dashboard: 'pricing',   key: 'dashboard.decomp.drivers.rebates'  },
    { id: 'material', share: 0.15, dashboard: 'products',  key: 'dashboard.decomp.drivers.material' },
    { id: 'fx',       share: 0.05, dashboard: 'pricing',   key: 'dashboard.decomp.drivers.fx'       },
    { id: 'mix',      share: 0.15, dashboard: 'revenue',   key: 'dashboard.decomp.drivers.mix'      },
  ];
  return split.map(s => ({
    id: s.id,
    label: t(s.key),
    dashboard: s.dashboard,
    valuePp: +(totalGapPp * s.share).toFixed(2),
  }));
}

export default function QuotedActualDecompositionPanel({
  open,
  onClose,
  periodLabel,
  totalGapPp = 0,
  sourceDashboard = 'overview',
  sourceElementId = 'quoted-vs-actual-hero',
}) {
  const { t } = useLanguage();
  const [measureForDriver, setMeasureForDriver] = useState(null);

  const drivers = buildDrivers(totalGapPp, t);
  const maxAbs = Math.max(...drivers.map(d => Math.abs(d.valuePp)), 0.01);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/30"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-[91] shadow-2xl overflow-y-auto"
          >
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-800">{t('dashboard.decomp.title')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{t('dashboard.decomp.subtitle')}</p>
                {periodLabel ? <p className="text-[10px] text-slate-400 mt-1">{periodLabel}</p> : null}
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {drivers.map(d => (
                <div key={d.id} className="border border-slate-100 rounded-lg p-3 hover:border-slate-200 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{d.label}</span>
                    <span className="text-xs font-mono text-rose-600">{d.valuePp >= 0 ? '−' : '+'}{Math.abs(d.valuePp).toFixed(2)} pp</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-rose-400 rounded-full"
                      style={{ width: `${(Math.abs(d.valuePp) / maxAbs) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-slate-400">{t('dashboard.decomp.source')}: {d.dashboard}</span>
                    <button
                      onClick={() => setMeasureForDriver(d)}
                      className="text-[10px] font-semibold text-[#0393da] hover:underline"
                    >
                      {t('common.createMeasure')}
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-800">{t('dashboard.decomp.total')}</span>
                <span className="text-xs font-mono font-bold text-rose-700">−{Math.abs(totalGapPp).toFixed(2)} pp</span>
              </div>
            </div>
          </motion.aside>

          <MeasureCreateModal
            open={!!measureForDriver}
            onClose={() => setMeasureForDriver(null)}
            sourceKpi={measureForDriver?.id}
            sourceDashboard={sourceDashboard}
            sourceElementId={`${sourceElementId}:${measureForDriver?.id}`}
            defaultTitle={measureForDriver ? `${measureForDriver.label} — Maßnahme` : ''}
          />
        </>
      ) : null}
    </AnimatePresence>
  );
}
