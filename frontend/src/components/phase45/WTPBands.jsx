import { IS_DEMO } from '../../utils/brand';
import { getWTPBands } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';

export default function WTPBands() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const rows = getWTPBands();
  if (!rows.length) return null;

  const min = Math.min(...rows.map((r) => r.lowWTP));
  const max = Math.max(...rows.map((r) => r.highWTP));
  const span = max - min || 1;
  const pct = (v) => ((v - min) / span) * 100;

  return (
    <ChartCard
      title={t('phase45.wtp.title')}
      subtitle={t('phase45.wtp.subtitle')}
    >
      <div className="space-y-3">
        {rows.map((r) => {
          const lowPct = pct(r.lowWTP);
          const midPct = pct(r.midWTP);
          const highPct = pct(r.highWTP);
          const curPct = pct(r.current);
          return (
            <div key={r.customer} className="flex items-center gap-3">
              <div className="w-28 flex-shrink-0">
                <div className="text-xs font-semibold" style={{ color: '#1a1a2e' }}>{r.customer}</div>
                <div className="text-[10px]" style={{ color: '#737373' }}>{r.segment}</div>
              </div>
              <div className="relative flex-1 h-6">
                {/* low band */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '10px',
                    borderRadius: '4px 0 0 4px',
                    background: '#cfe7f5',
                    left: `${lowPct}%`,
                    width: `${midPct - lowPct}%`,
                  }}
                />
                {/* mid band */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '10px',
                    background: '#6bbee3',
                    left: `${midPct}%`,
                    width: `${highPct - midPct}%`,
                  }}
                />
                {/* high band cap */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '10px',
                    borderRadius: '0 4px 4px 0',
                    background: '#0393da',
                    left: `${highPct}%`,
                    width: '4px',
                  }}
                />
                {/* current marker */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    width: '3px',
                    background: '#1a1a2e',
                    left: `calc(${curPct}% - 1.5px)`,
                    borderRadius: '2px',
                  }}
                />
              </div>
              <span className="w-14 text-right text-xs tabular-nums font-semibold" style={{ color: '#1a1a2e' }}>
                €{r.current}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-5 text-[11px]" style={{ color: '#737373' }}>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: '14px', height: '8px', background: '#cfe7f5', borderRadius: '2px' }} />
          <span>{t('phase45.wtp.low')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: '14px', height: '8px', background: '#6bbee3' }} />
          <span>{t('phase45.wtp.mid')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: '14px', height: '8px', background: '#0393da', borderRadius: '2px' }} />
          <span>{t('phase45.wtp.high')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: '3px', height: '12px', background: '#1a1a2e' }} />
          <span>{t('phase45.wtp.current')}</span>
        </div>
      </div>
    </ChartCard>
  );
}
