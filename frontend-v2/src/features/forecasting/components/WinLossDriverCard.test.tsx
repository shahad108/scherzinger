import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WinLossDriverCard } from './WinLossDriverCard';
import type { WinLossPanel, WinLossSparklinePoint } from '@/types/forecast';

function makeSpark(values: number[]): WinLossSparklinePoint[] {
  return values.map((v, i) => ({
    month: `2025-${String(i + 1).padStart(2, '0')}`,
    paPct: v,
    prPct: 0,
  }));
}

describe('WinLossDriverCard', () => {
  it('renders null when data is undefined', () => {
    const { container } = render(<WinLossDriverCard data={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when rows are empty', () => {
    const { container } = render(
      <WinLossDriverCard
        data={{ window: { days: 90, anchor: '2026-05-01' }, rows: [] }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders one row per cluster with PA / PR chips and a sparkline', () => {
    const data: WinLossPanel = {
      window: { days: 90, anchor: '2026-05-01' },
      rows: [
        {
          cluster: 'BKAES',
          paPct: 25,
          prPct: 10,
          sample: 40,
          monthlySparkline: makeSpark(Array(12).fill(15)),
        },
        {
          cluster: 'MBDIV',
          paPct: 5,
          prPct: 8,
          sample: 30,
          monthlySparkline: makeSpark(Array(12).fill(5)),
        },
      ],
    };
    render(<WinLossDriverCard data={data} />);
    const rows = screen.getAllByTestId('win-loss-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-cluster')).toBe('BKAES');
    expect(screen.getAllByTestId('win-loss-sparkline')).toHaveLength(2);
    // Both PA and PR chips render.
    expect(screen.getAllByTestId('win-loss-pa')).toHaveLength(2);
    expect(screen.getAllByTestId('win-loss-pr')).toHaveLength(2);
  });

  it('tones the PA chip red when PA% is rising vs trailing 3-month avg', () => {
    // Trailing 3 months: 5%, 6%, 5% (avg ≈ 5.3) — latest 20% → rising.
    const rising = makeSpark([2, 3, 4, 3, 4, 5, 4, 5, 5, 6, 5, 20]);
    const flat = makeSpark([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    const data: WinLossPanel = {
      window: { days: 90, anchor: '2026-05-01' },
      rows: [
        { cluster: 'RISING', paPct: 20, prPct: 5, sample: 50, monthlySparkline: rising },
        { cluster: 'FLAT', paPct: 10, prPct: 5, sample: 50, monthlySparkline: flat },
      ],
    };
    render(<WinLossDriverCard data={data} />);
    const rows = screen.getAllByTestId('win-loss-row');
    const risingPa = rows[0].querySelector('[data-testid="win-loss-pa"]');
    const flatPa = rows[1].querySelector('[data-testid="win-loss-pa"]');
    expect(risingPa?.className).toContain('rose');
    expect(flatPa?.className).not.toContain('rose');
  });

  it('shows the unfiltered filter-scope badge when tier or family is active', () => {
    const data: WinLossPanel = {
      window: { days: 90, anchor: '2026-05-01' },
      rows: [
        {
          cluster: 'BKAES',
          paPct: 10,
          prPct: 5,
          sample: 20,
          monthlySparkline: makeSpark(Array(12).fill(0)),
        },
      ],
    };
    render(<WinLossDriverCard data={data} filterScope={{ tier: 'A' }} />);
    const badge = screen.getByTestId('filter-scope-badge');
    expect(badge.getAttribute('data-variant')).toBe('unfiltered');
  });

  it('shows the scoped (muted) badge when only cluster is active', () => {
    const data: WinLossPanel = {
      window: { days: 90, anchor: '2026-05-01' },
      rows: [
        {
          cluster: 'BKAES',
          paPct: 10,
          prPct: 5,
          sample: 20,
          monthlySparkline: makeSpark(Array(12).fill(0)),
        },
      ],
    };
    render(<WinLossDriverCard data={data} filterScope={{ cluster: 'BKAES' }} />);
    const badge = screen.getByTestId('filter-scope-badge');
    expect(badge.getAttribute('data-variant')).toBe('scoped');
  });
});
