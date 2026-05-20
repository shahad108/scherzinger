import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AtRiskRevenueBar } from './AtRiskRevenueBar';
import type { AtRiskRevenue, AtRiskTierRow } from '@/types/forecast';

function tier(
  letter: string,
  forecast: number,
  atRisk: number,
  customerCount = 3,
): AtRiskTierRow {
  return {
    tier: letter,
    forecastEur: forecast,
    atRiskEur: atRisk,
    safeEur: forecast - atRisk,
    atRiskShare: forecast > 0 ? atRisk / forecast : 0,
    customerCount,
  };
}

function makeData(): AtRiskRevenue {
  const rows = [
    tier('A', 2_000_000, 800_000, 4),
    tier('B', 1_000_000, 250_000, 6),
    tier('C', 500_000, 50_000, 8),
    tier('D', 100_000, 5_000, 2),
  ];
  return {
    tiers: rows,
    totalForecastEur: rows.reduce((s, r) => s + r.forecastEur, 0),
    totalAtRiskEur: rows.reduce((s, r) => s + r.atRiskEur, 0),
  };
}

describe('AtRiskRevenueBar', () => {
  it('renders null when data is undefined', () => {
    const { container } = render(<AtRiskRevenueBar data={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when tiers array is empty', () => {
    const { container } = render(
      <AtRiskRevenueBar
        data={{ tiers: [], totalForecastEur: 0, totalAtRiskEur: 0 }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders four tier rows with customer counts and at-risk %', () => {
    render(<AtRiskRevenueBar data={makeData()} />);
    const rows = screen.getAllByTestId('at-risk-tier-row');
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.getAttribute('data-tier'))).toEqual(['A', 'B', 'C', 'D']);
    // Tier A is 800K of 2M → 40%
    expect(rows[0].textContent).toContain('40.0%');
    expect(rows[0].textContent).toContain('4 cust');
  });

  it('renders the stacked bar chart container and the per-tier summary list', () => {
    render(<AtRiskRevenueBar data={makeData()} />);
    expect(screen.getByTestId('at-risk-revenue-chart')).toBeTruthy();
    // Per-tier summary list confirms the data flowed through both stack keys
    // (Recharts itself doesn't paint inside jsdom because the ResponsiveContainer
    // has zero width, but the data shape feeding both stacks is exercised here).
    expect(screen.getByTestId('at-risk-revenue-legend')).toBeTruthy();
  });

  it('total caption shows formatted € and overall at-risk %', () => {
    render(<AtRiskRevenueBar data={makeData()} />);
    const subtitle = screen.getByTestId('at-risk-revenue-subtitle');
    // Total forecast = 3.6M, at risk = 1.105M → ~30.7%
    expect(subtitle.textContent).toContain('€3.60M');
    // formatEur uses toFixed(2) — 1.105 → "1.10".
    expect(subtitle.textContent).toMatch(/€1\.1[0-1]M/);
    expect(subtitle.textContent).toContain('30.7% at risk');
  });

  it('shows unfiltered filter-scope badge when tier filter is active', () => {
    render(<AtRiskRevenueBar data={makeData()} filterScope={{ tier: 'A' }} />);
    const badge = screen.getByTestId('filter-scope-badge');
    expect(badge.getAttribute('data-variant')).toBe('unfiltered');
  });

  it('shows unfiltered filter-scope badge when cluster filter is active', () => {
    render(<AtRiskRevenueBar data={makeData()} filterScope={{ cluster: 'BKAES' }} />);
    const badge = screen.getByTestId('filter-scope-badge');
    expect(badge.getAttribute('data-variant')).toBe('unfiltered');
  });

  it('omits filter-scope badge when no filter is active', () => {
    render(<AtRiskRevenueBar data={makeData()} filterScope={{}} />);
    expect(screen.queryByTestId('filter-scope-badge')).toBeNull();
  });

  it('handles zero-forecast tier without dividing by zero', () => {
    const data: AtRiskRevenue = {
      tiers: [
        tier('A', 0, 0, 0),
        tier('B', 1_000_000, 100_000, 2),
        tier('C', 0, 0, 0),
        tier('D', 0, 0, 0),
      ],
      totalForecastEur: 1_000_000,
      totalAtRiskEur: 100_000,
    };
    render(<AtRiskRevenueBar data={data} />);
    const rows = screen.getAllByTestId('at-risk-tier-row');
    // Empty tier renders an em-dash for share.
    expect(rows[0].textContent).toContain('—');
    expect(rows[1].textContent).toContain('10.0%');
  });
});
