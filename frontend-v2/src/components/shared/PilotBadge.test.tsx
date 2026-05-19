import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PilotBadge, PILOT_TOOLTIPS } from './PilotBadge';

describe('PilotBadge', () => {
  it('renders the "Pilot" label by default', () => {
    render(<PilotBadge tooltip="some tooltip" />);
    const badge = screen.getByTestId('pilot-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Pilot');
  });

  it('places the tooltip text into the DOM (aria-describedby + role=tooltip)', () => {
    render(<PilotBadge tooltip={PILOT_TOOLTIPS.movableRevenue} />);
    const badge = screen.getByTestId('pilot-badge');
    expect(badge).toHaveAttribute('title', PILOT_TOOLTIPS.movableRevenue);
    const tooltip = screen.getByTestId('pilot-badge-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent(
      /movable revenue estimated from cost delta/i,
    );
    expect(tooltip).toHaveTextContent(/price-elasticity training data/i);
    const descId = badge.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    expect(tooltip.id).toBe(descId);
  });

  it('renders the wtp tooltip copy when given that variant', () => {
    render(<PilotBadge tooltip={PILOT_TOOLTIPS.wtpClusterFallback} />);
    expect(
      screen.getByTestId('pilot-badge-tooltip'),
    ).toHaveTextContent(/cluster-level percentiles/i);
  });

  it('honours a custom testId', () => {
    render(
      <PilotBadge
        tooltip="x"
        testId="movable-revenue-pilot-badge"
      />,
    );
    expect(
      screen.getByTestId('movable-revenue-pilot-badge'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('movable-revenue-pilot-badge-tooltip'),
    ).toBeInTheDocument();
  });
});
