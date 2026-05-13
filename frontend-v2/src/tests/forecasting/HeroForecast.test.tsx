import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroForecast } from '@/features/forecasting/components/HeroForecast';
import type { ForecastHero } from '@/types/forecast';

// Recharts requires a real DOM size; jsdom returns 0×0 for the
// ResponsiveContainer parent, which makes the chart skip rendering.
// Stub ResizeObserver and force a fixed width via the parent so the
// Area/Line elements at least mount.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO);

const hero: ForecastHero = {
  caption: 'Walk-forward · solid = P50 · shaded = band',
  series: [
    { month: 'May', primary: 5.92, low: 5.78, high: 6.06, actual: 5.95, p50: 5.92, p80Low: 5.78, p80High: 6.06, p95Low: 5.69, p95High: 6.15 },
    { month: 'Jun', primary: 6.05, low: 5.90, high: 6.20, p50: 6.05, p80Low: 5.90, p80High: 6.20, p95Low: 5.81, p95High: 6.29 },
    { month: 'Jul', primary: 6.10, low: 5.94, high: 6.26, p50: 6.10, p80Low: 5.94, p80High: 6.26, p95Low: 5.84, p95High: 6.36 },
  ],
  movers: [
    { label: 'Band', value: '+€8K WoW', tone: 'green', sub: 'sub' },
  ],
  movableLockedSplit: { label: 'Movable / Locked', value: '62% / 38%', movablePct: 62, sub: 'sub' },
  whyBandMoves: { title: 'Why the band moves', sub: 'sub', rows: [{ label: 'Aug', value: '+22%', tone: 'green', sub: 'sub' }] },
  intervals: {
    title: 'Prediction intervals — what the band actually means',
    bands: [
      { id: 'p50', name: 'P50 · expected', desc: 'Median forecast. Plan on this.', calibration: null },
      { id: 'p80', name: 'P80 · likely range', desc: '80% of forecasts land here.', calibration: '3/3 actuals landed inside P80 (100%)' },
      { id: 'p95', name: 'P95 · plausible worst/best', desc: 'Stress band.', calibration: '3/3 actuals landed inside P95 (100%)' },
    ],
    disclosure: 'Three bands, three jobs. P50 = plan. P80 = planning range. P95 = hedge.',
    calibration: { windowMonths: 3, p80Hit: 3, p95Hit: 3, p80HitPct: 100, p95HitPct: 100, footnote: 'In-window calibration on 3 months.' },
    heuristic: { label: 'Pilot heuristic', rule: 'p95 = primary ± (p80_half × 1.6).', qualifier: 'Calibration recomputes when actuals replace seed.' },
  },
};

describe('HeroForecast intervals (Phase 6)', () => {
  it('renders the interval toggle and disclosure panel by default', () => {
    render(<HeroForecast hero={hero} mode="revenue" />);
    expect(screen.getByRole('tablist', { name: /Prediction interval bands/i })).toBeInTheDocument();
    expect(screen.getByText(/Prediction intervals — what the band actually means/)).toBeInTheDocument();
    expect(screen.getByText(/P50 · expected/)).toBeInTheDocument();
    expect(screen.getByText(/P80 · likely range/)).toBeInTheDocument();
    expect(screen.getByText(/P95 · plausible worst\/best/)).toBeInTheDocument();
    expect(screen.getByText(/3\/3 actuals landed inside P80/)).toBeInTheDocument();
    expect(screen.getByText(/In-window calibration on 3 months\./)).toBeInTheDocument();
  });

  it('hides the P95 band column when switched to P50 + P80 only', () => {
    render(<HeroForecast hero={hero} mode="revenue" />);
    expect(screen.getByText(/P95 · plausible worst\/best/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'P50 + P80' }));
    expect(screen.queryByText(/P95 · plausible worst\/best/)).not.toBeInTheDocument();
    // P50 and P80 still visible.
    expect(screen.getByText(/P50 · expected/)).toBeInTheDocument();
    expect(screen.getByText(/P80 · likely range/)).toBeInTheDocument();
  });

  it('expands the heuristic disclosure on click', () => {
    render(<HeroForecast hero={hero} mode="revenue" />);
    expect(screen.queryByText(/p95 = primary ±/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pilot heuristic/ }));
    expect(screen.getByText(/p95 = primary ±/)).toBeInTheDocument();
  });
});
