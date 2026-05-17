// Pricing Studio v3 / Phase 4 — WhatChangedStrip tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WhatChangedStrip } from '../WhatChangedStrip';
import type { SkuDiffSummary } from '@/data/api/useSkuDiff';

interface MockState {
  data: SkuDiffSummary | null;
  isLoading: boolean;
}

let mockState: MockState = { data: null, isLoading: false };
const dismissMutate = vi.fn();

vi.mock('@/data/api/useSkuDiff', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/useSkuDiff')>(
    '@/data/api/useSkuDiff',
  );
  return {
    ...actual,
    useSkuDiff: vi.fn(() => ({
      data: mockState.data,
      isLoading: mockState.isLoading,
    })),
    useDismissSkuDiff: vi.fn(() => ({ mutate: dismissMutate, isPending: false })),
  };
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search + loc.hash}</div>;
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/studio']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/studio" element={<>{ui}<LocationProbe /></>} />
          <Route path="/forecasting" element={<LocationProbe />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const summary = (over: Partial<SkuDiffSummary> = {}): SkuDiffSummary => ({
  since: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  now: new Date().toISOString(),
  changes: [
    {
      kind: 'cost',
      before: '77.45',
      after: '78.40',
      pct: '1.2',
      label: null,
      customer_id: null,
      lineage_ref: 'lin-1',
      link_target: '/forecasting?cluster=BKAGG#commodities',
    },
    {
      kind: 'competitor_signal',
      before: '123',
      after: '121',
      pct: '-1.6',
      label: null,
      customer_id: null,
      lineage_ref: 'lin-2',
      link_target: null,
    },
  ],
  summary_lineage_ref: 'lin-summary',
  ...over,
});

describe('WhatChangedStrip', () => {
  beforeEach(() => {
    dismissMutate.mockReset();
    mockState = { data: null, isLoading: false };
  });

  it('renders nothing when changes is empty', () => {
    mockState = {
      data: { ...summary(), changes: [] },
      isLoading: false,
    };
    wrap(<WhatChangedStrip aid="200832-E" onOpenAudit={() => {}} />);
    expect(screen.queryByTestId('what-changed-strip')).not.toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    mockState = { data: null, isLoading: true };
    wrap(<WhatChangedStrip aid="200832-E" onOpenAudit={() => {}} />);
    expect(screen.queryByTestId('what-changed-strip')).not.toBeInTheDocument();
  });

  it('renders the strip and a row per change', () => {
    mockState = { data: summary(), isLoading: false };
    wrap(<WhatChangedStrip aid="200832-E" onOpenAudit={() => {}} />);
    expect(screen.getByTestId('what-changed-strip')).toBeInTheDocument();
    expect(screen.getByTestId('what-changed-row-cost')).toBeInTheDocument();
    expect(screen.getByTestId('what-changed-row-competitor_signal')).toBeInTheDocument();
  });

  it('clicking a row with link_target navigates to it', () => {
    mockState = { data: summary(), isLoading: false };
    wrap(<WhatChangedStrip aid="200832-E" onOpenAudit={() => {}} />);
    fireEvent.click(screen.getByTestId('what-changed-row-cost'));
    const loc = screen.getByTestId('location').textContent ?? '';
    expect(loc).toContain('/forecasting');
    expect(loc).toContain('cluster=BKAGG');
  });

  it('clicking a row without link_target opens the audit drawer', () => {
    mockState = { data: summary(), isLoading: false };
    const onOpenAudit = vi.fn();
    wrap(<WhatChangedStrip aid="200832-E" onOpenAudit={onOpenAudit} />);
    fireEvent.click(screen.getByTestId('what-changed-row-competitor_signal'));
    expect(onOpenAudit).toHaveBeenCalled();
  });

  it('Open audit button opens the audit drawer', () => {
    mockState = { data: summary(), isLoading: false };
    const onOpenAudit = vi.fn();
    wrap(<WhatChangedStrip aid="200832-E" onOpenAudit={onOpenAudit} />);
    fireEvent.click(screen.getByTestId('what-changed-open-audit'));
    expect(onOpenAudit).toHaveBeenCalled();
  });

  it('Dismiss button calls the dismiss mutation', () => {
    mockState = { data: summary(), isLoading: false };
    wrap(<WhatChangedStrip aid="200832-E" onOpenAudit={() => {}} />);
    fireEvent.click(screen.getByTestId('what-changed-dismiss'));
    expect(dismissMutate).toHaveBeenCalled();
  });
});
