// Pricing Studio v3 / Phase 9 — AlertBanner tests.
//
// Drives the banner via a mocked usePricingStream so we can replay
// `pricing.alerts.triggered` SSE events deterministically.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AlertBanner } from '../AlertBanner';
import type { PricingStreamEvent } from '@/hooks/usePricingStream';

let lastEvent: PricingStreamEvent | null = null;

vi.mock('@/hooks/usePricingStream', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/usePricingStream')>(
    '@/hooks/usePricingStream',
  );
  return {
    ...actual,
    usePricingStream: () => ({
      lastEvent,
      isConnected: true,
      retry: () => {},
    }),
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  lastEvent = null;
});

describe('AlertBanner', () => {
  it('renders nothing when no event has been received', () => {
    lastEvent = null;
    wrap(<AlertBanner aid="AID-77" />);
    expect(screen.queryByTestId('alert-banner')).not.toBeInTheDocument();
  });

  it('renders the banner when a triggered event matches the current aid', () => {
    lastEvent = {
      topic: 'pricing.alerts.triggered',
      aid: 'AID-77',
      cluster: null,
      ts: Date.now() / 1000,
      payload: {
        aid: 'AID-77',
        alert_id: 'a-1',
        kind: 'cost_threshold',
        pct_actual: 6.2,
      },
    };
    wrap(<AlertBanner aid="AID-77" />);
    expect(screen.getByTestId('alert-banner')).toBeInTheDocument();
  });

  it('ignores triggered events targeting a different aid', () => {
    lastEvent = {
      topic: 'pricing.alerts.triggered',
      aid: 'AID-OTHER',
      cluster: null,
      ts: Date.now() / 1000,
      payload: { aid: 'AID-OTHER', alert_id: 'a-2', kind: 'cost_threshold' },
    };
    wrap(<AlertBanner aid="AID-77" />);
    expect(screen.queryByTestId('alert-banner')).not.toBeInTheDocument();
  });

  it('dismisses on click and stays dismissed for that alert id', () => {
    lastEvent = {
      topic: 'pricing.alerts.triggered',
      aid: 'AID-77',
      cluster: null,
      ts: Date.now() / 1000,
      payload: {
        aid: 'AID-77',
        alert_id: 'a-1',
        kind: 'floor_cross',
      },
    };
    wrap(<AlertBanner aid="AID-77" />);
    expect(screen.getByTestId('alert-banner')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('alert-banner-dismiss'));
    expect(screen.queryByTestId('alert-banner')).not.toBeInTheDocument();
  });

  it('ignores non-alert SSE topics', () => {
    lastEvent = {
      topic: 'pricing.recommendation.updated',
      aid: 'AID-77',
      cluster: null,
      ts: Date.now() / 1000,
      payload: { aid: 'AID-77' },
    };
    wrap(<AlertBanner aid="AID-77" />);
    expect(screen.queryByTestId('alert-banner')).not.toBeInTheDocument();
  });
});
