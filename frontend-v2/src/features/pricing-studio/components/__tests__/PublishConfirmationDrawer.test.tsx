// Pricing Studio v3 / Phase 7 — PublishConfirmationDrawer tests.
//
// Asserts that:
//   1. The compose state renders effective-date, old/new rows, notify
//      checkboxes, warning, Confirm/Cancel.
//   2. Confirm fires usePublishPrice with the right decimal-string payload.
//   3. On success the body transitions to the "Published" state, showing
//      receipt + per-channel notification rows (incl. amber failure).
//   4. The Rollback button is enabled within the 72h window and disabled
//      after. Confirming rollback fires useRollback.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PublishConfirmationDrawer } from '../PublishConfirmationDrawer';
import type { PublishReceipt } from '@/data/api/usePublishPrice';

// ---------------------------------------------------------------------------
// Mocks for the publish + rollback + price-book hooks.
// ---------------------------------------------------------------------------

const publishMutate = vi.fn();
const rollbackMutate = vi.fn();
let publishPending = false;
let rollbackPending = false;
let priceBookRows: Array<Record<string, unknown>> = [];

vi.mock('@/data/api/usePublishPrice', async () => {
  const actual = await vi.importActual<
    typeof import('@/data/api/usePublishPrice')
  >('@/data/api/usePublishPrice');
  return {
    ...actual,
    usePublishPrice: vi.fn(() => ({
      mutate: publishMutate,
      isPending: publishPending,
    })),
    useRollback: vi.fn(() => ({
      mutate: rollbackMutate,
      isPending: rollbackPending,
    })),
    usePriceBook: vi.fn(() => ({
      data: { aid: 'AID-1', rows: priceBookRows },
      isLoading: false,
    })),
  };
});

function makeReceipt(overrides: Partial<PublishReceipt> = {}): PublishReceipt {
  return {
    id: '8e1c2a44-0000-0000-0000-000000000000',
    aid: 'AID-1',
    source_proposal_id: 'p-1',
    old_price_book_row_id: 'old-row',
    new_price_book_row_id: 'new-row',
    published_at: new Date().toISOString(),
    rolled_back_at: null,
    notifications_dispatched: [
      {
        channel: 'slack',
        recipient: 'heiko@scherzinger.de',
        status: 'sent',
        dispatched_at: new Date().toISOString(),
      },
      {
        channel: 'email',
        recipient: 'tier-a@customers.com',
        status: 'failed',
        error: 'SMTP timeout',
        dispatched_at: null,
      },
    ],
    published_by: 'frank',
    rollback_reason: null,
    ...overrides,
  };
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  publishMutate.mockReset();
  rollbackMutate.mockReset();
  publishPending = false;
  rollbackPending = false;
  priceBookRows = [
    {
      id: 'old-row',
      aid: 'AID-1',
      price: '118.00',
      currency: 'EUR',
      valid_from: '2026-03-01T00:00:00+00:00',
      valid_to: null,
      source_proposal_id: null,
      lineage_ref_id: null,
      created_at: null,
    },
  ];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PublishConfirmationDrawer — compose state', () => {
  it('renders effective-date, price book rows, notify, warning and buttons', () => {
    wrap(
      <PublishConfirmationDrawer
        open
        onOpenChange={() => {}}
        aid="AID-1"
        proposedPrice="127.00"
        currentPriceLabel="€118.00"
        sourceProposalId="p-1"
      />,
    );

    expect(screen.getByTestId('publish-drawer-effective-input')).toBeInTheDocument();
    expect(screen.getByTestId('publish-drawer-rows')).toBeInTheDocument();
    expect(screen.getByTestId('publish-drawer-notify-sales')).toBeInTheDocument();
    expect(screen.getByTestId('publish-drawer-notify-customers')).toBeInTheDocument();
    expect(screen.getByTestId('publish-drawer-notify-escalate')).toBeInTheDocument();
    expect(screen.getByTestId('publish-drawer-warning')).toHaveTextContent(
      /Rollback available for 72 h/i,
    );
    expect(screen.getByTestId('publish-drawer-confirm')).toBeEnabled();
    expect(screen.getByTestId('publish-drawer-cancel')).toBeEnabled();
  });

  it('disables Confirm when proposedPrice is missing', () => {
    wrap(
      <PublishConfirmationDrawer
        open
        onOpenChange={() => {}}
        aid="AID-1"
        proposedPrice={null}
      />,
    );
    expect(screen.getByTestId('publish-drawer-confirm')).toBeDisabled();
  });

  it('Confirm triggers usePublishPrice mutate with decimal-string price', () => {
    wrap(
      <PublishConfirmationDrawer
        open
        onOpenChange={() => {}}
        aid="AID-1"
        proposedPrice="127.00"
        sourceProposalId="p-1"
      />,
    );

    fireEvent.click(screen.getByTestId('publish-drawer-confirm'));

    expect(publishMutate).toHaveBeenCalledTimes(1);
    const [body, opts] = publishMutate.mock.calls[0];
    expect(body.price).toBe('127.00');
    expect(body.source_proposal_id).toBe('p-1');
    expect(typeof opts.onSuccess).toBe('function');
  });
});

describe('PublishConfirmationDrawer — published state', () => {
  it('shows receipt + per-channel rows including amber failed', async () => {
    publishMutate.mockImplementation((_body, opts) => {
      opts.onSuccess?.({ scheduled: false, receipt: makeReceipt() });
    });

    wrap(
      <PublishConfirmationDrawer
        open
        onOpenChange={() => {}}
        aid="AID-1"
        proposedPrice="127.00"
        sourceProposalId="p-1"
      />,
    );

    fireEvent.click(screen.getByTestId('publish-drawer-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('publish-drawer-published')).toBeInTheDocument(),
    );
    const rows = screen.getAllByTestId('publish-drawer-fanout-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-status', 'sent');
    expect(rows[1]).toHaveAttribute('data-status', 'failed');
    expect(screen.getByText(/Receipt id: pub_8e1c2a44/i)).toBeInTheDocument();
  });

  it('Rollback button is enabled within 72h and fires useRollback', async () => {
    publishMutate.mockImplementation((_body, opts) => {
      opts.onSuccess?.({ scheduled: false, receipt: makeReceipt() });
    });

    wrap(
      <PublishConfirmationDrawer
        open
        onOpenChange={() => {}}
        aid="AID-1"
        proposedPrice="127.00"
        sourceProposalId="p-1"
      />,
    );

    fireEvent.click(screen.getByTestId('publish-drawer-confirm'));
    const rollbackBtn = await screen.findByTestId('publish-drawer-rollback');
    expect(rollbackBtn).toBeEnabled();

    fireEvent.click(rollbackBtn);
    const reasonInput = await screen.findByTestId(
      'publish-drawer-rollback-reason',
    );
    fireEvent.change(reasonInput, { target: { value: 'duplicate publish' } });
    fireEvent.click(
      screen.getByTestId('publish-drawer-rollback-confirm-button'),
    );

    expect(rollbackMutate).toHaveBeenCalledTimes(1);
    const [body] = rollbackMutate.mock.calls[0];
    expect(body.receipt_id).toBe('8e1c2a44-0000-0000-0000-000000000000');
    expect(body.reason).toBe('duplicate publish');
  });

  it('Rollback button is disabled after the 72h window', async () => {
    // 80 hours in the past — outside the window.
    const stalePublishedAt = new Date(
      Date.now() - 80 * 60 * 60 * 1000,
    ).toISOString();
    publishMutate.mockImplementation((_body, opts) => {
      opts.onSuccess?.({
        scheduled: false,
        receipt: makeReceipt({ published_at: stalePublishedAt }),
      });
    });

    wrap(
      <PublishConfirmationDrawer
        open
        onOpenChange={() => {}}
        aid="AID-1"
        proposedPrice="127.00"
        sourceProposalId="p-1"
      />,
    );

    fireEvent.click(screen.getByTestId('publish-drawer-confirm'));
    const rollbackBtn = await screen.findByTestId('publish-drawer-rollback');
    expect(rollbackBtn).toBeDisabled();
  });
});
