import type { ChangedRow } from '@/types/quotes';

interface Props {
  data: { title: string; rows: ChangedRow[] };
}

const dotColor: Record<ChangedRow['tone'], string> = {
  red: 'var(--red)',
  green: 'var(--green)',
  amber: 'var(--amber)',
};

export function ChangedStrip({ data }: Props) {
  return (
    <div className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]">
      <h5 className="mb-3 font-display text-[14px] font-bold leading-tight tracking-[-0.005em] text-[var(--ink)]">
        {data.title}
      </h5>
      <div className="flex flex-col">
        {data.rows.map((r, i) => (
          <div
            key={i}
            className="flex items-start gap-3 border-t border-[var(--hairline)] py-2.5 text-[12.5px] leading-[1.5] text-[var(--ink-3)] first:border-t-0 [&_b]:font-semibold [&_b]:text-[var(--ink)]"
          >
            <span
              className="mt-[7px] inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: dotColor[r.tone] }}
              aria-hidden="true"
            />
            <div className="flex-1">
              <span className="mr-1 font-display text-[13px] font-bold text-[var(--ink)] tabular-nums">
                {r.num}
              </span>
              <span dangerouslySetInnerHTML={{ __html: r.text }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
