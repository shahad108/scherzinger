import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceArea } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getMonteCarloHistogram } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';

export default function MonteCarloHistogram() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getMonteCarloHistogram();
  return (
    <ChartCard
      title={t('phase45.scenarioLab.monteCarlo')}
      subtitle={t('phase45.scenarioLab.monteCarloSubtitle')}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <XAxis
            dataKey="margin"
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: '#737373' }}
          />
          <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
          <Tooltip
            formatter={(v) => [v.toLocaleString(), 'runs']}
            labelFormatter={(v) => `${Math.round(v * 100)}% margin`}
          />
          <ReferenceArea x1={0.59} x2={0.77} fill="#0393da" fillOpacity={0.08} />
          <Bar dataKey="count" fill="#0393da" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
