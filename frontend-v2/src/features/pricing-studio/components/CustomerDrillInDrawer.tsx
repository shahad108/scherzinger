// Pricing Studio v3 / Phase 2 — Customer Drill-in side panel.
//
// Per spec §2.3 (Frank Pricing Studio v3, lines 396-417). 480px-wide
// right-rail drawer surfacing per-(customer × SKU) reality:
//   1. This SKU       — last_paid, LTM, paid band visual
//   2. At proposed €X — Δ vs last paid, risk_if_moved, wallet share
//   3. Wallet across all SKUs (top 5) — bar list
//   4. History (24mo) — sparkline w/ per-transaction dots
//   5. Actions footer — queue customer-specific proposal / open Margin Cockpit
//
// Tone for the risk + at-proposed delta reuses the Phase 1 mapping
// (rose-deep for ≥0.65 risk, amber for 0.35..0.65, neutral otherwise).
// All thresholds come from `customer_risk.compute_tone` on the BFF in
// the row payload; we only translate the string here.
//
// Decimal arrives as JSON-string from the BFF. We parse at the formatter
// boundary, never sooner.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Drawer } from '@/components/ui/Drawer';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { useCustomerDrillIn } from '@/data/api/useCustomerDrillIn';
import { useCreateProposal } from '@/data/api/useProposals';
import { useActionFeedbackStore } from '@/stores/actionFeedbackStore';
import { parseDecimal } from '../lib/decimal';
import { fmt } from '@/lib/format';
import type {
  CustomerDrillInPayload,
  DrillInAtProposed,
  DrillInHistoryPoint,
  WalletSkuRow,
} from '@/types/studio';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer: { id: string; name: string } | null;
  aid: string;
  /** Decimal-as-string. When null the "At proposed" section renders the missing badge. */
  proposedPrice: string | null;
}

export function CustomerDrillInDrawer({ open, onOpenChange, customer, aid, proposedPrice }: Props) {
  const { data, isLoading, isError } = useCustomerDrillIn(
    customer?.id ?? null,
    aid,
    proposedPrice,
    { enabled: open && Boolean(customer) },
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={480}
      title={customer ? `${customer.name} drill-in` : 'Customer drill-in'}
    >
      <div className="flex h-full flex-col" data-testid="customer-drill-in-drawer">
        <Header customer={customer} aid={aid} payload={data ?? null} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <div className="space-y-3 text-[12.5px] text-[var(--muted)]" data-testid="drill-in-loading">
              <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-sunken)]" />
              <div className="h-12 w-full animate-pulse rounded bg-[var(--surface-sunken)]" />
              <div className="h-20 w-full animate-pulse rounded bg-[var(--surface-sunken)]" />
            </div>
          )}
          {isError && (
            <div className="rounded border border-[var(--rose-tint)] bg-[var(--rose-bg)] p-3 text-[12.5px] text-[var(--rose-deep)]">
              No record for this customer on this SKU.
            </div>
          )}
          {data && (
            <>
              <ThisSku payload={data} />
              <AtProposed
                atProposed={data.at_proposed}
                proposedPrice={proposedPrice}
                walletSharePct={data.this_sku.wallet_share_pct}
              />
              <WalletTop skus={data.wallet_top_skus} />
              <HistorySpark points={data.history_on_sku} />
            </>
          )}
        </div>
        {data && customer && (
          <ActionsFooter
            customerId={customer.id}
            customerName={customer.name}
            aid={aid}
            proposedPrice={proposedPrice}
          />
        )}
      </div>
    </Drawer>
  );
}

// --- Header --------------------------------------------------------------

function Header({
  customer,
  aid,
  payload,
}: {
  customer: { id: string; name: string } | null;
  aid: string;
  payload: CustomerDrillInPayload | null;
}) {
  const tier = payload?.customer.tier ?? null;
  return (
    <div className="border-b border-[var(--hairline)] px-5 py-3 pr-12">
      <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
        Customer drill-in · {aid}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {tier && (
          <span className={`tier-chip ${tier}`} aria-label={`Tier ${tier}`}>
            {tier}
          </span>
        )}
        <h2 className="font-display text-[16px] font-bold leading-tight text-[var(--ink)]">
          {customer?.name ?? '—'}
        </h2>
      </div>
      {customer && (
        <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">id {customer.id}</div>
      )}
    </div>
  );
}

// --- Section 1: This SKU -------------------------------------------------

function ThisSku({ payload }: { payload: CustomerDrillInPayload }) {
  const cos = payload.this_sku;
  const lastPaid = parseDecimal(cos.last_paid);
  const ltm = parseDecimal(cos.ltm_eur);
  const lastPaidAt = cos.last_paid_at ? formatDate(cos.last_paid_at) : null;

  return (
    <section className="mb-4" data-testid="drill-in-this-sku">
      <SectionTitle>This SKU</SectionTitle>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
        <KV
          label="Last paid"
          value={
            Number.isFinite(lastPaid) ? (
              <span>
                <span className="font-bold text-[var(--ink)]">{fmt.eurPrecise(lastPaid)}</span>
                {lastPaidAt && <span className="ml-1 text-[var(--muted)]">· {lastPaidAt}</span>}
              </span>
            ) : (
              <DataMissingBadge reason="no history" />
            )
          }
        />
        <KV
          label="LTM units"
          value={<span className="tabular-nums">{cos.ltm_units ? fmt.num(cos.ltm_units) : '—'}</span>}
        />
        <KV
          label="LTM revenue"
          value={
            Number.isFinite(ltm) ? (
              <span className="tabular-nums font-semibold text-[var(--ink)]">{fmt.eur(ltm)}</span>
            ) : (
              <DataMissingBadge reason="no LTM" />
            )
          }
        />
        <KV
          label="Paid band"
          value={
            cos.paid_band ? (
              <span className="tabular-nums text-[11.5px] text-[var(--muted)]">
                {fmt.eurPrecise(parseDecimal(cos.paid_band.p10))} ·{' '}
                <b className="text-[var(--ink)]">{fmt.eurPrecise(parseDecimal(cos.paid_band.p50))}</b> ·{' '}
                {fmt.eurPrecise(parseDecimal(cos.paid_band.p90))}
              </span>
            ) : (
              <DataMissingBadge reason="no band" />
            )
          }
        />
      </dl>
    </section>
  );
}

// --- Section 2: At proposed €X ------------------------------------------

function AtProposed({
  atProposed,
  proposedPrice,
  walletSharePct,
}: {
  atProposed: DrillInAtProposed | null;
  proposedPrice: string | null;
  walletSharePct: string | null;
}) {
  const propNum = parseDecimal(proposedPrice);
  const propLabel = Number.isFinite(propNum) ? fmt.eurPrecise(propNum) : null;

  if (!proposedPrice || !atProposed) {
    return (
      <section className="mb-4" data-testid="drill-in-at-proposed">
        <SectionTitle>At proposed</SectionTitle>
        <div className="rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12px] text-[var(--muted)]">
          <DataMissingBadge
            reason="no price selected"
            tooltip="Pick a price option in the workbench to score this customer."
          />
        </div>
      </section>
    );
  }

  const deltaEur = parseDecimal(atProposed.delta_vs_last_paid);
  const deltaPct = parseDecimal(atProposed.delta_pct);
  const risk = parseDecimal(atProposed.risk_if_moved);
  const wallet = parseDecimal(walletSharePct);

  const riskTone: 'alert' | 'warn' | 'plain' =
    !Number.isFinite(risk) ? 'plain' : risk >= 0.65 ? 'alert' : risk >= 0.35 ? 'warn' : 'plain';
  const riskClass =
    riskTone === 'alert'
      ? 'bg-[var(--rose-bg)] border-[var(--rose-tint)] text-[var(--rose-deep)]'
      : riskTone === 'warn'
        ? 'bg-[var(--amber-bg)] border-[var(--amber)] text-[var(--amber)]'
        : 'bg-[var(--surface-soft)] border-[var(--hairline)] text-[var(--muted)]';

  return (
    <section className="mb-4" data-testid="drill-in-at-proposed">
      <SectionTitle>
        At proposed {propLabel && <span className="text-[var(--rose-deep)]">{propLabel}</span>}
      </SectionTitle>
      <div className={`rounded-[var(--r-md)] border p-3 ${riskClass}`}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-80">
              Δ vs last paid
            </div>
            <div className="mt-0.5 tabular-nums">
              {Number.isFinite(deltaEur) ? (
                <span className="text-[16px] font-bold">
                  {deltaEur >= 0 ? '+' : '−'}
                  {fmt.eurPrecise(Math.abs(deltaEur))}
                </span>
              ) : (
                <DataMissingBadge reason="no Δ" />
              )}
              {Number.isFinite(deltaPct) && (
                <span className="ml-2 text-[12.5px] opacity-80">
                  ({deltaPct >= 0 ? '+' : '−'}
                  {Math.abs(deltaPct).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-80">
              Risk if moved
            </div>
            <div className="mt-0.5 text-[16px] font-bold tabular-nums">
              {Number.isFinite(risk) ? `${(risk * 100).toFixed(0)}%` : '—'}
            </div>
          </div>
        </div>
        {Number.isFinite(wallet) && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-semibold tracking-wide">
            wallet share {(wallet * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </section>
  );
}

// --- Section 3: Wallet across all SKUs (top 5) --------------------------

function WalletTop({ skus }: { skus: WalletSkuRow[] }) {
  const max = useMemo(
    () => skus.reduce((m, r) => Math.max(m, parseDecimal(r.share_pct)), 0),
    [skus],
  );

  return (
    <section className="mb-4" data-testid="drill-in-wallet-top">
      <SectionTitle>Wallet across all SKUs · top 5</SectionTitle>
      {skus.length === 0 ? (
        <DataMissingBadge reason="no wallet data" />
      ) : (
        <ul className="space-y-1.5">
          {skus.map((r) => {
            const share = parseDecimal(r.share_pct);
            const ltm = parseDecimal(r.ltm_eur);
            const pct = max > 0 ? (share / max) * 100 : 0;
            return (
              <li
                key={r.aid}
                className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12px]"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-[var(--ink)]" title={r.aid}>
                      {r.aid}
                    </span>
                    <span className="tabular-nums text-[11.5px] text-[var(--muted)]">
                      {Number.isFinite(ltm) ? fmt.eur(ltm) : '—'}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <div
                      className="h-full rounded-full bg-[var(--rose)]"
                      style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                    />
                  </div>
                </div>
                <span className="w-12 text-right tabular-nums text-[11.5px] font-semibold text-[var(--ink)]">
                  {Number.isFinite(share) ? `${(share * 100).toFixed(1)}%` : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// --- Section 4: History on this SKU (24mo) ------------------------------

interface HistoryDatum {
  ts: number;
  date: string;
  price: number;
  units: number;
  won: boolean;
}

function HistorySpark({ points }: { points: DrillInHistoryPoint[] }) {
  const data: HistoryDatum[] = useMemo(() => {
    const out: HistoryDatum[] = [];
    for (const p of points) {
      if (!p.date) continue;
      const ts = Date.parse(p.date);
      const price = parseDecimal(p.price);
      if (!Number.isFinite(ts) || !Number.isFinite(price)) continue;
      out.push({ ts, date: p.date, price, units: p.units, won: p.won });
    }
    return out;
  }, [points]);

  return (
    <section className="mb-4" data-testid="drill-in-history">
      <SectionTitle>History on this SKU · 24mo</SectionTitle>
      {data.length === 0 ? (
        <DataMissingBadge reason="no transactions" />
      ) : (
        <div className="h-[120px] w-full rounded-[var(--r-md)] border border-[var(--hairline)] bg-white p-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 6, left: 8 }}>
              <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} hide />
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                cursor={{ stroke: 'var(--rose-tint)' }}
                contentStyle={{
                  background: 'white',
                  border: '1px solid var(--hairline)',
                  borderRadius: 6,
                  fontSize: 11,
                  padding: '6px 8px',
                }}
                labelFormatter={(v) => formatDate(new Date(Number(v)).toISOString())}
                formatter={(value, name, item) => {
                  if (name !== 'price') return [value as number, name as string];
                  const d = (item as { payload?: HistoryDatum }).payload;
                  if (!d) return [fmt.eurPrecise(Number(value)), 'price'];
                  return [
                    `${fmt.eurPrecise(d.price)} · ${d.units} units · ${d.won ? 'won' : 'lost'}`,
                    'price',
                  ];
                }}
              />
              <ReferenceLine y={data[data.length - 1]?.price} stroke="var(--surface-sunken)" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--rose-deep)"
                strokeWidth={1.5}
                dot={{ r: 2.5, fill: 'var(--rose-deep)', stroke: 'white', strokeWidth: 1 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

// --- Section 5: Actions footer ------------------------------------------

function ActionsFooter({
  customerId,
  customerName,
  aid,
  proposedPrice,
}: {
  customerId: string;
  customerName: string;
  aid: string;
  proposedPrice: string | null;
}) {
  const navigate = useNavigate();
  const pushToast = useActionFeedbackStore((s) => s.pushToast);
  const createProposal = useCreateProposal();

  const propNum = parseDecimal(proposedPrice);

  const handleQueue = () => {
    // TODO(p5: approval-wired) — customer-specific proposals get their
    // own approval rules in Phase 5. For now we fire-and-forget the
    // existing /pricing/proposals POST with a customer-scoped payload
    // and surface a toast. The proposal is enqueued; reviewers see it
    // in Action Center.
    createProposal.mutate(
      {
        article_id: aid,
        proposed_price: Number.isFinite(propNum) ? propNum : null,
        payload: { customer_id: customerId, source: 'studio.drill_in' },
      },
      {
        onSuccess: () => {
          pushToast(`Proposal queued for ${customerName}`, 'success');
        },
        onError: (err) => {
          pushToast(`Could not queue: ${(err as Error).message}`, 'error');
        },
      },
    );
  };

  const handleOpenMargin = () => {
    const url = `/margin?customer_id=${encodeURIComponent(customerId)}&source=studio&aid=${encodeURIComponent(aid)}`;
    navigate(url);
  };

  // TODO(post-Phase J): drill-in → forecasting per-customer view will land
  // once Forecasting v2.3 ships the per-customer slice. Until then we
  // omit the third button to avoid a 404.

  return (
    <div className="border-t border-[var(--hairline)] bg-[var(--surface-soft)] px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleQueue}
          disabled={createProposal.isPending}
          data-testid="drill-in-queue-proposal"
          className="inline-flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--rose-deep)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:bg-[var(--rose)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createProposal.isPending ? 'Queueing…' : 'Queue customer-specific proposal'}
        </button>
        <button
          type="button"
          onClick={handleOpenMargin}
          data-testid="drill-in-open-margin"
          className="inline-flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--hairline)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)]"
        >
          Open in Margin Cockpit
        </button>
      </div>
    </div>
  );
}

// --- helpers ------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
      {children}
    </h3>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 truncate">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(fmt.locale(), {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
