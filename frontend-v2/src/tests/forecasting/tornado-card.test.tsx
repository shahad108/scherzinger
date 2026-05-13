/**
 * Phase 1 — TornadoCard renders bars sorted by |delta| desc and opens the
 * DistributionDrawer with the per-cluster breakdown when a bar is clicked.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TornadoCard } from '@/features/forecasting/components/TornadoCard';
import type { ForecastTornado } from '@/types/forecast';

function withQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const tornado: ForecastTornado = {
  computedAt: '2026-05-13T06:14:00Z',
  metric: 'margin',
  horizonMonths: 12,
  entityType: 'commodity_group',
  n_simulations: 1000,
  shockMode: 'bootstrap',
  source: 'seed',
  bars: [
    {
      inputName: 'Steel S355',
      unit: '€/t',
      perturbationSize: 1.0,
      deltaPositive: -4.2,
      deltaNegative: 5.1,
      deltaUnit: 'pp margin',
      p5: 44.6,
      p95: 85.5,
      clusterBreakdown: [
        { cluster: 'BKAES', delta: -4.6 },
        { cluster: 'BKAGG', delta: -3.8 },
      ],
    },
    {
      inputName: 'Copper',
      unit: '€/t',
      perturbationSize: 1.0,
      deltaPositive: -0.6,
      deltaNegative: 0.7,
      deltaUnit: 'pp margin',
      clusterBreakdown: [{ cluster: 'BKAES', delta: -0.7 }],
    },
    {
      inputName: 'List-price uplift',
      unit: '%',
      perturbationSize: 1.0,
      deltaPositive: 3.6,
      deltaNegative: -4.0,
      deltaUnit: 'pp margin',
      clusterBreakdown: [{ cluster: 'BKAES', delta: 4.2 }],
    },
  ],
};

describe('TornadoCard (Phase 1)', () => {
  it('renders bars sorted by |delta| desc', () => {
    render(withQuery(<TornadoCard tornado={tornado} />));
    const card = screen.getByTestId('tornado-card');
    const bars = within(card).getAllByRole('button');
    // First bar should be Steel (|5.1| = 5.1 is the largest absolute delta).
    expect(bars[0]).toHaveAttribute('data-testid', 'tornado-bar-Steel S355');
    // Second should be List-price uplift (|4.0|).
    expect(bars[1]).toHaveAttribute('data-testid', 'tornado-bar-List-price uplift');
    // Last should be Copper (|0.7|).
    expect(bars[bars.length - 1]).toHaveAttribute('data-testid', 'tornado-bar-Copper');
  });

  it('clicking a bar opens the drawer with per-cluster breakdown', () => {
    render(withQuery(<TornadoCard tornado={tornado} />));
    fireEvent.click(screen.getByTestId('tornado-bar-Steel S355'));
    const drawer = screen.getByTestId('distribution-drawer');
    expect(within(drawer).getByText(/Per-cluster breakdown/i)).toBeInTheDocument();
    expect(within(drawer).getByText('BKAES')).toBeInTheDocument();
    expect(within(drawer).getByText('BKAGG')).toBeInTheDocument();
  });

  it('renders the entity-type chip in the header', () => {
    render(withQuery(<TornadoCard tornado={tornado} />));
    expect(screen.getByText(/margin · 12mo · commodity group/i)).toBeInTheDocument();
  });
});
