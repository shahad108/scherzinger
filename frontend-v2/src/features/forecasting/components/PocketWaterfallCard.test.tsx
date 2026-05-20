import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PocketWaterfallCard } from './PocketWaterfallCard';
import type { PocketWaterfall } from '@/types/forecast';

const base: PocketWaterfall = {
  steps: [
    { name: 'list', value: 100, leakagePct: null },
    { name: 'quoted', value: 88, leakagePct: 12 },
    { name: 'booked', value: 80, leakagePct: 9.09 },
    { name: 'invoiced', value: 76, leakagePct: 5 },
    { name: 'db2', value: 18, leakagePct: 76.32 },
  ],
  perCluster: [
    { cluster: 'BKAES', histogram: [{ bin: '70', count: 1 }, { bin: '80', count: 4 }, { bin: '90', count: 2 }], median: 80, p10: 72, p90: 92 },
    { cluster: 'BKAGG', histogram: [{ bin: '60', count: 2 }, { bin: '70', count: 3 }], median: 68, p10: 60, p90: 75 },
  ],
  unit: 'pct_of_list',
};

describe('PocketWaterfallCard', () => {
  it('renders null when no data', () => {
    const { container } = render(<PocketWaterfallCard data={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when steps are empty', () => {
    const { container } = render(<PocketWaterfallCard data={{ ...base, steps: [] }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one bar per step in order', () => {
    render(<PocketWaterfallCard data={base} />);
    expect(screen.getByTestId('pocket-step-list')).toBeInTheDocument();
    expect(screen.getByTestId('pocket-step-quoted')).toBeInTheDocument();
    expect(screen.getByTestId('pocket-step-booked')).toBeInTheDocument();
    expect(screen.getByTestId('pocket-step-invoiced')).toBeInTheDocument();
    expect(screen.getByTestId('pocket-step-db2')).toBeInTheDocument();
  });

  it('renders the leakage % column for each step after the first', () => {
    render(<PocketWaterfallCard data={base} />);
    expect(screen.getByTestId('pocket-step-quoted').textContent).toMatch(/12\.0%/);
    expect(screen.getByTestId('pocket-step-db2').textContent).toMatch(/76\.3%/);
    expect(screen.getByTestId('pocket-step-list').textContent).toMatch(/—/);
  });

  it('renders one per-cluster band card per cluster, p10 ≤ median ≤ p90', () => {
    render(<PocketWaterfallCard data={base} />);
    const grid = screen.getByTestId('pocket-cluster-bands');
    expect(grid.children.length).toBe(2);
    base.perCluster.forEach((b) => {
      expect(b.p10).toBeLessThanOrEqual(b.median);
      expect(b.median).toBeLessThanOrEqual(b.p90);
    });
  });

  it('omits per-cluster grid when none provided', () => {
    render(<PocketWaterfallCard data={{ ...base, perCluster: [] }} />);
    expect(screen.queryByTestId('pocket-cluster-bands')).toBeNull();
  });
});
