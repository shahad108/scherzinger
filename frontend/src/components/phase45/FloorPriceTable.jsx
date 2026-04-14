import { IS_DEMO } from '../../utils/brand';
import { getFloorPrices } from '../../utils/mockPhase45';
import DataTable from '../shared/DataTable';
import { useLanguage } from '../../context/LanguageContext';
import { formatEUR } from '../../utils/formatters';

export default function FloorPriceTable() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getFloorPrices();
  const columns = [
    { key: 'sku',     label: t('phase45.floorPrice.col.sku') },
    { key: 'name',    label: t('phase45.floorPrice.col.name') },
    { key: 'cg',      label: t('phase45.floorPrice.col.cg') },
    { key: 'hkvoll',  label: t('phase45.floorPrice.col.hkvoll'),  render: (val) => formatEUR(val) },
    { key: 'floor',   label: t('phase45.floorPrice.col.floor'),   render: (val) => formatEUR(val) },
    { key: 'current', label: t('phase45.floorPrice.col.current'), render: (val) => formatEUR(val) },
    {
      key: 'gap',
      label: t('phase45.floorPrice.col.gap'),
      render: (val) => (
        <span style={{ color: val >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
          {val >= 0 ? '+' : ''}{formatEUR(val)}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      title={t('phase45.floorPrice.title')}
      columns={columns}
      data={data}
      rowKey="sku"
    />
  );
}
