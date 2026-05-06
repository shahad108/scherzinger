import { motion } from 'motion/react';
import { ArrowRight, Plus, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import type { DecisionCard, Tone } from '@/types';

function toneToBadge(t: Tone): React.ComponentProps<typeof Badge>['tone'] {
  if (t === 'rose') return 'rose';
  return t;
}

const rankBgBySeverity: Record<DecisionCard['severity'], string> = {
  error: 'bg-[var(--red)]',
  warning: 'bg-[var(--amber)]',
  info: 'bg-[var(--ink)]',
  success: 'bg-[var(--green)]',
};

const metaToneClass: Record<Tone, string> = {
  positive: 'text-[var(--green)]',
  negative: 'text-[var(--red)]',
  warning: 'text-[var(--amber)]',
  info: 'text-[var(--primary-deep)]',
  rose: 'text-[var(--rose)]',
  neutral: 'text-[var(--ink)]',
};

export function DecisionCards({ decisions }: { decisions: DecisionCard[] }) {
  return (
    <>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
            Today's analyst decisions
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Ranked by impact. Frank analyzes; outputs flow to Heiko (Sales) and Till (MD). Generated
            Mon 8:00 · reranks daily.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="grid h-8 w-8 place-items-center rounded-md border border-[var(--hairline)] bg-white text-[var(--muted)] transition-colors hover:bg-[var(--grey-bg)] hover:text-[var(--ink-2)]"
            title="Add"
          >
            <Plus size={14} />
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-md border border-[var(--hairline)] bg-white text-[var(--muted)] transition-colors hover:bg-[var(--grey-bg)] hover:text-[var(--ink-2)]"
            title="More"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>
      <div className="mb-6 flex flex-col gap-3">
        {decisions.map((d, i) => (
          <motion.div
            key={d.rank}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-white shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-md)]"
          >
            <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
              <div
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-sm font-bold text-white shadow-sm',
                  rankBgBySeverity[d.severity],
                )}
              >
                {d.rank}
              </div>
              <div className="flex-1">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-display text-[15px] font-bold leading-snug tracking-tight text-[var(--ink)]">
                    {d.title}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {d.tags.map((t) => (
                      <Badge key={t.label} tone={toneToBadge(t.tone)}>
                        {t.label}
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="mb-4 text-[13px] leading-relaxed text-[var(--muted)]">{d.why}</p>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--hairline)] pt-4 md:grid-cols-4">
                  {d.meta.map((m) => (
                    <div key={m.k}>
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        {m.k}
                      </div>
                      <div
                        className={cn(
                          'mt-0.5 font-display text-sm font-bold tabular-nums',
                          metaToneClass[m.tone],
                        )}
                      >
                        {m.v}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <button className="rounded-md border border-[var(--green-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--green)] transition-colors hover:bg-[var(--green-bg)]">
                      Accept
                    </button>
                    <button className="rounded-md border border-[var(--amber-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--amber)] transition-colors hover:bg-[var(--amber-bg)]">
                      Park
                    </button>
                    <button className="rounded-md border border-[var(--red-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--red)] transition-colors hover:bg-[var(--red-bg)]">
                      Reject
                    </button>
                  </div>
                  <button className="inline-flex items-center gap-1.5 rounded-md bg-[var(--rose)] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--rose-deep)]">
                    {d.cta}
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}
