// Pricing Studio v3 / Phase 9 — AlertButton tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AlertButton } from '../AlertButton';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AlertButton', () => {
  it('renders a low-emphasis bell button with the right testid', () => {
    wrap(<AlertButton triggerKind="cost_threshold" scope={{ aid: 'A1' }} />);
    expect(screen.getByTestId('alert-button-cost_threshold')).toBeInTheDocument();
  });

  it('opens the AlertSetupDrawer with the kind prefilled when clicked', () => {
    wrap(
      <AlertButton
        triggerKind="competitor_undercut"
        scope={{ aid: 'A1' }}
        initialSpec={{ pct: 5 }}
      />,
    );
    fireEvent.click(screen.getByTestId('alert-button-competitor_undercut'));
    expect(screen.getByTestId('alert-setup-drawer')).toBeInTheDocument();
    const select = screen.getByTestId('alert-kind-select') as HTMLSelectElement;
    expect(select.value).toBe('competitor_undercut');
  });

  it('passes scope through to the drawer scope radio', () => {
    wrap(
      <AlertButton
        triggerKind="cost_threshold"
        scope={{ aid: 'AID-77' }}
        initialSpec={{ pct: 5, days: 30 }}
      />,
    );
    fireEvent.click(screen.getByTestId('alert-button-cost_threshold'));
    const skuRadio = screen.getByTestId('alert-scope-sku') as HTMLInputElement;
    expect(skuRadio.checked).toBe(true);
    expect(screen.getByText(/AID-77/)).toBeInTheDocument();
  });
});
