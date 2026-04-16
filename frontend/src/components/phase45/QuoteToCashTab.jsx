import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { Clock } from 'lucide-react';
import { IS_DEMO } from '../../utils/brand';
import { getQuoteToCash } from '../../utils/mockPhase45';
import { useLanguage } from '../../context/LanguageContext';
import { useUI } from '../../context/UIContext';
import { handleChartContainerClick } from '../../utils/pageContextResolver';
import ChartCard from '../shared/ChartCard';
import KPICard from '../shared/KPICard';
import quotes from '../../data/quotes.json';

export default function QuoteToCashTab() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const { selectItem, openQuoteDetail } = useUI();
  const q = getQuoteToCash();
  if (!q) return null;

  const driverMax = Math.max(...q.drivers.map((d) => Math.abs(d.coef)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: 4 KPI tiles in a 2x2 */}
        <div className="grid grid-cols-2 gap-4">
          <KPICard
            label={t('phase45.quoteToCash.median')}
            value={`${q.median}d`}
            icon={Clock}
            changeType="neutral"
            compact
          />
          <KPICard
            label={t('phase45.quoteToCash.mean')}
            value={`${q.mean}d`}
            icon={Clock}
            changeType="neutral"
            compact
          />
          <KPICard
            label={t('phase45.quoteToCash.p25')}
            value={`${q.p25}d`}
            icon={Clock}
            changeType="positive"
            compact
          />
          <KPICard
            label={t('phase45.quoteToCash.p75')}
            value={`${q.p75}d`}
            icon={Clock}
            changeType="warning"
            compact
          />
        </div>
        {/* Right: timeline CDF */}
        <ChartCard
          title={t('phase45.quoteToCash.title')}
          subtitle={t('phase45.quoteToCash.subtitle')}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={q.timeline} margin={{ top: 10, right: 10, left: 0, bottom: 10 }} onClick={(state) => handleChartContainerClick('Quote-to-Cash timeline', selectItem, q.timeline, state)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: '#737373' }}
                label={{ value: 'Days', position: 'insideBottom', offset: -5, fill: '#a3a3a3', fontSize: 10 }}
              />
              <YAxis
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                tick={{ fontSize: 11, fill: '#737373' }}
                domain={[0, 1]}
              />
              <RechartsTooltip
                formatter={(v) => [`${Math.round(v * 100)}%`, 'Cumulative']}
                labelFormatter={(l) => `Day ${l}`}
              />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="#0393da"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#0393da' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Drivers bar list */}
      <ChartCard title={t('phase45.quoteToCash.drivers')}>
        <div className="space-y-2">
          {q.drivers.map((d) => {
            const absWidth = (Math.abs(d.coef) / driverMax) * 100;
            const positive = d.coef >= 0;
            return (
              <div
                key={d.name}
                className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-md px-1"
                onClick={() => selectItem({
                  type: 'chart',
                  id: `Quote-to-Cash driver: ${d.name}`,
                  label: `Quote-to-Cash driver: ${d.name} (coef ${d.coef >= 0 ? '+' : ''}${d.coef.toFixed(2)})`,
                  data: { driver: d.name, coefficient: d.coef, direction: d.coef >= 0 ? 'slows quote-to-cash' : 'speeds up quote-to-cash' },
                })}
              >
                <span className="w-48 text-xs flex-shrink-0" style={{ color: '#1a1a2e' }}>{d.name}</span>
                <div className="relative flex-1 h-5 flex items-center">
                  <div style={{ position: 'absolute', top: '50%', left: '50%', width: '1px', height: '100%', background: '#e2e8f0', transform: 'translateX(-50%)' }} />
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      height: '12px',
                      borderRadius: '4px',
                      background: positive ? '#dc2626' : '#16a34a',
                      left: positive ? '50%' : `${50 - absWidth / 2}%`,
                      width: `${absWidth / 2}%`,
                    }}
                  />
                </div>
                <span
                  className="w-14 text-right text-xs tabular-nums font-bold flex-shrink-0"
                  style={{ color: positive ? '#dc2626' : '#16a34a' }}
                >
                  {positive ? '+' : ''}{d.coef.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </ChartCard>

      {/* Open quotes table — rows open quote detail slide-over */}
      <ChartCard title="Open quotes" subtitle="Click a row to see why win probability is what it is">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b">
                <th className="px-3 py-2">Quote</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Win prob.</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => openQuoteDetail(row.id)}
                  className="cursor-pointer hover:bg-slate-50 border-b border-slate-50"
                >
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.id}</td>
                  <td className="px-3 py-2 text-slate-600">{row.customerName}</td>
                  <td className="px-3 py-2 text-slate-500">{row.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">€{row.value.toLocaleString()}</td>
                  <td
                    className="px-3 py-2 text-right tabular-nums font-semibold"
                    style={{ color: row.winProbability >= 0.6 ? '#16a34a' : row.winProbability >= 0.4 ? '#d97706' : '#dc2626' }}
                  >
                    {Math.round(row.winProbability * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
