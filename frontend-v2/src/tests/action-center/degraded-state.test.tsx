import { act, cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import actionCenterMock from '@/data/mocks/action-center.json';
import ActionCenterPage from '@/features/action-center';
import { useAuthStore, type MeUser } from '@/stores/authStore';
import type { ActionCenterData } from '@/types';

const useActionCenter = vi.hoisted(() => vi.fn());

vi.mock('@/data/api/useActionCenter', () => ({
  useActionCenter,
}));

const FRANK: MeUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'frank@scherzinger.de',
  name: 'Frank Keller',
  ui_persona: 'frank',
  roles: ['analyst'],
  permissions: ['view.action_center', 'act.start_ab_test'],
  features: ['ab_test'],
};

const PETRA: MeUser = {
  ...FRANK,
  id: '00000000-0000-0000-0000-000000000099',
  email: 'petra@scherzinger.de',
  name: 'Petra Vogel',
};

function buildPayload(): ActionCenterData {
  const clone = structuredClone(actionCenterMock) as ActionCenterData;
  clone.meta = {
    generatedAt: '2026-05-11T10:30:00Z',
    traceId: 'trace-ac-1',
    blocks: {
      header: { status: 'live' },
      movableHero: { status: 'live' },
      buckets: { status: 'live' },
      decisions: { status: 'degraded', reason: 'Decision ranking temporarily unavailable.' },
      trust: { status: 'live' },
      lostQuote: { status: 'live' },
      skuTable: { status: 'live' },
      longTail: { status: 'live' },
      negotiation: { status: 'live' },
      rejections: { status: 'live' },
      audit: { status: 'live' },
      abTests: { status: 'live' },
    },
  };
  return clone;
}

function withProviders(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Action Center degraded states', () => {
  afterEach(() => {
    cleanup();
    act(() => {
      useAuthStore.setState({ user: null, isLoading: false });
    });
    useActionCenter.mockReset();
  });

  it('shows a degraded-state panel instead of rendering stale decision content', () => {
    act(() => {
      useAuthStore.setState({ user: FRANK, isLoading: false });
    });
    useActionCenter.mockReturnValue({
      data: buildPayload(),
      isLoading: false,
      error: null,
    });

    render(withProviders(<ActionCenterPage />));

    expect(
      screen.getByText(/Today's analyst decisions unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Decision ranking temporarily unavailable\./i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Article 200832-E \(Elektro-Zahnradpumpe, BKAES\)/i),
    ).not.toBeInTheDocument();
  });

  it('renders a locked card (not live data, not degraded) when status === "locked"', () => {
    act(() => {
      useAuthStore.setState({ user: FRANK, isLoading: false });
    });
    const payload = buildPayload();
    payload.meta!.blocks!.decisions = {
      status: 'locked',
      reason: 'Phase 4 unlock pending — decisions data source not yet wired.',
    };
    useActionCenter.mockReturnValue({ data: payload, isLoading: false, error: null });

    render(withProviders(<ActionCenterPage />));

    // Locked copy is shown, not the live SKU body nor the degraded amber copy.
    expect(
      screen.getByText(/Locked — data source not yet connected\./i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Today's analyst decisions unavailable/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Article 200832-E \(Elektro-Zahnradpumpe, BKAES\)/i),
    ).not.toBeInTheDocument();
  });

  it('uses the authenticated user in the page breadcrumb instead of hardcoded Frank copy', () => {
    act(() => {
      useAuthStore.setState({ user: PETRA, isLoading: false });
    });
    useActionCenter.mockReturnValue({
      data: buildPayload(),
      isLoading: false,
      error: null,
    });

    render(withProviders(<ActionCenterPage />));

    expect(screen.getByText(/Pricing Analyst · Petra/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pricing Analyst · Frank/i)).not.toBeInTheDocument();
  });
});
