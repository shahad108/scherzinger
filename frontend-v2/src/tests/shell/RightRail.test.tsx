import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { RightRail } from '@/app/layout/RightRail';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('RightRail', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders reviewers panel, sections list from useShell(), and an empty-state notif panel when /notifications returns only seed stubs', async () => {
    render(withProviders(<RightRail />));
    // Phase 4.5 audit fix #2: the seed notifications (pro/sku/phase) are
    // filtered out at the FE, so the rail shows the empty state instead.
    await waitFor(() => expect(screen.getByTestId('rail-notifs-empty')).toBeInTheDocument());
    expect(screen.queryByText('PRO mode activated')).not.toBeInTheDocument();
    expect(screen.queryByText('Phase deadline soon')).not.toBeInTheDocument();
    expect(screen.getByText('Assigned reviewers')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('Movable revenue')).toBeInTheDocument();
    expect(screen.getByText('Lost-quote analysis')).toBeInTheDocument();
  });
});
