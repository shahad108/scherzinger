import { useChat } from '../../../context/ChatContext';

export default function Clarification({ spec }) {
  const { sendMessage } = useChat();
  return (
    <div className="my-3 rounded-xl ring-1 ring-blue-200 bg-blue-50 p-4">
      <div className="text-sm font-medium text-blue-900">{spec.question}</div>
      {Array.isArray(spec.suggestions) && spec.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {spec.suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => sendMessage(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-white ring-1 ring-blue-200 text-blue-800 hover:bg-blue-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
