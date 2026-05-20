import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DriverWaterfall } from '../DriverWaterfall';
import { renderWithLineage } from './test-utils';
import { recommendation } from './fixtures';

describe('DriverWaterfall', () => {
  it('renders DataMissingBadge when drivers array is empty', () => {
    renderWithLineage(<DriverWaterfall drivers={[]} />);
    expect(screen.getByTestId('data-missing-badge')).toBeInTheDocument();
  });

  it('renders all 5 driver rows sorted by |contribution_pct| descending', () => {
    const rec = recommendation();
    renderWithLineage(<DriverWaterfall drivers={rec.drivers} />);
    const root = screen.getByTestId('driver-waterfall');
    const rows = root.querySelectorAll('[data-driver-kind]');
    expect(rows).toHaveLength(5);
    // First row should be the largest contribution (cost_trajectory at 0.35).
    expect(rows[0].getAttribute('data-driver-kind')).toBe('cost_trajectory');
    expect(rows[rows.length - 1].getAttribute('data-driver-kind')).toBe(
      'floor_protection',
    );
  });

  it('rings the floor_protection row when emphasiseFloor is set', () => {
    const rec = recommendation();
    renderWithLineage(<DriverWaterfall drivers={rec.drivers} emphasiseFloor />);
    const floorRow = screen
      .getByTestId('driver-waterfall')
      .querySelector('[data-driver-kind="floor_protection"]');
    expect(floorRow?.className).toMatch(/ring-1/);
  });
});
