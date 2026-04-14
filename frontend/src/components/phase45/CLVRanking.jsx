import { IS_DEMO } from '../../utils/brand';
import { getCLVRanking } from '../../utils/mockPhase45';
import DataTable from '../shared/DataTable';
import { useLanguage } from '../../context/LanguageContext';
import { formatEUR } from '../../utils/formatters';

const TIER_COLORS = {
  platinum: '#1a1a2e',
  gold:     '#d97706',
  silver:   '#94a3b8',
  bronze:   '#b45309',
};

export default function CLVRanking() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getCLVRanking();

  const columns = [
    { key: 'customer', label: t('phase45.clv.col.customer') },
    { key: 'clv', label: t('phase45.clv.col.clv'), render: (val) => <span className="font-semibold tabular-nums">{formatEUR(val)}</span> },
    {
      key: 'tier',
      label: t('phase45.clv.col.tier'),
      render: (val) => (
        <span
          className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
          style={{ background: TIER_COLORS[val] || '#737373' }}
        >
          {val}
        </span>
      ),
    },
    {
      key: 'retentionProb',
      label: t('phase45.clv.col.retention'),
      render: (val) => (
        <div className="flex items-center gap-2">
          <div style={{ position: 'relative', width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '9999px' }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${val * 100}%`,
                background: val >= 0.8 ? '#16a34a' : val >= 0.6 ? '#d97706' : '#dc2626',
                borderRadius: '9999px',
              }}
            />
          </div>
          <span className="text-xs tabular-nums" style={{ color: '#1a1a2e' }}>{Math.round(val * 100)}%</span>
        </div>
      ),
    },
    { key: 'monthsActive', label: t('phase45.clv.col.months') },
  ];

  return (
    <DataTable
      title={t('phase45.clv.title')}
      columns={columns}
      data={data}
      rowKey="customer"
    />
  );
}
