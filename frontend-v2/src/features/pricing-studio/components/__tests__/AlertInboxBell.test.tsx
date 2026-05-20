// Pricing Studio v3 / Phase 9 — AlertInboxBell tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AlertInboxBell } from '../AlertInboxBell';
import type { PricingAlertEvent } from '@/data/api/usePricingAlerts';

let mockEvents: PricingAlertEvent[] = [];

vi.mock('@/data/api/usePricingAlerts', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/usePricingAlerts')>(
    '@/data/api/usePricingAlerts',
  );
  return {
    ...actual,
    useAlertInbox: () => ({ data: { events: mockEvents } }),
    usePricingAlerts: () => ({ data: { alerts: [] } }),
    useDisableAlert: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const event: PricingAlertEvent = {
  id: 'e-1',
  alert_id: 'a-1',
  triggered_at: new Date().toISOString(),
  payload: { aid: 'AID-77', kind: 'cost_threshold' },
  channels_dispatched: ['in_app'],
  kind: 'cost_threshold',
  scope: { aid: 'AID-77', cluster: null, family: null },
};

beforeEach(() => {
  mockEvents = [];
});

describe('AlertInboxBell', () => {
  it('shows no badge when the inbox is empty', () => {
    mockEvents = [];
    wrap(<AlertInboxBell />);
    expect(screen.queryByTestId('alert-inbox-badge')).not.toBeInTheDocument();
  });

  it('shows an amber badge with count when inbox is non-empty', () => {
    mockEvents = [event];
    wrap(<AlertInboxBell />);
    const badge = screen.getByTestId('alert-inbox-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe('1');
  });

  it('collapses count > 9 to 9+', () => {
    mockEvents = Array.from({ length: 12 }, (_, i) => ({
      ...event,
      id: `e-${i}`,
    }));
    wrap(<AlertInboxBell />);
    expect(screen.getByTestId('alert-inbox-badge').textContent).toBe('9+');
  });

  it('opens the alerts drawer when the bell is clicked', () => {
    mockEvents = [event];
    wrap(<AlertInboxBell />);
    fireEvent.click(screen.getByTestId('alert-inbox-bell'));
    expect(screen.getByTestId('alerts-drawer')).toBeInTheDocument();
  });
});
