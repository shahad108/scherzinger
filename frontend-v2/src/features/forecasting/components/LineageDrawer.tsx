// Phase 2 — Shared lineage drawer.
//
// Opened by AccuracyBadge clicks across every forecast block. Three sections:
// Model (type/version/last-trained/window), Performance (per-cluster metrics +
// calibration), Sources (data tables + external series + last fetched).

import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useLineage } from '@/data/api/useLineage';

interface Props {
  open: boolean;
  onClose: () => void;
  entityType?: string;
  entityId?: string;
  metric?: string;
  modelId?: string;
  title?: string;
}

export function LineageDrawer({
  open,
  onClose,
  entityType,
  entityId,
  metric,
  modelId,
  title = 'Forecast lineage',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const { data, isLoading } = useLineage(
    { entity_type: entityType, entity_id: entityId, metric, model_id: modelId },
    open,
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="lineage-drawer"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="relative ml-auto h-full w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-5 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Lineage · {entityType ?? 'overall'}
              {entityId ? ` · ${entityId}` : ''}
            </div>
            <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-2)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-6">
          {isLoading && (
            <div className="text-[12.5px] text-[var(--muted)]">Loading lineage…</div>
          )}
          {data && (
            <>
              <Section title="Model">
                <ul className="space-y-2">
                  {data.models.map((m) => (
                    <li
                      key={`${m.modelName}-${m.version}-${m.trainedAt ?? ''}`}
                      className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3"
                    >
                      <div className="flex items-center justify-between">
                        <b className="text-[13.5px] text-[var(--ink)]">{m.modelName}</b>
                        <span className="tag-chip">v{m.version}</span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-2 text-[11.5px] text-[var(--muted)]">
                        <span>
                          Trained:{' '}
                          <b>{m.trainedAt ? new Date(m.trainedAt).toLocaleDateString() : '—'}</b>
                        </span>
                        <span>
                          Holdout: <b>{m.holdoutMonths ?? '—'}mo</b>
                        </span>
                        <span>
                          {m.metric}: <b>{m.metricValue != null ? m.metricValue.toFixed(3) : '—'}</b>
                        </span>
                        <span>
                          n: <b>{m.nObservations ?? '—'}</b>
                        </span>
                      </div>
                      {m.featureList && m.featureList.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {m.featureList.slice(0, 8).map((f) => (
                            <span key={f} className="tag-chip dark">
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                      {m.notes && (
                        <div className="mt-1.5 text-[11.5px] italic text-[var(--muted)]">
                          {m.notes}
                        </div>
                      )}
                    </li>
                  ))}
                  {!data.models.length && (
                    <li className="text-[12px] text-[var(--muted)]">
                      No matching model card.
                    </li>
                  )}
                </ul>
              </Section>

              <Section title="Performance">
                <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                  {data.models.slice(0, 4).map((m) => (
                    <div
                      key={`${m.modelName}-perf`}
                      className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-2"
                    >
                      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        {m.modelName}
                      </div>
                      <div className="mt-0.5 font-display text-[14px] font-bold tabular-nums text-[var(--ink)]">
                        {m.metric}: {m.metricValue != null ? m.metricValue.toFixed(3) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Sources">
                <ul className="space-y-1.5 text-[12.5px]">
                  {data.sources.map((s) => (
                    <li
                      key={s.name}
                      className="flex items-start justify-between gap-3 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2"
                    >
                      <div>
                        <b>{s.name}</b>
                        <span className="ml-1 tag-chip">{s.kind}</span>
                        <div className="text-[11.5px] text-[var(--muted)]">{s.description}</div>
                      </div>
                      <span className="text-[11px] text-[var(--muted)] whitespace-nowrap">
                        {new Date(s.lastFetchedAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>

              {data.auditChain.length > 0 && (
                <Section title="Audit chain">
                  <ol className="space-y-1 text-[12px]">
                    {data.auditChain.map((a, i) => (
                      <li
                        key={`${a.at}-${i}`}
                        className="flex items-center justify-between rounded-md border border-[var(--hairline)] px-2.5 py-1.5"
                      >
                        <span>
                          <b>{a.kind}</b> · {a.targetType}/{a.targetId}
                        </span>
                        <span className="text-[11px] text-[var(--muted)] tabular-nums">
                          {new Date(a.at).toLocaleString()} · {a.hash.slice(0, 8)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}
