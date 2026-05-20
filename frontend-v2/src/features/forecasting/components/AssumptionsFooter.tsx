// Phase 2 — Compact one-line-per-assumption strip rendered just above the
// CrossLinkStrip. Same data as MethodologyPanel.assumptions; this is a quick
// scan, the panel is the deep dive.

import type { MethodologyAssumption } from '@/types/forecast';

interface Props {
  assumptions: MethodologyAssumption[];
  dataThrough?: string;
}

export function AssumptionsFooter({ assumptions, dataThrough }: Props) {
  return (
    <aside
      data-testid="assumptions-footer"
      className="mt-6 rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface-soft)] p-3"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Assumptions in force
        </span>
        {dataThrough && (
          <span className="tag-chip">Data through {dataThrough}</span>
        )}
      </div>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2 lg:grid-cols-3 text-[11.5px] text-[var(--ink-2)]">
        {assumptions.map((a) => (
          <li key={a.label}>
            <b>{a.label}:</b> <span className="tabular-nums">{a.value}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
