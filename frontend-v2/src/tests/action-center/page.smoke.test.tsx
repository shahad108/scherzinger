/**
 * P4.T16 — Action Center page smoke test.
 *
 * Mock mode is the default in this Vitest run (VITE_SCHERZINGER_API unset),
 * so apiFetch reads action-center.json out of bundled mocks. The test
 * asserts every block heading renders and no error strip is shown.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ActionCenterPage from '@/features/action-center';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Action Center page', () => {
  it('renders every block heading', async () => {
    render(withProviders(<ActionCenterPage />));

    // Greeting + KPI block
    await waitFor(() =>
      expect(screen.getByText(/Good morning, Frank/i)).toBeInTheDocument(),
    );

    // A representative heading from each block
    expect(screen.getAllByText(/Movable bucket/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Today's analyst decisions/i)).toBeInTheDocument();
    expect(screen.getByText(/SKU pricing engine/i)).toBeInTheDocument();
    expect(screen.getByText(/A\/B Test Tracker/i)).toBeInTheDocument();
    expect(screen.getByText(/Why we lose/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Audit trail/i).length).toBeGreaterThan(0);
  });

  it('shows the hide-locked toggle in the page head', async () => {
    render(withProviders(<ActionCenterPage />));
    await waitFor(() =>
      expect(screen.getByText(/Good morning, Frank/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /hide locked/i })).toBeInTheDocument();
  });

  it('does not render an error strip on the happy path', async () => {
    render(withProviders(<ActionCenterPage />));
    await waitFor(() =>
      expect(screen.getByText(/Good morning, Frank/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Fehler:/i)).not.toBeInTheDocument();
  });
});
