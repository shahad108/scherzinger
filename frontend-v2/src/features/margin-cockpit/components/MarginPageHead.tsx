import { ChevronDown, FileText, Wand2 } from 'lucide-react';
import type { MarginPageHeader } from '@/types';

interface Props {
  header: MarginPageHeader;
  onGenerateBriefing: () => void;
}

export function MarginPageHead({ header, onGenerateBriefing }: Props) {
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
                className="rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 font-semibold text-[var(--ink-2)]"
              >
                {p}
              </span>
            ))}
            {header.subStats.map((s) => (
              <span key={s.label} className="text-[var(--muted)]">
                <b className="font-semibold text-[var(--ink-2)]">{s.value}</b> {s.label}
              </span>
            ))}
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: 'var(--violet-bg)', color: 'var(--violet)' }}
            >
              {header.auditTag}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {header.filters.map((f) => (
            <button
              key={f.label}
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]"
            >
              <ChevronDown size={12} /> {f.label} · {f.value}
            </button>
          ))}
          <button
            type="button"
            onClick={onGenerateBriefing}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: 'var(--rose)' }}
          >
            <Wand2 size={12} /> Generate margin briefing →
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)]"
          >
            <FileText size={12} /> Branded PDF
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)]"
          >
            Export to deck
          </button>
        </div>
      </div>
    </>
  );
}
