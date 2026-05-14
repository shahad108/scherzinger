import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeroKPIStrip } from './HeroKPIStrip';

describe('HeroKPIStrip', () => {
  it('renders four tiles', () => {
    render(
      <HeroKPIStrip
        forecast12mo={6_800_000}
        varianceVsPlanPct={-2.3}
        mape={8.4}
        fva={{ score: 0.4, verdict: 'helping', n: 12 }}
        mode="revenue"
      />,
    );
    expect(screen.getByText(/Forecast/i)).toBeInTheDocument();
    expect(screen.getByText(/Variance/i)).toBeInTheDocument();
    expect(screen.getByText(/MAPE/i)).toBeInTheDocument();
    expect(screen.getByText(/FVA/i)).toBeInTheDocument();
    expect(screen.getByText('6.8M €')).toBeInTheDocument();
  });
});
