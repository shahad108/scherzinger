import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { HeroForecast, renderMoverSub } from './HeroForecast';
import type { ForecastHero, ForecastSeriesPoint } from '@/types/forecast';

// Phase 3 (forecast redesign v2) — the chart pulls overrides from the BFF on
// mount. We mock the hook so the test never hits the network.
vi.mock('@/data/api/useForecastOverrides', () => ({
  useForecastOverrides: () => ({ data: { items: [] } }),
}));

// Phase H — annotations are similarly fetched on mount; mock the hook so the
// test never hits the network.
vi.mock('@/data/api/useForecastAnnotations', () => ({
  useForecastAnnotations: () => ({ data: { items: [] } }),
  useCreateAnnotation: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useDeleteAnnotation: () => ({ mutate: vi.fn(), isPending: false }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function makeHero(): ForecastHero {
  // 12 history months + 6 forecast months = 18 total. The component should
  // trim by default to ~6 history + all forecast.
  const series: ForecastSeriesPoint[] = Array.from({ length: 18 }, (_, i) => {
    const month = `2026-${String((i % 12) + 1).padStart(2, '0')}`;
    const p50 = 500_000 + i * 5000;
    const isHistory = i < 12;
    return {
      month,
      primary: p50,
      low: p50 - 30_000,
      high: p50 + 30_000,
      p50,
      p80Low: p50 - 20_000,
      p80High: p50 + 20_000,
      p95Low: p50 - 30_000,
      p95High: p50 + 30_000,
      actual: isHistory ? p50 - 1_000 : undefined,
    };
  });

  return {
    caption: 'Test',
    series,
    movers: [],
    movableLockedSplit: {
      label: 'Movable',
      value: '50%',
      movablePct: 50,
      sub: 'test',
    },
    whyBandMoves: { title: 'Why', sub: 'sub', rows: [] },
  };
}

describe('HeroForecast v2', () => {
  it('renders chart with the history toggle', () => {
    wrap(<HeroForecast hero={makeHero()} mode="revenue" />);
    expect(screen.getByTestId('hero-history-toggle')).toBeInTheDocument();
    expect(screen.getByText(/Show full history/i)).toBeInTheDocument();
  });

  it('toggles between trimmed and full history labels', () => {
    wrap(<HeroForecast hero={makeHero()} mode="revenue" />);
    const btn = screen.getByTestId('hero-history-toggle');
    expect(btn).toHaveTextContent(/Show full history/i);
    fireEvent.click(btn);
    expect(btn).toHaveTextContent(/Trim history/i);
  });

  it('does not crash when no onPointClick prop is supplied (backward compat)', () => {
    // AggregateViewV1 still mounts the chart with only hero+mode; this guards
    // that path.
    wrap(<HeroForecast hero={makeHero()} mode="revenue" />);
    expect(screen.getByTestId('hero-title')).toBeInTheDocument();
  });

  it('accepts an onPointClick prop without throwing', () => {
    const onPointClick = vi.fn();
    wrap(<HeroForecast hero={makeHero()} mode="revenue" onPointClick={onPointClick} />);
    expect(screen.getByTestId('hero-title')).toBeInTheDocument();
  });

  it('exposes a keyboard-reachable "Add note" button (disabled until hover)', () => {
    wrap(<HeroForecast hero={makeHero()} mode="revenue" />);
    const addBtn = screen.getByTestId('hero-add-annotation');
    // Without a hovered month the button is disabled — accessibility fallback
    // is reachable but cannot fire blindly.
    expect(addBtn).toBeDisabled();
  });
});

describe('renderMoverSub (XSS-safe bolding)', () => {
  it('returns plain text when there is no match', () => {
    const out = renderMoverSub('no numbers here');
    expect(out).toEqual(['no numbers here']);
  });

  it('wraps 6-digit customer IDs in <strong>', () => {
    const { container } = render(<>{renderMoverSub('Customer 123456 closed')}</>);
    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.querySelector('strong')?.textContent).toBe('123456');
    expect(container.textContent).toBe('Customer 123456 closed');
  });

  it('wraps +€NK deltas in <strong>', () => {
    const { container } = render(<>{renderMoverSub('Up +€42K MoM')}</>);
    expect(container.querySelector('strong')?.textContent).toBe('+€42K');
  });

  it('does not interpret HTML in the input (XSS safety)', () => {
    const { container } = render(
      <>{renderMoverSub('<img src=x onerror=alert(1)> 123456')}</>,
    );
    // No <img> ever ends up in the DOM — only literal text + the strong tag.
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
