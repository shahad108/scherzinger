import { Fragment, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { postJson } from '@/lib/api/client';
import { useActionFeedbackStore } from '@/stores/actionFeedbackStore';
import type { CustomerRow, ParetoLayer as ParetoLayerData, SkuRow } from '@/types/forecast';

interface Props {
  data: ParetoLayerData;
  /** When true, render every row instead of the top 7 (from URL `?show_all=1`). */
  showAll?: boolean;
}

type Tab = 'cust' | 'sku';
const TIERS: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

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

// Shared hook for navigation + queue intents used by both tables.
function useParetoActions() {
  const navigate = useNavigate();
  const toast = useActionFeedbackStore((s) => s.pushToast);
  const openStudio = (aid: string, customerId?: string) => {
    const qs = new URLSearchParams({ article: aid, source: 'forecasting-pareto' });
    if (customerId) qs.set('customer', customerId);
    navigate(`/pricing?${qs.toString()}`);
  };
  const queueAction = async (aid: string, customerId?: string) => {
    try {
      // /actions/queue endpoint may not exist yet — let it 404 and surface a
      // toast. Wire backend stub when the action queue API ships.
      await postJson('/actions/queue', { kind: 'price_review', article_id: aid, customer_id: customerId });
      toast(`Queued ${aid}${customerId ? ` · ${customerId}` : ''}`, 'info');
    } catch (err) {
      toast(`Queue failed: ${(err as Error).message}`, 'error');
    }
  };
  return { openStudio, queueAction };
}

// v2.2 Phase J — open the customer drill-in drawer via the `?customer=<id>`
// URL param. The forecasting page shell listens for this param and renders
// `<CustomerForecastDetail />` (the former PerCustomerTab drawer).
function useOpenCustomerDetail() {
  const [params, setParams] = useSearchParams();
  return (customerId: string) => {
    const next = new URLSearchParams(params);
    next.set('customer', customerId);
    setParams(next, { replace: false });
  };
}

function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { openStudio } = useParetoActions();
  const openCustomerDetail = useOpenCustomerDetail();

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
                      <button
                        type="button"
                        data-testid={`pareto-customer-detail-${r.customerId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openCustomerDetail(r.customerId);
                        }}
                        title={`Open customer detail for ${r.customerId}`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          font: 'inherit',
                          color: 'var(--rose-deep)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                        }}
                      >
                        {r.customerId}
                      </button>
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
                              <button
                                type="button"
                                className="sm-action"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openStudio(s.aid, r.customerId);
                                }}
                              >
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
  const { openStudio, queueAction } = useParetoActions();
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
                  <button
                    type="button"
                    className={`row-action${r.primary ? ' primary' : ''}`}
                    onClick={() => openStudio(r.aid, r.topCustomer.match(/\d+/)?.[0])}
                  >
                    Open in Studio →
                  </button>
                  {r.queue && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="row-action queue"
                        onClick={() => queueAction(r.aid, r.topCustomer.match(/\d+/)?.[0])}
                      >
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

export function ParetoLayer({ data, showAll = false }: Props) {
  const [tab, setTab] = useState<Tab>('cust');
  const [params, setParams] = useSearchParams();
  const activeTier = params.get('tier');

  const setTier = (t: 'A' | 'B' | 'C' | 'D' | null) => {
    const next = new URLSearchParams(params);
    if (t === null) next.delete('tier');
    else next.set('tier', t);
    setParams(next, { replace: true });
  };

  const setShowAll = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set('show_all', '1');
    else next.delete('show_all');
    setParams(next, { replace: true });
  };

  // Tier filter is applied client-side too, so the chip flip is instant even
  // if the BFF doesn't honour ?tier= (it will, but defense-in-depth).
  const filteredCustomerRows = activeTier
    ? data.customer.rows.filter((r) => r.tier === activeTier)
    : data.customer.rows;
  const visibleCustomerRows = showAll ? filteredCustomerRows : filteredCustomerRows.slice(0, 7);
  const visibleSkuRows = showAll ? data.sku.rows : data.sku.rows.slice(0, 6);

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
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                data-testid="pareto-tier-all"
                onClick={() => setTier(null)}
                className="tag-chip"
                style={{
                  cursor: 'pointer',
                  border: 'none',
                  font: 'inherit',
                  background: activeTier === null ? 'var(--rose-bg)' : undefined,
                  color: activeTier === null ? 'var(--rose-deep)' : undefined,
                }}
              >
                All
              </button>
              {TIERS.map((t) => {
                const label = ({ A: 'Strategic', B: 'Standard', C: 'Volume', D: 'Problematic' } as const)[t];
                const isActive = activeTier === t;
                return (
                  <button
                    key={t}
                    type="button"
                    data-testid={`pareto-tier-${t}`}
                    onClick={() => setTier(isActive ? null : t)}
                    className="tag-chip"
                    style={{
                      cursor: 'pointer',
                      border: 'none',
                      font: 'inherit',
                      background: isActive ? 'var(--rose-bg)' : undefined,
                      color: isActive ? 'var(--rose-deep)' : undefined,
                    }}
                  >
                    <span className={`tier-chip ${t}`}>{t}</span>
                    {label}
                  </button>
                );
              })}
            </div>
            <CustomerTable rows={visibleCustomerRows} />
            <p className="footer-note">
              {showAll
                ? `All ${filteredCustomerRows.length} of ${filteredCustomerRows.length}`
                : `Top ${Math.min(7, filteredCustomerRows.length)} of ${filteredCustomerRows.length}`}{' '}
              ·{' '}
              <button
                type="button"
                data-testid="pareto-show-all"
                onClick={() => setShowAll(!showAll)}
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
                {showAll ? 'show top 7' : 'show all 10'}
              </button>{' '}
              · 80.4% of revenue (Pareto)
            </p>
          </>
        ) : (
          <>
            <SkuTable rows={visibleSkuRows} />
            <p className="footer-note">
              {showAll
                ? `All ${data.sku.rows.length} of ${data.sku.rows.length}`
                : `Top ${Math.min(6, data.sku.rows.length)} of ${data.sku.rows.length}`}{' '}
              ·{' '}
              <button
                type="button"
                data-testid="pareto-sku-show-all"
                onClick={() => setShowAll(!showAll)}
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
                {showAll ? 'show top 6' : 'show all 10'}
              </button>
            </p>
          </>
        )}
      </div>
    </>
  );
}
