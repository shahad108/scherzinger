import { formatValue } from './formatters';
import EntityChip from './EntityChip';

const BADGE_CLS = {
  critical: 'bg-red-100 text-red-800 ring-red-200',
  warning:  'bg-amber-100 text-amber-800 ring-amber-200',
  success:  'bg-emerald-100 text-emerald-800 ring-emerald-200',
  neutral:  'bg-slate-100 text-slate-700 ring-slate-200',
};

export default function RankedList({ spec, onEntityClick }) {
  const { items, caption } = spec;
  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <ol>
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-100 first:border-t-0">
            <span className="text-xs font-mono text-slate-400 w-5">{i + 1}</span>
            <span className="flex-1 text-sm">
              <EntityChip {...it} onEntityClick={onEntityClick} />
            </span>
            <span className="text-xs text-slate-500">{it.primary.label}</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">
              {formatValue(it.primary.value, it.primary.format)}
            </span>
            {it.badge && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ring-1 ${BADGE_CLS[it.badge.tone] || BADGE_CLS.neutral}`}>
                {it.badge.text}
              </span>
            )}
          </li>
        ))}
      </ol>
      {caption && <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">{caption}</div>}
    </div>
  );
}
