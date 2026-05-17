import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PlanTrackingStrip } from './PlanTrackingStrip';
import type { PlanTracking } from '@/types/forecast';

const base: PlanTracking = {
  points: [
    { month: '2026-01', plan: 500_000, actual: 480_000 },
    { month: '2026-02', plan: 600_000, actual: 590_000 },
    { month: '2026-03', plan: 700_000, actual: null },
  ],
  cumulativeGapEur: -30_000,
  cumulativeGapPct: -2.7,
  recentMonthAttribution: { price: -95_000, volume: -40_000, mix: -25_000, cost: 20_000 },
  resetLog: [
    { at: '2026-02-12T09:00:00Z', by: 'Manuel', reason: 'Steel S355 spike priced in', priorValue: 510_000 },
  ],
};

describe('PlanTrackingStrip', () => {
  it('renders null when no data', () => {
    const { container } = render(<PlanTrackingStrip data={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when points are empty', () => {
    const { container } = render(<PlanTrackingStrip data={{ ...base, points: [] }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the YTD performance headline tone and value', () => {
    render(<PlanTrackingStrip data={base} />);
    expect(screen.getByTestId('plan-tracking-strip')).toBeInTheDocument();
    expect(screen.getByText(/Below plan/i)).toBeInTheDocument();
    expect(screen.getByText(/30k €/)).toBeInTheDocument();
  });

  it('renders the variance attribution chips when present', () => {
    render(<PlanTrackingStrip data={base} />);
    const attr = screen.getByTestId('plan-variance-attribution');
    expect(attr.textContent).toMatch(/Price/);
    expect(attr.textContent).toMatch(/Volume/);
    expect(attr.textContent).toMatch(/Mix/);
    expect(attr.textContent).toMatch(/Cost/);
  });

  it('toggles plan-reset history on click', () => {
    render(<PlanTrackingStrip data={base} />);
    expect(screen.queryByTestId('plan-reset-history')).toBeNull();
    fireEvent.click(screen.getByTestId('plan-reset-history-button'));
    expect(screen.getByTestId('plan-reset-history')).toBeInTheDocument();
    expect(screen.getByText(/Manuel/)).toBeInTheDocument();
  });

  it('disables reset-history button when no resets', () => {
    render(<PlanTrackingStrip data={{ ...base, resetLog: [] }} />);
    expect(screen.getByTestId('plan-reset-history-button')).toBeDisabled();
  });

  it('renders the degraded affordance when meta.status is degraded', () => {
    const degraded: PlanTracking = {
      ...base,
      cumulativeGapEur: null,
      cumulativeGapPct: null,
      points: base.points.map((p) => ({ ...p, plan: null })),
      meta: { status: 'degraded', reason: 'Plan targets not configured for this dataset' },
    };
    render(<PlanTrackingStrip data={degraded} />);
    const strip = screen.getByTestId('plan-tracking-strip');
    expect(strip).toHaveAttribute('data-degraded', 'true');
    expect(screen.getByText(/Plan target unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Plan targets not configured/i)).toBeInTheDocument();
  });
});
