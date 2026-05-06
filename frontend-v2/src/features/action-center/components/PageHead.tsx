import { ChevronDown, Download, Filter } from 'lucide-react';
import type { ActionCenterHeader } from '@/types';

interface Props {
  header: ActionCenterHeader;
}

export function PageHead({ header }: Props) {
  return (
    <>
      <div className="mb-3 text-xs text-[var(--muted)]">
        <span>Cockpit</span>
        <span className="mx-1.5 text-[var(--muted-2)]">/</span>
        <span>Pricing Analyst · Frank</span>
        <span className="mx-1.5 text-[var(--muted-2)]">/</span>
        <b className="font-semibold text-[var(--ink-2)]">Action Center</b>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
            {header.greeting}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--muted)]">
            <span className="rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1">
              <b className="font-semibold text-[var(--ink-2)]">{header.week}</b> · {header.dateRange}
            </span>
            {header.stats.map((s) => (
              <span key={s.label} className="text-[var(--muted)]">
                <b className="font-semibold text-[var(--ink-2)]">{s.value}</b> {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]">
            <ChevronDown size={12} /> All Departments
          </button>
          <button className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]">
            <Download size={12} /> Export
          </button>
          <button className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]">
            <Filter size={12} /> Filter
          </button>
        </div>
      </div>
    </>
  );
}
