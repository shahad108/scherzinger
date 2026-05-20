import { ExternalLink } from 'lucide-react';

export default function EntityChip({ id, label, entityType, onEntityClick }) {
  if (!entityType || !onEntityClick) {
    return <span className="font-semibold text-slate-900">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onEntityClick({ entityType, id })}
      className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:underline"
    >
      {label}
      <ExternalLink className="w-3 h-3 opacity-60" />
    </button>
  );
}
