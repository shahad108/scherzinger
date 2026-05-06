import type { RejectionRow } from '@/types';

export function RejectionList({ rows }: { rows: RejectionRow[] }) {
  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
          Why we lose · ranked by revenue lost
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Rejection codes from the lost-quote pipeline. KA dominates — data-quality issue you should
          drive.
        </p>
      </div>
      <div className="mb-6 flex flex-col gap-2.5">
        {rows.map((r) => (
          <div
            key={r.rank}
            className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--hairline)] bg-white p-4 shadow-[var(--shadow)] transition-shadow hover:shadow-[var(--shadow-md)]"
          >
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--ink)] font-display text-sm font-bold text-white">
              {r.rank}
            </div>
            <div className="min-w-[200px] flex-1">
              <div className="font-display text-sm font-bold text-[var(--ink)]">{r.code}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{r.subtitle}</div>
            </div>
            <div className="text-right">
              <div className="font-display text-base font-bold tabular-nums text-[var(--red)]">
                {r.lostRevenue}
              </div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                {r.share} of lost
              </div>
            </div>
            <div className="border-l border-[var(--hairline)] pl-4 text-right">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Owner
              </div>
              <div className="mt-0.5 text-xs font-semibold text-[var(--ink-2)]">{r.owner}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
