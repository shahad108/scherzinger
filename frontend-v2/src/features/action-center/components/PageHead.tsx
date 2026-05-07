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

      <div className="mb-[22px] flex flex-wrap items-start justify-between gap-x-3.5 gap-y-6">
        <div className="min-w-0 flex-1 basis-[360px]">
          <h1 className="font-display text-[34px] font-bold leading-[1.1] tracking-[-0.028em] text-[var(--ink)]">
            {header.greeting}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--muted)]">
            <span
              className="text-[11.5px]"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                padding: '5px 10px',
                letterSpacing: '0.01em',
              }}
            >
              <b className="font-semibold text-[var(--ink-2)]">{header.week}</b> · {header.dateRange}
            </span>
            {header.stats.map((s) => (
              <span
                key={s.label}
                className="text-[11.5px]"
                style={{
                  background: 'var(--surface-soft)',
                  borderRadius: 7,
                  padding: '5px 10px',
                }}
              >
                <b className="font-bold text-[var(--ink-2)]">{s.value}</b> {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          {[
            { icon: ChevronDown, label: 'All Departments' },
            { icon: Download,    label: 'Export' },
            { icon: Filter,      label: 'Filter' },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[#f7f9fb]"
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 11,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <Icon size={13} className="text-[var(--ink-3)]" /> {label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
