/**
 * Phase 2 — AccuracyBadge renders correct metric per block and opens
 * the LineageDrawer on click.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccuracyBadge } from '@/features/forecasting/components/AccuracyBadge';

function withQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('AccuracyBadge (Phase 2)', () => {
  it('renders MAPE as a percentage', () => {
    render(
      withQuery(
        <AccuracyBadge
          data={{ metric: 'mape', value: 0.0688, n: 36, horizonMonths: 12 }}
          entityType="commodity_group"
        />,
      ),
    );
    const badge = screen.getByTestId('accuracy-badge');
    expect(within(badge).getByText('MAPE')).toBeInTheDocument();
    expect(within(badge).getByText('6.9%')).toBeInTheDocument();
    expect(within(badge).getByText(/n=36/)).toBeInTheDocument();
    expect(within(badge).getByText(/h=12mo/)).toBeInTheDocument();
  });

  it('renders AUC as a decimal', () => {
    render(
      withQuery(
        <AccuracyBadge
          data={{ metric: 'auc_roc', value: 0.93, n: 482, horizonMonths: 12 }}
          entityType="customer"
        />,
      ),
    );
    expect(screen.getByText('AUC')).toBeInTheDocument();
    expect(screen.getByText('0.93')).toBeInTheDocument();
  });

  it('opens the lineage drawer on click', async () => {
    render(
      withQuery(
        <AccuracyBadge
          data={{ metric: 'mape', value: 0.0688, n: 36, horizonMonths: 12 }}
          entityType="commodity_group"
          entityId="BKAES"
          drawerTitle="BKAES — lineage"
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('accuracy-badge'));
    expect(await screen.findByTestId('lineage-drawer')).toBeInTheDocument();
    expect(screen.getByText(/BKAES — lineage/)).toBeInTheDocument();
  });
});
