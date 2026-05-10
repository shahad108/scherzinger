/**
 * Phase 5 — pricing proposals lifecycle.
 *
 * Mocks the network layer so the create / list / submit hooks roundtrip
 * through the synthetic store, then asserts the Studio context panel
 * renders the new proposal and the Submit-for-approval button advances
 * the status to `pending_approval`.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ProposalContextPanel } from '@/features/pricing-studio/components/ProposalContextPanel';
import { useCreateProposal, useSubmitProposal } from '@/data/api/useProposals';

beforeEach(() => {
  // Reset the synthetic proposal store between tests so each test
  // sees a clean slate.
  if (typeof window !== 'undefined') window.sessionStorage.clear();
});

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

function CreateButton() {
  const createProposal = useCreateProposal();
  return (
    <button
      type="button"
      onClick={() =>
        createProposal.mutate({
          article_id: '200832-E',
          recommendation_id: 'margin_erosion:200832-E',
          current_price: 4.1,
          proposed_price: 4.38,
          delta_pp: 6.8,
        })
      }
    >
      create
    </button>
  );
}

function SubmitButton({ proposalId }: { proposalId: string }) {
  const submit = useSubmitProposal();
  return (
    <button type="button" onClick={() => submit.mutate(proposalId)}>
      submit
    </button>
  );
}

describe('Pricing proposals lifecycle (mock mode)', () => {
  it('creates a proposal and shows it in ProposalContextPanel', async () => {
    render(
      withQc(
        <>
          <CreateButton />
          <ProposalContextPanel
            articleId="200832-E"
            recommendationId="margin_erosion:200832-E"
          />
        </>,
      ),
    );

    // Panel hidden when no proposals exist.
    expect(screen.queryByText(/Pricing proposals/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^create$/ }));

    await waitFor(() =>
      expect(screen.getByText(/Pricing proposals · 200832-E/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/€4\.10 →/i)).toBeInTheDocument();
    expect(screen.getByText(/€4\.38/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit for approval/i })).toBeInTheDocument();
  });

  it('Submit-for-approval advances status to pending_approval', async () => {
    // Seed the synthetic store directly so we know the proposal id.
    const seed = {
      id: 'mock-test-1',
      recommendation_id: null,
      article_id: '204604',
      current_price: 5.2,
      proposed_price: 5.55,
      delta_pp: 6.7,
      status: 'draft' as const,
      approval_required: false,
      payload: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    window.sessionStorage.setItem(
      'pryzm_v2_synth_proposals',
      JSON.stringify([seed]),
    );

    render(
      withQc(
        <>
          <SubmitButton proposalId="mock-test-1" />
          <ProposalContextPanel articleId="204604" />
        </>,
      ),
    );

    await waitFor(() => expect(screen.getByText(/Draft/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^submit$/ }));

    await waitFor(() =>
      expect(screen.getByText(/Pending approval/i)).toBeInTheDocument(),
    );
    // Submit button on the row should disappear once status leaves draft.
    expect(
      screen.queryByRole('button', { name: /Submit for approval/i }),
    ).not.toBeInTheDocument();
  });
});

// Quiet React's unhandled-rejection log when a network mutation fails in
// the rare case the synthetic store gets cleared mid-test.
vi.spyOn(console, 'warn').mockImplementation(() => {});
