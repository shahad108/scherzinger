// Pricing Studio v3 / Phase 5 — ApprovalStepper tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApprovalStepper } from '../ApprovalStepper';
import { LineageDrawerProvider } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { useAuthStore } from '@/stores/authStore';

interface InstanceState {
  data: {
    approval_instance: {
      id: string;
      proposal_id: string;
      current_step: number;
      steps: Array<{
        role: string;
        decision: 'pending' | 'approved' | 'rejected' | 'changes_requested';
        actor: string | null;
        at: string | null;
        comment: string | null;
        rule?: string | null;
      }>;
      created_at: string | null;
      updated_at: string | null;
    };
    actions: Array<{
      id: string;
      actor: string | null;
      decision: string;
      comment: string | null;
      at: string | null;
    }>;
    proposal: unknown;
  } | null;
  isLoading: boolean;
}

let mockInstance: InstanceState = { data: null, isLoading: false };

const recallMutate = vi.fn();

vi.mock('@/data/api/useApprovalInstance', async () => {
  const actual = await vi.importActual<
    typeof import('@/data/api/useApprovalInstance')
  >('@/data/api/useApprovalInstance');
  return {
    ...actual,
    useApprovalInstance: vi.fn(() => mockInstance),
    useRecallProposal: vi.fn(() => ({ mutate: recallMutate, isPending: false })),
  };
});

const collabSend = vi.fn(() => true);
const collabReconnect = vi.fn();
let collabState: {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
} = { isConnected: true, connectionState: 'connected' };
vi.mock('@/data/api/useProposalCollab', () => ({
  useProposalCollab: vi.fn(() => ({
    peers: [],
    comments: [],
    isConnected: collabState.isConnected,
    connectionState: collabState.connectionState,
    sendComment: collabSend,
    reconnect: collabReconnect,
    lastFrame: null,
  })),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LineageDrawerProvider>{ui}</LineageDrawerProvider>
    </QueryClientProvider>,
  );
}

const makeInstance = (overrides: Partial<InstanceState['data']> = {}): InstanceState['data'] => ({
  approval_instance: {
    id: 'instance-1',
    proposal_id: 'proposal-1',
    current_step: 1,
    steps: [
      {
        role: 'frank',
        decision: 'approved',
        actor: 'frank@example.com',
        at: '2026-05-15T11:00:00Z',
        comment: null,
        rule: null,
      },
      {
        role: 'manuel',
        decision: 'pending',
        actor: null,
        at: null,
        comment: null,
        rule: 'Δ > 5%',
      },
      {
        role: 'md',
        decision: 'pending',
        actor: null,
        at: null,
        comment: null,
        rule: 'tier A',
      },
    ],
    created_at: '2026-05-15T10:00:00Z',
    updated_at: '2026-05-15T11:00:00Z',
  },
  actions: [
    {
      id: 'a-1',
      actor: 'frank',
      decision: 'approved',
      comment: 'Looks good to me.',
      at: '2026-05-15T11:00:00Z',
    },
  ],
  proposal: null,
  ...overrides,
});

beforeEach(() => {
  useAuthStore.setState({ user: null, isLoading: false });
  mockInstance = { data: null, isLoading: false };
  recallMutate.mockReset();
  collabSend.mockReset().mockReturnValue(true);
  collabReconnect.mockReset();
  collabState = { isConnected: true, connectionState: 'connected' };
});

describe('ApprovalStepper', () => {
  it('renders bubbles for each routed step plus draft + live anchors', () => {
    mockInstance = { data: makeInstance(), isLoading: false };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'pending_approval',
          article_id: 'AID-1',
          payload: {},
          created_by: 'user-1',
        }}
      />,
    );
    expect(screen.getByTestId('approval-stepper-bubbles')).toBeInTheDocument();
    expect(screen.getByTestId('approval-bubble-frank')).toBeInTheDocument();
    expect(screen.getByTestId('approval-bubble-manuel')).toBeInTheDocument();
    expect(screen.getByTestId('approval-bubble-md')).toBeInTheDocument();
    expect(screen.getByTestId('approval-bubble-draft')).toBeInTheDocument();
    expect(screen.getByTestId('approval-bubble-live')).toBeInTheDocument();
  });

  it('shows status icons by step decision (approved has check, pending has clock label)', () => {
    mockInstance = { data: makeInstance(), isLoading: false };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'pending_approval',
          article_id: 'AID-1',
          payload: {},
        }}
      />,
    );
    const frank = screen.getByTestId('approval-bubble-frank');
    expect(frank.textContent ?? '').toMatch(/frank/i);
    // The pending Manuel bubble's label includes "pending".
    expect(
      screen.getByLabelText(/Manuel:\s*pending/i),
    ).toBeInTheDocument();
  });

  it('Phase G G2 — never renders its own Recall button (banner owns recall)', () => {
    // Recall is no longer the stepper's responsibility — the
    // pending-approval banner in ProposalContextPanel owns it. Confirm
    // the stepper never renders one, regardless of status, creator, or
    // whether an approval instance exists.
    mockInstance = { data: makeInstance(), isLoading: false };
    useAuthStore.setState({
      user: {
        id: 'user-1',
        email: 'creator@example.com',
        name: 'Creator',
        ui_persona: 'frank',
        roles: [],
        permissions: [],
        features: [],
      },
      isLoading: false,
    });
    const { rerender, unmount } = wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'pending_approval',
          article_id: 'AID-1',
          payload: {},
          created_by: 'user-1',
        }}
      />,
    );
    expect(screen.queryByTestId('approval-recall-button')).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LineageDrawerProvider>
          <ApprovalStepper
            proposal={{
              id: 'proposal-1',
              status: 'draft',
              article_id: 'AID-1',
              payload: {},
              created_by: 'user-1',
            }}
          />
        </LineageDrawerProvider>
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId('approval-recall-button')).not.toBeInTheDocument();
    unmount();

    // Draft + no instance → still no recall button in the stepper.
    mockInstance = { data: null, isLoading: false };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'draft',
          article_id: 'AID-1',
          payload: {},
          created_by: 'user-1',
        }}
      />,
    );
    expect(screen.queryByTestId('approval-recall-button')).not.toBeInTheDocument();
  });

  it('Phase G G1 — draft proposal with no instance renders the full 5-node default chain', () => {
    mockInstance = { data: null, isLoading: false };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'draft',
          article_id: 'AID-1',
          payload: {},
          created_by: 'user-1',
        }}
      />,
    );
    expect(screen.getByTestId('approval-stepper-draft-empty')).toBeInTheDocument();
    expect(screen.getByTestId('approval-stepper-default-chain')).toBeInTheDocument();
    // All five default stages must be visible so Frank can see the path
    // ahead. Pre-publish → "Draft" is current.
    for (const key of ['draft', 'submitted', 'till', 'approved', 'live']) {
      expect(screen.getByTestId(`approval-default-bubble-${key}`)).toBeInTheDocument();
    }
    const current = screen.getByTestId('approval-default-bubble-draft');
    expect(current.getAttribute('aria-current')).toBe('step');
  });

  it('Phase G G1 — the currently-pending step has aria-current="step"', () => {
    mockInstance = { data: makeInstance(), isLoading: false };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'pending_approval',
          article_id: 'AID-1',
          payload: {},
          created_by: 'user-1',
        }}
      />,
    );
    const current = screen.getByTestId('approval-bubble-manuel');
    expect(current.getAttribute('aria-current')).toBe('step');
    // Already-approved Frank node and not-yet-reached MD node are NOT
    // current.
    expect(screen.getByTestId('approval-bubble-frank').getAttribute('aria-current')).toBeNull();
    expect(screen.getByTestId('approval-bubble-md').getAttribute('aria-current')).toBeNull();
  });

  it('Phase G G1 — renders the decision history list with actor + relative time + comment', () => {
    mockInstance = { data: makeInstance(), isLoading: false };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'pending_approval',
          article_id: 'AID-1',
          payload: {},
          created_by: 'user-1',
        }}
      />,
    );
    const history = screen.getByTestId('approval-stepper-history');
    expect(history).toBeInTheDocument();
    // Action row "a-1" exists with actor=frank and a comment.
    const row = screen.getByTestId('approval-history-row-a-1');
    expect(row.textContent).toMatch(/frank/i);
    expect(row.textContent).toMatch(/Looks good to me/);
  });

  it('shows a Reconnect button when the collab channel is fully disconnected', () => {
    mockInstance = { data: makeInstance(), isLoading: false };
    collabState = { isConnected: false, connectionState: 'disconnected' };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'pending_approval',
          article_id: 'AID-1',
          payload: {},
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('approval-add-comment-button'));
    expect(screen.getByTestId('approval-collab-offline-notice')).toBeInTheDocument();
    const btn = screen.getByTestId('approval-collab-reconnect-button');
    fireEvent.click(btn);
    expect(collabReconnect).toHaveBeenCalled();
  });

  it('does not show Reconnect while the channel is still reconnecting', () => {
    mockInstance = { data: makeInstance(), isLoading: false };
    collabState = { isConnected: false, connectionState: 'reconnecting' };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'pending_approval',
          article_id: 'AID-1',
          payload: {},
        }}
      />,
    );
    fireEvent.click(screen.getByTestId('approval-add-comment-button'));
    expect(screen.getByTestId('approval-collab-offline-notice')).toBeInTheDocument();
    expect(
      screen.queryByTestId('approval-collab-reconnect-button'),
    ).not.toBeInTheDocument();
  });

  it('Add comment toggles the inline textarea', () => {
    mockInstance = { data: makeInstance(), isLoading: false };
    wrap(
      <ApprovalStepper
        proposal={{
          id: 'proposal-1',
          status: 'pending_approval',
          article_id: 'AID-1',
          payload: {},
        }}
      />,
    );
    expect(screen.queryByTestId('approval-comment-form')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('approval-add-comment-button'));
    expect(screen.getByTestId('approval-comment-form')).toBeInTheDocument();
  });
});
