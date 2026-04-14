import { IS_DEMO } from '../../utils/brand';
import { getPriceOptimizer } from '../../utils/mockPhase45';
import DataTable from '../shared/DataTable';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';
import { formatEUR } from '../../utils/formatters';

export default function PriceOptimizer() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getPriceOptimizer();
  const columns = [
    { key: 'sku',            label: t('phase45.priceOptimizer.col.sku') },
    { key: 'current',        label: t('phase45.priceOptimizer.col.current'),        render: (val) => formatEUR(val) },
    { key: 'suggested',      label: t('phase45.priceOptimizer.col.suggested'),      render: (val) => formatEUR(val) },
    { key: 'min',            label: t('phase45.priceOptimizer.col.min'),            render: (val) => formatEUR(val) },
    { key: 'max',            label: t('phase45.priceOptimizer.col.max'),            render: (val) => formatEUR(val) },
    {
      key: 'expectedMargin',
      label: t('phase45.priceOptimizer.col.expectedMargin'),
      render: (val) => `${(val * 100).toFixed(1)}%`,
    },
  ];
  return (
    <ChartCard
      title={t('phase45.priceOptimizer.title')}
      subtitle={t('phase45.priceOptimizer.subtitle')}
    >
      <DataTable columns={columns} data={data} rowKey="sku" />
    </ChartCard>
  );
}
