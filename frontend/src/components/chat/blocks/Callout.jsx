import { Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TONE_RING } from './formatters';

const ICON = { insight: Info, warning: AlertTriangle, success: CheckCircle2 };

export default function Callout({ spec }) {
  const Icon = ICON[spec.tone] || Info;
  return (
    <div className={`flex items-start gap-2 text-sm ring-1 rounded-lg px-3 py-2 my-2 ${TONE_RING[spec.tone] || TONE_RING.insight}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="leading-relaxed">{spec.text}</span>
    </div>
  );
}
