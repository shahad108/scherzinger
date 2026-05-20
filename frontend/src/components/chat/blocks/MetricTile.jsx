import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

const DIR_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };
const DIR_COLOR = { up: 'text-emerald-600', down: 'text-red-600', flat: 'text-slate-400' };

export default function MetricTile({ spec, compact = false }) {
  const { label, value, unit, delta, deltaDirection, caption } = spec;
  const Icon = DIR_ICON[deltaDirection] || null;
  const pad = compact ? 'px-3 py-2' : 'px-4 py-3';
  const valueCls = compact ? 'text-base font-bold text-slate-900' : 'text-2xl font-bold text-slate-900';
  const labelCls = compact
    ? 'text-[10px] font-medium text-slate-500 uppercase tracking-wide'
    : 'text-xs font-medium text-slate-500 uppercase tracking-wide';
  const unitCls = compact ? 'text-[11px] text-slate-500' : 'text-sm text-slate-500';
  return (
    <div className={`rounded-xl ring-1 ring-slate-200 bg-white ${pad} my-1.5`}>
      <div className={labelCls}>{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <div className={valueCls}>{value}</div>
        {unit && <div className={unitCls}>{unit}</div>}
      </div>
      {delta != null && (
        <div className={`mt-0.5 flex items-center gap-1 text-[11px] ${DIR_COLOR[deltaDirection] || 'text-slate-600'}`}>
          {Icon && <Icon className="w-3 h-3" />}
          <span>{delta}</span>
        </div>
      )}
      {!compact && caption && <div className="mt-2 text-xs text-slate-500 leading-relaxed">{caption}</div>}
    </div>
  );
}
