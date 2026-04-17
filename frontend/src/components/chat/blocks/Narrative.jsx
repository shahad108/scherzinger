import { TONE_RING } from './formatters';

export default function Narrative({ spec, compact = false }) {
  const { text, tone } = spec;
  const textCls = compact ? 'text-xs leading-snug' : 'text-sm leading-relaxed';
  if (!tone || tone === 'neutral') {
    return <p className={`${textCls} text-slate-700 my-1.5`}>{text}</p>;
  }
  return (
    <div className={`${textCls} ring-1 rounded-lg px-3 py-2 my-1.5 ${TONE_RING[tone] || TONE_RING.neutral}`}>
      {text}
    </div>
  );
}
