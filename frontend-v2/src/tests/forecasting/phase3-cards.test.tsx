/**
 * Phase 3 — smoke tests for the four diagnostic cards.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarginTrajectoryCard } from '@/features/forecasting/components/MarginTrajectoryCard';
import { CostDecompositionCard } from '@/features/forecasting/components/CostDecompositionCard';
import { SeasonalOverlayCard } from '@/features/forecasting/components/SeasonalOverlayCard';
import { CommodityTrajectoriesCard } from '@/features/forecasting/components/CommodityTrajectoriesCard';

function withQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('Phase 3 — diagnostic cards', () => {
  it('MarginTrajectoryCard shows the floor-crossing annotation', () => {
    render(
      withQuery(
        <MarginTrajectoryCard
          data={{
            historical: [{ quarter: 'Q1 26', margin: 59.8 }],
            projected: [
              { quarter: 'Q2 26', margin: 59.1, low: 56, high: 62 },
            ],
            floor: 60,
            crossesFloorAt: 'Q3 26',
            methodologyNote: 'WMA + residual band.',
          }}
        />,
      ),
    );
    expect(screen.getAllByText(/Crosses 60% in Q3 26/i).length).toBeGreaterThan(0);
  });

  it('CostDecompositionCard renders a data-driven insight per layer', () => {
    render(
      withQuery(
        <CostDecompositionCard
          data={{
            quarters: ['Q1 26', 'Q2 26'],
            layers: [
              { name: 'Material', values: [33, 30], trendDirection: 'down', insight: 'Material declining.' },
              { name: 'Full mfg', values: [42, 48], trendDirection: 'up', insight: 'Full cost rising → investigate capacity.' },
            ],
          }}
        />,
      ),
    );
    const insights = screen.getByTestId('cost-insights');
    expect(insights).toBeInTheDocument();
    expect(insights.textContent).toMatch(/Material declining/);
    expect(insights.textContent).toMatch(/investigate capacity/);
  });

  it('SeasonalOverlayCard shows the current-month deviation chip', () => {
    render(
      withQuery(
        <SeasonalOverlayCard
          data={{
            months: ['Apr', 'May'],
            indices: [100, 102],
            currentMonthLabel: 'May',
            currentMonthExpected: 102,
            currentMonthActual: 105,
            deviationPct: 2.9,
            deviationTone: 'green',
            note: 'From seasonal_patterns.',
          }}
        />,
      ),
    );
    expect(screen.getByText(/May actual 105/i)).toBeInTheDocument();
    expect(screen.getByText(/\+2.9% vs expected/i)).toBeInTheDocument();
  });

  it('CommodityTrajectoriesCard renders one slope chip per group', () => {
    render(
      withQuery(
        <CommodityTrajectoriesCard
          data={{
            quarters: ['Q1 26'],
            groups: [
              { id: 'BKAES', name: 'BKAES', series: [64], slopePerYear: -2.2 },
              { id: 'BKAGG', name: 'BKAGG', series: [57], slopePerYear: -2.7 },
            ],
          }}
        />,
      ),
    );
    const slopes = screen.getByTestId('commodity-slopes');
    expect(slopes.querySelectorAll('li').length).toBe(2);
    expect(slopes.textContent).toMatch(/BKAES/);
    expect(slopes.textContent).toMatch(/BKAGG/);
  });
});
