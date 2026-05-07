import type { MovableLockedSplit } from '@/types';

interface Props {
  data: MovableLockedSplit;
}

export function MovableLockedOverlay({ data }: Props) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[11.5px]">
        <span className="font-semibold text-[var(--ink-2)]">
          Of the {data.totalLeakage} total leakage — what's actionable this cycle?
        </span>
        <span
          className="text-[var(--muted)]"
          dangerouslySetInnerHTML={{ __html: data.source }}
        />
      </div>
      <div className="flex h-7 overflow-hidden rounded-md text-[11px] font-semibold text-white">
        <div
          className="flex items-center justify-center px-2"
          style={{ width: `${data.movable.pct}%`, background: 'var(--rose)' }}
        >
          {data.movable.label}
        </div>
        <div
          className="flex items-center justify-center px-2"
          style={{ width: `${data.locked.pct}%`, background: 'var(--muted-2)' }}
        >
          {data.locked.label}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
        <span>
          <b style={{ color: 'var(--rose)' }}>●</b> Movable — Frank acts this cycle (Studio + A/B)
        </span>
        <span>
          <b style={{ color: 'var(--ink-3)' }}>●</b> Locked — under frame contracts; Till's renegotiation queue
        </span>
      </div>
    </div>
  );
}
