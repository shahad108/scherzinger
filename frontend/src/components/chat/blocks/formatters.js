export function formatValue(v, format) {
  if (v == null) return '—';
  if (format === 'currency') {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }
  if (format === 'percent') {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    const pct = n > 1 ? n : n * 100;
    return `${pct.toFixed(1)}%`;
  }
  if (format === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return new Intl.NumberFormat('en-US').format(n);
  }
  return String(v);
}

export const TONE_RING = {
  insight:  'ring-blue-200 bg-blue-50 text-blue-900',
  warning:  'ring-amber-200 bg-amber-50 text-amber-900',
  success:  'ring-emerald-200 bg-emerald-50 text-emerald-900',
  neutral:  'ring-slate-200 bg-slate-50 text-slate-800',
  critical: 'ring-red-200 bg-red-50 text-red-900',
};

export const STATUS_DOT = {
  critical: 'bg-red-500',
  moderate: 'bg-amber-500',
  stable:   'bg-emerald-500',
  strong:   'bg-emerald-500',
  weak:     'bg-red-500',
};

export const STATUS_LABEL = {
  critical: 'Critical',
  moderate: 'Moderate',
  stable:   'Stable',
  strong:   'Strong',
  weak:     'Weak',
};
