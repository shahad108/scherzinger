import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/cn';
import type { NegotiationData, Tone } from '@/types';

const toneClass: Record<Tone, string> = {
  positive: 'text-[var(--green)]',
  negative: 'text-[var(--red)]',
  warning: 'text-[var(--amber)]',
  info: 'text-[var(--primary-deep)]',
  rose: 'text-[var(--rose)]',
  neutral: 'text-[var(--ink)]',
};

export function NegotiationCockpit({ data }: { data: NegotiationData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
            Annual list-price negotiation cockpit
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Synthesized prep — list vs quoted, commodity trajectory, market direction.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]"
        >
          {open ? 'Collapse' : 'Expand'}
          <ChevronDown
            size={12}
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6 overflow-hidden"
          >
            <div className="rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow)]">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    8-commodity trajectory
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {data.commodities.map((c) => (
                      <div
                        key={c.name}
                        className="flex items-center justify-between rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2 text-xs"
                      >
                        <span className="font-semibold text-[var(--ink-2)]">{c.name}</span>
                        <span className={cn('font-display font-bold tabular-nums', toneClass[c.tone])}>
                          {c.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg bg-[var(--surface-soft)] p-5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Discount gap
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-bold tabular-nums text-[var(--ink)]">
                      {data.discountGap}
                    </span>
                    <span className="text-sm font-bold text-[var(--green)]">
                      {data.discountGapDelta}
                    </span>
                  </div>
                  <div className="mt-4 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Market direction
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[var(--ink-3)]">
                    {data.summary.map((s, i) => (
                      <li key={i} className={i === data.summary.length - 1 ? 'font-semibold text-[var(--ink)]' : ''}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
