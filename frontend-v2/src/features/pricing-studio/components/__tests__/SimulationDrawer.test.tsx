// Pricing Studio v3 / Phase 8 — SimulationDrawer tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SimulationDrawer } from '../SimulationDrawer';
import type { SimulationResponse } from '@/data/api/useSimulation';

const simulateMutate = vi.fn();
const proposalMutateAsync = vi.fn();
const proposalState = { isPending: false, isError: false };

const baseResponse: SimulationResponse = {
  aid: '200832-E',
  control_price: '118.00',
  variant_price: '127.00',
  eligibility: null,
  target_sample: 30,
  n_eligible: 24,
  sample_size: 30,
  scenarios: {
    low: {
      revenue_delta_12mo: 42000,
      db2_delta_12mo: 18000,
      churn_risk_pp: 0.3,
      win_prob_control: 0.86,
      win_prob_variant: 0.7,
    },
    mid: {
      revenue_delta_12mo: 78000,
      db2_delta_12mo: 34000,
      churn_risk_pp: 0.9,
      win_prob_control: 0.84,
      win_prob_variant: 0.72,
    },
    high: {
      revenue_delta_12mo: 115000,
      db2_delta_12mo: 48000,
      churn_risk_pp: 1.8,
      win_prob_control: 0.82,
      win_prob_variant: 0.74,
    },
  },
  fan_band_chart_data: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    low: ((i + 1) / 12) * 42000,
    mid: ((i + 1) / 12) * 78000,
    high: ((i + 1) / 12) * 115000,
  })),
  lineage_ref: 'lin-abc-123',
  horizon_months: 12,
};

vi.mock('@/data/api/useSimulation', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/useSimulation')>(
    '@/data/api/useSimulation',
  );
  return {
    ...actual,
    useSimulation: () => ({
      mutate: simulateMutate,
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
    }),
  };
});

vi.mock('@/data/api/useProposals', () => ({
  useCreateProposal: () => ({
    mutateAsync: proposalMutateAsync,
    isPending: proposalState.isPending,
    isError: proposalState.isError,
  }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  simulateMutate.mockReset();
  proposalMutateAsync.mockReset();
  proposalState.isPending = false;
  proposalState.isError = false;
  // useSimulation.mutate is fire-and-forget; immediately invoke the
  // onSuccess callback with the canned response.
  simulateMutate.mockImplementation(
    (_body: unknown, opts?: { onSuccess?: (r: SimulationResponse) => void }) => {
      opts?.onSuccess?.(baseResponse);
    },
  );
});

describe('SimulationDrawer', () => {
  it('renders the three scenarios after a successful simulate', async () => {
    wrap(
      <SimulationDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        variantPrice="127.00"
        controlPrice="118.00"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('sim-scenarios-table')).toBeInTheDocument();
    });
    expect(screen.getByText('Low')).toBeInTheDocument();
    expect(screen.getByText('Mid')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    // Sample / eligibility footer.
    expect(screen.getByText(/n_eligible = 24/)).toBeInTheDocument();
  });

  it('wires "Set as proposal" to createProposal with decimal strings', async () => {
    proposalMutateAsync.mockResolvedValueOnce({ id: 'prop-1' });
    const onProposalCreated = vi.fn();
    wrap(
      <SimulationDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        variantPrice="127.00"
        controlPrice="118.00"
        onProposalCreated={onProposalCreated}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('sim-set-as-proposal')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('sim-set-as-proposal'));
    await waitFor(() => {
      expect(proposalMutateAsync).toHaveBeenCalledTimes(1);
    });
    const body = proposalMutateAsync.mock.calls[0][0];
    expect(body.article_id).toBe('200832-E');
    expect(body.proposed_price).toBe('127.00');
    expect(body.current_price).toBe('118.00');
    await waitFor(() => expect(onProposalCreated).toHaveBeenCalledWith('prop-1'));
  });

  it('wires "Run as A/B" to onRunAsAbTest with the variant + control prices', async () => {
    const onRunAsAbTest = vi.fn();
    wrap(
      <SimulationDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        variantPrice="127.00"
        controlPrice="118.00"
        onRunAsAbTest={onRunAsAbTest}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('sim-run-as-ab')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('sim-run-as-ab'));
    expect(onRunAsAbTest).toHaveBeenCalledWith('127.00', '118.00');
  });
});
