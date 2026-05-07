import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { Sidebar } from '@/app/layout/Sidebar';

describe('Sidebar', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  afterAll(() => {
    i18n.changeLanguage('de');
  });

  it('renders Workspace label, six nav items, Departments, Data fresh, and user card', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
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
