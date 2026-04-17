import { TONE_RING } from './formatters';

export default function Narrative({ spec }) {
  const { text, tone } = spec;
  if (!tone || tone === 'neutral') {
    return <p className="text-sm leading-relaxed text-slate-700 my-2">{text}</p>;
  }
  return (
    <div className={`text-sm leading-relaxed ring-1 rounded-lg px-3 py-2 my-2 ${TONE_RING[tone] || TONE_RING.neutral}`}>
      {text}
    </div>
  );
}
