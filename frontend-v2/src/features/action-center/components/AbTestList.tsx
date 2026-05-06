import { Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import type { AbTestCard, Tone } from '@/types';

function toneToBadge(t: Tone): React.ComponentProps<typeof Badge>['tone'] {
  if (t === 'rose') return 'rose';
  return t;
}

const liftClass: Record<Tone, string> = {
  positive: 'text-[var(--green)]',
  negative: 'text-[var(--red)]',
  warning: 'text-[var(--amber)]',
  info: 'text-[var(--primary-deep)]',
  rose: 'text-[var(--rose)]',
  neutral: 'text-[var(--ink)]',
};

export function AbTestList({ tests }: { tests: AbTestCard[] }) {
  return (
    <>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
            A/B Test Tracker
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Test before broad rollout. Frank's first-class workflow.
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]">
          <Plus size={12} />
          Start new A/B test
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {tests.map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow)]"
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--ink)] font-display text-sm font-bold text-white">
                {t.rank}
              </div>
              <div className="flex-1">
                <div className="font-display text-[14px] font-bold text-[var(--ink)]">
                  {t.title}
                </div>
                <div className="text-xs text-[var(--muted)]">{t.subtitle}</div>
              </div>
              <Badge tone={toneToBadge(t.trendTone)}>{t.trend}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--hairline)] pt-4 md:grid-cols-4">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Pre margin
                </div>
                <div className="mt-0.5 font-display text-base font-bold tabular-nums text-[var(--ink)]">
                  {t.preMargin}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Post margin
                </div>
                <div className="mt-0.5 font-display text-base font-bold tabular-nums text-[var(--green)]">
                  {t.postMargin}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Lift
                </div>
                <div
                  className={cn(
                    'mt-0.5 font-display text-base font-bold tabular-nums',
                    liftClass[t.liftTone],
                  )}
                >
                  {t.lift}
                </div>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Status
                </div>
                <div className="mt-0.5 font-display text-base font-bold tabular-nums text-[var(--ink)]">
                  {t.status}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]">
                Hold
              </button>
              <button className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]">
                Stop test
              </button>
              <button className="ml-auto rounded-md bg-[var(--rose)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--rose-deep)]">
                Promote to full rollout →
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
