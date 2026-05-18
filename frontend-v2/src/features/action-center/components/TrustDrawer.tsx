import { Drawer } from '@/components/ui/Drawer';
import { useTrustDrawer } from '@/data/api/useTrustDrawer';
import type { TrustTile } from '@/types';
import type { TrustDrawerTile, TrustModelCard } from '@/types/trustDrawer';

interface Props {
  open: boolean;
  onClose: () => void;
  focusedTile: TrustTile | null;
}

const METRIC_LABEL: Record<string, string> = {
  directional_accuracy: 'Directional accuracy',
  mae: 'MAE (margin pp)',
  rmse: 'RMSE',
  mape: 'MAPE',
};

function formatTrained(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function fmtMetric(name: string, value: number | null): string {
  if (value === null || value === undefined) return '—';
  if (name === 'directional_accuracy' || name === 'mape') return `${(value * 100).toFixed(1)}%`;
  if (name === 'mae' || name === 'rmse') return `${(value * 100).toFixed(2)}pp`;
  return value.toFixed(3);
}

/** Pick the drawer tile whose key best matches the tile the user clicked. */
function pickTile(
  focusedTile: TrustTile | null,
  drawerTiles: TrustDrawerTile[],
): TrustDrawerTile | null {
  if (!focusedTile || drawerTiles.length === 0) return drawerTiles[0] ?? null;
  const lower = focusedTile.label.toLowerCase();
  if (lower.includes('error') || lower.includes('mae') || lower.includes('forecast')) {
    return drawerTiles.find((t) => t.key === 'forecast_error') ?? drawerTiles[0];
  }
  return drawerTiles.find((t) => t.key === 'directional_accuracy') ?? drawerTiles[0];
}

export function TrustDrawer({ open, onClose, focusedTile }: Props) {
  const { data, isLoading, error } = useTrustDrawer(open);
  const tile = pickTile(focusedTile, data?.tiles ?? []);

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} width={560}>
      <div className="flex h-full flex-col overflow-hidden" data-testid="ac-trust-drawer">
        <header className="border-b border-[var(--hairline)] px-6 pb-4 pt-5">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Model trust drawer
          </div>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-[var(--ink)]">
            {focusedTile?.label ?? 'Model accuracy'}
          </h2>
          {focusedTile && (
            <div className="mt-1 text-sm text-[var(--muted)]">
              Live tile value: <span className="font-medium text-[var(--ink)]">{focusedTile.value}</span> ·{' '}
              {focusedTile.caption}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading && <p className="text-sm text-[var(--muted)]">Loading model registry…</p>}
          {error && (
            <p className="text-sm text-[var(--red)]">
              Could not load model registry: {(error as Error).message}
            </p>
          )}
          {!isLoading && !error && (!data || data.tiles.length === 0) && (
            <div className="rounded-lg border border-dashed border-[var(--hairline)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
              No model_registry rows yet. Run{' '}
              <code className="rounded bg-[var(--surface-3)] px-1 py-0.5 text-[12px]">
                scripts/build_model_registry.py
              </code>{' '}
              after the next backtest to populate this drawer.
            </div>
          )}

          {tile && (
            <section className="space-y-5">
              <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] p-4">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Top-cluster headline
                </div>
                <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-[var(--ink)]">
                  {tile.value}
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">{tile.caption}</p>
                <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{tile.explainer}</p>
              </div>

              <div>
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Top 5 clusters · sorted by {METRIC_LABEL[tile.source?.metric ?? 'directional_accuracy']}
                </div>
                <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-[var(--surface-2)] text-left text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Cluster</th>
                        <th className="px-3 py-2 font-medium">Model</th>
                        <th className="px-3 py-2 font-medium tabular-nums">Metric</th>
                        <th className="px-3 py-2 font-medium tabular-nums">n</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tile.top_clusters.map((c, idx) => (
                        <tr key={idx} className="border-t border-[var(--hairline)]">
                          <td className="px-3 py-2">
                            <span className="text-[var(--ink)]">{c.entity_label}</span>{' '}
                            <span className="text-[var(--muted)]">· {c.entity_id ?? '—'}</span>
                          </td>
                          <td className="px-3 py-2 text-[var(--muted)]">{c.model_name}</td>
                          <td className="px-3 py-2 tabular-nums text-[var(--ink)]">
                            {fmtMetric(c.metric, c.metric_value)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[var(--muted)]">{c.n ?? '—'}</td>
                        </tr>
                      ))}
                      {tile.top_clusters.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-[var(--muted)]">
                            No clusters available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {data && data.models.length > 0 && (
            <section className="mt-6 space-y-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Registered models · {data.models.length}
              </div>
              {data.models.map((m: TrustModelCard) => (
                <div
                  key={m.model_name}
                  className="rounded-lg border border-[var(--hairline)] bg-white p-3 text-[12.5px]"
                >
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium text-[var(--ink)]">{m.model_name}</div>
                    <div className="text-[var(--muted)]">v{m.version}</div>
                  </div>
                  <div className="mt-1 text-[var(--muted)]">
                    Trained {formatTrained(m.last_trained_at)} · holdout {m.holdout_months ?? '—'} mo ·{' '}
                    {m.clusters.length} clusters
                  </div>
                  {m.features.length > 0 && (
                    <div className="mt-1 text-[var(--muted)]">
                      Features: {m.features.join(', ')}
                    </div>
                  )}
                  {m.notes && (
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-2)]">{m.notes}</p>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </Drawer>
  );
}
