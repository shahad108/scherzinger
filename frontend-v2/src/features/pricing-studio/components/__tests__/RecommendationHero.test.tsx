import { fireEvent, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RecommendationHero } from '../RecommendationHero';
import { renderWithLineage } from './test-utils';
import { recommendation, wtp, winProbCurve, competitorRef } from './fixtures';

describe('RecommendationHero', () => {
  it('renders the recommended price, Δ, confidence chip, and rationale', () => {
    renderWithLineage(
      <RecommendationHero
        aid="200832-E"
        recommendation={recommendation()}
        wtp={wtp()}
        winProbCurve={winProbCurve()}
        competitorRef={competitorRef()}
        currentPriceLabel="€118.00"
        currentPriceValue={118}
      />,
    );
    expect(screen.getByTestId('rec-price')).toHaveTextContent('127');
    expect(screen.getByTestId('rec-delta')).toHaveTextContent(/\+7/);
    expect(screen.getByTestId('confidence-chip')).toHaveTextContent(/Medium/);
    expect(screen.getByText(/Rationale/i)).toBeInTheDocument();
    // Bold from the rationale markdown.
    expect(screen.getByText('+2.4%')).toBeInTheDocument();
  });

  it('renders DataMissingBadge when recommendation is absent', () => {
    renderWithLineage(
      <RecommendationHero
        aid="200832-E"
        recommendation={undefined}
        currentPriceLabel="€118.00"
      />,
    );
    expect(screen.getAllByTestId('data-missing-badge').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('rec-price')).not.toBeInTheDocument();
  });

  it('clicking the price triggers the lineage drawer context (no crash)', () => {
    // The drawer itself is rendered at page root; here we just verify the
    // click handler doesn't blow up and the price button is the expected
    // accessible element.
    renderWithLineage(
      <RecommendationHero
        aid="200832-E"
        recommendation={recommendation()}
        currentPriceLabel="€118.00"
        currentPriceValue={118}
      />,
    );
    const priceBtn = screen.getByTestId('rec-price');
    fireEvent.click(priceBtn);
    // "Why this price?" CTA is the second open trigger.
    fireEvent.click(screen.getByTestId('why-this-price'));
    expect(priceBtn).toBeEnabled();
  });

  it('renders the competitor "above ours" tone when rec > competitor', () => {
    renderWithLineage(
      <RecommendationHero
        aid="200832-E"
        recommendation={recommendation({ recommended_price: '130.00' })}
        competitorRef={competitorRef({ median_price: '120.00' })}
        currentPriceLabel="€118.00"
        currentPriceValue={118}
      />,
    );
    expect(screen.getByText(/above ours/i)).toBeInTheDocument();
  });

  it('surfaces the "Updated Ns ago" pill when lastTickAt is provided', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    renderWithLineage(
      <RecommendationHero
        aid="200832-E"
        recommendation={recommendation()}
        currentPriceLabel="€118.00"
        currentPriceValue={118}
        lastTickAt={nowSec - 3}
      />,
    );
    expect(screen.getByText(/Updated \d+s ago/)).toBeInTheDocument();
  });
});
