import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from '@/app/layout/TopBar';

describe('TopBar', () => {
  it('renders logo, search, persona, language, date, and Create CTA', () => {
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Pryzm')).toBeInTheDocument();
    expect(screen.getByLabelText(/Search SKUs/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Frank' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Till' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Heiko' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Notifications/)).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create/ })).toBeInTheDocument();
  });
});
