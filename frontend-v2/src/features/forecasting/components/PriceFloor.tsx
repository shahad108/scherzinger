import type { FloorRow } from '@/types/forecast';

interface Props {
  rows: FloorRow[];
  footnote: string;
  /** Phase 2 deep link — highlight the row whose `article` matches. */
  highlightArticle?: string | null;
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
          <button type="button" className="head-pill">Top 10 ▾</button>
          <button type="button" className="head-pill">All customers ▾</button>
          <button type="button" className="head-pill">Export</button>
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
              {rows.map((r, i) => {
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
                          <button type="button" className="row-action">
                            Renewal note →
                          </button>
                        ) : (
                          <>
                            <button type="button" className={`row-action${r.primary ? ' primary' : ''}`}>
                              Open in Studio →
                            </button>
                            {r.queue && (
                              <button type="button" className="row-action queue">
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
                            <a
                              href="#"
                              style={{
                                color: 'var(--rose-deep)',
                                fontWeight: 600,
                                textDecoration: 'none',
                              }}
                            >
                              {r.next.split(' · ')[1]}
                            </a>
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
    </>
  );
}
