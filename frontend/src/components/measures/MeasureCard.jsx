import { useLanguage } from '../../context/LanguageContext';
import MeasureStatusPill from './MeasureStatusPill';

function formatDate(iso, lang) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MeasureCard({ measure, compact = false, onClick }) {
  const { t, lang } = useLanguage();
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white hover:border-[#0393da] transition-colors ${compact ? 'p-2.5' : 'p-3'} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className={`font-semibold text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`}>{measure.title}</h4>
        <MeasureStatusPill status={measure.status} />
      </div>
      {!compact && measure.description ? (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{measure.description}</p>
      ) : null}
      <div className={`flex items-center gap-3 ${compact ? 'mt-1.5' : 'mt-2'} text-[10px] text-slate-400`}>
        {measure.owner ? <span>{measure.owner}</span> : null}
        {measure.dueDate ? <span>• {t('measures.field.dueDate')}: {formatDate(measure.dueDate, lang)}</span> : null}
        {measure.sourceDashboard ? <span>• {measure.sourceDashboard}</span> : null}
      </div>
    </div>
  );
}
