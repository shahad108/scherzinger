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
} from '@/types/studio';
import { CustomerDrillInDrawer } from './CustomerDrillInDrawer';
import { PaidBandMicroBar } from './PaidBandMicroBar';
import { fmt } from '@/lib/format';
import { parseDecimal } from '../lib/decimal';
import { renderInline } from './renderInline';

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
}

export function CustomerFanout({ data, fanPrice, block, proposedPriceDecimal, aid }: Props) {
  const [openCustomer, setOpenCustomer] = useState<CustomerFanoutRow | null>(null);

  // When the BFF v3 block is present render the typed rows; otherwise
  // fall back to the legacy pre-formatted FanoutPane (mock path).
  // `rows` is required on the wire-shape but old workbench mocks may
  // ship a partial object — guard for that.
  const useBlock = Boolean(block && Array.isArray(block.rows) && block.rows.length > 0);

  return (
    <div className="ws-pane">
      <h4>
        Customer fan-out · this SKU only
        <span className="ws-pane-sub">
          if priced at <b>{fanPrice}</b> ({data.paneSub.match(/\(([^)]+)\)/)?.[1] ?? 'cost-floor'})
        </span>
      </h4>
      <p className="cluster-note">{renderInline(data.clusterNote)}</p>
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
      <p className="ws-fan-note">
        {data.footNote} · <a href="#">show all</a>
      </p>

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
  // Tone is BFF truth — never recompute on the client. We just translate
  // it to the same CSS class names that already exist on .ws-fan-row.
  const toneClass = row.tone !== 'plain' ? ` ${row.tone}` : '';
  const churnPct = parseDecimal(row.churn_p);
  const churnLabel = Number.isFinite(churnPct) ? `${(churnPct * 100).toFixed(0)}%` : '—';
  const churnToneClass = row.tone === 'alert' ? 'alert' : row.tone === 'warn' ? 'warn' : 'plain';

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
