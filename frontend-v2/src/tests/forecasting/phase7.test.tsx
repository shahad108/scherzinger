/**
 * Phase 7 — Market direction strip + briefing modal.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MarketDirectionStrip } from '@/features/forecasting/components/MarketDirectionStrip';
import { BriefingButton } from '@/features/forecasting/components/BriefingButton';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MarketDirectionStrip (Phase 7)', () => {
  it('renders 8 curated tiles with WoW chips', () => {
    render(
      withProviders(
        <MarketDirectionStrip
          data={{
            source: 'seed',
            tiles: [
              { name: 'Steel HRC (Eurofer)', value: 1180, unit: '€/t', wowPct: 1.2, tone: 'red', context: 'Trajectory steepening.' },
              { name: 'EUR / USD', value: 1.08, unit: 'FX', wowPct: -0.3, tone: 'amber', context: 'USD strength.' },
              { name: 'Alloys', value: 2840, unit: '€/t', wowPct: 0.4, tone: 'ink-3', context: 'Stable.' },
              { name: 'Copper LME', value: 8420, unit: '€/t', wowPct: 3.1, tone: 'amber', context: 'China.' },
              { name: 'Energy', value: 0.184, unit: '€/kWh', wowPct: -2.4, tone: 'green', context: 'Mild April.' },
              { name: 'ifo', value: 87.2, unit: 'idx', wowPct: 0.8, tone: 'green', context: 'Slight improvement.' },
              { name: 'German PMI', value: 49.6, unit: 'idx', wowPct: -0.4, tone: 'amber', context: 'Still contraction.' },
              { name: 'VDMA orders', value: -3.2, unit: '% YoY', wowPct: 0.0, tone: 'amber', context: 'Flat MoM.' },
            ],
            digest: { wow: 'Mixed.', mom: 'X', yoy: 'Y', notes: 'Z' },
          }}
        />,
      ),
    );
    expect(screen.getByTestId('market-direction-strip')).toBeInTheDocument();
    const tiles = screen.getAllByTestId(/market-tile-/);
    expect(tiles.length).toBe(8);
    expect(screen.getByText(/\+1\.2% WoW/i)).toBeInTheDocument();
    expect(screen.getByText(/−2\.4% WoW|-2\.4% WoW/i)).toBeInTheDocument();
  });
});

describe('BriefingButton (Phase 7)', () => {
  it('opens the modal and generates a receipt on submit', async () => {
    render(withProviders(<BriefingButton />));
    fireEvent.click(screen.getByTestId('briefing-open'));
    expect(await screen.findByTestId('briefing-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('briefing-submit'));
    await waitFor(() => expect(screen.getByTestId('briefing-receipt')).toBeInTheDocument());
    expect(screen.getByText(/Job queued/i)).toBeInTheDocument();
  });

  it('exposes PDF and HTML formats', () => {
    render(withProviders(<BriefingButton />));
    fireEvent.click(screen.getByTestId('briefing-open'));
    const select = screen.getByTestId('briefing-format') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('pdf');
    expect(options).toContain('html');
  });
});
