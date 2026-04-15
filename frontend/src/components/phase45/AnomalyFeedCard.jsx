import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { IS_DEMO } from '../../utils/brand';
import { getAnomalies } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';

const SEVERITY_BADGE = {
  high:   { bg: '#fee2e2', color: '#dc2626' },
  medium: { bg: '#fef3c7', color: '#d97706' },
  low:    { bg: '#e0f2fe', color: '#0393da' },
};

export default function AnomalyFeedCard() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const navigate = useNavigate();
  const rows = getAnomalies();
  if (!rows.length) return null;

  const openDeepDive = (sku) => {
    navigate('/products', { state: { openSku: sku, tab: 'anomalies' } });
  };

  return (
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
              onClick={() => openDeepDive(a.sku)}
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
  );
}
