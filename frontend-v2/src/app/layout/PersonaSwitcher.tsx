import { usePersona } from '@/hooks/usePersona';
import { cn } from '@/lib/cn';
import type { Persona } from '@/types';

const personas: { id: Persona; label: string }[] = [
  { id: 'frank', label: 'Frank' },
  { id: 'till', label: 'Till' },
  { id: 'heiko', label: 'Heiko' },
];

export function PersonaSwitcher() {
  const { persona, setPersona } = usePersona();
  return (
    <div className="inline-flex rounded-full border border-[var(--border-subtle)] bg-gray-50 p-0.5">
      {personas.map((p) => (
        <button
          key={p.id}
          onClick={() => setPersona(p.id)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            persona === p.id
              ? 'bg-white text-gray-900 shadow-[var(--shadow-1)]'
              : 'text-gray-600 hover:text-gray-900',
            p.id !== 'frank' && 'cursor-not-allowed opacity-60',
          )}
          disabled={p.id !== 'frank'}
          title={p.id !== 'frank' ? 'Frank only in v2' : undefined}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
