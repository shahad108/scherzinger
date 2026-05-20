import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MarginCockpitPage from '@/features/margin-cockpit';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Margin Cockpit page', () => {
  it('loads and renders all major sections', async () => {
    render(withProviders(<MarginCockpitPage />));
    await waitFor(() => expect(screen.getAllByText('Margin Intelligence').length).toBeGreaterThan(0));
    expect(screen.getByText('€280,000')).toBeInTheDocument();                  // health closable cell
    expect(screen.getAllByText('BKAES', { exact: false }).length).toBeGreaterThan(0);   // cluster chip
    expect(screen.getByText(/Where the 3.9pp gap came from/)).toBeInTheDocument(); // waterfall
    expect(screen.getByText('70.6%')).toBeInTheDocument();                     // lost-quote tile
    expect(screen.getByText(/Input cost vs realized price/)).toBeInTheDocument();
    expect(screen.getByText(/Cross-Customer Discrepancy/)).toBeInTheDocument();
  });

  it('switches tabs and shows the SKU leakage rows', async () => {
    render(withProviders(<MarginCockpitPage />));
    await waitFor(() => expect(screen.getAllByText('Margin Intelligence').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('tab', { name: /SKU Margin Leakage/ }));
    expect(await screen.findByText('Precision shaft')).toBeInTheDocument();
  });

  it('switches segment sub-tabs from Tier-pivot deep link via the waterfall mix bucket', async () => {
    render(withProviders(<MarginCockpitPage />));
    await waitFor(() => expect(screen.getAllByText('Margin Intelligence').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /Customer mix shift/ }));
    // SegmentPane → tier sub-tab should now be active
    expect(await screen.findByText('Strategic')).toBeInTheDocument();
  });
});
