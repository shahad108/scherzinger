/**
 * Phase 2 deep-link contract — Pricing Studio honours
 *   ?aid=…&recommendation=…&source=…
 * by selecting the matching SKU and rendering a contextual banner.
 * SKU-not-found path renders an explicit warning instead of redirecting.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import PricingStudioPage from '@/features/pricing-studio';

function withProviders(ui: React.ReactNode, route: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Pricing Studio deep links', () => {
  it('renders the recommendation banner when ?recommendation= is present', async () => {
    render(
      withProviders(
        <PricingStudioPage />,
        '/pricing?aid=200832-E&recommendation=margin_erosion%3A200832-E&source=action-center',
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/From Action Center/i)).toBeInTheDocument(),
    );
    // Mock fallback synthesizes a title from the ref.
    expect(
      await screen.findByText(/Margin erosion · Article 200832-E/i),
    ).toBeInTheDocument();
  });

  it('renders the queue banner when ?queue=repricing is present', async () => {
    render(
      withProviders(
        <PricingStudioPage />,
        '/pricing?queue=repricing&source=action-center',
      ),
    );
    await waitFor(() =>
      expect(screen.getByText(/From Action Center/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/Repricing queue/i).length).toBeGreaterThan(0);
  });

  it('shows the SKU-not-found banner when ?aid points at an unknown article', async () => {
    render(
      withProviders(
        <PricingStudioPage />,
        '/pricing?aid=ZZZ-NOT-A-REAL-SKU-9999&source=action-center',
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/SKU not found in Studio: ZZZ-NOT-A-REAL-SKU-9999/i),
      ).toBeInTheDocument(),
    );
  });
});
