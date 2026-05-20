// Pricing Studio v3 / Phase 8 — CompareDrawer tests.

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  CustomerFanoutBlock,
  OptionMarginBlock,
  PriceOptionsBundle,
  WinProbCurveBlock,
} from '@/types/studio';
import { CompareDrawer } from '../CompareDrawer';

// Phase H — mocks for "Set as proposal" CTA.
const createProposalMutate = vi.fn();
const proposalMutationState = { isPending: false };
vi.mock('@/data/api/useProposals', () => ({
  useCreateProposal: () => ({
    mutate: createProposalMutate,
    isPending: proposalMutationState.isPending,
    isError: false,
  }),
}));

const runUiActionMock = vi.fn();
vi.mock('@/hooks/useUiAction', () => ({
  useUiAction: () => runUiActionMock,
}));

beforeEach(() => {
  createProposalMutate.mockReset();
  runUiActionMock.mockReset();
  proposalMutationState.isPending = false;
});

const options: PriceOptionsBundle = {
  hold: {
    price: '€118',
    delta: '0 · hold',
    impact: '€0 · hold',
    impactTone: 'neg',
    risk: 'churn · low',
  },
  floor: {
    price: '€127',
    delta: '+7.6%',
    impact: '+€78k',
    impactTone: 'pos',
    risk: '3 customers · at risk',
  },
  market: {
    price: '€125',
    delta: '+5.9%',
    impact: '+€65k',
    impactTone: 'pos',
    risk: '2 customers · at risk',
  },
  abtest: {
    slice: '50/50',
    meta: 'Tier B,C',
    takeaway: 'A/B vs hold',
    criterion: 'p<0.10',
  },
  customPlaceholder: '0.00',
};

const optionMargins: OptionMarginBlock[] = [
  {
    option_id: 'hold',
    price: '118.00',
    list: '120.00',
    quoted: '118.00',
    booked: '118.00',
    invoiced: '116.00',
    db2: '0.14',
    leakage_per_step_pct: ['0.02', '0.0', '0.02', '0.0'],
  },
  {
    option_id: 'floor',
    price: '127.00',
    list: '130.00',
    quoted: '127.00',
    booked: '127.00',
    invoiced: '125.00',
    db2: '0.18',
    leakage_per_step_pct: ['0.02', '0.0', '0.02', '0.0'],
  },
];

const winProbCurve: WinProbCurveBlock = {
  aid: '200832-E',
  tier: null,
  n_deals: 80,
  confidence_band: null,
  points: [
    { price: '110.00', win_prob: '0.90' },
    { price: '118.00', win_prob: '0.84' },
    { price: '127.00', win_prob: '0.71' },
    { price: '135.00', win_prob: '0.55' },
  ],
};

const fanout: CustomerFanoutBlock = {
  aid: '200832-E',
  proposed_price: null,
  rows: [
    {
      customer_id: '101580',
      customer_name: 'Customer 101580',
      aid: '200832-E',
      tier: 'A',
      last_paid: '118.00',
      last_paid_at: '2024-09-12T00:00:00Z',
      ltm_units: 320,
      ltm_eur: '37760.00',
      wallet_share_pct: '0.38',
      paid_band: { p10: '110.00', p50: '118.00', p90: '124.00' },
      churn_p: '0.12',
      decline_p: '0.18',
      risk_if_moved: 'high',
      tone: 'warn',
      proposal_queued: false,
      lineage_ref_id: null,
    },
    {
      customer_id: '102330',
      customer_name: 'Customer 102330',
      aid: '200832-E',
      tier: 'B',
      last_paid: '120.00',
      last_paid_at: '2024-08-10T00:00:00Z',
      ltm_units: 180,
      ltm_eur: '21600.00',
      wallet_share_pct: '0.22',
      paid_band: { p10: '115.00', p50: '120.00', p90: '125.00' },
      churn_p: '0.08',
      decline_p: '0.10',
      risk_if_moved: 'med',
      tone: 'plain',
      proposal_queued: false,
      lineage_ref_id: null,
    },
  ],
  lineage_ref: null,
};

describe('CompareDrawer', () => {
  it('renders three columns: Hold, Recommended, Custom', () => {
    render(
      <CompareDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
        customPrice="130.00"
      />,
    );
    const table = screen.getByTestId('compare-table');
    const headers = within(table).getAllByRole('columnheader');
    // Metric + 3 option columns = 4 headers.
    expect(headers).toHaveLength(4);
    expect(headers[1]).toHaveTextContent('Hold');
    expect(headers[2]).toHaveTextContent('Recommended');
    expect(headers[3]).toHaveTextContent('Custom');
  });

  it('pulls DB2 from option_margins', () => {
    render(
      <CompareDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
      />,
    );
    // Hold DB2 = 14%, Recommended DB2 = 18%.
    expect(screen.getByText('14.0%')).toBeInTheDocument();
    expect(screen.getByText('18.0%')).toBeInTheDocument();
  });

  it('renders "Set as proposal" CTA on each option column', () => {
    render(
      <CompareDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
        customPrice="130.00"
      />,
    );
    expect(
      screen.getByTestId('compare-set-as-proposal-hold'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('compare-set-as-proposal-recommended'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('compare-set-as-proposal-custom'),
    ).toBeInTheDocument();
  });

  it('disables "Set as proposal" when option price equals hold (no-op)', () => {
    render(
      <CompareDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
        customPrice="130.00"
      />,
    );
    // Hold matches current price (€118) → no-op proposal → disabled.
    expect(screen.getByTestId('compare-set-as-proposal-hold')).toBeDisabled();
    // Recommended (€127) and Custom (€130) differ → enabled.
    expect(
      screen.getByTestId('compare-set-as-proposal-recommended'),
    ).toBeEnabled();
    expect(screen.getByTestId('compare-set-as-proposal-custom')).toBeEnabled();
  });

  it('disables "Set as proposal" when option price is null', () => {
    // Omit customPrice → Custom column has no parseable price.
    render(
      <CompareDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
      />,
    );
    expect(screen.getByTestId('compare-set-as-proposal-custom')).toBeDisabled();
  });

  it('click triggers useCreateProposal with the expected body', () => {
    render(
      <CompareDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
        customPrice="130.00"
        recommendationId="rec-abc"
      />,
    );
    fireEvent.click(screen.getByTestId('compare-set-as-proposal-recommended'));
    expect(createProposalMutate).toHaveBeenCalledTimes(1);
    const [body] = createProposalMutate.mock.calls[0];
    expect(body).toMatchObject({
      article_id: '200832-E',
      proposed_price: '127.00',
      current_price: '118.00',
      recommendation_id: 'rec-abc',
      payload: {
        source: 'compare_drawer',
        option_label: 'floor',
        note: null,
      },
    });
  });

  it('closes the drawer + toasts on successful create', async () => {
    const onOpenChange = vi.fn();
    createProposalMutate.mockImplementation(
      (
        _body: unknown,
        opts: { onSuccess?: () => void; onError?: (e: Error) => void },
      ) => {
        opts.onSuccess?.();
      },
    );
    render(
      <CompareDrawer
        open
        onOpenChange={onOpenChange}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
        customPrice="130.00"
      />,
    );
    fireEvent.click(screen.getByTestId('compare-set-as-proposal-recommended'));
    await waitFor(() => {
      expect(runUiActionMock).toHaveBeenCalledWith({
        toast: 'Draft proposal created',
      });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders inline error on mutation failure', async () => {
    createProposalMutate.mockImplementation(
      (
        _body: unknown,
        opts: { onSuccess?: () => void; onError?: (e: Error) => void },
      ) => {
        opts.onError?.(new Error('Backend rejected the proposal'));
      },
    );
    render(
      <CompareDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
        customPrice="130.00"
      />,
    );
    fireEvent.click(screen.getByTestId('compare-set-as-proposal-recommended'));
    const errNode = await screen.findByTestId(
      'compare-set-as-proposal-recommended-error',
    );
    expect(errNode).toHaveTextContent(/Backend rejected/i);
    // No toast on failure.
    expect(runUiActionMock).not.toHaveBeenCalled();
  });

  it('renders routing row as TODO placeholder dashes', () => {
    render(
      <CompareDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        options={options}
        optionMargins={optionMargins}
        winProbCurve={winProbCurve}
        customerFanout={fanout}
        currentPriceLabel="€118"
      />,
    );
    const row = screen.getByTestId('compare-routing-row');
    const cells = within(row).getAllByRole('cell');
    // First cell is the "Routing" label; the other 3 are dashes.
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent(/Routing/);
    for (let i = 1; i < 4; i++) {
      expect(cells[i]).toHaveTextContent('—');
    }
    expect(
      screen.getByText(/Routing column is a placeholder/i),
    ).toBeInTheDocument();
  });
});
