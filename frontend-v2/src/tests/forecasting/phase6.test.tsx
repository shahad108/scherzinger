/**
 * Phase 6 — Quote-to-Revenue bridge + cluster picker + CI calibration card.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuoteToRevenueBridge } from '@/features/forecasting/components/QuoteToRevenueBridge';
import { CalibrationCard } from '@/features/forecasting/components/CalibrationCard';
import { NewProductForecast } from '@/features/forecasting/components/NewProductForecast';

function withQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('QuoteToRevenueBridge (Phase 6)', () => {
  const data = {
    source: 'seed' as const,
    horizons: [
      { horizonDays: 30, openQuotes: 38, openPipelineEur: 699200, winRate: 0.624, avgMargin: 0.187, expectedRevenue: 436301, expectedGrossProfit: 81588, breakdown: { byTier: [] } },
      { horizonDays: 60, openQuotes: 71, openPipelineEur: 1221200, winRate: 0.604, avgMargin: 0.183, expectedRevenue: 737605, expectedGrossProfit: 134982, breakdown: { byTier: [] } },
      { horizonDays: 90, openQuotes: 104, openPipelineEur: 1747200, winRate: 0.591, avgMargin: 0.179, expectedRevenue: 1032595, expectedGrossProfit: 184834, breakdown: { byTier: [] } },
    ],
  };

  it('renders three numbers for the 30d horizon by default', () => {
    render(withQuery(<QuoteToRevenueBridge data={data} />));
    expect(screen.getByText('38')).toBeInTheDocument(); // open quotes
    expect(screen.getByText('62.4%')).toBeInTheDocument(); // win rate
    expect(screen.getByText('€82K')).toBeInTheDocument(); // expected GP
  });

  it('switching to 90d recomputes the numbers', () => {
    render(withQuery(<QuoteToRevenueBridge data={data} />));
    fireEvent.click(screen.getByTestId('q2r-horizon-90'));
    expect(screen.getByText('104')).toBeInTheDocument();
    expect(screen.getByText('59.1%')).toBeInTheDocument();
    expect(screen.getByText('€185K')).toBeInTheDocument();
  });
});

describe('CalibrationCard (Phase 6)', () => {
  it('lists 4 clusters and the BKAES row is within ±5pp of nominal', () => {
    render(
      withQuery(
        <CalibrationCard
          data={{
            nominalBand: 80,
            source: 'seed',
            rows: [
              { clusterId: 'BKAES', actualHitRatePct: 81, nBacktests: 18, tone: 'green' },
              { clusterId: 'BKAGG', actualHitRatePct: 76, nBacktests: 18, tone: 'amber' },
              { clusterId: 'BKAIZ', actualHitRatePct: 72, nBacktests: 18, tone: 'amber' },
              { clusterId: 'SOPU', actualHitRatePct: 58, nBacktests: 12, tone: 'red' },
            ],
          }}
        />,
      ),
    );
    expect(screen.getByTestId('calibration-row-BKAES')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-row-BKAGG')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-row-BKAIZ')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-row-SOPU')).toBeInTheDocument();
    // BKAES at 81% vs 80% nominal → within ±5pp.
    expect(Math.abs(81 - 80)).toBeLessThanOrEqual(5);
  });
});

describe('NewProductForecast cluster picker (Phase 6)', () => {
  it('each card renders a cluster picker with top-3 candidates', () => {
    render(
      withQuery(
        <NewProductForecast
          data={{
            stats: [],
            series: [],
            cards: [
              { rank: 1, title: 'A', description: 'desc', cluster: 'BKAES', tone: 'status', confidence: '76%', primaryLabel: 'Assign', primaryAction: 'assign', secondaryLabel: 'View' },
              { rank: 2, title: 'B', description: 'desc', cluster: 'BKAGG', tone: 'amber', confidence: '68%', primaryLabel: 'Assign', primaryAction: 'assign', secondaryLabel: 'View' },
              { rank: 3, title: 'C', description: 'desc', cluster: 'SOPU', tone: 'red', confidence: '38%', primaryLabel: 'Manual', primaryAction: 'manual', secondaryLabel: 'View' },
            ],
          }}
        />,
      ),
    );
    expect(screen.getByTestId('cluster-picker-1')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-picker-2')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-picker-3')).toBeInTheDocument();
    const select = screen.getByTestId('cluster-picker-select-1') as HTMLSelectElement;
    expect(select.options.length).toBe(3);
  });
});
