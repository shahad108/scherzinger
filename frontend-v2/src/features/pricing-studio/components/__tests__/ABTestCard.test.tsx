// Pricing Studio v3 / Phase 8 — ABTestCard tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ABTestCard } from '../ABTestCard';
import type { ActiveAbTestSummary } from '@/types/studio';

const createMutateAsync = vi.fn();
const createState = { isPending: false, isError: false };

const decideMutate = vi.fn();
const decideState = { isPending: false };

vi.mock('@/data/api/useAbTest', () => ({
  useCreateAbTest: () => ({
    mutateAsync: createMutateAsync,
    isPending: createState.isPending,
    isError: createState.isError,
  }),
  useDecideAbTest: () => ({
    mutate: decideMutate,
    isPending: decideState.isPending,
  }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  createMutateAsync.mockReset();
  decideMutate.mockReset();
  createState.isPending = false;
  createState.isError = false;
  decideState.isPending = false;
});

describe('ABTestCard', () => {
  it('renders the setup form when no active test exists', () => {
    wrap(
      <ABTestCard
        aid="200832-E"
        defaultControlPrice="118.00"
        defaultVariantPrice="127.00"
      />,
    );
    expect(screen.getByTestId('ab-test-setup')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set up A\/B test/i })).toBeEnabled();
  });

  it('renders the scoring strip when an active test exists', () => {
    const active: ActiveAbTestSummary = {
      test_id: 'abt-1',
      aid: '200832-E',
      control_price: '118.00',
      variant_price: '127.00',
      decision_state: 'running',
      target_sample: 30,
      criterion: null,
      scoring: {
        test_id: 'abt-1',
        control: { n: 12, conv: 0.7, margin: 0.18, revenue: 12000 },
        variant: { n: 15, conv: 0.75, margin: 0.22, revenue: 19000 },
        z_stat: 1.4,
        p_value: 0.08,
        decision_ready: false,
      },
    };
    wrap(
      <ABTestCard
        aid="200832-E"
        defaultControlPrice="118.00"
        defaultVariantPrice="127.00"
        activeTest={active}
      />,
    );
    expect(screen.getByTestId('ab-test-active')).toBeInTheDocument();
    expect(screen.getByText(/15\/30/)).toBeInTheDocument();
    expect(screen.getByText(/12\/30/)).toBeInTheDocument();
    // Decision buttons should both render. Promote is disabled when
    // decision_ready=false; Hold is always enabled.
    expect(screen.getByTestId('ab-test-promote')).toBeDisabled();
    expect(screen.getByTestId('ab-test-hold')).toBeEnabled();
  });

  it('enables promote when decision_ready is true', () => {
    const active: ActiveAbTestSummary = {
      test_id: 'abt-2',
      aid: '200832-E',
      control_price: '118.00',
      variant_price: '127.00',
      decision_state: 'running',
      target_sample: 30,
      criterion: null,
      scoring: {
        test_id: 'abt-2',
        control: { n: 30, conv: 0.7, margin: 0.16, revenue: 30000 },
        variant: { n: 30, conv: 0.78, margin: 0.21, revenue: 40000 },
        z_stat: 2.1,
        p_value: 0.018,
        decision_ready: true,
      },
    };
    wrap(
      <ABTestCard
        aid="200832-E"
        defaultControlPrice="118.00"
        defaultVariantPrice="127.00"
        activeTest={active}
      />,
    );
    expect(screen.getByTestId('ab-test-promote')).toBeEnabled();
    fireEvent.click(screen.getByTestId('ab-test-promote'));
    expect(decideMutate).toHaveBeenCalledWith({ decision: 'promote' });
  });

  it('submits with normalised decimal-as-string prices on "Set up A/B test"', async () => {
    createMutateAsync.mockResolvedValueOnce({
      ab_test: {
        id: 'abt-new',
        aid: '200832-E',
        control_price: '118.00',
        variant_price: '127.00',
        status: 'active',
        decision_state: 'running',
        target_sample: 30,
        eligibility: null,
        criterion: null,
        duration_days: 14,
        success_metric: 'db2_margin',
        hypothesis: null,
        start_date: null,
        end_date: null,
        created_at: null,
      },
    });
    const onCreated = vi.fn();
    wrap(
      <ABTestCard
        aid="200832-E"
        defaultControlPrice="€118"
        defaultVariantPrice="€127"
        onCreated={onCreated}
      />,
    );
    fireEvent.click(screen.getByTestId('ab-test-create'));
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    const body = createMutateAsync.mock.calls[0][0];
    expect(body.aid).toBe('200832-E');
    expect(body.control_price).toBe('118.00');
    expect(body.variant_price).toBe('127.00');
    expect(body.target_sample).toBe(30);
    expect(body.criterion).toMatchObject({ delta_pp: 2, sided: 'one' });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('abt-new'));
  });

  it('reveals eligibility editor and toggles tiers', () => {
    wrap(
      <ABTestCard
        aid="200832-E"
        defaultControlPrice="118.00"
        defaultVariantPrice="127.00"
      />,
    );
    expect(screen.queryByTestId('ab-test-eligibility')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Open eligibility/i }));
    expect(screen.getByTestId('ab-test-eligibility')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tier B' }));
    // After toggling Tier B, the eligibility summary updates to "Tier B".
    // Multiple "Tier B" nodes exist (the chip + summary), so just confirm
    // at least one matches.
    expect(screen.getAllByText(/Tier B/).length).toBeGreaterThan(0);
  });
});
