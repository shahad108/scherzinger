import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ModelCardsPage from '@/features/settings/ModelCardsPage';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/client', () => ({ apiFetch }));

beforeEach(() => apiFetch.mockReset());

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const today = new Date().toISOString();

const oneModel = {
  count: 1,
  models: [
    {
      model_name: 'ema',
      version: 'v1.0-backfill',
      last_trained_at: today,
      holdout_months: 3,
      notes: 'Backfilled from backtest_results.',
      features: ['lag_1', 'lag_2', 'lag_3'],
      clusters: [
        { entity_type: 'commodity_group', entity_id: 'BKAES', entity_label: 'By commodity', n: 12, metrics: { directional_accuracy: 0.82, mae: 0.024, mape: 0.063, rmse: 0.031 } },
        { entity_type: 'commodity_group', entity_id: 'BKAGG', entity_label: 'By commodity', n: 8,  metrics: { directional_accuracy: 0.74, mae: 0.029, mape: 0.075, rmse: 0.038 } },
        { entity_type: 'commodity_group', entity_id: 'SOPU',  entity_label: 'By commodity', n: 2,  metrics: { directional_accuracy: 0.38, mae: 0.072, mape: 0.190, rmse: 0.089 } },
        // 3 more so the "Show all 6" toggle becomes visible.
        { entity_type: 'commodity_group', entity_id: 'X1', entity_label: 'By commodity', n: 6, metrics: { directional_accuracy: 0.66, mae: 0.041, mape: 0.10, rmse: 0.05 } },
        { entity_type: 'commodity_group', entity_id: 'X2', entity_label: 'By commodity', n: 5, metrics: { directional_accuracy: 0.61, mae: 0.045, mape: 0.11, rmse: 0.06 } },
        { entity_type: 'commodity_group', entity_id: 'X3', entity_label: 'By commodity', n: 4, metrics: { directional_accuracy: 0.58, mae: 0.048, mape: 0.12, rmse: 0.065 } },
      ],
    },
  ],
};

describe('ModelCardsPage', () => {
  it('renders the card with version, freshness pill, features, and per-cluster table', async () => {
    apiFetch.mockResolvedValueOnce(oneModel);
    render(withQc(<ModelCardsPage />));
    await waitFor(() => expect(screen.getByText('ema')).toBeInTheDocument());
    expect(screen.getByText('vv1.0-backfill')).toBeInTheDocument();
    expect(screen.getByText(/3mo holdout/)).toBeInTheDocument();
    expect(screen.getByText(/Backfilled from backtest_results/)).toBeInTheDocument();
    expect(screen.getByText('lag_1')).toBeInTheDocument();
    expect(screen.getByText('lag_2')).toBeInTheDocument();
    // Top cluster (n=12) renders with high directional accuracy.
    expect(screen.getByText('BKAES')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    // Low-n badge appears on SOPU (n=2) only after expanding past top-5.
    expect(screen.queryByText('SOPU')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show all 6/ }));
    expect(screen.getByText('SOPU')).toBeInTheDocument();
    expect(screen.getByText('low-n')).toBeInTheDocument();
  });

  it('toggles between top-5 and full cluster list', async () => {
    apiFetch.mockResolvedValueOnce(oneModel);
    render(withQc(<ModelCardsPage />));
    await waitFor(() => expect(screen.getByText('ema')).toBeInTheDocument());
    // Default: top 5 — SOPU (n=2) is rank 6 by n so hidden.
    expect(screen.queryByText('SOPU')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show all 6/ }));
    expect(screen.getByText('SOPU')).toBeInTheDocument();
  });

  it('renders an empty-registry hint with the backfill script path', async () => {
    apiFetch.mockResolvedValueOnce({ count: 0, models: [] });
    render(withQc(<ModelCardsPage />));
    await waitFor(() => expect(screen.getByText(/Model registry is empty/)).toBeInTheDocument());
    expect(screen.getByText(/scripts\/build_model_registry\.py/)).toBeInTheDocument();
  });
});
