export default function Clarification({ spec, compact = false, onSuggestionClick }) {
  // Chips are routed via onSuggestionClick — mini-chat and AI Insights each
  // pass a handler that targets the correct conversation. If absent, chips
  // are disabled (should never happen in production).
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
              disabled={!onSuggestionClick}
              onClick={() => onSuggestionClick?.(s)}
              className={`${chipCls} rounded-full bg-white ring-1 ring-blue-200 text-blue-800 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
