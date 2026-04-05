import Tooltip from './Tooltip';

const variantClasses = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-[#c1e8ff] text-[#004b72]',
  neutral: 'bg-slate-50 text-slate-600',
};

const dotColors = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-[#0393da]',
  neutral: 'bg-slate-400',
};

export default function StatusBadge({ label, variant = 'neutral', tooltip }) {
  const badge = (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${variantClasses[variant]}`}>
      <span className={`size-1.5 rounded-full ${dotColors[variant]}`} />
      {label}
    </span>
  );
  if (!tooltip) return badge;
  return <Tooltip text={tooltip}>{badge}</Tooltip>;
}
