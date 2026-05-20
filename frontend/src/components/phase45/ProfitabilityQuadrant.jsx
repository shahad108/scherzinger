import { ScatterChart, Scatter, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getProfitability } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';

const quadrantColor = { star: '#16a34a', cashcow: '#0393da', questionmark: '#d97706', dog: '#dc2626' };

export default function ProfitabilityQuadrant() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getProfitability().map((d) => ({ ...d, fill: quadrantColor[d.quadrant] }));
  const medianRev    = data.map((d) => d.revenue).sort((a, b) => a - b)[Math.floor(data.length / 2)];
  const medianMargin = 0.62;
  return (
    <ChartCard title={t('phase45.profitability.title')} subtitle={t('phase45.profitability.subtitle')}>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 24, bottom: 24, left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="revenue"
            type="number"
            tickFormatter={(v) => `€${(v / 1e6).toFixed(1)}M`}
            tick={{ fontSize: 11, fill: '#737373' }}
            label={{ value: t('phase45.profitability.axisRevenue'), position: 'insideBottom', offset: -6, fill: '#737373', fontSize: 11 }}
          />
          <YAxis
            dataKey="margin"
            type="number"
            domain={[0.3, 0.8]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: '#737373' }}
            label={{ value: t('phase45.profitability.axisMargin'), angle: -90, position: 'insideLeft', fill: '#737373', fontSize: 11 }}
          />
          <Tooltip formatter={(v, name) => name === 'margin' ? `${(v * 100).toFixed(1)}%` : `€${v.toLocaleString()}`} />
          <ReferenceLine x={medianRev} stroke="#cbd5e1" strokeDasharray="4 4" />
          <ReferenceLine y={medianMargin} stroke="#cbd5e1" strokeDasharray="4 4" />
          <Scatter data={data} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
