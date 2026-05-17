import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RecommendationKpiTiles } from '../RecommendationKpiTiles';
import { renderWithLineage } from './test-utils';
import { recommendation, winProbCurve } from './fixtures';

describe('RecommendationKpiTiles', () => {
  it('renders six tile labels with full data', () => {
    renderWithLineage(
      <RecommendationKpiTiles
        aid="200832-E"
        recommendation={recommendation()}
        winProbCurve={winProbCurve()}
        currentPriceLabel="€118.00"
        currentPriceValue={118}
      />,
    );
    const tiles = screen.getByTestId('rec-kpi-tiles');
    expect(tiles).toBeInTheDocument();
    expect(screen.getByText('Current price')).toBeInTheDocument();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(screen.getByText(/Δ to current/)).toBeInTheDocument();
    expect(screen.getByText('Projected DB2')).toBeInTheDocument();
    expect(screen.getByText('Win prob')).toBeInTheDocument();
    expect(screen.getByText('Confidence')).toBeInTheDocument();
  });

  it('renders DataMissingBadge for each absent source field', () => {
    renderWithLineage(
      <RecommendationKpiTiles
        aid="200832-E"
        recommendation={undefined}
        winProbCurve={undefined}
        currentPriceLabel="€118.00"
        currentPriceValue={undefined}
      />,
    );
    // Projected DB2 is always missing in Phase 1; recommendation/win-prob
    // tiles also degrade. That's 5 of the 6 tiles. Current-price tile is
    // the only one rendering a literal value.
    expect(screen.getAllByTestId('data-missing-badge').length).toBeGreaterThanOrEqual(4);
  });
});
