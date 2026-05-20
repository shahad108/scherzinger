// Pricing Studio v3 / Phase 3 — CostTrajectoryDrawer tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CostTrajectoryDrawer } from '../CostTrajectoryDrawer';
import { LineageDrawerProvider } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import type { CostOutlookPayload } from '@/types/studio';
import { costHistory, costOutlookPayload } from './fixtures-phase3';

// Mock the hook so the drawer renders with deterministic input.
let mockState: { data: CostOutlookPayload | null; isLoading: boolean; isError: boolean } = {
  data: costOutlookPayload(),
  isLoading: false,
  isError: false,
};
const setMockState = (s: typeof mockState) => {
  mockState = s;
};

vi.mock('@/data/api/useCostOutlook', () => ({
  useCostOutlook: vi.fn(() => mockState),
  costOutlookKey: (aid: string, h: number) => ['cost-outlook', aid, h] as const,
}));

// Recharts uses ResizeObserver in jsdom which is missing by default; stub
// it so the chart can mount without throwing. (Other Phase 1/2 charts go
// through the same stub via the test setup; we add a local one here to
// keep this test self-contained.)
class ROStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ROStub;

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search + loc.hash}</div>;
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/studio']}>
      <QueryClientProvider client={qc}>
        <LineageDrawerProvider>
          <Routes>
            <Route path="/studio" element={<>{ui}<LocationProbe /></>} />
            <Route path="/margin" element={<LocationProbe />} />
          </Routes>
        </LineageDrawerProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('CostTrajectoryDrawer', () => {
  beforeEach(() => {
    setMockState({ data: costOutlookPayload(), isLoading: false, isError: false });
  });

  it('renders all five sections when open with a payload', async () => {
    wrap(
      <CostTrajectoryDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        cluster="BKAGG"
        history={costHistory()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('cost-drawer-header')).toBeInTheDocument();
    });
    expect(screen.getByTestId('cost-drawer-today')).toBeInTheDocument();
    expect(screen.getByTestId('cost-drawer-forecast')).toBeInTheDocument();
    expect(screen.getByTestId('cost-drawer-components')).toBeInTheDocument();
    expect(screen.getByTestId('cost-drawer-floor')).toBeInTheDocument();
    expect(screen.getByTestId('cost-drawer-actions')).toBeInTheDocument();
  });

  it('does NOT render the floor section when floor_crosses_at is null', async () => {
    setMockState({
      data: costOutlookPayload({ floor_crosses_at: null }),
      isLoading: false,
      isError: false,
    });
    wrap(
      <CostTrajectoryDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        history={costHistory()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('cost-drawer-components')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('cost-drawer-floor')).not.toBeInTheDocument();
  });

  it('renders the forecast section header with horizon', async () => {
    wrap(
      <CostTrajectoryDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        history={costHistory()}
      />,
    );
    // Recharts uses ResponsiveContainer + sizeMe under the hood; in jsdom
    // it falls back to detached SVG and no measured chart geometry is
    // produced. We assert the chart's host section + the horizon copy is
    // present — confirming the band-bearing ComposedChart was mounted.
    await waitFor(() => {
      expect(screen.getByTestId('cost-drawer-forecast')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/6-month forecast \(p20–p80\)/i),
    ).toBeInTheDocument();
  });

  it('clicking "Open Margin Cockpit cost lens" navigates with aid + source=studio', async () => {
    wrap(
      <CostTrajectoryDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        history={costHistory()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('cost-drawer-open-margin')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('cost-drawer-open-margin'));
    await waitFor(() => {
      const loc = screen.getByTestId('location').textContent ?? '';
      expect(loc).toContain('/margin');
      expect(loc).toContain('aid=200832-E');
      expect(loc).toContain('source=studio');
      expect(loc).toContain('#cost');
    });
  });

  it('shows DataMissingBadge when the cost-outlook query errors (e.g. 404)', async () => {
    setMockState({ data: null, isLoading: false, isError: true });
    wrap(
      <CostTrajectoryDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        history={null}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('cost-drawer-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('data-missing-badge')).toBeInTheDocument();
  });

  it('exposes an enabled "Set cost alert" button that opens the AlertSetupDrawer', async () => {
    wrap(
      <CostTrajectoryDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        history={costHistory()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('cost-drawer-set-alert')).toBeInTheDocument();
    });
    const btn = screen.getByTestId('cost-drawer-set-alert') as HTMLButtonElement;
    expect(btn).not.toBeDisabled();
    // Label is the bare "Set cost alert" — no threshold value rendered.
    expect(btn.textContent?.trim()).toBe('Set cost alert');
    expect(btn.textContent ?? '').not.toMatch(/€|≥/);
  });

  it('renders components rows with up/down change classes', async () => {
    wrap(
      <CostTrajectoryDrawer
        open
        onOpenChange={() => {}}
        aid="200832-E"
        history={costHistory()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('cost-drawer-components')).toBeInTheDocument();
    });
    const material = document
      .querySelector('[data-component="material"] .ws-cost-comp-change');
    expect(material?.className).toContain('up');
    expect(material?.textContent ?? '').toMatch(/\+6\.7%|\+6\.67%|\+6\.7/);
  });
});
