// Pricing Studio v3 / Phase 6 — BatchApprovalDrawer tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BatchApprovalDrawer } from '../BatchApprovalDrawer';
import type { BatchEnvelope } from '@/data/api/useBatch';

const commitMutate = vi.fn();
const cancelMutate = vi.fn();

vi.mock('@/data/api/useBatch', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/useBatch')>(
    '@/data/api/useBatch',
  );
  return {
    ...actual,
    useCommitBatch: vi.fn(() => ({
      mutate: commitMutate,
      isPending: false,
    })),
    useCancelBatch: vi.fn(() => ({
      mutate: cancelMutate,
      isPending: false,
    })),
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const batch: BatchEnvelope = {
  batch_id: 'b-1',
  status: 'preview',
  rule: { kind: 'floor_plus', margin_pp: '20' },
  scope_filter: {},
  items: [
    {
      id: 'i-1',
      aid: 'AID-1',
      before_price: '100.00',
      after_price: '110.00',
      status: 'queued',
      proposal_id: null,
      per_sku_lineage_ref: null,
      preview: {
        aid: 'AID-1',
        before_price: '100.00',
        after_price: '110.00',
        projected_db2: '12.50',
        win_prob_at_new: '0.78',
        risk_score: '0.20',
        approval_route: ['manuel'],
        auto_approve: false,
        block: false,
      },
    },
    {
      id: 'i-2',
      aid: 'AID-2',
      before_price: '200.00',
      after_price: '220.00',
      status: 'queued',
      proposal_id: null,
      per_sku_lineage_ref: null,
      preview: {
        aid: 'AID-2',
        before_price: '200.00',
        after_price: '220.00',
        projected_db2: '30.00',
        win_prob_at_new: '0.65',
        risk_score: '0.55',
        approval_route: ['md'],
        auto_approve: false,
        block: false,
      },
    },
    {
      id: 'i-3',
      aid: 'AID-3',
      before_price: '50.00',
      after_price: '52.00',
      status: 'queued',
      proposal_id: null,
      per_sku_lineage_ref: null,
      preview: {
        aid: 'AID-3',
        before_price: '50.00',
        after_price: '52.00',
        projected_db2: '1.00',
        win_prob_at_new: '0.90',
        risk_score: '0.05',
        approval_route: [],
        auto_approve: true,
        block: false,
      },
    },
  ],
  approval_routing_summary: {
    auto_approve: 1,
    block: 0,
    manuel: 1,
    md: 1,
  },
  kpi_summary: {
    count: 3,
    total_revenue_impact: '32.00',
    total_margin_impact: '43.50',
    avg_win_prob_at_new: '0.77',
  },
  created_at: null,
  committed_at: null,
  cancelled_at: null,
};

beforeEach(() => {
  commitMutate.mockReset();
  cancelMutate.mockReset();
});

describe('BatchApprovalDrawer', () => {
  it('renders the routing breakdown rows', () => {
    wrap(
      <BatchApprovalDrawer
        open
        onOpenChange={() => {}}
        batch={batch}
        lockedAids={[]}
      />,
    );
    expect(screen.getByTestId('batch-approval-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('batch-routing-row-auto_approve')).toBeInTheDocument();
    expect(screen.getByTestId('batch-routing-row-manuel')).toBeInTheDocument();
    expect(screen.getByTestId('batch-routing-row-md')).toBeInTheDocument();
  });

  it('Confirm-and-submit triggers the commit mutation', () => {
    const onOpenChange = vi.fn();
    wrap(
      <BatchApprovalDrawer
        open
        onOpenChange={onOpenChange}
        batch={batch}
        lockedAids={['AID-2']}
      />,
    );
    fireEvent.click(screen.getByTestId('batch-drawer-confirm-button'));
    expect(commitMutate).toHaveBeenCalledTimes(1);
    const [body] = commitMutate.mock.calls[0];
    expect(body).toEqual({ dry_run: false, locked_aids: ['AID-2'] });
  });

  it('Cancel-batch triggers the cancel mutation', async () => {
    const onOpenChange = vi.fn();
    wrap(
      <BatchApprovalDrawer
        open
        onOpenChange={onOpenChange}
        batch={batch}
        lockedAids={[]}
      />,
    );
    fireEvent.click(screen.getByTestId('batch-drawer-cancel-button'));
    await waitFor(() => expect(cancelMutate).toHaveBeenCalledTimes(1));
  });

  it('Edit selection just closes the drawer (no POST)', () => {
    const onOpenChange = vi.fn();
    wrap(
      <BatchApprovalDrawer
        open
        onOpenChange={onOpenChange}
        batch={batch}
        lockedAids={[]}
      />,
    );
    fireEvent.click(screen.getByTestId('batch-drawer-edit-selection-button'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(commitMutate).not.toHaveBeenCalled();
    expect(cancelMutate).not.toHaveBeenCalled();
  });
});
