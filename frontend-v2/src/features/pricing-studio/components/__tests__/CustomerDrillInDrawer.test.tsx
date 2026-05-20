// Pricing Studio v3 / Phase 2 — CustomerDrillInDrawer tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CustomerDrillInDrawer } from '../CustomerDrillInDrawer';
import { drillInPayload } from './fixtures-phase2';
import type { CustomerDrillInPayload } from '@/types/studio';

// The default payload returned by the mocked hook — overridable per-test
// via ``setMockPayload`` so individual cases can assert on different
// tones / proposal shapes without coupling to module-level state.
let mockPayload: CustomerDrillInPayload = drillInPayload();
const setMockPayload = (p: CustomerDrillInPayload) => {
  mockPayload = p;
};

// Mock the data hook so the drawer renders with deterministic input
// without round-tripping through the BFF mock JSON loader.
vi.mock('@/data/api/useCustomerDrillIn', () => ({
  useCustomerDrillIn: vi.fn(() => ({
    data: mockPayload,
    isLoading: false,
    isError: false,
  })),
}));

const createProposalMutate = vi.fn();
vi.mock('@/data/api/useProposals', () => ({
  useCreateProposal: () => ({
    mutate: createProposalMutate,
    isPending: false,
  }),
}));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/studio']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/studio" element={<>{ui}<LocationProbe /></>} />
          <Route path="/margin" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const customer = { id: '101580', name: 'Customer 101580' };

describe('CustomerDrillInDrawer', () => {
  beforeEach(() => {
    setMockPayload(drillInPayload());
    createProposalMutate.mockReset();
  });

  it('renders all 5 sections when open with a proposed price', async () => {
    wrap(
      <CustomerDrillInDrawer
        open
        onOpenChange={() => {}}
        customer={customer}
        aid="200832-E"
        proposedPrice="5.10"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('drill-in-this-sku')).toBeInTheDocument();
    });
    expect(screen.getByTestId('drill-in-at-proposed')).toBeInTheDocument();
    expect(screen.getByTestId('drill-in-wallet-top')).toBeInTheDocument();
    expect(screen.getByTestId('drill-in-history')).toBeInTheDocument();
    expect(screen.getByTestId('drill-in-queue-proposal')).toBeInTheDocument();
    expect(screen.getByTestId('drill-in-open-margin')).toBeInTheDocument();
  });

  it('renders DataMissingBadge inside the at-proposed section when proposedPrice is null', () => {
    wrap(
      <CustomerDrillInDrawer
        open
        onOpenChange={() => {}}
        customer={customer}
        aid="200832-E"
        proposedPrice={null}
      />,
    );
    const section = screen.getByTestId('drill-in-at-proposed');
    // The section header still renders, but the body collapses to the
    // DataMissingBadge — reason: "no price selected".
    expect(section).toHaveTextContent(/no price selected/i);
  });

  it('clicking "Open in Margin Cockpit" navigates with the right query params', async () => {
    wrap(
      <CustomerDrillInDrawer
        open
        onOpenChange={() => {}}
        customer={customer}
        aid="200832-E"
        proposedPrice="5.10"
      />,
    );
    fireEvent.click(screen.getByTestId('drill-in-open-margin'));
    await waitFor(() => {
      const loc = screen.getByTestId('location').textContent ?? '';
      expect(loc).toContain('/margin');
      expect(loc).toContain('customer_id=101580');
      expect(loc).toContain('source=studio');
      expect(loc).toContain('aid=200832-E');
    });
  });

  // SF1 (Phase 2.2.5): cent-precision contract.
  it('queues a proposal with proposed_price as a STRING (not a number)', () => {
    wrap(
      <CustomerDrillInDrawer
        open
        onOpenChange={() => {}}
        customer={customer}
        aid="200832-E"
        proposedPrice="5.10"
      />,
    );
    fireEvent.click(screen.getByTestId('drill-in-queue-proposal'));
    expect(createProposalMutate).toHaveBeenCalledTimes(1);
    const [body] = createProposalMutate.mock.calls[0];
    // Must pass the original decimal-as-string — never round-trip
    // through Number() because that drops cent precision.
    expect(body.proposed_price).toBe('5.10');
    expect(typeof body.proposed_price).toBe('string');
  });

  // SF2 (Phase 2.2.5): tone is BFF truth — drawer reads ``at_proposed.tone``
  // and never re-thresholds ``risk_if_moved``.
  it('maps the BFF-computed tone field to the at-proposed card', () => {
    setMockPayload(
      drillInPayload({
        // Synthesize a "low risk but explicitly alert" payload: if the
        // drawer were re-deriving thresholds it would NOT pick alert.
        // The BFF must be authoritative.
        at_proposed: {
          delta_vs_last_paid: '0.30',
          delta_pct: '6.25',
          risk_if_moved: '0.05',
          tone: 'alert',
        },
      }),
    );
    wrap(
      <CustomerDrillInDrawer
        open
        onOpenChange={() => {}}
        customer={customer}
        aid="200832-E"
        proposedPrice="5.10"
      />,
    );
    const card = screen.getByTestId('drill-in-at-proposed-card');
    expect(card).toHaveAttribute('data-tone', 'alert');
  });

  it('falls back to plain when the BFF tone field is absent', () => {
    setMockPayload(
      drillInPayload({
        // Pre-SF2 BFF builds may omit the field entirely. Confirm the
        // drawer doesn't crash and renders neutral styling.
        at_proposed: {
          delta_vs_last_paid: '0.10',
          delta_pct: '2.0',
          risk_if_moved: '0.80',
        } as never,
      }),
    );
    wrap(
      <CustomerDrillInDrawer
        open
        onOpenChange={() => {}}
        customer={customer}
        aid="200832-E"
        proposedPrice="5.10"
      />,
    );
    const card = screen.getByTestId('drill-in-at-proposed-card');
    expect(card).toHaveAttribute('data-tone', 'plain');
  });

  it('ESC closes the drawer (onOpenChange called with false)', () => {
    const onOpenChange = vi.fn();
    wrap(
      <CustomerDrillInDrawer
        open
        onOpenChange={onOpenChange}
        customer={customer}
        aid="200832-E"
        proposedPrice="5.10"
      />,
    );
    // Radix Dialog wires Escape on the dialog content. Fire it on body.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    // Radix dispatches the close callback asynchronously; one tick is enough.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
