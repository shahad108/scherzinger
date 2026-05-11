// Phase 8 — Model Cards settings page.
//
// Reads /api/v1/models/cards (backed by the model_registry table built in
// Batch 3). Each model card carries last-trained date, holdout window,
// feature list, notes, and a per-cluster metrics table. Same source feeds
// the Action Center Trust drawer — one consistent story.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

interface ClusterRow {
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  n: number | null;
  metrics: Record<string, number | null>;
}

interface ModelCard {
  model_name: string;
  version: string | null;
  last_trained_at: string | null;
  holdout_months: number | null;
  notes: string | null;
  features: string[] | null;
  clusters: ClusterRow[];
}

interface CardsResponse {
  models: ModelCard[];
  count: number;
}

function useModelCards() {
  return useQuery({
    queryKey: ['models', 'cards'],
    queryFn: () => apiFetch<CardsResponse>('/models/cards'),
    staleTime: 60_000,
  });
}

function formatMetric(name: string, value: number | null): string {
  if (value == null) return '—';
  if (name === 'directional_accuracy') return `${(value * 100).toFixed(0)}%`;
  if (name === 'mape') return `${(value * 100).toFixed(2)}%`;
  // mae/rmse are reported as fractional margin pp.
  return `${(value * 100).toFixed(2)}pp`;
}

const METRIC_TONE: Record<string, 'higher_better' | 'lower_better'> = {
  directional_accuracy: 'higher_better',
  mae: 'lower_better',
  mape: 'lower_better',
  rmse: 'lower_better',
};

const METRIC_LABELS: Record<string, string> = {
  directional_accuracy: 'Directional acc.',
  mae: 'MAE',
  mape: 'MAPE',
  rmse: 'RMSE',
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function FreshnessPill({ iso }: { iso: string | null }) {
  const days = daysSince(iso);
  if (days == null) {
    return <span className="rounded-full bg-[var(--surface-soft)] px-2 py-[2px] text-[10px] font-semibold text-[var(--muted)]">Untrained</span>;
  }
  const tone =
    days <= 14 ? { bg: 'var(--green-bg)', fg: 'var(--green)', label: 'Fresh' } :
    days <= 45 ? { bg: 'var(--amber-bg)', fg: 'var(--amber)', label: 'Aging' } :
                 { bg: 'var(--rose-bg)',  fg: 'var(--rose-deep)', label: 'Stale' };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-semibold"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" /> {tone.label} · {days}d
    </span>
  );
}

function ClusterMetricsTable({ rows, metricNames }: { rows: ClusterRow[]; metricNames: string[] }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--border)]">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-[var(--surface-soft)] text-left text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
            <th className="px-3 py-2">Cluster</th>
            <th className="px-3 py-2 text-right">n</th>
            {metricNames.map((m) => (
              <th key={m} className="px-3 py-2 text-right">
                {METRIC_LABELS[m] ?? m}
                <span className="ml-1 text-[9px] font-medium text-[var(--ink-3)]">
                  {METRIC_TONE[m] === 'higher_better' ? '↑' : '↓'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lowN = (r.n ?? 0) < 3;
            return (
              <tr
                key={`${r.entity_type}|${r.entity_id ?? 'na'}`}
                className="border-t border-[var(--hairline)]"
              >
                <td className="px-3 py-2">
                  <div className="font-semibold text-[var(--ink-2)]">
                    {r.entity_id ?? r.entity_label}
                  </div>
                  <div className="text-[10.5px] text-[var(--muted)]">{r.entity_label}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className={lowN ? 'text-[var(--amber)]' : 'text-[var(--ink-2)]'}>
                    {r.n ?? '—'}
                  </span>
                  {lowN && (
                    <span
                      className="ml-1 rounded-[4px] bg-[var(--amber-bg)] px-1 py-[1px] text-[9px] font-bold text-[var(--amber)]"
                      title="Low-n: fewer than 3 walk-forward steps. Manual review before auto-act."
                    >
                      low-n
                    </span>
                  )}
                </td>
                {metricNames.map((m) => (
                  <td key={m} className="px-3 py-2 text-right font-bold tabular-nums text-[var(--ink-2)]">
                    {formatMetric(m, r.metrics[m] ?? null)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ModelCardView({ card }: { card: ModelCard }) {
  const [showAll, setShowAll] = useState(false);
  const metricNames = useMemo(() => {
    const seen = new Set<string>();
    for (const c of card.clusters) for (const m of Object.keys(c.metrics)) seen.add(m);
    // Stable order: directional_accuracy first, then alphabetical.
    return [...seen].sort((a, b) => {
      if (a === 'directional_accuracy') return -1;
      if (b === 'directional_accuracy') return 1;
      return a.localeCompare(b);
    });
  }, [card.clusters]);

  // Sort by sample size (n) descending, then by entity id alphabetically.
  // Surface the n=3+ rows first — these are the ones the recommender
  // actually trusts. The top-5 default slice operates on this sorted view.
  const sortedClusters = useMemo(
    () =>
      [...card.clusters].sort((a, b) => {
        const an = a.n ?? 0;
        const bn = b.n ?? 0;
        if (bn !== an) return bn - an;
        return String(a.entity_id ?? '').localeCompare(String(b.entity_id ?? ''));
      }),
    [card.clusters],
  );
  const visible = showAll ? sortedClusters : sortedClusters.slice(0, 5);

  return (
    <article className="rounded-[14px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
            {card.model_name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--muted)]">
            <span>v{card.version ?? '—'}</span>
            <span aria-hidden>·</span>
            <span>
              trained{' '}
              {card.last_trained_at
                ? new Date(card.last_trained_at).toLocaleDateString()
                : '—'}
            </span>
            <FreshnessPill iso={card.last_trained_at} />
            <span aria-hidden>·</span>
            <span>{card.holdout_months ?? '—'}mo holdout</span>
            <span aria-hidden>·</span>
            <span>{card.clusters.length} clusters</span>
          </div>
        </div>
      </header>

      {card.notes && (
        <p className="mt-3 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
          {card.notes}
        </p>
      )}

      {card.features && card.features.length > 0 && (
        <div className="mt-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Features
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {card.features.map((f) => (
              <span
                key={f}
                className="rounded-[5px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-1.5 py-[2px] font-mono text-[10.5px] text-[var(--ink-2)]"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
            Per-cluster accuracy
          </div>
          {card.clusters.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-[10.5px] font-semibold text-[var(--rose-deep)] hover:underline"
            >
              {showAll ? 'Show top 5' : `Show all ${card.clusters.length}`}
            </button>
          )}
        </div>
        <ClusterMetricsTable rows={visible} metricNames={metricNames} />
      </div>
    </article>
  );
}

export default function ModelCardsPage() {
  const { data, isLoading, error } = useModelCards();

  if (isLoading) return <div className="text-[13px] text-[var(--muted)]">Loading model registry…</div>;
  if (error || !data) {
    return (
      <div className="text-[13px] text-[var(--muted)]">
        Model registry unavailable.
      </div>
    );
  }

  if (data.count === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-[var(--amber-border)] bg-[var(--amber-bg)] p-4 text-[12.5px] text-[var(--ink-2)]">
        Model registry is empty. Run <code className="rounded bg-white px-1">scripts/build_model_registry.py</code> to backfill from <code className="rounded bg-white px-1">backtest_results</code>.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--hairline)] pb-4">
        <div>
          <h2 className="font-display text-[18px] font-bold text-[var(--ink)]">Model cards</h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            One card per registered model. Per-cluster accuracy, holdout window, training date, and feature
            list — the same source that feeds the Action Center Trust drawer and the per-SKU recommendation
            contract.
          </p>
        </div>
        <div className="rounded-[7px] bg-[var(--surface-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)]">
          {data.count} {data.count === 1 ? 'model' : 'models'} · source <code className="ml-1 rounded bg-white px-1 text-[10.5px] text-[var(--rose-deep)]">model_registry</code>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {data.models.map((m) => (
          <ModelCardView key={m.model_name} card={m} />
        ))}
      </div>
    </div>
  );
}
