import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getBreakEven } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';

export default function BreakEvenChart() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const [first] = getBreakEven();
  if (!first) return null;
  return (
    <ChartCard title={t('phase45.breakEven.title')} subtitle={`${first.sku} — ${t('phase45.breakEven.subtitle')}`}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={first.curve}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="units" label={{ value: t('phase45.breakEven.axisVolume'), position: 'insideBottom', offset: -4, fill: '#737373', fontSize: 11 }} tick={{ fontSize: 11, fill: '#737373' }} />
          <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#737373' }} />
          <Tooltip formatter={(v) => `€${v.toLocaleString()}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="revenue" name={t('phase45.breakEven.labelRevenue')} stroke="#0393da" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="cost"    name={t('phase45.breakEven.labelCost')}    stroke="#dc2626" strokeWidth={2} dot={false} />
          <ReferenceLine x={first.breakEvenUnits} stroke="#16a34a" strokeDasharray="4 4" label={{ value: t('phase45.breakEven.labelBreak'), fill: '#16a34a', fontSize: 11 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
