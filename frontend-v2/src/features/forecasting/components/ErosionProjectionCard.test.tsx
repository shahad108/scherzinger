import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErosionProjectionCard } from './ErosionProjectionCard';
import type { ErosionProjection, ErosionProjectionPoint } from '@/types/forecast';

function makeProjection(start = 12, slopeList = -0.5, slopeFloor = 0.1): ErosionProjectionPoint[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    listPrice: start + slopeList * (i + 1),
    floor: 8 + slopeFloor * (i + 1),
  }));
}

describe('ErosionProjectionCard', () => {
  it('renders null when data is undefined', () => {
    const { container } = render(<ErosionProjectionCard data={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when rows are empty', () => {
    const { container } = render(
      <ErosionProjectionCard data={{ horizonMonths: 12, rows: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one row per cluster with the projection chart and crossover marker', () => {
    const data: ErosionProjection = {
      horizonMonths: 12,
      rows: [
        {
          cluster: 'BKAES',
          currentListPrice: 12,
          currentFloor: 8,
          monthlyListSlope: -0.5,
          monthlyCostSlope: 0.1,
          projection: makeProjection(),
          crossoverMonth: '2026-08',
          cadence: { updatesEveryMonths: 6, benchmarkMonths: 1 },
        },
        {
          cluster: 'MBDIV',
          currentListPrice: 9,
          currentFloor: 6,
          monthlyListSlope: 0,
          monthlyCostSlope: 0,
          projection: makeProjection(9, 0, 0),
          crossoverMonth: null,
          cadence: { updatesEveryMonths: 3, benchmarkMonths: 1 },
        },
      ],
    };
    render(<ErosionProjectionCard data={data} />);
    const rows = screen.getAllByTestId('erosion-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-cluster')).toBe('BKAES');
    expect(screen.getAllByTestId('erosion-chart')).toHaveLength(2);
    // BKAES has a crossover, MBDIV does not.
    expect(screen.getByTestId('erosion-crossover-chip').textContent).toContain('2026-08');
    expect(screen.getByTestId('erosion-safe-chip').textContent?.toLowerCase()).toContain(
      'above floor',
    );
  });

  it('shows "above floor for full horizon" chip when crossoverMonth is null', () => {
    const data: ErosionProjection = {
      horizonMonths: 12,
      rows: [
        {
          cluster: 'SAFE',
          currentListPrice: 10,
          currentFloor: 5,
          monthlyListSlope: 0.1,
          monthlyCostSlope: 0.05,
          projection: makeProjection(10, 0.1, 0.05),
          crossoverMonth: null,
          cadence: { updatesEveryMonths: 1, benchmarkMonths: 1 },
        },
      ],
    };
    render(<ErosionProjectionCard data={data} />);
    expect(screen.getByTestId('erosion-safe-chip')).toBeTruthy();
    expect(screen.queryByTestId('erosion-crossover-chip')).toBeNull();
  });

  it('shows cadence-unknown text when updatesEveryMonths is null', () => {
    const data: ErosionProjection = {
      horizonMonths: 12,
      rows: [
        {
          cluster: 'UNK',
          currentListPrice: 10,
          currentFloor: 5,
          monthlyListSlope: 0,
          monthlyCostSlope: 0,
          projection: makeProjection(10, 0, 0),
          crossoverMonth: null,
          cadence: { updatesEveryMonths: null, benchmarkMonths: 1 },
        },
      ],
    };
    render(<ErosionProjectionCard data={data} />);
    const chip = screen.getByTestId('erosion-cadence-chip');
    expect(chip.textContent?.toLowerCase()).toContain('cadence unknown');
  });

  it('shows the unfiltered filter-scope badge when tier or family is active', () => {
    const data: ErosionProjection = {
      horizonMonths: 12,
      rows: [
        {
          cluster: 'BKAES',
          currentListPrice: 12,
          currentFloor: 8,
          monthlyListSlope: -0.5,
          monthlyCostSlope: 0.1,
          projection: makeProjection(),
          crossoverMonth: '2026-08',
          cadence: { updatesEveryMonths: 6, benchmarkMonths: 1 },
        },
      ],
    };
    render(<ErosionProjectionCard data={data} filterScope={{ tier: 'A' }} />);
    const badge = screen.getByTestId('filter-scope-badge');
    expect(badge.getAttribute('data-variant')).toBe('unfiltered');
  });

  it('shows the scoped (muted) badge when only cluster is active', () => {
    const data: ErosionProjection = {
      horizonMonths: 12,
      rows: [
        {
          cluster: 'BKAES',
          currentListPrice: 12,
          currentFloor: 8,
          monthlyListSlope: -0.5,
          monthlyCostSlope: 0.1,
          projection: makeProjection(),
          crossoverMonth: '2026-08',
          cadence: { updatesEveryMonths: 6, benchmarkMonths: 1 },
        },
      ],
    };
    render(<ErosionProjectionCard data={data} filterScope={{ cluster: 'BKAES' }} />);
    const badge = screen.getByTestId('filter-scope-badge');
    expect(badge.getAttribute('data-variant')).toBe('scoped');
  });
});
