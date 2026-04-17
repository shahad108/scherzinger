import { Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TONE_RING } from './formatters';

const ICON = { insight: Info, warning: AlertTriangle, success: CheckCircle2 };

export default function Callout({ spec, compact = false }) {
  const Icon = ICON[spec.tone] || Info;
  const textCls = compact ? 'text-xs' : 'text-sm';
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className={`flex items-start gap-2 ${textCls} ring-1 rounded-lg px-3 py-2 my-1.5 ${TONE_RING[spec.tone] || TONE_RING.insight}`}>
      <Icon className={`${iconSize} mt-0.5 shrink-0`} />
      <span className="leading-relaxed">{spec.text}</span>
    </div>
  );
}
