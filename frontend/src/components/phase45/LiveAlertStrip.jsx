import { IS_DEMO } from '../../utils/brand';
import { getLiveAlerts } from '../../utils/mockPhase45';
import { useLanguage } from '../../context/LanguageContext';
import { colors, shadows, radius } from '../../utils/designTokensV2';

const SEVERITY_COLORS = {
  high:   '#dc2626',
  medium: '#d97706',
  low:    '#0393da',
};

function relTime(ts) {
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function LiveAlertStrip() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const alerts = getLiveAlerts();
  if (!alerts.length) return null;

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: radius.card,
        boxShadow: shadows.card,
        padding: '1rem 1.25rem',
        border: '1px solid #edeeef',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#0393da' }}>
            {t('phase45.liveAlerts.title')}
          </h3>
          <p className="text-[10px]" style={{ color: '#737373' }}>{t('phase45.liveAlerts.subtitle')}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#fee2e2', color: '#dc2626' }}>
          LIVE
        </span>
      </div>
      <div className="flex overflow-x-auto gap-3 pb-1">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-2 flex-shrink-0 px-3 py-2 rounded-full"
            style={{ background: '#f8fafc', border: '1px solid #edeeef' }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '9999px',
                background: SEVERITY_COLORS[a.severity] || '#737373',
                boxShadow: `0 0 0 3px ${SEVERITY_COLORS[a.severity] || '#737373'}22`,
              }}
            />
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: '#1a1a2e' }}>{a.message}</span>
            <span
              className="text-xs font-bold tabular-nums"
              style={{ color: a.delta && a.delta.startsWith('-') ? '#dc2626' : '#16a34a' }}
            >
              {a.delta}
            </span>
            <span className="text-[10px]" style={{ color: '#a3a3a3' }}>{relTime(a.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
