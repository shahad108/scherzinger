// Pricing Studio v3 / Phase 5 — ApprovalDrawer tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApprovalDrawer } from '../ApprovalDrawer';
import { LineageDrawerProvider } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import type { ProposalRow } from '@/data/api/useRecommendation';

const decideMutate = vi.fn();
vi.mock('@/data/api/useApprovalInbox', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/useApprovalInbox')>(
    '@/data/api/useApprovalInbox',
  );
  return {
    ...actual,
    useApprovalDecision: vi.fn(() => ({
      mutateAsync: decideMutate,
      isPending: false,
    })),
  };
});

vi.mock('@/data/api/useApprovalInstance', async () => {
  const actual = await vi.importActual<
    typeof import('@/data/api/useApprovalInstance')
  >('@/data/api/useApprovalInstance');
  return {
    ...actual,
    useApprovalInstance: vi.fn(() => ({
      data: {
        approval_instance: {
          id: 'i-1',
          proposal_id: 'p-1',
          current_step: 0,
          steps: [
            {
              role: 'manuel',
              decision: 'pending',
              actor: null,
              at: null,
              comment: null,
              rule: 'Δ > 5%',
            },
          ],
          created_at: null,
          updated_at: null,
        },
        actions: [],
        proposal: null,
      },
      isLoading: false,
    })),
  };
});

const proposal: Pick<
  ProposalRow,
  'id' | 'article_id' | 'current_price' | 'proposed_price' | 'delta_pp' | 'status' | 'payload'
> = {
  id: 'p-1',
  article_id: 'AID-1',
  current_price: 118.0,
  proposed_price: 121.5,
  delta_pp: 2.9,
  status: 'pending_approval',
  payload: { projected_db2: '35.4%', win_prob: '0.82' },
};

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LineageDrawerProvider>{ui}</LineageDrawerProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  decideMutate.mockReset().mockResolvedValue({
    approval_instance: null,
    proposal_status: 'approved',
  });
});

describe('ApprovalDrawer', () => {
  it('renders the six drawer sections', () => {
    wrap(
      <ApprovalDrawer
        open
        onOpenChange={() => {}}
        proposal={proposal}
        instanceId="i-1"
        currentStepRole="manuel"
      />,
    );
    expect(screen.getByTestId('drawer-section-summary')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-section-rules')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-section-lineage')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-section-past')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-section-comment')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-section-decision')).toBeInTheDocument();
  });

  it('Reject without a comment shows an inline error and does not POST', () => {
    wrap(
      <ApprovalDrawer
        open
        onOpenChange={() => {}}
        proposal={proposal}
        instanceId="i-1"
        currentStepRole="manuel"
      />,
    );
    fireEvent.click(screen.getByTestId('drawer-reject-button'));
    expect(screen.getByTestId('drawer-reject-error')).toBeInTheDocument();
    expect(decideMutate).not.toHaveBeenCalled();
  });

  it('Approve POSTs the decision via the mutation', async () => {
    wrap(
      <ApprovalDrawer
        open
        onOpenChange={() => {}}
        proposal={proposal}
        instanceId="i-1"
        currentStepRole="manuel"
      />,
    );
    fireEvent.click(screen.getByTestId('drawer-approve-button'));
    await waitFor(() =>
      expect(decideMutate).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'approve' }),
      ),
    );
  });

  it('"Counter-propose" expands the price field, then posts a request_changes decision with the counter-price', async () => {
    wrap(
      <ApprovalDrawer
        open
        onOpenChange={() => {}}
        proposal={proposal}
        instanceId="i-1"
        currentStepRole="manuel"
      />,
    );
    expect(screen.queryByTestId('drawer-edit-price')).not.toBeInTheDocument();
    const btn = screen.getByTestId('drawer-approve-changes-button');
    expect(btn.textContent ?? '').toMatch(/counter-propose/i);
    fireEvent.click(btn);
    expect(screen.getByTestId('drawer-edit-price')).toBeInTheDocument();
    // Hint text appears below the price field.
    expect(
      screen.getByText(/sends the proposal back to the requester/i),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('drawer-edit-price-input'), {
      target: { value: '121.50' },
    });
    fireEvent.change(screen.getByTestId('drawer-comment-input'), {
      target: { value: 'closer to budget pls' },
    });
    fireEvent.click(screen.getByTestId('drawer-approve-changes-button'));
    await waitFor(() =>
      expect(decideMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          decision: 'request_changes',
          comment: expect.stringMatching(
            /Counter-proposing €121\.50: closer to budget pls/i,
          ),
        }),
      ),
    );
  });
});
