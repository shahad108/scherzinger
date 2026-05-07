import type { MarginTabs, SegmentRow } from '@/types';

interface Props {
  pane: MarginTabs['seg'];
  activeSegTab: string;
  onSegTabChange: (seg: string) => void;
}

const tierBadge = (t: SegmentRow['tier']) => {
  if (!t) return null;
  const palette: Record<NonNullable<SegmentRow['tier']>, { bg: string; color: string }> = {
    A: { bg: 'var(--green-bg)', color: 'var(--green)' },
    B: { bg: 'var(--surface-soft)', color: 'var(--ink-2)' },
    C: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
    D: { bg: 'var(--rose-bg)', color: 'var(--rose-deep)' },
  };
  const p = palette[t];
  return (
    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold" style={{ background: p.bg, color: p.color }}>
      {t}
    </span>
  );
};

export function SegmentPane({ pane, activeSegTab, onSegTabChange }: Props) {
  const active = pane.subPanes.find((p) => p.id === activeSegTab) ?? pane.subPanes[0];
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-[var(--muted)]">{pane.description}</p>
      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
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
              className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                isActive ? 'text-white' : 'border border-[var(--hairline)] bg-white text-[var(--ink-2)]'
              }`}
              style={isActive ? { background: 'var(--ink-2)' } : undefined}
            >
              {sp.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`segtabpanel-${active.id}`} aria-labelledby={`segtab-${active.id}`}>
        <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
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
            className="mt-2 rounded-xl px-3 py-2 text-[12px]"
            style={{ background: 'var(--violet-bg)', color: 'var(--violet)', borderLeft: '3px solid var(--violet)' }}
            dangerouslySetInnerHTML={{ __html: active.caveatHtml }}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-[var(--ink-2)]">
        <span>⚡</span><span dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
