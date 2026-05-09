import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { Sidebar } from '@/app/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';

describe('Sidebar', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
    useAuthStore.setState({
      user: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'frank@scherzinger.de',
        name: 'Frank Keller',
        ui_persona: 'frank',
        roles: ['analyst'],
        permissions: ['view.action_center'],
        features: [],
      },
      isLoading: false,
    });
  });

  afterAll(() => {
    i18n.changeLanguage('de');
    useAuthStore.setState({ user: null, isLoading: false });
  });

  it('renders Workspace label, six nav items, Departments, Data fresh, and user card', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Action Center/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Forecasting/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pricing Studio/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Margin Cockpit/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Quotes/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /AI Briefing/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument();
    expect(screen.getByText('Departments')).toBeInTheDocument();
    expect(screen.getByText('Data fresh')).toBeInTheDocument();
    expect(screen.getByText('Frank Keller')).toBeInTheDocument();
  });
});
