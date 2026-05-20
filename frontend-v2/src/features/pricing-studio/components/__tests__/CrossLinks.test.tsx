// Pricing Studio v3 / Phase 11 — CrossLinks navigation tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CrossLink } from '@/types/studio';
import { CrossLinks } from '../CrossLinks';

function CurrentUrl() {
  const loc = useLocation();
  return <pre data-testid="cur">{loc.pathname + loc.search}</pre>;
}

function renderWith(links: CrossLink[], aid: string | null = 'AID-1', cluster: string | null = 'BKAGG') {
  return render(
    <MemoryRouter initialEntries={['/start']}>
      <Routes>
        <Route
          path="/start"
          element={
            <>
              <CrossLinks links={links} aid={aid} cluster={cluster} />
              <CurrentUrl />
            </>
          }
        />
        <Route path="*" element={<CurrentUrl />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CrossLinks (Phase 11)', () => {
  it('navigates to Margin Cockpit with aid + source=studio', () => {
    renderWith([{ label: 'Margin Cockpit' }]);
    fireEvent.click(screen.getByTestId('cross-link-margin-cockpit'));
    const url = screen.getByTestId('cur').textContent ?? '';
    expect(url).toBe('/margin?aid=AID-1&source=studio');
  });

  it('navigates to Forecasting with cluster + source=studio', () => {
    renderWith([{ label: 'Forecasting' }]);
    fireEvent.click(screen.getByTestId('cross-link-forecasting'));
    expect(screen.getByTestId('cur').textContent ?? '').toBe(
      '/forecasting?cluster=BKAGG&source=studio',
    );
  });

  it('navigates to Action Center with aid + source=studio', () => {
    renderWith([{ label: 'Action Center' }]);
    fireEvent.click(screen.getByTestId('cross-link-action-center'));
    expect(screen.getByTestId('cur').textContent ?? '').toBe(
      '/action-center?aid=AID-1&source=studio',
    );
  });

  it('navigates to Quotes with aid + source=studio', () => {
    renderWith([{ label: 'Quotes' }]);
    fireEvent.click(screen.getByTestId('cross-link-quotes'));
    expect(screen.getByTestId('cur').textContent ?? '').toBe(
      '/quotes?aid=AID-1&source=studio',
    );
  });

  it('marks unknown destinations as TODO and disables them', () => {
    renderWith([{ label: 'Made Up Page' }]);
    const pill = screen.getByTestId('cross-link-made-up-page');
    expect(pill).toBeDisabled();
    expect(screen.getByTestId('cross-link-todo')).toBeInTheDocument();
  });
});
