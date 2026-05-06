import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { BucketCard, Tone } from '@/types';

const avatarColors = ['bg-stone-300', 'bg-purple-200', 'bg-orange-200', 'bg-amber-200'];

function toneToBadge(t: Tone): React.ComponentProps<typeof Badge>['tone'] {
  if (t === 'rose') return 'rose';
  return t;
}

export function BucketGrid({ buckets }: { buckets: BucketCard[] }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      {buckets.map((b) => (
        <div
          key={b.id}
          className="rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-md)]"
        >
          <div className="mb-3">
            <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--ink)]">
              {b.title}
            </h3>
            <div className="mt-1 text-xs text-[var(--muted)]">{b.subtitle}</div>
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {b.tags.map((t) => (
              <Badge key={t.label} tone={toneToBadge(t.tone)}>
                {t.label}
              </Badge>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex -space-x-2">
              {b.avatars.map((a, i) => (
                <div
                  key={a + i}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-[var(--ink-2)] ${
                    a.startsWith('+') ? 'bg-stone-100 text-[var(--muted)]' : avatarColors[i % avatarColors.length]
                  }`}
                >
                  {a}
                </div>
              ))}
            </div>
            <button className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--rose)] transition-colors hover:text-[var(--rose-deep)]">
              {b.cta}
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
