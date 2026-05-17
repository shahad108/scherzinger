// Pricing Studio v3 / Phase 2 — Customer fanout + drill-in test fixtures.
//
// Decimal arrives from the BFF as JSON-string; fixtures match that wire
// shape so each component's parser path is exercised end-to-end.

import type {
  CustomerDrillInPayload,
  CustomerFanoutBlock,
  CustomerFanoutRow,
} from '@/types/studio';

export const fanoutRow = (overrides: Partial<CustomerFanoutRow> = {}): CustomerFanoutRow => ({
  customer_id: '101580',
  customer_name: 'Customer 101580',
  aid: '200832-E',
  tier: 'A',
  last_paid: '4.80',
  last_paid_at: '2024-09-12T00:00:00Z',
  ltm_units: 1600,
  ltm_eur: '7680.00',
  wallet_share_pct: '0.3800',
  paid_band: { p10: '4.50', p50: '4.80', p90: '5.10' },
  churn_p: '0.62',
  decline_p: '0.18',
  risk_if_moved: '0.70',
  tone: 'alert',
  proposal_queued: false,
  lineage_ref_id: 'a1d4e3f0-0000-4000-8000-000000000aaa',
  ...overrides,
});

export const fanoutBlock = (
  rows: CustomerFanoutRow[] = [
    fanoutRow(),
    fanoutRow({
      customer_id: '102330',
      customer_name: 'Customer 102330',
      tone: 'warn',
      churn_p: '0.08',
      risk_if_moved: '0.42',
      proposal_queued: true,
    }),
    fanoutRow({
      customer_id: '103044',
      customer_name: 'Customer 103044',
      tier: 'B',
      tone: 'plain',
      churn_p: '0.05',
      risk_if_moved: '0.12',
      wallet_share_pct: '0.1200',
    }),
  ],
  overrides: Partial<CustomerFanoutBlock> = {},
): CustomerFanoutBlock => ({
  aid: '200832-E',
  proposed_price: null,
  rows,
  lineage_ref: 'a1d4e3f0-0000-4000-8000-000000000bbb',
  ...overrides,
});

export const drillInPayload = (
  overrides: Partial<CustomerDrillInPayload> = {},
): CustomerDrillInPayload => ({
  customer: { id: '101580', name: 'Customer 101580', tier: 'A' },
  this_sku: {
    aid: '200832-E',
    customer_id: '101580',
    last_paid: '4.80',
    last_paid_at: '2024-09-12T00:00:00Z',
    ltm_units: 1600,
    ltm_eur: '7680.00',
    churn_p: '0.62',
    decline_p: '0.18',
    risk_if_moved: '0.70',
    wallet_share_pct: '0.3800',
    paid_band: { p10: '4.50', p50: '4.80', p90: '5.10' },
    tier: 'A',
  },
  at_proposed: {
    delta_vs_last_paid: '0.30',
    delta_pct: '6.25',
    risk_if_moved: '0.72',
  },
  wallet_top_skus: [
    { aid: '200832-E', share_pct: '0.3800', ltm_eur: '7680.00' },
    { aid: '200900-A', share_pct: '0.2200', ltm_eur: '4400.00' },
    { aid: '201001-B', share_pct: '0.1800', ltm_eur: '3600.00' },
    { aid: '201100-C', share_pct: '0.1100', ltm_eur: '2200.00' },
    { aid: '201205-D', share_pct: '0.1100', ltm_eur: '2200.00' },
  ],
  history_on_sku: [
    { date: '2024-04-10', price: '4.70', units: 200, won: true },
    { date: '2024-07-22', price: '4.75', units: 250, won: true },
    { date: '2024-09-12', price: '4.80', units: 1150, won: true },
  ],
  lineage_ref: 'a1d4e3f0-0000-4000-8000-000000000ccc',
  ...overrides,
});
