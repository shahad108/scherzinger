import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
  it('mounts TopBar, Sidebar, Outlet, and RightRail together', async () => {
    render(withProviders(<Shell />));
    await waitFor(() => expect(screen.getByText('PRO mode activated')).toBeInTheDocument());
    expect(screen.getByLabelText('Pryzm')).toBeInTheDocument();
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Outlet content')).toBeInTheDocument();
    expect(screen.getByText('Sections')).toBeInTheDocument();
  });
});
