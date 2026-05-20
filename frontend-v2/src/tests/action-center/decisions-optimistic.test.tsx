/**
 * P12.T5 — DecisionCards optimistic accept.
 *
 * Click the primary CTA on a decision card → the card disappears
 * immediately. When the underlying POST /actions/accept_recommendation
 * fails, the card re-appears and a MessageStrip surfaces the error.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Replace useAcceptDecision with a hook that uses a TanStack mutation whose
// mutationFn always rejects. This drives the component's onError path without
// touching the network.
vi.mock('@/data/api/useActions', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    useAcceptDecision: () =>
      useMutation({
        mutationFn: async () => {
          throw new Error('API POST /actions/accept_recommendation → 500: boom');
        },
      }),
    useDeclineDecision: () =>
      useMutation({
        mutationFn: async () => ({ replay: false, audit: {} }),
      }),
    usePartialAccept: () =>
      useMutation({
        mutationFn: async () => ({ replay: false, audit: {} }),
      }),
    useStartAbTest: () =>
      useMutation({
        mutationFn: async () => ({ replay: false, audit: {} }),
      }),
  };
});

import { DecisionCards } from '@/features/action-center/components/DecisionCards';
import type { DecisionCard } from '@/types';

const decisions: DecisionCard[] = [
  {
    rank: '1',
    title: 'D1',
    headline: 'D1-headline',
    cta: 'View',
    primaryCta: 'AcceptPrimaryD1',
    recommendation: 'Hold price',
    confLabel: 'High',
  } as unknown as DecisionCard,
  {
    rank: '2',
    title: 'D2',
    headline: 'D2-headline',
    cta: 'View',
    primaryCta: 'AcceptPrimaryD2',
    recommendation: 'Hold price',
    confLabel: 'Medium',
  } as unknown as DecisionCard,
];

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DecisionCards optimistic accept', () => {
  it('rolls the card back into view and shows MessageStrip when the API fails', async () => {
    render(withProviders(<DecisionCards decisions={decisions} />));

    expect(screen.getByText(/D1-headline/i)).toBeInTheDocument();
    expect(screen.getByText(/D2-headline/i)).toBeInTheDocument();

    const primary = screen.getByRole('button', { name: 'AcceptPrimaryD1' });
    fireEvent.click(primary);

    // Optimistic removal happens synchronously on click → D1 should vanish.
    await waitFor(() => {
      expect(screen.queryByText(/D1-headline/i)).not.toBeInTheDocument();
    });

    // After the API rejects, the card should come back AND a strip appears.
    // The strip text and the card heading both contain "D1-headline" so we
    // assert via the strip's role and the card's recommendation chip.
    await waitFor(
      () => {
        expect(screen.getByRole('status')).toHaveTextContent(/Could not accept "D1-headline"/);
        // Card 1 is back: its primary CTA is renderable again.
        expect(screen.getByRole('button', { name: 'AcceptPrimaryD1' })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });
});
