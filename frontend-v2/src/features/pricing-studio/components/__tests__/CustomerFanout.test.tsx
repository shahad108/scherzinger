// Pricing Studio v3 / Phase 2 — CustomerFanout tests.
//
// Cover the v3 typed-block path: tone class comes from the BFF (NEVER
// recomputed), the churn chip / wallet-share column / paid-band bar /
// proposal-queued badge are all present, and clicking a row opens the
// drill-in drawer.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CustomerFanout } from '../CustomerFanout';
import type { FanoutPane } from '@/types/studio';
import { fanoutBlock, fanoutRow, drillInPayload } from './fixtures-phase2';

// Drawer content is exercised in its own test file; stub the network hooks
// so opening the drawer in this suite doesn't try to round-trip through
// the BFF mock loader (no fixture JSON exists for the drill-in path).
vi.mock('@/data/api/useCustomerDrillIn', () => ({
  useCustomerDrillIn: vi.fn(() => ({
    data: drillInPayload(),
    isLoading: false,
    isError: false,
  })),
}));
vi.mock('@/data/api/useProposals', () => ({
  useCreateProposal: () => ({ mutate: vi.fn(), isPending: false }),
}));

const legacyPane: FanoutPane = {
  paneSub: 'if priced at €5.10 (cost-floor)',
  fanPrice: '€5.10',
  clusterNote: 'Cluster note',
  rows: [],
  footNote: 'showing top 6',
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CustomerFanout (v3 typed block)', () => {
  it('renders the BFF-typed rows when block is provided', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€5.10"
        block={fanoutBlock()}
        proposedPriceDecimal="5.10"
        aid="200832-E"
      />,
    );
    expect(screen.getByTestId('fanout-row-101580')).toBeInTheDocument();
    expect(screen.getByTestId('fanout-row-102330')).toBeInTheDocument();
    expect(screen.getByTestId('fanout-row-103044')).toBeInTheDocument();
  });

  it('row tone class comes from BFF — never client-computed', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€5.10"
        // Synthesize: low churn but explicit "alert" tone from BFF.
        // If the client were recomputing thresholds it would NOT pick
        // alert — the BFF must be authoritative.
        block={fanoutBlock([
          fanoutRow({ tone: 'alert', churn_p: '0.05', risk_if_moved: '0.10' }),
        ])}
        proposedPriceDecimal="5.10"
        aid="200832-E"
      />,
    );
    const row = screen.getByTestId('fanout-row-101580');
    expect(row).toHaveAttribute('data-tone', 'alert');
    expect(row.className).toMatch(/\balert\b/);
  });

  it('shows the right-side "churn N%" chip with tone-driven colour', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€5.10"
        block={fanoutBlock([
          fanoutRow({ tone: 'alert', churn_p: '0.62' }),
        ])}
        proposedPriceDecimal="5.10"
        aid="200832-E"
      />,
    );
    const chip = screen.getByText(/^churn 62%$/);
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('data-tone', 'alert');
  });

  it('renders the wallet-share column with 1 decimal', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€5.10"
        block={fanoutBlock([fanoutRow({ wallet_share_pct: '0.3800' })])}
        proposedPriceDecimal="5.10"
        aid="200832-E"
      />,
    );
    expect(screen.getByText('38.0%')).toBeInTheDocument();
    expect(screen.getByText('wallet share')).toBeInTheDocument();
  });

  it('renders the paid-band micro-bar with proposed marker when price is set', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€5.10"
        block={fanoutBlock([fanoutRow()])}
        proposedPriceDecimal="5.10"
        aid="200832-E"
      />,
    );
    expect(screen.getByTestId('paid-band-micro-bar')).toBeInTheDocument();
    expect(screen.getByTestId('paid-band-proposed')).toBeInTheDocument();
  });

  it('renders the proposal-queued badge only when proposal_queued is true', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€5.10"
        block={fanoutBlock([
          fanoutRow({ customer_id: 'A', proposal_queued: true }),
          fanoutRow({ customer_id: 'B', proposal_queued: false }),
        ])}
        proposedPriceDecimal="5.10"
        aid="200832-E"
      />,
    );
    expect(screen.getByTestId('fan-queued-A')).toBeInTheDocument();
    expect(screen.queryByTestId('fan-queued-B')).not.toBeInTheDocument();
  });

  // SF3 (Phase 2.2.5): the pane subtitle context label is BFF truth.
  it('header subtitle reflects block.context_label (not the legacy regex parse)', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€6.50"
        block={fanoutBlock([fanoutRow()], { context_label: 'at proposed €6.50' })}
        proposedPriceDecimal="6.50"
        aid="200832-E"
      />,
    );
    const sub = screen.getByTestId('ws-pane-sub');
    expect(sub).toHaveTextContent(/at proposed €6\.50/i);
    // The legacy "(cost-floor)" parenthetical from data.paneSub must NOT
    // leak through when the BFF block is authoritative.
    expect(sub).not.toHaveTextContent(/cost-floor/i);
  });

  it('falls back to the legacy paneSub parse when block is absent', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€5.10"
        block={undefined}
        proposedPriceDecimal={null}
        aid="200832-E"
      />,
    );
    expect(screen.getByTestId('ws-pane-sub')).toHaveTextContent(/cost-floor/i);
  });

  it('clicking a row opens the drill-in drawer', () => {
    wrap(
      <CustomerFanout
        data={legacyPane}
        fanPrice="€5.10"
        block={fanoutBlock([fanoutRow({ customer_id: 'XYZ', customer_name: 'Acme GmbH' })])}
        proposedPriceDecimal="5.10"
        aid="200832-E"
      />,
    );
    fireEvent.click(screen.getByTestId('fanout-row-XYZ'));
    // The drawer renders with the customer header.
    expect(screen.getByTestId('customer-drill-in-drawer')).toBeInTheDocument();
  });
});
