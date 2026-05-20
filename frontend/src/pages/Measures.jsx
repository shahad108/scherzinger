import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useMeasures } from '../hooks/useMeasures';
import { MEASURE_STATUSES } from '../data/measures';
import { DASHBOARD_KEYS } from '../lib/dataFreshness';
import MeasureCard from '../components/measures/MeasureCard';
import MeasureCreateModal from '../components/measures/MeasureCreateModal';

export default function Measures() {
  const { t } = useLanguage();
  const { listMeasures } = useMeasures();
  const [status, setStatus] = useState('all');
  const [dashboard, setDashboard] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);

  const items = useMemo(() => listMeasures({ status, sourceDashboard: dashboard }), [listMeasures, status, dashboard]);
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [items]);

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t('measures.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('measures.subtitle')}</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0393da] rounded-md hover:bg-[#0277b6]"
        >
          <Plus size={14} />
          <span>{t('measures.new')}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-lg bg-slate-50 border border-slate-100">
        <Filter label={t('measures.filter.status')} value={status} onChange={setStatus}
          options={[{ value: 'all', label: t('measures.filter.all') }, ...MEASURE_STATUSES.map(s => ({ value: s, label: t(`measures.statuses.${s}`) }))]} />
        <Filter label={t('measures.filter.dashboard')} value={dashboard} onChange={setDashboard}
          options={[{ value: 'all', label: t('measures.filter.all') }, ...DASHBOARD_KEYS.map(k => ({ value: k, label: k }))]} />
        <span className="ml-auto text-[11px] text-slate-500">{sorted.length} / {listMeasures().length}</span>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400 italic border border-dashed border-slate-200 rounded-lg">
          {t('measures.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sorted.map(m => <MeasureCard key={m.id} measure={m} />)}
        </div>
      )}

      <MeasureCreateModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function Filter({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
