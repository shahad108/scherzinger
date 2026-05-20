import { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useMeasures } from '../../hooks/useMeasures';
import { MEASURE_STATUSES } from '../../data/measures';

export default function MeasureCreateModal({
  open,
  onClose,
  sourceKpi = null,
  sourceDashboard = null,
  sourceElementId = null,
  defaultTitle = '',
  onCreated,
}) {
  const { t } = useLanguage();
  const { createMeasure } = useMeasures();

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('open');

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const m = createMeasure({
      title: title.trim(),
      description: description.trim(),
      owner: owner.trim(),
      dueDate: dueDate || null,
      status,
      sourceKpi,
      sourceDashboard,
      sourceElementId,
      author: 'user',
    });
    onCreated?.(m);
    onClose();
    setTitle(''); setDescription(''); setOwner(''); setDueDate(''); setStatus('open');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">{t('measures.create.title')}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <Field label={t('measures.field.title')}>
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0393da]"
            />
          </Field>
          <Field label={t('measures.field.description')}>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0393da] resize-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('measures.field.owner')}>
              <input
                value={owner}
                onChange={e => setOwner(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0393da]"
              />
            </Field>
            <Field label={t('measures.field.dueDate')}>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0393da]"
              />
            </Field>
          </div>
          <Field label={t('measures.field.status')}>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:border-[#0393da]"
            >
              {MEASURE_STATUSES.map(s => (
                <option key={s} value={s}>{t(`measures.statuses.${s}`)}</option>
              ))}
            </select>
          </Field>
          {(sourceDashboard || sourceElementId || sourceKpi) ? (
            <div className="text-[10px] text-slate-400 pt-1">
              <span className="font-semibold">{t('measures.field.source')}:</span>{' '}
              {[sourceDashboard, sourceKpi, sourceElementId].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
              {t('common.cancel')}
            </button>
            <button type="submit" className="px-3 py-1.5 text-xs font-semibold text-white bg-[#0393da] rounded-md hover:bg-[#0277b6]">
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</span>
      {children}
    </label>
  );
}
