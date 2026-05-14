import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import { Shell } from '@/app/layout/Shell';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/some']}>
        <Routes>
          <Route element={ui as React.ReactElement}>
            <Route path="/some" element={<div>Outlet content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Shell', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('mounts TopBar, Sidebar, Outlet, and RightRail together', async () => {
    render(withProviders(<Shell />));
    // Phase 4.5 audit fix #2: fake seed notifications (PRO mode / SKU /
    // Phase deadline) are filtered out, so the rail renders the empty state.
    await waitFor(() => expect(screen.getByTestId('rail-notifs-empty')).toBeInTheDocument());
    expect(screen.getByLabelText('Pryzm')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Outlet content')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
  });
});
