// Pricing Studio v3 / Phase 6 — BatchWorkbench tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BatchWorkbench } from '../BatchWorkbench';
import type { BatchEnvelope } from '@/data/api/useBatch';

const createBatchMutate = vi.fn();
vi.mock('@/data/api/useBatch', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/useBatch')>(
    '@/data/api/useBatch',
  );
  return {
    ...actual,
    useCreateBatch: vi.fn(() => ({
      mutate: createBatchMutate,
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
  ],
  approval_routing_summary: { auto_approve: 0, block: 0, manuel: 1, md: 1 },
  kpi_summary: {
    count: 2,
    total_revenue_impact: '30.00',
    total_margin_impact: '42.50',
    avg_win_prob_at_new: '0.715',
  },
  created_at: null,
  committed_at: null,
  cancelled_at: null,
};

beforeEach(() => {
  createBatchMutate.mockReset();
});

describe('BatchWorkbench', () => {
  it('renders the rule selector with all 5 kinds', () => {
    wrap(
      <BatchWorkbench
        aids={['AID-1', 'AID-2']}
        batch={null}
        staleAids={new Set()}
        lockedAids={[]}
        onToggleLock={() => {}}
        onBatchCreated={() => {}}
        onCommitClick={() => {}}
        onCancelClick={() => {}}
      />,
    );
    const select = screen.getByTestId('batch-rule-kind-select') as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toEqual([
      'floor_plus',
      'pct_move',
      'match_competitor',
      'target_db2',
      'custom_jsonlogic',
    ]);
  });

  it('changes the parameter field as the rule kind changes', () => {
    wrap(
      <BatchWorkbench
        aids={['AID-1', 'AID-2']}
        batch={null}
        staleAids={new Set()}
        lockedAids={[]}
        onToggleLock={() => {}}
        onBatchCreated={() => {}}
        onCommitClick={() => {}}
        onCancelClick={() => {}}
      />,
    );
    // floor_plus shows margin_pp.
    expect(screen.getByLabelText(/Margin \(pp over floor\)/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('batch-rule-kind-select'), {
      target: { value: 'pct_move' },
    });
    expect(screen.getByLabelText(/Move \(%\)/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('batch-rule-kind-select'), {
      target: { value: 'match_competitor' },
    });
    expect(screen.getByLabelText(/Undershoot/i)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('batch-rule-kind-select'), {
      target: { value: 'target_db2' },
    });
    expect(screen.getByLabelText(/Target DB2/i)).toBeInTheDocument();
  });

  it('renders the preview table with the expected columns and rows', () => {
    wrap(
      <BatchWorkbench
        aids={['AID-1', 'AID-2']}
        batch={batch}
        staleAids={new Set()}
        lockedAids={[]}
        onToggleLock={() => {}}
        onBatchCreated={() => {}}
        onCommitClick={() => {}}
        onCancelClick={() => {}}
      />,
    );
    const table = screen.getByTestId('batch-preview-table');
    expect(table).toBeInTheDocument();
    expect(screen.getByTestId('batch-row-AID-1')).toBeInTheDocument();
    expect(screen.getByTestId('batch-row-AID-2')).toBeInTheDocument();
    // Header columns present (scope to <th> so "Lock" header doesn't
    // collide with the per-row Lock toggle).
    const headers = Array.from(
      table.querySelectorAll('thead th'),
    ).map((el) => el.textContent ?? '');
    for (const col of [
      'AID',
      'Cluster',
      'Current',
      'After',
      'Δ%',
      'Projected DB2',
      'Win-prob',
      'Risk',
      'Lock',
    ]) {
      expect(headers).toContain(col);
    }
  });

  it('locked rows mute and Commit count excludes them', () => {
    const { rerender } = wrap(
      <BatchWorkbench
        aids={['AID-1', 'AID-2']}
        batch={batch}
        staleAids={new Set()}
        lockedAids={[]}
        onToggleLock={() => {}}
        onBatchCreated={() => {}}
        onCommitClick={() => {}}
        onCancelClick={() => {}}
      />,
    );
    expect(screen.getByTestId('batch-commit-button')).not.toBeDisabled();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <BatchWorkbench
          aids={['AID-1', 'AID-2']}
          batch={batch}
          staleAids={new Set()}
          lockedAids={['AID-1', 'AID-2']}
          onToggleLock={() => {}}
          onBatchCreated={() => {}}
          onCommitClick={() => {}}
          onCancelClick={() => {}}
        />
      </QueryClientProvider>,
    );
    const row = screen.getByTestId('batch-row-AID-1');
    expect(row.className).toMatch(/locked/);
    expect(screen.getByTestId('batch-commit-button')).toBeDisabled();
  });

  it('fires create-batch on Preview', async () => {
    wrap(
      <BatchWorkbench
        aids={['AID-1', 'AID-2']}
        batch={null}
        staleAids={new Set()}
        lockedAids={[]}
        onToggleLock={() => {}}
        onBatchCreated={() => {}}
        onCommitClick={() => {}}
        onCancelClick={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('batch-preview-button'));
    await waitFor(() => expect(createBatchMutate).toHaveBeenCalledTimes(1));
    const [body] = createBatchMutate.mock.calls[0];
    expect(body.aids).toEqual(['AID-1', 'AID-2']);
    expect(body.rule.kind).toBe('floor_plus');
  });
});
