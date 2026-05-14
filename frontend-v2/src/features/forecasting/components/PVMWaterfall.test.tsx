import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PVMWaterfall, totalDelta, maxAbsDelta } from './PVMWaterfall';
import type { PVMBar } from '@/types/forecast';

const bars: PVMBar[] = [
  { factor: 'price', delta: 420_000, pctOfTotal: 52 },
  { factor: 'volume', delta: -180_000, pctOfTotal: 22 },
  { factor: 'mix', delta: 90_000, pctOfTotal: 11 },
  { factor: 'churn', delta: -60_000, pctOfTotal: 7 },
  { factor: 'fx', delta: 30_000, pctOfTotal: 4 },
  { factor: 'other', delta: 20_000, pctOfTotal: 4 },
];

describe('PVMWaterfall arithmetic', () => {
  it('sums deltas correctly (net)', () => {
    // 420 - 180 + 90 - 60 + 30 + 20 = 320 (in k€)
    expect(totalDelta(bars)).toBe(320_000);
  });

  it('finds max absolute delta', () => {
    expect(maxAbsDelta(bars)).toBe(420_000);
  });

  it('handles all-negative bars', () => {
    const neg: PVMBar[] = [
      { factor: 'price', delta: -100, pctOfTotal: 50 },
      { factor: 'volume', delta: -50, pctOfTotal: 50 },
    ];
    expect(totalDelta(neg)).toBe(-150);
    expect(maxAbsDelta(neg)).toBe(100);
  });

  it('handles empty bars without throwing', () => {
    expect(totalDelta([])).toBe(0);
    expect(maxAbsDelta([])).toBe(0);
  });
});

describe('PVMWaterfall render', () => {
  it('renders all factor rows + total', () => {
    render(<PVMWaterfall periodLabel="Next 12mo vs LTM" bars={bars} mode="revenue" />);
    expect(screen.getByTestId('pvm-waterfall')).toBeInTheDocument();
    expect(screen.getByTestId('pvm-row-price')).toBeInTheDocument();
    expect(screen.getByTestId('pvm-row-volume')).toBeInTheDocument();
    expect(screen.getByTestId('pvm-row-mix')).toBeInTheDocument();
    expect(screen.getByTestId('pvm-row-churn')).toBeInTheDocument();
    expect(screen.getByTestId('pvm-row-fx')).toBeInTheDocument();
    expect(screen.getByTestId('pvm-row-other')).toBeInTheDocument();
    expect(screen.getByTestId('pvm-total')).toHaveTextContent(/Net/);
  });

  it('renders the period label', () => {
    render(<PVMWaterfall periodLabel="Q3 vs Q2" bars={bars} />);
    expect(screen.getByText('Q3 vs Q2')).toBeInTheDocument();
  });
});
