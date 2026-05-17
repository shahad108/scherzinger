// Pricing Studio v3 / Phase 4 — AuditDrawer tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AuditDrawer } from '../AuditDrawer';
import { LineageDrawer } from '../LineageDrawer';
import { LineageDrawerProvider } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import type { AuditFeedRow } from '@/data/api/useAuditFeed';

const makeRow = (over: Partial<AuditFeedRow> = {}): AuditFeedRow => ({
  id: 'evt-1',
  at: '2026-05-15T12:00:00Z',
  actor: 'frank',
  action: 'price_set',
  target_kind: 'sku',
  target_id: '200832-E',
  before: { price: 118.0 },
  after: { price: 121.0 },
  reason: 'Cost moved up',
  lineage_ref: { id: 'lin-1' },
  linked_rec: null,
  link_target: null,
  ...over,
});

interface MockState {
  pages: { rows: AuditFeedRow[]; total: number; lineage_ref: string | null; offset: number }[];
  hasNextPage: boolean;
  fetchNextPage: ReturnType<typeof vi.fn>;
  isFetchingNextPage: boolean;
  isLoading: boolean;
}

let mockState: MockState = {
  pages: [],
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  isFetchingNextPage: false,
  isLoading: false,
};

vi.mock('@/data/api/useAuditFeed', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/useAuditFeed')>(
    '@/data/api/useAuditFeed',
  );
  return {
    ...actual,
    useAuditFeed: vi.fn(() => ({
      data: { pages: mockState.pages },
      isLoading: mockState.isLoading,
      hasNextPage: mockState.hasNextPage,
      isFetchingNextPage: mockState.isFetchingNextPage,
      fetchNextPage: mockState.fetchNextPage,
    })),
  };
});

vi.mock('@/hooks/usePricingStream', () => ({
  usePricingStream: () => ({ lastEvent: null, isConnected: true, retry: () => {} }),
}));

class ROStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ROStub;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IntersectionObserver = (globalThis as any).IntersectionObserver ?? ROStub;

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/studio']}>
      <QueryClientProvider client={qc}>
        <LineageDrawerProvider>
          <Routes>
            <Route path="/studio" element={<>{ui}<LocationProbe /></>} />
            <Route path="/action-center" element={<LocationProbe />} />
          </Routes>
        </LineageDrawerProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('AuditDrawer', () => {
  beforeEach(() => {
    mockState = {
      pages: [
        {
          rows: [
            makeRow({ id: 'evt-1', action: 'price_set' }),
            makeRow({
              id: 'evt-2',
              action: 'proposal_created',
              linked_rec: { ref: 'rec-abc', label: 'draft #rec-abc' },
              link_target: '/action-center?ref=rec-abc',
              before: null,
              after: { article_id: '200832-E', rec_ref: 'rec-abc' },
            }),
          ],
          total: 2,
          lineage_ref: 'lin-summary',
          offset: 0,
        },
      ],
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      isLoading: false,
    };
  });

  it('renders rows from BFF when open', () => {
    wrap(<AuditDrawer open onOpenChange={() => {}} aid="200832-E" />);
    expect(screen.getByTestId('audit-drawer')).toBeInTheDocument();
    expect(screen.getAllByTestId('audit-row')).toHaveLength(2);
    expect(screen.getByText('Price set')).toBeInTheDocument();
    expect(screen.getByText('Proposal created')).toBeInTheDocument();
  });

  it('toggles filter pills with aria-pressed state', () => {
    wrap(<AuditDrawer open onOpenChange={() => {}} aid="200832-E" />);
    const pricePill = screen.getByTestId('audit-pill-price');
    expect(pricePill).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pricePill);
    expect(pricePill).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pricePill);
    expect(pricePill).toHaveAttribute('aria-pressed', 'false');
  });

  it('triggers fetchNextPage when more pages exist (sentinel intersects)', async () => {
    const fetchNextPage = vi.fn();
    mockState = {
      ...mockState,
      hasNextPage: true,
      fetchNextPage,
    };
    // Directly invoke the sentinel callback by spying on the
    // IntersectionObserver constructor.
    const observers: Array<(entries: { isIntersecting: boolean }[]) => void> = [];
    class IOSpy {
      cb: (entries: { isIntersecting: boolean }[]) => void;
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        this.cb = cb;
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IntersectionObserver = IOSpy;

    wrap(<AuditDrawer open onOpenChange={() => {}} aid="200832-E" />);
    // Fire the intersection event manually.
    observers.forEach((cb) => cb([{ isIntersecting: true }]));
    await waitFor(() => {
      expect(fetchNextPage).toHaveBeenCalled();
    });
  });

  it('opens lineage drawer when a row’s "View lineage" button is clicked', () => {
    wrap(
      <>
        <AuditDrawer open onOpenChange={() => {}} aid="200832-E" />
        <LineageDrawer aid="200832-E" />
      </>,
    );
    const lineageButtons = screen.getAllByTestId('audit-row-lineage');
    expect(lineageButtons.length).toBeGreaterThan(0);
    fireEvent.click(lineageButtons[0]);
    expect(screen.getByText(/Why this number\?/i)).toBeInTheDocument();
  });

  it('calls onScrollToProposalPanel when an "Open proposal" pill is clicked', () => {
    const onScroll = vi.fn();
    wrap(
      <AuditDrawer open onOpenChange={() => {}} aid="200832-E" onScrollToProposalPanel={onScroll} />,
    );
    const openPill = screen.getByTestId('audit-row-open-proposal');
    fireEvent.click(openPill);
    expect(onScroll).toHaveBeenCalledWith('rec-abc');
  });
});
