import { formatValue } from './formatters';
import EntityChip from './EntityChip';

const BADGE_CLS = {
  critical: 'bg-red-100 text-red-800 ring-red-200',
  warning:  'bg-amber-100 text-amber-800 ring-amber-200',
  success:  'bg-emerald-100 text-emerald-800 ring-emerald-200',
  neutral:  'bg-slate-100 text-slate-700 ring-slate-200',
};

const COMPACT_ITEM_LIMIT = 5;

export default function RankedList({ spec, onEntityClick, compact = false }) {
  const { items, caption } = spec;
  const visible = compact ? items.slice(0, COMPACT_ITEM_LIMIT) : items;
  const overflowCount = compact ? Math.max(0, items.length - visible.length) : 0;
  const rowPad = compact ? 'px-3 py-1.5' : 'px-4 py-2.5';
  const textCls = compact ? 'text-[11px]' : 'text-sm';
  return (
    <div className="my-2 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <ol>
        {visible.map((it, i) => (
          <li key={it.id} className={`flex items-center gap-2 ${rowPad} border-t border-slate-100 first:border-t-0`}>
            <span className="text-[11px] font-mono text-slate-400 w-4 shrink-0">{i + 1}</span>
            <span className={`flex-1 min-w-0 truncate ${textCls}`}>
              <EntityChip {...it} onEntityClick={onEntityClick} />
            </span>
            {!compact && <span className="text-xs text-slate-500">{it.primary.label}</span>}
            <span className={`${compact ? 'text-[11px]' : 'text-sm'} font-semibold text-slate-900 tabular-nums`}>
              {formatValue(it.primary.value, it.primary.format)}
            </span>
            {it.badge && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${BADGE_CLS[it.badge.tone] || BADGE_CLS.neutral}`}>
                {it.badge.text}
              </span>
            )}
          </li>
        ))}
      </ol>
      {overflowCount > 0 && (
        <div className="px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500 italic border-t border-slate-100">
          +{overflowCount} more in detailed view
        </div>
      )}
      {!compact && caption && <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">{caption}</div>}
    </div>
  );
}
