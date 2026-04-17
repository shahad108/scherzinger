import { useChat } from '../../../context/ChatContext';

export default function Clarification({ spec, compact = false }) {
  const { sendMessage } = useChat();
  const titleCls = compact ? 'text-xs' : 'text-sm';
  const chipCls = compact ? 'text-[11px] px-2.5 py-1' : 'text-xs px-3 py-1.5';
  return (
    <div className={`my-3 rounded-xl ring-1 ring-blue-200 bg-blue-50 ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`${titleCls} font-medium text-blue-900`}>{spec.question}</div>
      {Array.isArray(spec.suggestions) && spec.suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {spec.suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => sendMessage(s)}
              className={`${chipCls} rounded-full bg-white ring-1 ring-blue-200 text-blue-800 hover:bg-blue-100`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
