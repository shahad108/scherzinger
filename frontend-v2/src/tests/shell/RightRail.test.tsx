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

  it('renders notifications, reviewers panel, and sections list from useShell()', async () => {
    render(withProviders(<RightRail />));
    await waitFor(() => expect(screen.getByText('PRO mode activated')).toBeInTheDocument());
    expect(screen.getByText('New SKU recommendation')).toBeInTheDocument();
    expect(screen.getByText('Phase deadline soon')).toBeInTheDocument();
    expect(screen.getByText('Assigned reviewers')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
    expect(screen.getByText('Movable revenue')).toBeInTheDocument();
    expect(screen.getByText('Lost-quote analysis')).toBeInTheDocument();
  });
});
