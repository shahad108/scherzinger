import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getLostOpportunity } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';
import { useUI } from '../../context/UIContext';
import { handlePieClick } from '../../utils/pageContextResolver';
import { formatEUR } from '../../utils/formatters';

const SLICE_COLORS = ['#0393da', '#1a1a2e', '#d97706', '#16a34a', '#7c3aed', '#dc2626'];

export default function LostOpportunitySunburst() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const { selectItem } = useUI();
  const lost = getLostOpportunity();
  if (!lost) return null;
  const reasons = lost.byReason || [];
  const pieData = reasons.map((r) => ({ name: r.label, value: r.amount, code: r.code }));
  return (
    <ChartCard
      title={t('phase45.lostOpp.title')}
      subtitle={t('phase45.lostOpp.subtitle')}
    >
      <div className="flex items-center gap-4">
        <div style={{ position: 'relative', width: '260px', height: '260px', flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={2}
                stroke="#ffffff"
                strokeWidth={2}
                onClick={(data) => handlePieClick('Lost opportunity by reason', selectItem, data)}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatEUR(value)} />
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a2e', fontFamily: "'Manrope', sans-serif" }}>
              {formatEUR(lost.total)}
            </div>
            <div style={{ fontSize: '10px', color: '#737373', marginTop: '2px' }}>
              {t('phase45.lostOpp.total')}
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {reasons.map((r, i) => (
            <div
              key={r.code}
              className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded-md px-1 py-1"
              onClick={() => selectItem({
                type: 'chart',
                id: `Lost opportunity: ${r.code}`,
                label: `Lost opportunity: ${r.code} ${r.label} · ${formatEUR(r.amount)}`,
                data: { code: r.code, reason: r.label, amount: r.amount, total_lost: lost.total, share: ((r.amount / lost.total) * 100).toFixed(1) + '%' },
              })}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  background: SLICE_COLORS[i % SLICE_COLORS.length],
                  flexShrink: 0,
                }}
              />
              <span style={{ color: '#1a1a2e', fontWeight: 600, minWidth: '24px' }}>{r.code}</span>
              <span style={{ color: '#737373', flex: 1 }}>{r.label}</span>
              <span className="tabular-nums" style={{ color: '#1a1a2e', fontWeight: 600 }}>{formatEUR(r.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}
