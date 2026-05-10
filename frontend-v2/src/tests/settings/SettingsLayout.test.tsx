/**
 * P14.T1 — Settings shell renders left-rail nav with all expected links.
 */
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '@/i18n';
import SettingsLayout from '@/features/settings/SettingsLayout';

describe('SettingsLayout', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders left-rail nav with profile/preferences/saved-views/data-quality', () => {
    render(
      <MemoryRouter initialEntries={['/settings/profile']}>
        <Routes>
          <Route path="/settings/*" element={<SettingsLayout />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: /Settings sections/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Profile/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Preferences/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Saved views/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Data quality/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Notes/i })).toBeInTheDocument();
  });
});
