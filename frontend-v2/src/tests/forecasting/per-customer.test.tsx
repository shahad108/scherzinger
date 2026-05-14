/**
 * Phase 4 — per-customer table renders the top-at-risk rows; clicking Open
 * opens the detail drawer.
 *
 * Phase J (v2.2) — the top-level "Per customer" tab was removed. The
 * `PerCustomerTab` table view is still tested standalone (it's the same
 * data shape the drill-in renders) and a new test asserts that clicking a
 * customer in the ParetoLayer (via the full ForecastingPage) opens the
 * `CustomerForecastDetail` drawer scoped to that customer.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ForecastingPage from '@/features/forecasting';
import { PerCustomerTab } from '@/features/forecasting/components/PerCustomerTab';
import { RiskTierChip } from '@/features/forecasting/components/RiskTierChip';

function withProviders(ui: React.ReactNode, route = '/forecasting') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Per-customer table (Phase 4)', () => {
  it('lists the top 5 at-risk customers from the seed', async () => {
    render(withProviders(<PerCustomerTab />));
    await waitFor(() => expect(screen.getByTestId('customer-row-101487')).toBeInTheDocument());
    expect(screen.getByTestId('customer-row-104447')).toBeInTheDocument();
    expect(screen.getByTestId('customer-row-100924')).toBeInTheDocument();
  });

  it('clicking Open opens the customer detail drawer', async () => {
    render(withProviders(<PerCustomerTab />));
    await waitFor(() => expect(screen.getByTestId('open-customer-101487')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('open-customer-101487'));
    expect(await screen.findByTestId('customer-detail')).toBeInTheDocument();
    expect(screen.getAllByText(/alloys distributor/i).length).toBeGreaterThan(0);
  });

  it('filtering by medium hides high-risk rows', async () => {
    render(withProviders(<PerCustomerTab />));
    await waitFor(() => expect(screen.getByTestId('per-customer-tab')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('risk-filter-medium'));
    await waitFor(() => {
      expect(screen.queryByTestId('customer-row-101487')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('customer-row-101154')).toBeInTheDocument();
  });
});

describe('Customer drill-in via ParetoLayer (Phase J)', () => {
  it('forecasting page no longer renders the top-level tablist', async () => {
    render(withProviders(<ForecastingPage />));
    // Wait for any pareto row to render so we know the page hydrated.
    await waitFor(() =>
      expect(screen.getByTestId('pareto-customer-detail-101580')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('forecast-tabs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forecast-tab-customers')).not.toBeInTheDocument();
  });

  it('clicking a ParetoLayer customer opens the CustomerForecastDetail drawer scoped to that id', async () => {
    render(withProviders(<ForecastingPage />));
    await waitFor(() =>
      expect(screen.getByTestId('pareto-customer-detail-101580')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('pareto-customer-detail-101580'));
    const drawer = await screen.findByTestId('customer-detail');
    expect(drawer).toBeInTheDocument();
    // Drawer should mention the chosen customer id in its header.
    expect(within(drawer).getAllByText(/101580/).length).toBeGreaterThan(0);
  });
});

describe('RiskTierChip (Phase 4)', () => {
  it.each([
    ['high', 0.6, 0.7, 'High risk'],
    ['medium', 0.35, 0.32, 'Medium risk'],
    ['low', 0.1, 0.05, 'Low risk'],
  ] as const)('renders %s tier label', (tier, pChurn, pDecline, label) => {
    render(<RiskTierChip tier={tier} pChurn={pChurn} pDecline={pDecline} />);
    expect(within(screen.getByTestId('risk-tier-chip')).getByText(label)).toBeInTheDocument();
  });
});
