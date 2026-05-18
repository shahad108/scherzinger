/**
 * TodaySummaryStrip — F5 contract.
 *
 * Plan ref: docs/ACTION_CENTER_PLAN.md §2.3.
 *
 *  - 5 tiles in fixed id order
 *  - values flow from payload, no literal numbers
 *  - clicking model_trust dispatches a drawer intent
 *  - clicking blocked_quotes routes to /quotes?status=blocked&source=...
 *  - when meta.blocks.summary.status === 'degraded' the page renders the
 *    shared DegradedBlock copy instead of tiles
 */
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import actionCenterMock from '@/data/mocks/action-center.json';
import ActionCenterPage from '@/features/action-center';
import { TodaySummaryStrip } from '@/features/action-center/components/TodaySummaryStrip';
import { useAuthStore, type MeUser } from '@/stores/authStore';
import type { ActionCenterData, SummaryTile } from '@/types';

const useActionCenter = vi.hoisted(() => vi.fn());
vi.mock('@/data/api/useActionCenter', () => ({ useActionCenter }));

const FRANK: MeUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'frank@scherzinger.de',
  name: 'Frank Keller',
  ui_persona: 'frank',
  roles: ['analyst'],
  permissions: ['view.action_center'],
  features: [],
};

function makeTile(overrides: Partial<SummaryTile>): SummaryTile {
  return {
    id: 'movable_revenue',
    label: 'Movable revenue',
    value: '€3.88M',
    delta: '+9.2% vs prev',
    deltaDirection: 'up',
    tone: 'positive',
    sourceBlockId: 'movableHero',
    action: { scroll: '#sec-movable', sourceScreen: 'action-center' },
    locked: false,
    ...overrides,
  };
}

const TILES: SummaryTile[] = [
  makeTile({ id: 'movable_revenue', label: 'Movable revenue', value: '€3.88M' }),
  makeTile({
    id: 'open_actions',
    label: 'Open actions',
    value: '4',
    delta: null,
    deltaDirection: 'flat',
    tone: 'warning',
    sourceBlockId: 'decisions',
    action: { scroll: '#sec-decisions', sourceScreen: 'action-center' },
  }),
  makeTile({
    id: 'recoverable_margin',
    label: 'Recoverable margin',
    value: '€124k',
    delta: null,
    deltaDirection: 'flat',
    tone: 'positive',
    sourceBlockId: 'decisions',
    action: {
      scroll: '#sec-decisions',
      query: { queue: 'margin' },
      sourceScreen: 'action-center',
    },
  }),
  makeTile({
    id: 'blocked_quotes',
    label: 'Blocked quotes',
    value: '7',
    delta: null,
    deltaDirection: 'flat',
    tone: 'warning',
    sourceBlockId: 'quotes',
    action: {
      route: '/quotes',
      query: { status: 'blocked', source: 'action-center' },
      toast: 'Opening blocked quotes.',
      sourceScreen: 'action-center',
    },
  }),
  makeTile({
    id: 'model_trust',
    label: 'Model trust',
    value: '82%',
    delta: null,
    deltaDirection: 'flat',
    tone: 'neutral',
    sourceBlockId: 'trust',
    action: {
      sourceScreen: 'action-center',
      drawer: {
        title: 'Pattern accuracy details',
        items: [{ label: 'Current value', value: '82%' }],
      },
      toast: 'Pattern accuracy transparency opened',
      toastSeverity: 'info',
    },
  }),
];

function buildPayload(overrides?: Partial<ActionCenterData['meta']>): ActionCenterData {
  const clone = structuredClone(actionCenterMock) as ActionCenterData;
  clone.summary = { tiles: TILES };
  clone.meta = {
    generatedAt: '2026-05-18T08:00:00Z',
    traceId: 'trace-summary-1',
    blocks: {
      header: { status: 'live' },
      movableHero: { status: 'live' },
      buckets: { status: 'live' },
      decisions: { status: 'live' },
      trust: { status: 'live' },
      lostQuote: { status: 'live' },
      skuTable: { status: 'live' },
      longTail: { status: 'live' },
      negotiation: { status: 'live' },
      rejections: { status: 'live' },
      audit: { status: 'live' },
      abTests: { status: 'live' },
      summary: { status: 'live' },
    },
    ...overrides,
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

describe('TodaySummaryStrip', () => {
  afterEach(() => {
    cleanup();
    act(() => {
      useAuthStore.setState({ user: null, isLoading: false });
    });
    useActionCenter.mockReset();
  });

  it('renders the 5 tiles in the canonical id order', () => {
    const onAction = vi.fn();
    render(<TodaySummaryStrip tiles={TILES} onAction={onAction} />);
    const renderedIds = TILES.map((t) =>
      screen.getByTestId(`summary-tile-${t.id}`).getAttribute('data-testid'),
    );
    expect(renderedIds).toEqual([
      'summary-tile-movable_revenue',
      'summary-tile-open_actions',
      'summary-tile-recoverable_margin',
      'summary-tile-blocked_quotes',
      'summary-tile-model_trust',
    ]);
  });

  it('renders each tile value from the payload (no literals)', () => {
    const onAction = vi.fn();
    render(<TodaySummaryStrip tiles={TILES} onAction={onAction} />);
    expect(screen.getByTestId('summary-tile-movable_revenue')).toHaveTextContent(
      '€3.88M',
    );
    expect(screen.getByTestId('summary-tile-open_actions')).toHaveTextContent('4');
    expect(screen.getByTestId('summary-tile-recoverable_margin')).toHaveTextContent(
      '€124k',
    );
    expect(screen.getByTestId('summary-tile-blocked_quotes')).toHaveTextContent('7');
    expect(screen.getByTestId('summary-tile-model_trust')).toHaveTextContent('82%');
  });

  it('dispatches the drawer intent when model_trust is clicked', () => {
    const onAction = vi.fn();
    render(<TodaySummaryStrip tiles={TILES} onAction={onAction} />);
    fireEvent.click(screen.getByTestId('summary-tile-model_trust'));
    expect(onAction).toHaveBeenCalledTimes(1);
    const intent = onAction.mock.calls[0][0];
    expect(intent.drawer).toBeDefined();
    expect(intent.drawer.title).toMatch(/Pattern accuracy/i);
  });

  it('dispatches the /quotes?status=blocked route when blocked_quotes is clicked', () => {
    const onAction = vi.fn();
    render(<TodaySummaryStrip tiles={TILES} onAction={onAction} />);
    fireEvent.click(screen.getByTestId('summary-tile-blocked_quotes'));
    const intent = onAction.mock.calls[0][0];
    expect(intent.route).toBe('/quotes');
    expect(intent.query).toMatchObject({ status: 'blocked', source: 'action-center' });
  });

  it('dispatches a scroll intent for movable_revenue', () => {
    const onAction = vi.fn();
    render(<TodaySummaryStrip tiles={TILES} onAction={onAction} />);
    fireEvent.click(screen.getByTestId('summary-tile-movable_revenue'));
    expect(onAction.mock.calls[0][0].scroll).toBe('#sec-movable');
  });

  it('renders a lock chip and em-dash when locked', () => {
    const onAction = vi.fn();
    const lockedTiles: SummaryTile[] = [
      ...TILES.slice(0, 4),
      makeTile({
        id: 'model_trust',
        label: 'Model trust',
        value: null,
        locked: true,
        tone: 'neutral',
        deltaDirection: 'flat',
        sourceBlockId: 'trust',
        action: { drawer: { title: 'x' } },
      }),
    ];
    render(<TodaySummaryStrip tiles={lockedTiles} onAction={onAction} />);
    expect(screen.getByTestId('summary-tile-model_trust')).toHaveTextContent('—');
    expect(screen.getByTestId('summary-tile-model_trust-lock')).toBeInTheDocument();
  });

  it('renders DegradedBlock when meta.blocks.summary.status is degraded', () => {
    act(() => {
      useAuthStore.setState({ user: FRANK, isLoading: false });
    });
    const payload = buildPayload();
    payload.meta!.blocks.summary = {
      status: 'degraded',
      reason: 'Summary builder threw.',
    };
    useActionCenter.mockReturnValue({ data: payload, isLoading: false, error: null });

    render(withProviders(<ActionCenterPage />));

    expect(screen.getByText(/Today summary unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Summary builder threw/i)).toBeInTheDocument();
    // Tiles are NOT rendered when degraded.
    expect(screen.queryByTestId('summary-tile-movable_revenue')).not.toBeInTheDocument();
  });

  it('renders all 5 tiles inside the page when summary status is live', () => {
    act(() => {
      useAuthStore.setState({ user: FRANK, isLoading: false });
    });
    useActionCenter.mockReturnValue({ data: buildPayload(), isLoading: false, error: null });
    render(withProviders(<ActionCenterPage />));
    expect(screen.getByTestId('summary-tile-movable_revenue')).toBeInTheDocument();
    expect(screen.getByTestId('summary-tile-blocked_quotes')).toBeInTheDocument();
  });
});
