// Pricing Studio v3 / Phase 2 — CustomerDrillInDrawer tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CustomerDrillInDrawer } from '../CustomerDrillInDrawer';
import { drillInPayload } from './fixtures-phase2';

// Mock the data hook so the drawer renders with deterministic input
// without round-tripping through the BFF mock JSON loader.
vi.mock('@/data/api/useCustomerDrillIn', () => ({
  useCustomerDrillIn: vi.fn(() => ({
    data: drillInPayload(),
    isLoading: false,
    isError: false,
  })),
}));

vi.mock('@/data/api/useProposals', () => ({
  useCreateProposal: () => ({
    mutate: vi.fn(),
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
