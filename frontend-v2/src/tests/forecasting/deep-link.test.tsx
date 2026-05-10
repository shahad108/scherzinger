/**
 * Phase 2 — Forecasting honours ?queue=renewals&article=… by rendering
 * the deep-link breadcrumb and applying a focus pulse to the matching
 * row in the price-floor table.
 */
import { render, screen, waitFor } from '@testing-library/react';
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

describe('Forecasting deep links', () => {
  it('renders the renewal-queue banner', async () => {
    render(withProviders(<ForecastingPage />, '/forecasting?queue=renewals&source=action-center'));
    await waitFor(() =>
      expect(screen.getByText(/From action center/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Renewal queue/i)).toBeInTheDocument();
  });
});
