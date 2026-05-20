// Pricing Studio v3 / Phase 5 — ApprovalInboxBell tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApprovalInboxBell } from '../ApprovalInboxBell';
import { LineageDrawerProvider } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import type { ApprovalInboxRow } from '@/data/api/useApprovalInbox';

let mockItems: ApprovalInboxRow[] = [];

vi.mock('@/data/api/useApprovalInbox', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/useApprovalInbox')>(
    '@/data/api/useApprovalInbox',
  );
  return {
    ...actual,
    useApprovalInbox: vi.fn(() => ({
      data: { items: mockItems, total: mockItems.length },
    })),
    useApprovalDecision: vi.fn(() => ({
      mutateAsync: vi.fn().mockResolvedValue(null),
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
    useApprovalInstance: vi.fn(() => ({ data: null, isLoading: false })),
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LineageDrawerProvider>{ui}</LineageDrawerProvider>
    </QueryClientProvider>,
  );
}

const row: ApprovalInboxRow = {
  approval_instance_id: 'i-77',
  proposal_id: 'p-77',
  aid: 'AID-77',
  current_price: 100,
  proposed_price: 110,
  delta_pp: 4.2,
  status: 'pending_approval',
  current_step: 0,
  step_role: 'manuel',
  created_at: '2026-05-15T10:00:00Z',
};

beforeEach(() => {
  mockItems = [];
});

describe('ApprovalInboxBell', () => {
  it('shows no badge when the inbox is empty', () => {
    mockItems = [];
    wrap(<ApprovalInboxBell />);
    expect(screen.queryByTestId('approval-inbox-badge')).not.toBeInTheDocument();
  });

  it('shows a count badge when inbox is non-empty', () => {
    mockItems = [row];
    wrap(<ApprovalInboxBell />);
    const badge = screen.getByTestId('approval-inbox-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('1');
  });

  it('clicking the bell opens the inbox drawer with row entries', () => {
    mockItems = [row];
    wrap(<ApprovalInboxBell />);
    fireEvent.click(screen.getByTestId('approval-inbox-bell'));
    expect(screen.getByTestId('approval-inbox-drawer')).toBeInTheDocument();
    expect(screen.getByTestId(`approval-inbox-row-${row.approval_instance_id}`)).toBeInTheDocument();
  });

  it('clicking an inbox row opens the ApprovalDrawer for that instance', () => {
    mockItems = [row];
    wrap(<ApprovalInboxBell />);
    fireEvent.click(screen.getByTestId('approval-inbox-bell'));
    fireEvent.click(screen.getByTestId(`approval-inbox-row-${row.approval_instance_id}`));
    expect(screen.getByTestId('approval-drawer')).toBeInTheDocument();
  });
});
