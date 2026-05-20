// Pricing Studio v3 / Phase G G2 — PendingApprovalBanner tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PendingApprovalBanner, relativeTime } from '../PendingApprovalBanner';
import type { ProposalRow } from '@/data/api/useRecommendation';

const recallMutate = vi.fn(
  (_id: string, opts?: { onSuccess?: () => void; onError?: () => void }) => {
    opts?.onSuccess?.();
  },
);
let recallPending = false;

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
              role: 'md',
              decision: 'pending',
              actor: null,
              at: null,
              comment: null,
            },
          ],
          created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
          updated_at: null,
        },
        actions: [],
        proposal: null,
      },
      isLoading: false,
    })),
    useRecallProposal: vi.fn(() => ({
      mutate: recallMutate,
      isPending: recallPending,
    })),
  };
});

const pushToast = vi.fn();
vi.mock('@/stores/actionFeedbackStore', () => ({
  useActionFeedbackStore: <T,>(selector: (s: { pushToast: typeof pushToast }) => T) =>
    selector({ pushToast }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const proposal: Pick<
  ProposalRow,
  'id' | 'status' | 'updated_at' | 'created_at'
> = {
  id: 'p-1',
  status: 'pending_approval',
  updated_at: null,
  created_at: null,
};

beforeEach(() => {
  recallMutate.mockReset();
  recallMutate.mockImplementation(
    (_id: string, opts?: { onSuccess?: () => void; onError?: () => void }) => {
      opts?.onSuccess?.();
    },
  );
  recallPending = false;
  pushToast.mockReset();
});

describe('PendingApprovalBanner', () => {
  it('relativeTime formats common ranges', () => {
    const now = Date.parse('2026-05-19T12:00:00Z');
    expect(relativeTime(null, now)).toBe('—');
    expect(relativeTime('2026-05-19T12:00:00Z', now)).toBe('just now');
    expect(relativeTime('2026-05-19T11:45:00Z', now)).toBe('15m ago');
    expect(relativeTime('2026-05-19T09:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-05-15T12:00:00Z', now)).toBe('4d ago');
  });

  it('hides when proposal is not pending_approval', () => {
    wrap(
      <PendingApprovalBanner
        proposal={{ ...proposal, status: 'draft' }}
      />,
    );
    expect(screen.queryByTestId('pending-approval-banner')).not.toBeInTheDocument();
  });

  it('renders banner with recipient + relative time when pending', () => {
    wrap(<PendingApprovalBanner proposal={proposal} />);
    const banner = screen.getByTestId('pending-approval-banner');
    expect(banner).toBeInTheDocument();
    // Mock instance has step.role = "md" → label "Till".
    expect(banner.textContent).toMatch(/Till/);
    expect(banner.textContent).toMatch(/for approval/);
    expect(screen.getByTestId('pending-approval-banner-since').textContent).toMatch(/3h ago/);
  });

  it('opens confirmation modal then fires recall on confirm and pushes a toast', () => {
    wrap(<PendingApprovalBanner proposal={proposal} />);
    // No modal initially.
    expect(screen.queryByTestId('pending-approval-recall-confirm')).not.toBeInTheDocument();

    // Click Recall → confirmation modal opens.
    fireEvent.click(screen.getByTestId('pending-approval-recall-button'));
    expect(screen.getByTestId('pending-approval-recall-confirm')).toBeInTheDocument();

    // Confirm → mutate fires + toast posted.
    fireEvent.click(screen.getByTestId('pending-approval-recall-confirm-button'));
    expect(recallMutate).toHaveBeenCalledWith('p-1', expect.any(Object));
    expect(pushToast).toHaveBeenCalledWith('Proposal recalled.', 'success');
  });
});
