import type { MovableLockedSplit } from '@/types';

interface Props {
  data: MovableLockedSplit;
}

export function MovableLockedOverlay({ data }: Props) {
  return (
    <div className="mt-4 rounded-[11px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2.5">
        <span className="text-[12px] font-bold text-[var(--ink)]">
          Of the {data.totalLeakage} total leakage — what's actionable this cycle?
        </span>
        <span
          className="text-[11px] text-[var(--muted)] [&_code]:rounded [&_code]:bg-white [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[10.5px] [&_code]:text-[var(--rose-deep)]"
          dangerouslySetInnerHTML={{ __html: data.source }}
        />
      </div>
      <div className="flex h-[30px] overflow-hidden rounded-[7px] border border-[var(--border-strong)] text-[12px] font-bold text-white">
        <div
          className="flex items-center justify-center px-2"
          style={{ width: `${data.movable.pct}%`, background: 'var(--rose)' }}
        >
          {data.movable.label}
        </div>
        <div
          className="flex items-center justify-center px-2 opacity-85"
          style={{ width: `${data.locked.pct}%`, background: 'var(--ink-3)' }}
        >
          {data.locked.label}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[11.5px] text-[var(--muted)]">
        <span>
          <b style={{ color: 'var(--rose)' }}>●</b> <b className="text-[var(--ink-2)]">Movable</b> — Frank acts this cycle (Studio + A/B)
        </span>
        <span>
          <b style={{ color: 'var(--ink-3)' }}>●</b> <b className="text-[var(--ink-2)]">Locked</b> — under frame contracts; Till's renegotiation queue
        </span>
      </div>
    </div>
  );
}
