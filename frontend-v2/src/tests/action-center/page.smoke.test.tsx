/**
 * P4.T16 — Action Center page smoke test.
 *
 * Mock mode is the default in this Vitest run (VITE_SCHERZINGER_API unset),
 * so apiFetch reads action-center.json out of bundled mocks. The test
 * asserts every block heading renders and no error strip is shown.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    // A representative heading from each block.
    // Plan §2.5 — Movable/Locked SKU cards are replaced by the
    // BucketFilterRow chip strip.
    expect(screen.getByTestId('bucket-filter-row')).toBeInTheDocument();
    expect(screen.getByTestId('bucket-filter-all')).toBeInTheDocument();
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

  it('clicking the churn chip filters DecisionCards to churn-queue rows only', async () => {
    render(withProviders(<ActionCenterPage />));
    await waitFor(() =>
      expect(screen.getByText(/Good morning, Frank/i)).toBeInTheDocument(),
    );

    // Sanity: all three mock decision headlines render in DecisionCards
    // before filtering. DecisionCards renders ``d.headline ?? d.title``,
    // so we assert against the unique headline copy.
    expect(
      screen.getByText(/Article 200832-E .* margin 30\.6% → 6\.4%/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Article 204604 .* margin 32\.7% → 11\.8%/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Article 205169 .* margin 70\.1% → 44\.2%/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bucket-filter-churn'));

    // Only the churn-queue decision (205169) survives the filter.
    await waitFor(() =>
      expect(
        screen.queryByText(/Article 200832-E .* margin 30\.6% → 6\.4%/),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Article 204604 .* margin 32\.7% → 11\.8%/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Article 205169 .* margin 70\.1% → 44\.2%/),
    ).toBeInTheDocument();
  });

  it('SKU bulk toolbar is hidden by default and appears after a checkbox click', async () => {
    render(withProviders(<ActionCenterPage />));
    await waitFor(() =>
      expect(screen.getByText(/SKU pricing engine/i)).toBeInTheDocument(),
    );

    // Toolbar must not exist until at least one row is selected (plan §2.9 F18).
    expect(screen.queryByTestId('sku-bulk-toolbar')).not.toBeInTheDocument();

    // Click the first SKU row checkbox (mock fixture seeds article 200832-E).
    fireEvent.click(screen.getByRole('checkbox', { name: /Select 200832-E/ }));
    expect(screen.getByTestId('sku-bulk-toolbar')).toBeInTheDocument();
  });
});

