import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getChurn } from '../../utils/mockPhase45';
import { useLanguage } from '../../context/LanguageContext';
import ChartCard from '../shared/ChartCard';

export default function ChurnSurvivalCurve() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const churn = getChurn();
  if (!churn) return null;

  const driverMax = Math.max(...churn.drivers.map((d) => Math.abs(d.coef)));

  return (
    <ChartCard
      title={t('phase45.churn.title')}
      subtitle={t('phase45.churn.subtitle')}
    >
      <div className="space-y-6">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={churn.survivalCurve} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id="churnArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0393da" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0393da" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="months"
              tick={{ fontSize: 11, fill: '#737373' }}
              label={{ value: t('phase45.churn.axisMonths'), position: 'insideBottom', offset: -5, fill: '#a3a3a3', fontSize: 10 }}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 11, fill: '#737373' }}
            />
            <RechartsTooltip
              formatter={(v) => [`${Math.round(v * 100)}%`, t('phase45.churn.axisProb')]}
              labelFormatter={(l) => `${l}m`}
            />
            <Area type="monotone" dataKey="retention" stroke="#0393da" strokeWidth={2.5} fill="url(#churnArea)" />
          </AreaChart>
        </ResponsiveContainer>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#737373' }}>
              {t('phase45.churn.drivers')}
            </h4>
            <div className="space-y-2">
              {churn.drivers.map((d) => {
                const widthPct = (Math.abs(d.coef) / driverMax) * 100;
                return (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-44 text-xs flex-shrink-0" style={{ color: '#1a1a2e' }}>{d.name}</span>
                    <div className="relative flex-1 h-4">
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          height: '10px',
                          borderRadius: '4px',
                          background: '#dc2626',
                          width: `${widthPct}%`,
                        }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs tabular-nums font-bold flex-shrink-0" style={{ color: '#dc2626' }}>
                      {d.coef.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#737373' }}>
              {t('phase45.churn.atRisk')}
            </h4>
            <div className="space-y-2">
              {churn.atRisk.map((r) => {
                const pct = Math.round(r.churnProb * 100);
                const bg = r.churnProb >= 0.65 ? '#fee2e2' : r.churnProb >= 0.5 ? '#fef3c7' : '#e0f2fe';
                const color = r.churnProb >= 0.65 ? '#dc2626' : r.churnProb >= 0.5 ? '#d97706' : '#0393da';
                return (
                  <div key={r.customer} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg" style={{ background: '#f8fafc' }}>
                    <span className="text-xs font-semibold" style={{ color: '#1a1a2e' }}>{r.customer}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: '#a3a3a3' }}>{r.lastOrder}</span>
                      <span
                        className="inline-flex text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full"
                        style={{ background: bg, color }}
                      >
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ChartCard>
  );
}
