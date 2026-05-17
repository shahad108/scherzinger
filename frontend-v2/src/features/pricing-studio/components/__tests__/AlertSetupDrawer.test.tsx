// Pricing Studio v3 / Phase 9 — AlertSetupDrawer tests.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AlertSetupDrawer } from '../AlertSetupDrawer';
import type { AlertSpec } from '@/data/api/usePricingAlerts';

const mutateAsync = vi.fn(async (_spec: AlertSpec) => ({
  alert: {
    id: 'a-1',
    kind: _spec.kind,
    spec_json: {},
    scope: { aid: null, cluster: null, family: null },
    channels: ['in_app'] as const,
    created_by: 'u-1',
    enabled: true,
    created_at: null,
  },
}));

vi.mock('@/data/api/usePricingAlerts', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/usePricingAlerts')>(
    '@/data/api/usePricingAlerts',
  );
  return {
    ...actual,
    useCreateAlert: () => ({
      mutateAsync,
      isPending: false,
    }),
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

beforeEach(() => {
  mutateAsync.mockClear();
});

describe('AlertSetupDrawer', () => {
  it('renders cost_threshold kind with pct + days fields', () => {
    wrap(
      <AlertSetupDrawer
        open
        onOpenChange={() => {}}
        triggerKind="cost_threshold"
        scope={{ aid: 'A1' }}
        initialSpec={{ pct: 5, days: 30 }}
      />,
    );
    expect(screen.getByTestId('alert-field-pct')).toBeInTheDocument();
    expect(screen.getByTestId('alert-field-days')).toBeInTheDocument();
  });

  it('renders floor_cross kind with no extra fields', () => {
    wrap(
      <AlertSetupDrawer
        open
        onOpenChange={() => {}}
        triggerKind="floor_cross"
        scope={{ aid: 'A1' }}
      />,
    );
    expect(screen.queryByTestId('alert-field-pct')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alert-field-days')).not.toBeInTheDocument();
  });

  it('renders pa_pr_surge kind with count + days', () => {
    wrap(
      <AlertSetupDrawer
        open
        onOpenChange={() => {}}
        triggerKind="pa_pr_surge"
        scope={{ aid: 'A1' }}
      />,
    );
    expect(screen.getByTestId('alert-field-count')).toBeInTheDocument();
    expect(screen.getByTestId('alert-field-days')).toBeInTheDocument();
  });

  it('toggles scope between sku, cluster, and custom', () => {
    wrap(
      <AlertSetupDrawer
        open
        onOpenChange={() => {}}
        triggerKind="cost_threshold"
        scope={{ aid: 'A1', cluster: 'BKAGG' }}
      />,
    );
    fireEvent.click(screen.getByTestId('alert-scope-cluster'));
    expect((screen.getByTestId('alert-scope-cluster') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('alert-scope-custom'));
    expect((screen.getByTestId('alert-scope-custom') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('alert-advanced-toggle')).toBeInTheDocument();
  });

  it('serializes pct as a decimal string when submitting', async () => {
    const onOpenChange = vi.fn();
    wrap(
      <AlertSetupDrawer
        open
        onOpenChange={onOpenChange}
        triggerKind="cost_threshold"
        scope={{ aid: 'A1' }}
        initialSpec={{ pct: 5, days: 30 }}
      />,
    );
    fireEvent.click(screen.getByTestId('alert-setup-submit'));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledTimes(1);
    });
    const spec = mutateAsync.mock.calls[0][0];
    expect(spec.kind).toBe('cost_threshold');
    // pct stays a string on the wire (decimal-as-string contract).
    if (spec.kind === 'cost_threshold') {
      expect(typeof spec.pct).toBe('string');
      expect(spec.pct).toBe('5');
      expect(spec.days).toBe(30);
      expect(spec.aid).toBe('A1');
      expect(spec.channels).toEqual(['in_app']);
    }
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('disables submit when no channels are selected', () => {
    wrap(
      <AlertSetupDrawer
        open
        onOpenChange={() => {}}
        triggerKind="floor_cross"
        scope={{ aid: 'A1' }}
      />,
    );
    fireEvent.click(screen.getByTestId('alert-channel-in_app'));
    const submit = screen.getByTestId('alert-setup-submit') as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });
});
