import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getElasticity } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';
import { useUI } from '../../context/UIContext';
import { handleChartContainerClick } from '../../utils/pageContextResolver';

export default function ElasticityCurve() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const { selectItem } = useUI();
  const elasticity = getElasticity();
  if (!elasticity) return null;
  const points = elasticity.points || [];
  return (
    <ChartCard
      title={t('phase45.elasticity.title')}
      subtitle={t('phase45.elasticity.subtitle')}
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={points} margin={{ top: 10, right: 20, bottom: 10, left: 0 }} onClick={(state) => handleChartContainerClick('Price elasticity curve', selectItem, points, state)}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          <XAxis
            dataKey="priceDelta"
            tick={{ fontSize: 11, fill: '#737373' }}
            tickFormatter={(v) => `${v}%`}
            label={{ value: t('phase45.elasticity.axisPrice'), position: 'insideBottom', offset: -2, fontSize: 11, fill: '#737373' }}
          />
          <YAxis
            dataKey="winRate"
            tick={{ fontSize: 11, fill: '#737373' }}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            label={{ value: t('phase45.elasticity.axisWinRate'), angle: -90, position: 'insideLeft', fontSize: 11, fill: '#737373' }}
          />
          <Tooltip
            formatter={(value) => `${Math.round(value * 100)}%`}
            labelFormatter={(label) => `${label}%`}
          />
          <Line
            type="monotone"
            dataKey="winRate"
            stroke="#0393da"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
