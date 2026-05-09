import { Pencil } from 'lucide-react';
import type { GuardrailsSectionData } from '@/types/quotes';

interface Props {
  data: GuardrailsSectionData;
}

export function GuardrailsSection({ data }: Props) {
  return (
    <section className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">
            {data.title}
          </h2>
          <div className="mt-1 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--muted)]">{data.subtitle}</div>
          <div
            className="mt-2 inline-flex items-center rounded-[7px] bg-[var(--surface-soft)] px-2.5 py-[5px] text-[11px] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]"
            dangerouslySetInnerHTML={{ __html: data.historyChipHtml }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--hairline)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[#f7f9fb]"
          >
            {data.historyButtonLabel}
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-[12px] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(90,125,163,0.55)] transition-colors hover:bg-[var(--rose-deep)]"
            style={{ background: 'var(--rose)' }}
          >
            {data.editButtonLabel}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.cards.map((c) => (
          <div
            key={c.id}
            className="group relative flex flex-col gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--surface-soft)] p-[16px_18px]"
          >
            <button
              type="button"
              aria-label={`Edit ${c.category}`}
              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[var(--muted)] opacity-0 transition-opacity hover:bg-white hover:text-[var(--ink-2)] group-hover:opacity-100"
            >
              <Pencil size={12} />
            </button>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{c.category}</div>
            <div className="font-display text-[34px] font-bold leading-none tabular-nums tracking-[-0.025em] text-[var(--ink)]">
              {c.threshold}
            </div>
            <div className="text-[11px] leading-[1.4] text-[var(--muted)]">{c.meta}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
