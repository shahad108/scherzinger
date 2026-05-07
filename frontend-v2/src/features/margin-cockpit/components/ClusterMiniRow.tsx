import type { ClusterChip } from '@/types';

interface Props {
  clusters: ClusterChip[];
}

const toneStyles: Record<ClusterChip['tone'], { bg: string; color: string }> = {
  green: { bg: 'var(--green-bg)', color: 'var(--green)' },
  amber: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  red:   { bg: 'var(--rose-bg)',  color: 'var(--rose-deep)' },
};

export function ClusterMiniRow({ clusters }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--hairline)] bg-white px-4 py-3">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        Margin by cluster →
      </span>
      {clusters.map((c) => {
        const t = toneStyles[c.tone];
        return (
          <button
            key={c.code}
            type="button"
            aria-label={c.filterToast}
            className="rounded-full px-3 py-1 text-[12px] font-semibold"
            style={{ background: t.bg, color: t.color }}
          >
            {c.code} <b className="font-bold">{c.margin}</b> · {c.target} · conf <b>{c.conf}</b>
            {c.warning && <span className="ml-1">{c.warning}</span>}
          </button>
        );
      })}
      <span className="ml-auto text-[11px] text-[var(--muted)]">
        Source · <code className="rounded bg-[var(--surface-soft)] px-1 py-0.5">products_detail.commodity_scorecard</code>
      </span>
    </div>
  );
}
