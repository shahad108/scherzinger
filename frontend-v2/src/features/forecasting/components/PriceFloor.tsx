import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { postJson } from '@/lib/api/client';
import { useActionFeedbackStore } from '@/stores/actionFeedbackStore';
import type { FloorRow } from '@/types/forecast';

interface Props {
  rows: FloorRow[];
  footnote: string;
  /** Phase 2 deep link — highlight the row whose `article` matches. */
  highlightArticle?: string | null;
}

type ViewMode = 'top10' | 'all';

// CSV export of the currently rendered Price Floor table. Built client-side so
// it never hits the network — no leaks, no auth surprises.
function rowsToCsv(rows: FloorRow[]): string {
  const header = [
    'tier',
    'customer_id',
    'cluster',
    'article',
    'current_price',
    'floor',
    'headroom',
    'movable_share',
    'next_action',
    'below_floor',
    'locked',
  ];
  const escape = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const body = rows.map((r) => [
    r.tier,
    r.customerId,
    r.cluster.label,
    r.article,
    r.currentPrice,
    r.floor,
    r.headroom,
    r.movableShare,
    r.next,
    r.belowFloor ? '1' : '0',
    r.locked ? '1' : '0',
  ].map((s) => escape(String(s))).join(','));
  return [header.join(','), ...body].join('\n');
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ClusterChip({ label, conf }: { label: string; conf: 'green' | 'amber' | 'red' }) {
  return (
    <span className="cluster-chip" data-conf={conf} style={{ marginLeft: 0 }}>
      {label}
    </span>
  );
}

function renderBoldFootnote(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <b key={i} style={{ color: 'var(--red)' }}>
        {p.slice(2, -2)}
      </b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function PriceFloor({ rows, footnote, highlightArticle }: Props) {
  const [view, setView] = useState<ViewMode>('top10');
  const [renewalRow, setRenewalRow] = useState<FloorRow | null>(null);
  const navigate = useNavigate();
  const toast = useActionFeedbackStore((s) => s.pushToast);

  const visibleRows = view === 'top10' ? rows.slice(0, 10) : rows;

  const openStudio = (article: string, customerId: string) => {
    navigate(
      `/pricing?article=${encodeURIComponent(article)}&customer=${encodeURIComponent(customerId)}&source=forecasting-price-floor`,
    );
  };
  const queueAction = async (article: string, customerId: string) => {
    try {
      await postJson('/actions/queue', { kind: 'price_floor_review', article_id: article, customer_id: customerId });
      toast(`Queued ${article} · ${customerId}`, 'info');
    } catch (err) {
      toast(`Queue failed: ${(err as Error).message}`, 'error');
    }
  };
  const openQuote = (quoteId: string) => {
    navigate(`/quotes?quote_id=${encodeURIComponent(quoteId)}&source=forecasting-price-floor`);
  };

  return (
    <>
      <div className="section-row">
        <div>
          <h2>Price floor · per customer × SKU</h2>
          <div className="sub">
            Forecast-informed minimums for negotiation prep. Below-floor quotes auto-flag in
            Quotes &amp; Guardrails.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            data-testid="pricefloor-view-top10"
            className="head-pill"
            aria-pressed={view === 'top10'}
            onClick={() => setView('top10')}
            style={view === 'top10' ? { background: 'var(--rose-bg)', color: 'var(--rose-deep)' } : undefined}
          >
            Top 10 ▾
          </button>
          <button
            type="button"
            data-testid="pricefloor-view-all"
            className="head-pill"
            aria-pressed={view === 'all'}
            onClick={() => setView('all')}
            style={view === 'all' ? { background: 'var(--rose-bg)', color: 'var(--rose-deep)' } : undefined}
          >
            All customers ▾
          </button>
          <button
            type="button"
            data-testid="pricefloor-export"
            className="head-pill"
            onClick={() => {
              downloadCsv(`price-floor-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(visibleRows));
              toast(`Exported ${visibleRows.length} rows`, 'info');
            }}
          >
            Export
          </button>
        </div>
      </div>

      <div className="sku-card">
        <div className="table-wrap">
          <table className="frank-table">
            <thead>
              <tr>
                <th>Customer · cluster</th>
                <th>Article</th>
                <th>Current price</th>
                <th>Forecast-informed floor</th>
                <th>Headroom for discount</th>
                <th>Movable share</th>
                <th>Action · next quote</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, i) => {
                const isFocused = highlightArticle && r.article === highlightArticle;
                return (
                <tr
                  key={`${r.customerId}-${r.article}-${i}`}
                  className={r.belowFloor ? 'hl' : undefined}
                  data-focus-pulse={isFocused ? '1' : undefined}
                  ref={(node) => {
                    if (isFocused && node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className={`tier-chip ${r.tier}`}>{r.tier}</span>
                      <b>{r.customerId}</b>
                      <ClusterChip label={r.cluster.label} conf={r.cluster.conf} />
                    </div>
                  </td>
                  <td>{r.article}</td>
                  <td className={`num-cell${r.locked ? ' muted' : ''}`}>{r.currentPrice}</td>
                  <td className={`num-cell${r.floorPos ? ' pos' : ''}${r.locked ? ' muted' : ''}`}>{r.floor}</td>
                  <td className={`num-cell ${r.headroomTone}`}>{r.headroom}</td>
                  <td className={`num-cell ${r.movableTone}`}>{r.movableShare}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                      <div className="row-actions">
                        {r.renewalNote ? (
                          <button
                            type="button"
                            className="row-action"
                            onClick={() => setRenewalRow(r)}
                          >
                            Renewal note →
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={`row-action${r.primary ? ' primary' : ''}`}
                              onClick={() => openStudio(r.article, r.customerId)}
                            >
                              Open in Studio →
                            </button>
                            {r.queue && (
                              <button
                                type="button"
                                className="row-action queue"
                                onClick={() => queueAction(r.article, r.customerId)}
                              >
                                + Queue
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {r.nextLink ? (
                          <>
                            {r.next.split(' · ')[0]} ·{' '}
                            <button
                              type="button"
                              onClick={() => {
                                // r.next looks like "Quote #12848 · review now". Pull the digits.
                                const quoteId = (r.next.match(/#?(\d{3,})/)?.[1]) ?? r.next;
                                openQuote(quoteId);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                color: 'var(--rose-deep)',
                                fontWeight: 600,
                                cursor: 'pointer',
                                font: 'inherit',
                              }}
                            >
                              {r.next.split(' · ')[1]}
                            </button>
                          </>
                        ) : (
                          r.next
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="footer-note" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
        {renderBoldFootnote(footnote)}
      </p>
      <RenewalDrawer row={renewalRow} onClose={() => setRenewalRow(null)} />
    </>
  );
}

interface RenewalDrawerProps {
  row: FloorRow | null;
  onClose: () => void;
}

function RenewalDrawer({ row, onClose }: RenewalDrawerProps) {
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose]);

  if (!row) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      data-testid="renewal-drawer"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="relative ml-auto h-full w-full max-w-[440px] overflow-y-auto bg-white shadow-2xl border-l-4 border-[var(--rose-deep)]">
        <header className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-5 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Renewal note
            </div>
            <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
              Customer {row.customerId} · {row.article}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)]"
          >
            <X size={16} />
          </button>
        </header>
        <div className="p-5 space-y-4 text-[12.5px] text-[var(--ink-2)] leading-relaxed">
          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
              Cluster
            </div>
            <span className="cluster-chip" data-conf={row.cluster.conf}>{row.cluster.label}</span>
          </section>
          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
              Current vs floor
            </div>
            <div className="tabular-nums">
              <b>{row.currentPrice}</b> current · <b>{row.floor}</b> floor · headroom {row.headroom}
            </div>
          </section>
          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
              Movable share
            </div>
            <div className="tabular-nums">{row.movableShare}</div>
          </section>
          <section>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-1">
              Next milestone
            </div>
            <div>{row.next}</div>
          </section>
          <section className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[11.5px] text-[var(--muted)]">
            Renewal narrative pulls from `customer_risk_scores` + `quotes` when the renewal
            payload ships. Until then this drawer surfaces the row's snapshot.
          </section>
        </div>
      </aside>
    </div>
  );
}
