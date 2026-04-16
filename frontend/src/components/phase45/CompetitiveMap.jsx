import { IS_DEMO } from '../../utils/brand';
import { getCompetitive } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';
import { useUI } from '../../context/UIContext';
import { formatEUR } from '../../utils/formatters';

export default function CompetitiveMap() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const { selectItem } = useUI();
  const all = getCompetitive();
  if (!all.length) return null;
  const min = Math.min(...all.flatMap((r) => [r.marketLow, r.our]));
  const max = Math.max(...all.flatMap((r) => [r.marketHigh, r.our]));
  const span = max - min || 1;
  const pct = (v) => ((v - min) / span) * 100;
  return (
    <ChartCard
      title={t('phase45.competitive.title')}
      subtitle={t('phase45.competitive.subtitle')}
    >
      <div className="space-y-1">
        {all.map((r) => {
          const leftPct = pct(r.marketLow);
          const widthPct = pct(r.marketHigh) - leftPct;
          return (
            <div
              key={r.sku}
              className="flex items-center gap-3 py-2 cursor-pointer hover:bg-slate-50 rounded-md px-1"
              onClick={() => selectItem({
                type: 'sku',
                id: r.sku,
                label: `${r.sku} · Our ${formatEUR(r.our)} vs market ${formatEUR(r.marketLow)}–${formatEUR(r.marketHigh)} (${r.position})`,
                data: {
                  sku: r.sku,
                  our_price: r.our,
                  market_low: r.marketLow,
                  market_high: r.marketHigh,
                  market_position: r.position,
                },
              })}
            >
              <span className="w-20 text-xs font-mono" style={{ color: '#1a1a2e' }}>{r.sku}</span>
              <div className="relative flex-1 h-6">
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: '6px',
                    borderRadius: '9999px',
                    background: '#e2e8f0',
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '12px',
                    borderRadius: '9999px',
                    background: '#0393da',
                    boxShadow: '0 0 0 2px #ffffff',
                    left: `calc(${pct(r.our)}% - 6px)`,
                  }}
                />
              </div>
              <span className="w-20 text-xs tabular-nums text-right" style={{ color: '#1a1a2e' }}>{formatEUR(r.our)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 text-[11px]" style={{ color: '#737373' }}>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: '16px', height: '4px', background: '#e2e8f0', borderRadius: '9999px' }} />
          <span>{t('phase45.competitive.market')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#0393da', borderRadius: '9999px' }} />
          <span>{t('phase45.competitive.our')}</span>
        </div>
      </div>
    </ChartCard>
  );
}
