import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { TopBar } from '@/app/layout/TopBar';

describe('TopBar', () => {
  beforeAll(async () => {
    // Test against English so the labels match the assertions verbatim.
    await i18n.changeLanguage('en');
  });

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
