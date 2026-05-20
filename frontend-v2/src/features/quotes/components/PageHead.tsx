import { ChevronDown, FileText, Wand2 } from 'lucide-react';
import type { QuotesPageHeader } from '@/types/quotes';

interface Props {
  header: QuotesPageHeader;
  onGenerateBriefing: () => void;
}

export function PageHead({ header, onGenerateBriefing }: Props) {
  return (
    <>
      <div className="mb-3 text-xs text-[var(--muted)]">
        {header.crumbTrail.map((crumb, i) => {
          const isLast = i === header.crumbTrail.length - 1;
          return (
            <span key={crumb}>
              {isLast ? (
                <b className="font-semibold text-[var(--ink-2)]">{crumb}</b>
              ) : (
                <span>{crumb}</span>
              )}
              {!isLast && <span className="mx-1.5 text-[var(--muted-2)]">/</span>}
            </span>
          );
        })}
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
            {header.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--muted)]">
            {header.subPills.map((p) => (
              <span
                key={p}
                className="rounded-[7px] border border-[var(--hairline)] bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-[var(--ink-2)]"
              >
                {p}
              </span>
            ))}
            {header.subStats.map((s) => (
              <span
                key={`${s.label}-${s.value}`}
                className="rounded-[7px] bg-[var(--surface-soft)] px-2.5 py-[5px] text-[11.5px]"
              >
                <b className="font-bold text-[var(--ink)]">{s.value}</b>{' '}
                <span className="text-[var(--muted)]">{s.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {header.filters.map((f) => (
            <button
              key={f.label}
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--hairline)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ink-2)] transition-colors hover:bg-[#f7f9fb]"
            >
              {f.value} <ChevronDown size={12} />
            </button>
          ))}
          <button
            type="button"
            onClick={onGenerateBriefing}
            className="flex h-9 items-center gap-1.5 rounded-[12px] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(90,125,163,0.55)] transition-colors hover:bg-[var(--rose-deep)]"
            style={{ background: 'var(--rose)' }}
          >
            <Wand2 size={12} /> {header.briefingButtonLabel}
          </button>
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--hairline)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[#f7f9fb]"
          >
            <FileText size={12} /> {header.exportLabel}
          </button>
        </div>
      </div>
    </>
  );
}
