// Pricing Studio v3 / Phase 11 — ActiveFiltersStrip tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { ActiveFiltersStrip } from '../ActiveFiltersStrip';

function CurrentParams() {
  const [params] = useSearchParams();
  return <pre data-testid="current-params">{params.toString()}</pre>;
}

function renderWith(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <ActiveFiltersStrip />
              <CurrentParams />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ActiveFiltersStrip', () => {
  it('renders nothing when there are no tracked filters', () => {
    renderWith('/?unrelated=x');
    expect(screen.queryByTestId('active-filters-strip')).toBeNull();
  });

  it('renders a chip per active filter', () => {
    renderWith('/?tier=A&family=BKAGG');
    expect(screen.getByTestId('active-filter-tier')).toHaveTextContent('Tier');
    expect(screen.getByTestId('active-filter-tier')).toHaveTextContent('A');
    expect(screen.getByTestId('active-filter-family')).toHaveTextContent('BKAGG');
  });

  it('removes a filter when the chip × is clicked', () => {
    renderWith('/?tier=A&family=BKAGG');
    fireEvent.click(screen.getByTestId('active-filter-tier-remove'));
    expect(screen.queryByTestId('active-filter-tier')).toBeNull();
    expect(screen.getByTestId('current-params').textContent ?? '').toBe(
      'family=BKAGG',
    );
  });

  it('clears all tracked filters with "Clear all"', () => {
    renderWith('/?tier=A&family=BKAGG&cluster=BKAES');
    fireEvent.click(screen.getByTestId('active-filters-clear-all'));
    expect(screen.queryByTestId('active-filters-strip')).toBeNull();
  });
});
