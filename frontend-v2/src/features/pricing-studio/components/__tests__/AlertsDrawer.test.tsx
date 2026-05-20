// Pricing Studio v3 / Phase 9 — AlertsDrawer tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AlertsDrawer } from '../AlertsDrawer';
import type {
  PricingAlert,
  PricingAlertEvent,
} from '@/data/api/usePricingAlerts';

let mockEvents: PricingAlertEvent[] = [];
let mockAlerts: PricingAlert[] = [];
const disableMutate = vi.fn();

vi.mock('@/data/api/usePricingAlerts', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/usePricingAlerts')>(
    '@/data/api/usePricingAlerts',
  );
  return {
    ...actual,
    useAlertInbox: () => ({ data: { events: mockEvents } }),
    usePricingAlerts: () => ({ data: { alerts: mockAlerts } }),
    useDisableAlert: () => ({ mutate: disableMutate, isPending: false }),
  };
});

function LocationCapture({ onChange }: { onChange: (loc: string) => void }) {
  const loc = useLocation();
  onChange(`${loc.pathname}${loc.search}`);
  return null;
}

function wrap(ui: ReactNode, onLoc?: (loc: string) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/pricing']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                {ui}
                {onLoc && <LocationCapture onChange={onLoc} />}
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const today = new Date();
const todayIso = today.toISOString();
const olderIso = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

const todayEvent: PricingAlertEvent = {
  id: 'e-today',
  alert_id: 'a-1',
  triggered_at: todayIso,
  payload: { aid: 'AID-77', kind: 'cost_threshold' },
  channels_dispatched: ['in_app'],
  kind: 'cost_threshold',
  scope: { aid: 'AID-77', cluster: null, family: null },
};

const weekEvent: PricingAlertEvent = {
  id: 'e-week',
  alert_id: 'a-2',
  triggered_at: olderIso,
  payload: { aid: 'AID-88' },
  channels_dispatched: ['in_app'],
  kind: 'competitor_undercut',
  scope: { aid: 'AID-88', cluster: null, family: null },
};

const alert: PricingAlert = {
  id: 'a-1',
  kind: 'cost_threshold',
  spec_json: {},
  scope: { aid: 'AID-77', cluster: null, family: null },
  channels: ['in_app'],
  created_by: 'u-1',
  enabled: true,
  created_at: todayIso,
};

beforeEach(() => {
  mockEvents = [];
  mockAlerts = [];
  disableMutate.mockClear();
});

describe('AlertsDrawer', () => {
  it('renders the inbox tab with grouped events by time', () => {
    mockEvents = [todayEvent, weekEvent];
    wrap(<AlertsDrawer open onOpenChange={() => {}} />);
    expect(screen.getByTestId('alerts-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('alerts-group-today')).toBeInTheDocument();
    expect(screen.getByTestId('alerts-group-this-week')).toBeInTheDocument();
  });

  it('navigates to /pricing with alert query params when an event row is clicked', () => {
    mockEvents = [todayEvent];
    let location = '';
    wrap(<AlertsDrawer open onOpenChange={() => {}} />, (l) => {
      location = l;
    });
    fireEvent.click(screen.getByTestId('alerts-event-e-today'));
    expect(location).toContain('aid=AID-77');
    expect(location).toContain('source=alert');
    expect(location).toContain('alert_id=a-1');
  });

  it('switches to the Manage tab from the footer and renders the alerts list', () => {
    mockEvents = [todayEvent];
    mockAlerts = [alert];
    wrap(<AlertsDrawer open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByTestId('alerts-manage-button'));
    expect(screen.getByTestId('alerts-manage-view')).toBeInTheDocument();
    expect(
      screen.getByTestId(`alerts-manage-disable-${alert.id}`),
    ).toBeInTheDocument();
  });

  it('fires the disable mutation when the disable button is clicked', () => {
    mockAlerts = [alert];
    wrap(<AlertsDrawer open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByTestId('alerts-tab-manage'));
    fireEvent.click(screen.getByTestId(`alerts-manage-disable-${alert.id}`));
    expect(disableMutate).toHaveBeenCalledWith(alert.id);
  });

  it('renders an empty-state message when there are no alerts in the manage view', () => {
    mockAlerts = [];
    wrap(<AlertsDrawer open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByTestId('alerts-tab-manage'));
    expect(screen.getByTestId('alerts-manage-empty')).toBeInTheDocument();
  });
});
