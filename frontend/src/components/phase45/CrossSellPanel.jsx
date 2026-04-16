import { IS_DEMO } from '../../utils/brand';
import { getCrossSell } from '../../utils/mockPhase45';
import DataTable from '../shared/DataTable';
import { useLanguage } from '../../context/LanguageContext';
import { useUI } from '../../context/UIContext';
import { buildCrossSellInsight } from '../../utils/insightBuilders';
import productsData from '../../data/products.json';

const realSkuSet = new Set(
  (Array.isArray(productsData) ? productsData : productsData.products || []).map((p) => p.article_id)
);

export default function CrossSellPanel() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const { selectItem, openInsight } = useUI();
  const data = getCrossSell();

  const columns = [
    { key: 'sku', label: t('phase45.crossSell.col.sku'), render: (val) => <span className="font-mono text-xs">{val}</span> },
    { key: 'customer', label: t('phase45.crossSell.col.customer') },
    {
      key: 'confidence',
      label: t('phase45.crossSell.col.confidence'),
      render: (val) => (
        <div className="flex items-center gap-2">
          <div style={{ position: 'relative', width: '90px', height: '6px', background: '#e2e8f0', borderRadius: '9999px' }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${val * 100}%`,
                background: '#0393da',
                borderRadius: '9999px',
              }}
            />
          </div>
          <span className="text-xs tabular-nums font-semibold" style={{ color: '#1a1a2e' }}>{Math.round(val * 100)}%</span>
        </div>
      ),
    },
    { key: 'reason', label: t('phase45.crossSell.col.reason'), render: (val) => <span className="text-xs" style={{ color: '#737373' }}>{val}</span> },
  ];

  return (
    <DataTable
      title={t('phase45.crossSell.title')}
      columns={columns}
      data={data}
      rowKey="sku"
      onRowClick={(row) => {
        selectItem({
          type: 'sku',
          id: row.sku,
          label: `Cross-sell: ${row.sku} → ${row.customer} · ${Math.round(row.confidence * 100)}% confidence`,
          data: {
            sku: row.sku,
            target_customer: row.customer,
            confidence_pct: Math.round(row.confidence * 100),
            reason: row.reason,
          },
        });
        openInsight(buildCrossSellInsight(row, realSkuSet.has(row.sku)));
      }}
    />
  );
}
