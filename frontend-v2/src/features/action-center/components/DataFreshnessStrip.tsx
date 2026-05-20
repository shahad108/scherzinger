import type { DataFreshness } from '@/types';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const dt = new Date(iso);
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return iso;
  }
}

function relativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(ms) || ms < 0) return null;
    const days = Math.floor(ms / 86_400_000);
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.round(days / 30);
    return `${months} mo ago`;
  } catch {
    return null;
  }
}

interface Props {
  freshness?: DataFreshness;
}

export function DataFreshnessStrip({ freshness }: Props) {
  if (!freshness) return null;
  const items = [
    { label: 'Invoices through', value: fmtDate(freshness.invoicesThrough) },
    { label: 'Quotes through', value: fmtDate(freshness.quotesThrough) },
    {
      label: 'Linkage refresh',
      value: relativeAge(freshness.linksUpdatedAt) ?? fmtDate(freshness.linksUpdatedAt),
    },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-4 py-2 text-[11px] text-[var(--muted)]">
      <span className="font-semibold uppercase tracking-wider text-[var(--ink-3)]">
        Data freshness
      </span>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span>{it.label}</span>
          <b className="font-semibold text-[var(--ink-2)]">{it.value}</b>
        </span>
      ))}
    </div>
  );
}
