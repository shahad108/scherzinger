/**
 * Phase 1 — Mode toggle wires the active metric + horizon through the URL
 * so the hero + tornado + distributions all rerender against the matching slice.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ForecastingPage from '@/features/forecasting';

function withProviders(ui: React.ReactNode, route: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Forecasting ModeToggle (Phase 1)', () => {
  it('renders three mode pills + a horizon dropdown', async () => {
    render(withProviders(<ForecastingPage />, '/forecasting'));
    await waitFor(() =>
      expect(screen.getByTestId('mode-toggle')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('mode-pill-revenue')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mode-pill-margin')).toBeInTheDocument();
    expect(screen.getByTestId('mode-pill-volume')).toBeInTheDocument();
    expect(screen.getByTestId('horizon-select')).toBeInTheDocument();
  });

  it('clicking Volume switches the active pill', async () => {
    render(withProviders(<ForecastingPage />, '/forecasting'));
    await waitFor(() => expect(screen.getByTestId('mode-toggle')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('mode-pill-volume'));

    await waitFor(() =>
      expect(screen.getByTestId('mode-pill-volume')).toHaveAttribute('aria-selected', 'true'),
    );
    expect(screen.getByTestId('mode-pill-revenue')).toHaveAttribute('aria-selected', 'false');
  });

  it('honours ?mode=margin from the URL', async () => {
    render(withProviders(<ForecastingPage />, '/forecasting?mode=margin'));
    await waitFor(() =>
      expect(screen.getByTestId('mode-pill-margin')).toHaveAttribute('aria-selected', 'true'),
    );
  });

  it('honours ?horizon=3 from the URL', async () => {
    render(withProviders(<ForecastingPage />, '/forecasting?horizon=3'));
    await waitFor(() => expect(screen.getByTestId('horizon-select')).toBeInTheDocument());
    expect((screen.getByTestId('horizon-select') as HTMLSelectElement).value).toBe('3');
  });
});
