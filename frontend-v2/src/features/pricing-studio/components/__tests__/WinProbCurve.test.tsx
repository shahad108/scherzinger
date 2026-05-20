import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WinProbCurve } from '../WinProbCurve';
import { renderWithLineage } from './test-utils';
import { winProbCurve, winProbCurveFlat } from './fixtures';

describe('WinProbCurve', () => {
  it('renders DataMissingBadge when the curve is missing or empty', () => {
    renderWithLineage(<WinProbCurve curve={null} />);
    expect(screen.getByTestId('data-missing-badge')).toHaveTextContent(/No win-prob model/i);
  });

  it('renders the chart container when the curve has points', () => {
    renderWithLineage(
      <WinProbCurve curve={winProbCurve()} recommendedPrice="125.00" />,
    );
    expect(screen.getByTestId('win-prob-curve')).toBeInTheDocument();
    // Header text confirms render
    expect(screen.getByText(/Win probability vs price/i)).toBeInTheDocument();
    expect(screen.getByText(/n=22/)).toBeInTheDocument();
  });

  it('exposes confidence band tag when provided', () => {
    renderWithLineage(
      <WinProbCurve curve={winProbCurve({ confidence_band: 'asymptotic' })} />,
    );
    expect(screen.getByText(/asymptotic/i)).toBeInTheDocument();
  });

  it('still renders the chart when the curve is a flat fallback (no CI distinction)', () => {
    renderWithLineage(<WinProbCurve curve={winProbCurveFlat()} />);
    // No crash even though every point's CI collapses to the win prob.
    expect(screen.getByTestId('win-prob-curve')).toBeInTheDocument();
  });
});
