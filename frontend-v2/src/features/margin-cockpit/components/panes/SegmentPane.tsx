import type { MarginTabs, SegmentRow } from '@/types';

interface Props {
  pane: MarginTabs['seg'];
  activeSegTab: string;
  onSegTabChange: (seg: string) => void;
}

const tierBadge = (t: SegmentRow['tier']) => {
  if (!t) return null;
  const palette: Record<NonNullable<SegmentRow['tier']>, string> = {
    A: 'var(--rose)',
    B: 'var(--ink-3)',
    C: 'var(--amber)',
    D: 'var(--red)',
  };
  return (
    <span
      className="mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[10px] font-bold text-white"
      style={{ background: palette[t] }}
    >
      {t}
    </span>
  );
};

export function SegmentPane({ pane, activeSegTab, onSegTabChange }: Props) {
  const active = pane.subPanes.find((p) => p.id === activeSegTab) ?? pane.subPanes[0];
  return (
    <div>
      <p className="mb-3 text-[12px] text-[var(--muted)]">{pane.description}</p>
      <div role="tablist" className="mb-3 inline-flex flex-wrap gap-0.5 rounded-[9px] bg-[var(--surface-sunken)] p-[3px]">
        {pane.subPanes.map((sp) => {
          const isActive = sp.id === active.id;
          return (
            <button
              key={sp.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              id={`segtab-${sp.id}`}
              aria-controls={`segtabpanel-${sp.id}`}
              onClick={() => onSegTabChange(sp.id)}
              className={`rounded-[7px] px-2.5 py-1.5 text-[12px] transition-all ${
                isActive
                  ? 'bg-white font-semibold text-[var(--ink)] shadow-[var(--shadow-card)]'
                  : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              {sp.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`segtabpanel-${active.id}`} aria-labelledby={`segtab-${active.id}`}>
        <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
                {active.headers.map((h) => (
                  <th key={h} className="px-3 py-2 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.rows.map((r, i) => (
                <tr key={i}>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    {tierBadge(r.tier)}<b className="font-bold">{r.label}</b>
                  </td>
                  {r.cells.map((c, j) => (
                    <td key={j} className="border-t border-[var(--hairline)] px-3 py-2 text-right">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {active.storyHtml && (
          <p className="mt-3 text-[12px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: active.storyHtml }} />
        )}
        {active.caveatHtml && (
          <p
            className="mt-2 rounded-[7px] px-3 py-2.5 text-[12px] [&_b]:font-semibold [&_i]:italic"
            style={{ background: 'var(--violet-bg)', color: 'var(--violet)', borderLeft: '3px solid var(--violet)' }}
            dangerouslySetInnerHTML={{ __html: active.caveatHtml }}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[12px] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]">
        <span className="text-[14px]">⚡</span><span className="flex-1" dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
