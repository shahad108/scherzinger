// Pricing Studio v3 / Phase 2 — Customer fan-out panel.
//
// Reads the BFF-computed `customer_fanout` block (typed `CustomerFanoutBlock`)
// when present and falls back to the legacy `fanout` pane for the
// mock-driven dev path. The new block carries the SOURCE-OF-TRUTH `tone`
// per row — DO NOT recompute thresholds on the client. The same rule
// applies to the right-side churn chip, wallet-share column, paid-band
// micro-bar, and proposal-queued badge.
//
// Clicking a row opens `<CustomerDrillInDrawer>` with the customer +
// aid + the currently active proposed_price (or null when the user is
// still viewing the default fanout).

import { useState } from 'react';
import type {
  CustomerFanoutBlock,
  CustomerFanoutRow,
  FanoutPane,
  WorkbenchBlockMeta,
} from '@/types/studio';
import { CustomerDrillInDrawer } from './CustomerDrillInDrawer';
import { PaidBandMicroBar } from './PaidBandMicroBar';
import { fmt } from '@/lib/format';
import { parseDecimal } from '../lib/decimal';
import { renderInline } from './renderInline';
import { AlertButton } from '@/components/AlertButton';

interface Props {
  /** Legacy FanoutPane (mock JSON path) — used for the default workbench view. */
  data: FanoutPane;
  /** Formatted "€5.10" price headline displayed in the pane header. */
  fanPrice: string;
  /** v3 wire-shape block when the BFF attaches it; takes precedence over `data`. */
  block?: CustomerFanoutBlock | null;
  /** Currently selected proposed price (Decimal-as-string) for drill-in URLs. */
  proposedPriceDecimal?: string | null;
  /** Owning aid (used for drill-in URLs). */
  aid: string;
  /**
   * Phase A — per-block status from ``workbench.meta.blocks.customer_fanout``.
   * When non-``'live'`` we render an inline empty/locked/degraded card in
   * place of the rows; the block payload is then ignored. ``computed_at``
   * (when present) drives the "Stale data" chip after 7d.
   */
  blockMeta?: WorkbenchBlockMeta | null;
}

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

function isStale(computedAt: string | null | undefined): boolean {
  if (!computedAt) return false;
  const ts = Date.parse(computedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > STALE_THRESHOLD_MS;
}

export function CustomerFanout({
  data,
  fanPrice,
  block,
  proposedPriceDecimal,
  aid,
  blockMeta,
}: Props) {
  const [openCustomer, setOpenCustomer] = useState<CustomerFanoutRow | null>(null);

  // When the BFF v3 block is present render the typed rows; otherwise
  // fall back to the legacy pre-formatted FanoutPane (mock path).
  // `rows` is required on the wire-shape but old workbench mocks may
  // ship a partial object — guard for that.
  const useBlock = Boolean(block && Array.isArray(block.rows) && block.rows.length > 0);
  // Pricing Studio v3 / Phase 11 — empty state when the BFF block is
  // explicitly empty (no rows) AND the legacy data also has no rows.
  // Loading is handled upstream by the studio skeleton — once the page
  // is rendered, we're guaranteed to have either rows or "no customers".
  const isExplicitlyEmpty =
    block !== null &&
    block !== undefined &&
    Array.isArray(block.rows) &&
    block.rows.length === 0 &&
    (!data.rows || data.rows.length === 0);

  // SF3 (Phase 2.2.5): prefer the BFF-computed context label so a slider
  // re-score updates the header in lockstep with the row tones. Fall
  // back to the legacy regex parse of paneSub only when the block isn't
  // present (mock JSON path).
  const contextLabel =
    (useBlock && block?.context_label) ||
    data.paneSub.match(/\(([^)]+)\)/)?.[1] ||
    'cost-floor';

  // Phase A — when the BFF marks the fanout block non-live we render an
  // inline empty/locked/degraded card and skip the row list entirely. The
  // rest of the pane (header, alert button) still renders so the user has
  // context for what would have been here.
  const blockStatus = blockMeta?.status ?? 'live';
  const blockNonLive = blockStatus !== 'live';

  // Phase A — "Stale data" amber chip when the upstream computation is
  // older than 7d. Backend writes ``computed_at`` on the block-meta when
  // a lineage timestamp is available; if absent we don't render the chip.
  const stale = isStale(blockMeta?.computed_at);

  return (
    <div className="ws-pane">
      <h4 className="flex items-center gap-2">
        <span>
          Customer fan-out · this SKU only
          <span className="ws-pane-sub" data-testid="ws-pane-sub">
            if priced at <b>{fanPrice}</b> ({contextLabel})
          </span>
        </span>
        {stale && (
          <span
            data-testid="customer-fanout-stale-chip"
            title={
              blockMeta?.computed_at
                ? `Last computed ${blockMeta.computed_at}`
                : 'Last computation is more than 7 days old'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
              padding: '2px 8px',
              borderRadius: 999,
              background: 'color-mix(in oklab, var(--amber-bg) 70%, white)',
              border: '1px solid color-mix(in oklab, var(--amber) 32%, white)',
              color: 'var(--ink)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.02em',
            }}
          >
            Stale data
          </span>
        )}
        <AlertButton
          triggerKind="churn_spike"
          scope={{ aid }}
          initialSpec={{ pp: 10 }}
          label="churn"
        />
      </h4>
      <p className="cluster-note">{renderInline(data.clusterNote)}</p>
      {blockNonLive && (
        <FanoutStatusCard
          status={blockStatus}
          reason={blockMeta?.reason ?? null}
        />
      )}
      {!blockNonLive && isExplicitlyEmpty && (
        <div
          className="rounded-[var(--r-sm)] border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-3 text-[12px] text-[var(--muted)]"
          data-testid="customer-fanout-empty"
        >
          No customers buy this SKU in the current period — fan-out is empty.
        </div>
      )}
      {!blockNonLive && (
      <div className="ws-fanout">
        {useBlock
          ? block!.rows.map((r) => (
              <BlockRow
                key={r.customer_id}
                row={r}
                proposedPriceDecimal={proposedPriceDecimal ?? block!.proposed_price ?? null}
                onClick={() => setOpenCustomer(r)}
              />
            ))
          : data.rows.map((r) => (
              <div key={r.customer} className={`ws-fan-row${r.rowTone !== 'plain' ? ` ${r.rowTone}` : ''}`}>
                <span className={`tier-chip ${r.tier}`}>{r.tier}</span>
                <span className="ws-fan-cust">
                  {r.customer}
                  <span className="ws-fan-sub">
                    {r.customerSub}
                    {r.customerSubExtra && (
                      <>
                        {' · '}
                        <i style={{ color: 'var(--rose-deep)' }}>{r.customerSubExtra}</i>
                      </>
                    )}
                  </span>
                </span>
                <span className="ws-fan-num">
                  {r.amount}
                  <span className="ws-fan-sub">{r.amountSub}</span>
                </span>
                <span className="ws-fan-churn">
                  <span className={`n ${r.churnTone}`}>{r.churnPct}</span>
                  <span className="l">churn risk</span>
                </span>
                <span className="ws-fan-rec">{r.recommendation}</span>
              </div>
            ))}
      </div>
      )}
      {!blockNonLive && (
        <p className="ws-fan-note">
          {data.footNote} · <a href="#">show all</a>
        </p>
      )}

      <CustomerDrillInDrawer
        open={openCustomer !== null}
        onOpenChange={(o) => {
          if (!o) setOpenCustomer(null);
        }}
        customer={openCustomer ? { id: openCustomer.customer_id, name: openCustomer.customer_name } : null}
        aid={aid}
        proposedPrice={proposedPriceDecimal ?? null}
      />
    </div>
  );
}

// --- v3 typed row --------------------------------------------------------

interface BlockRowProps {
  row: CustomerFanoutRow;
  proposedPriceDecimal: string | null;
  onClick: () => void;
}

function BlockRow({ row, proposedPriceDecimal, onClick }: BlockRowProps) {
  // Tone is BFF truth — never recompute on the client. We pass the
  // backend's tone string straight through as the CSS-class suffix so
  // the same row colours land via the existing .ws-fan-row stylesheet.
  // Do NOT re-threshold from churn_p / risk_if_moved / decline_p here.
  const toneClass = row.tone !== 'plain' ? ` ${row.tone}` : '';
  const churnPct = parseDecimal(row.churn_p);
  const churnLabel = Number.isFinite(churnPct) ? `${(churnPct * 100).toFixed(0)}%` : '—';
  // BFF tone is also the source-of-truth for the churn chip colour —
  // just thread it through as a CSS-class suffix (plain | warn | alert).
  const churnToneClass = row.tone;

  const walletShare = parseDecimal(row.wallet_share_pct);
  const walletLabel = Number.isFinite(walletShare) ? `${(walletShare * 100).toFixed(1)}%` : '—';

  const ltm = parseDecimal(row.ltm_eur);
  const ltmLabel = Number.isFinite(ltm) ? fmt.eur(ltm) : '—';

  const lastPaidNum = parseDecimal(row.last_paid);
  const lastPaid = Number.isFinite(lastPaidNum) ? fmt.eurPrecise(lastPaidNum) : '—';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`ws-fan-row ws-fan-row-block${toneClass}`}
      data-testid={`fanout-row-${row.customer_id}`}
      data-tone={row.tone}
      aria-label={`Open drill-in for ${row.customer_name}`}
    >
      <span className={`tier-chip ${row.tier}`}>{row.tier}</span>

      <span className="ws-fan-cust">
        <span className="flex items-center gap-1.5">
          {row.customer_name}
          {row.proposal_queued && (
            <span
              className="ws-fan-queued"
              data-testid={`fan-queued-${row.customer_id}`}
              title="A customer-specific proposal is already queued"
            >
              queued
            </span>
          )}
        </span>
        <span className="ws-fan-sub">
          last paid {lastPaid} · LTM {ltmLabel}
          {row.ltm_units ? ` · ${row.ltm_units} units` : ''}
        </span>
      </span>

      <span className="ws-fan-num ws-fan-wallet">
        {walletLabel}
        <span className="ws-fan-sub">wallet share</span>
      </span>

      <PaidBandMicroBar band={row.paid_band} proposed={proposedPriceDecimal} />

      <span className={`ws-fan-churn ws-fan-churn-${churnToneClass}`}>
        <span className="ws-fan-churn-chip" data-tone={row.tone}>churn {churnLabel}</span>
      </span>
    </button>
  );
}

// --- Phase A status card ----------------------------------------------------

/**
 * Inline empty / locked / degraded card mirrored from the Action Center
 * patterns (see ``LockedBlock`` / ``DegradedBlock``). Rendered in place of
 * the fanout rows when ``meta.blocks.customer_fanout.status !== 'live'``.
 */
function FanoutStatusCard({
  status,
  reason,
}: {
  status: 'empty' | 'degraded' | 'locked' | (string & {});
  reason: string | null;
}) {
  const isDegraded = status === 'degraded';
  const isLocked = status === 'locked';
  const title =
    isDegraded
      ? 'Customer fan-out is degraded'
      : isLocked
        ? 'Customer fan-out is locked'
        : 'No customer fan-out yet';
  const hint =
    reason ??
    (isDegraded
      ? 'Backend reported a partial failure computing per-customer risk.'
      : isLocked
        ? 'Data source not yet connected for this SKU.'
        : 'No customers have bought this SKU in the lookback window.');
  return (
    <div
      role={isDegraded ? 'alert' : 'note'}
      data-testid={`customer-fanout-${status}`}
      data-status={status}
      style={{
        margin: '8px 0',
        padding: '14px 16px',
        borderRadius: 12,
        background: isDegraded
          ? 'color-mix(in oklab, var(--amber-bg) 60%, white)'
          : 'var(--surface-sunken)',
        border: isDegraded
          ? '1px solid color-mix(in oklab, var(--amber) 32%, white)'
          : '1px dashed var(--hairline)',
        color: 'var(--ink-2)',
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 12 }}>{title}</div>
      <div style={{ marginTop: 4 }}>{hint}</div>
    </div>
  );
}
