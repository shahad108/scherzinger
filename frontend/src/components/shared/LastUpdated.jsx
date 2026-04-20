import { useLanguage } from '../../context/LanguageContext';
import { getDashboardFreshness } from '../../lib/dataFreshness';

function formatDate(iso, lang) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Unified "last updated" timestamp block.
 *
 * Preferred usage: pass `dashboardKey` — dates come from dataFreshness helper.
 * Escape hatch: pass `dataAsOf` / `modelAsOf` directly if a caller has its own source.
 */
export default function LastUpdated({ dashboardKey, dataAsOf, modelAsOf, className = '' }) {
  const { t, lang } = useLanguage();

  let resolvedData = dataAsOf ?? null;
  let resolvedModel = modelAsOf ?? null;
  if (dashboardKey && (!resolvedData || resolvedModel === undefined)) {
    const f = getDashboardFreshness(dashboardKey);
    resolvedData = resolvedData ?? f.dataAsOf;
    resolvedModel = resolvedModel ?? f.modelAsOf;
  }

  return (
    <div className={`text-[11px] text-slate-500 leading-tight ${className}`}>
      <div>
        <span className="text-slate-400">{t('common.lastUpdated')}:</span>{' '}
        <span className="font-medium text-slate-600">{formatDate(resolvedData, lang)}</span>
      </div>
      {resolvedModel ? (
        <div className="mt-0.5">
          <span className="text-slate-400">{t('common.modelAsOf')}:</span>{' '}
          <span className="font-medium text-slate-600">{formatDate(resolvedModel, lang)}</span>
        </div>
      ) : null}
    </div>
  );
}
