import { Fragment, useState } from 'react';
import type { CustomerRow, ParetoLayer as ParetoLayerData, SkuRow } from '@/types/forecast';

interface Props {
  data: ParetoLayerData;
}

type Tab = 'cust' | 'sku';

function ClusterChip({ label, conf }: { label: string; conf: 'green' | 'amber' | 'red' }) {
  return (
    <span className="cluster-chip" data-conf={conf}>
      {label}
    </span>
  );
}

function ConfChip({ tone, label }: { tone: 'h' | 'm' | 't'; label: string }) {
  return (
    <span className={`conf-chip ${tone}`}>
      <span className="ck" />
      {label}
    </span>
  );
}

function BookedBar({ pct, text }: { pct: number; text: string }) {
  return (
    <div className="booked-bar">
      <div className="booked-track">
        <div className="booked-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="booked-text">{text}</span>
    </div>
  );
}

function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="sku-card">
      <div className="table-wrap">
        <table className="frank-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>
                LTM revenue
                <br />
                <span style={{ color: 'var(--muted)', fontSize: 9.5, fontWeight: 500, letterSpacing: '.04em' }}>
                  + % of next 12mo already booked
                </span>
              </th>
              <th>Forecast (next 12mo)</th>
              <th>
                YoY trend
                <br />
                <span style={{ color: 'var(--muted)', fontSize: 9.5, fontWeight: 500, letterSpacing: '.04em' }}>
                  Volume vs price split
                </span>
              </th>
              <th>Confidence</th>
              <th>Renewal due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isExpanded = expanded === r.customerId;
              const hasDrill = !!r.drill && r.drill.length > 0;
              return (
                <Fragment key={r.customerId}>
                  <tr
                    className={`drill-row${isExpanded ? ' expanded' : ''}${hasDrill ? ' expandable' : ''}`}
                    onClick={() => hasDrill && setExpanded(isExpanded ? null : r.customerId)}
                  >
                    <td>
                      {hasDrill && <span className="exp-arrow">▶</span>}
                      <span className={`tier-chip ${r.tier}`}>{r.tier}</span>
                      <b>{r.customerId}</b>
                      <ClusterChip label={r.cluster.label} conf={r.cluster.conf} />
                      {r.belowBand && (
                        <span
                          style={{
                            color: 'var(--red)',
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: '.04em',
                            textTransform: 'uppercase',
                            marginLeft: 6,
                            fontFamily: "'Manrope', sans-serif",
                          }}
                        >
                          below band
                        </span>
                      )}
                    </td>
                    <td className="num-cell">
                      {r.ltm}
                      <BookedBar pct={r.bookedPct} text={r.bookedText} />
                    </td>
                    <td className="num-cell">
                      <b>{r.forecast}</b>
                      <br />
                      <span className="band">{r.band}</span>
                    </td>
                    <td>
                      <span className={`trend-arrow ${r.trendDir}`}>{r.trendLabel}</span>
                      <span className="vp-split">
                        <span>{r.vpVol}</span> · <span>{r.vpPrc}</span>
                      </span>
                    </td>
                    <td>
                      <ConfChip tone={r.conf} label={r.confLabel} />
                    </td>
                    <td>{r.renewal}</td>
                  </tr>
                  {hasDrill && isExpanded && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div className="drill-detail-inner">
                          <h6>{r.drillTitle}</h6>
                          {r.drill!.map((s) => (
                            <div className="sku-mix-row" key={s.aid}>
                              <span className="sm-aid">{s.aid}</span>
                              <span>{s.desc}</span>
                              <span>{s.fc}</span>
                              <span style={{ color: 'var(--muted)' }}>{s.share}</span>
                              <button type="button" className="sm-action">
                                Open in Studio →
                              </button>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SkuTable({ rows }: { rows: SkuRow[] }) {
  return (
    <div className="sku-card">
      <div className="table-wrap">
        <table className="frank-table">
          <thead>
            <tr>
              <th>Article</th>
              <th>Description</th>
              <th>LTM volume</th>
              <th>Forecast volume (next 12mo)</th>
              <th>Margin (forecast)</th>
              <th>Confidence</th>
              <th>Top customer</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="drill-row" key={r.aid}>
                <td>
                  <b>{r.aid}</b>
                  <ClusterChip label={r.cluster.label} conf={r.cluster.conf} />
                  {r.abTest && <span className="ab-chip">🧪 A/B running</span>}
                </td>
                <td>{r.desc}</td>
                <td className="num-cell">{r.ltmVolume}</td>
                <td className="num-cell">
                  <b>{r.forecastVolume}</b>
                  <br />
                  <span className="band">{r.band}</span>
                </td>
                <td className={`num-cell${r.marginPos ? ' pos' : ''}`}>{r.margin}</td>
                <td>
                  <ConfChip tone={r.conf} label={r.confLabel} />
                </td>
                <td>{r.topCustomer}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className={`row-action${r.primary ? ' primary' : ''}`}>
                    Open in Studio →
                  </button>
                  {r.queue && (
                    <>
                      {' '}
                      <button type="button" className="row-action queue">
                        + Queue
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ParetoLayer({ data }: Props) {
  const [tab, setTab] = useState<Tab>('cust');

  return (
    <>
      <div className="section-row">
        <div>
          <h2>Pareto layer · top 10 customers + SKUs</h2>
          <div className="sub">
            The aggregate forecast above rolls up from these. Each row carries its own band,
            confidence, and assumption. Walk-forward retrained Apr 28 · 06:14 CET.
          </div>
        </div>
        <span className="tag-chip">80% of revenue</span>
      </div>

      <div className="lq-card">
        <div className="fc-tabs">
          <button
            type="button"
            className={`tab${tab === 'cust' ? ' active' : ''}`}
            onClick={() => setTab('cust')}
          >
            By customer · top 10
          </button>
          <button
            type="button"
            className={`tab${tab === 'sku' ? ' active' : ''}`}
            onClick={() => setTab('sku')}
          >
            By SKU · top 10
          </button>
        </div>

        {tab === 'cust' ? (
          <>
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 14,
              }}
            >
              <span className="tag-chip"><span className="tier-chip A">A</span>Strategic</span>
              <span className="tag-chip"><span className="tier-chip B">B</span>Standard</span>
              <span className="tag-chip"><span className="tier-chip C">C</span>Volume</span>
              <span className="tag-chip"><span className="tier-chip D">D</span>Problematic</span>
            </div>
            <CustomerTable rows={data.customer.rows} />
            <p className="footer-note">
              Top 7 of 10 · <a href="#">show all 10</a> · 80.4% of revenue (Pareto)
            </p>
          </>
        ) : (
          <>
            <SkuTable rows={data.sku.rows} />
            <p className="footer-note">
              Top 6 of 10 · <a href="#">show all 10</a>
            </p>
          </>
        )}
      </div>
    </>
  );
}
