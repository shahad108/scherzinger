import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

const DIR_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };
const DIR_COLOR = { up: 'text-emerald-600', down: 'text-red-600', flat: 'text-slate-400' };

export default function MetricTile({ spec }) {
  const { label, value, unit, delta, deltaDirection, caption } = spec;
  const Icon = DIR_ICON[deltaDirection] || null;
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white px-4 py-3 my-2">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {unit && <div className="text-sm text-slate-500">{unit}</div>}
      </div>
      {delta != null && (
        <div className={`mt-1 flex items-center gap-1 text-xs ${DIR_COLOR[deltaDirection] || 'text-slate-600'}`}>
          {Icon && <Icon className="w-3 h-3" />}
          <span>{delta}</span>
        </div>
      )}
      {caption && <div className="mt-2 text-xs text-slate-500 leading-relaxed">{caption}</div>}
    </div>
  );
}
