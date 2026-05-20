import { useState } from 'react';
import type { ClusterChip } from '@/types';

interface Props {
  clusters: ClusterChip[];
}

const toneStyles: Record<ClusterChip['tone'], { bg: string; color: string }> = {
  green: { bg: 'var(--green-bg)', color: 'var(--green)' },
  amber: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  red:   { bg: 'var(--rose-bg)',  color: 'var(--rose-deep)' },
};

function ClusterButton({ c }: { c: ClusterChip }) {
  const [open, setOpen] = useState(false);
  const t = toneStyles[c.tone];
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => c.warning && setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => c.warning && setOpen((v) => !v)}
        aria-label={c.filterToast}
        className="rounded-[7px] border border-transparent px-2.5 py-[5px] text-[11.5px] font-semibold transition-colors"
        style={{ background: t.bg, color: t.color, borderColor: t.bg }}
      >
        {c.code} <b className="font-bold">{c.margin}</b> · {c.target} · conf <b>{c.conf}</b>
        {c.warning && <span className="ml-1">{c.warning}</span>}
      </button>
      {open && c.warning && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 block w-[260px] rounded-lg border border-[var(--hairline)] bg-white p-2.5 text-[10.5px] leading-relaxed text-[var(--ink-2)] shadow-[var(--shadow-md)]"
        >
          <b className="block text-[var(--amber)]">Low-n cluster</b>
          {c.filterToast}
        </span>
      )}
    </span>
  );
}

export function ClusterMiniRow({ clusters }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-card)]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">
        Margin by cluster →
      </span>
      {clusters.map((c) => (
        <ClusterButton key={c.code} c={c} />
      ))}
      <span className="ml-auto text-[11px] text-[var(--muted)]">
        Source · <code className="rounded bg-[var(--surface-soft)] px-1 py-0.5 text-[10.5px] text-[var(--rose-deep)]">products_detail.commodity_scorecard</code>
      </span>
    </div>
  );
}
