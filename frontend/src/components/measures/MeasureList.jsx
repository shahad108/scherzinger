import { useMemo, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useMeasures } from '../../hooks/useMeasures';
import { MEASURE_STATUSES } from '../../data/measures';
import MeasureCard from './MeasureCard';

export default function MeasureList({ sourceDashboard = 'all', sourceElementId = null, emptyHint }) {
  const { t } = useLanguage();
  const { listMeasures, getMeasuresForElement } = useMeasures();
  const [status, setStatus] = useState('all');

  const items = useMemo(() => {
    const base = sourceElementId
      ? getMeasuresForElement(sourceElementId)
      : listMeasures({ sourceDashboard });
    return status === 'all' ? base : base.filter(m => m.status === status);
  }, [status, sourceDashboard, sourceElementId, listMeasures, getMeasuresForElement]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [items]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <label className="text-[11px] font-medium text-slate-500">{t('measures.filter.status')}</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
        >
          <option value="all">{t('measures.filter.all')}</option>
          {MEASURE_STATUSES.map(s => (
            <option key={s} value={s}>{t(`measures.statuses.${s}`)}</option>
          ))}
        </select>
        <span className="ml-auto text-[11px] text-slate-400">{sorted.length}</span>
      </div>
      {sorted.length === 0 ? (
        <div className="text-xs text-slate-400 italic py-4 text-center">
          {emptyHint ?? t('measures.empty')}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(m => <MeasureCard key={m.id} measure={m} />)}
        </div>
      )}
    </div>
  );
}
