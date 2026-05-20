import { IS_DEMO } from '../../utils/brand';
import { getWinProbability } from '../../utils/mockPhase45';
import DataTable from '../shared/DataTable';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';
import { useUI } from '../../context/UIContext';

export default function WinProbabilityScorer() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const { selectItem } = useUI();
  const data = getWinProbability();
  const columns = [
    { key: 'quoteId',  label: t('phase45.winProb.col.quote') },
    { key: 'customer', label: t('phase45.winProb.col.customer') },
    {
      key: 'probability',
      label: t('phase45.winProb.col.probability'),
      render: (val) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${val * 100}%`,
                background: val > 0.7 ? '#16a34a' : val > 0.4 ? '#d97706' : '#dc2626',
              }}
            />
          </div>
          <span className="text-xs tabular-nums w-10 text-right">{(val * 100).toFixed(0)}%</span>
        </div>
      ),
    },
  ];
  return (
    <ChartCard
      title={t('phase45.winProb.title')}
      subtitle={t('phase45.winProb.subtitle')}
    >
      <DataTable
        columns={columns}
        data={data}
        rowKey="quoteId"
        onRowClick={(row) => selectItem({
          type: 'chart',
          id: `Quote ${row.quoteId}`,
          label: `Quote ${row.quoteId} · ${row.customer} · ${(row.probability * 100).toFixed(0)}% win probability`,
          data: { quote_id: row.quoteId, customer: row.customer, win_probability_pct: (row.probability * 100).toFixed(0) },
        })}
      />
    </ChartCard>
  );
}
