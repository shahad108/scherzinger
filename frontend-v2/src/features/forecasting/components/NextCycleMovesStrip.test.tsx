import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextCycleMovesStrip } from './NextCycleMovesStrip';
import type { NextMove } from '@/types/forecast';

// v2.2 Phase B — the strip now calls useUiAction() directly. Mock it so the
// test asserts the mapped ActionIntent without booting the full router/store
// stack.
const runActionMock = vi.fn();
vi.mock('@/hooks/useUiAction', () => ({
  useUiAction: () => runActionMock,
}));

beforeEach(() => {
  runActionMock.mockReset();
});

const moves: NextMove[] = [
  {
    id: 'm1',
    rank: 1,
    cluster: 'BKAGG',
    headline: 'BKAGG: 12 SKUs at risk · €420k impact',
    forecastImpactEur: 420_000,
    sourceSignal: 'cost crossing list price',
    actionIntent: {
      kind: 'partial_accept',
      payload: {
        cluster: 'BKAGG',
        sourceScreen: 'forecasting',
        sourceKind: 'next-cycle-move',
        headline: 'BKAGG: 12 SKUs at risk · €420k impact',
      },
    },
  },
  {
    id: 'm2',
    rank: 2,
    cluster: 'BKAES',
    headline: 'BKAES: renewal queue · 8 articles',
    forecastImpactEur: 180_000,
    sourceSignal: 'renewal window opening in 30d',
    actionIntent: {
      kind: 'queue_renewal',
      payload: {
        cluster: 'BKAES',
        sourceScreen: 'forecasting',
        sourceKind: 'next-cycle-move',
        headline: 'BKAES: renewal queue · 8 articles',
        articles: ['A-100', 'A-101'],
      },
    },
  },
];

describe('NextCycleMovesStrip', () => {
  it('renders null when no moves', () => {
    const { container } = render(<NextCycleMovesStrip moves={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one card per move in rank order', () => {
    render(<NextCycleMovesStrip moves={moves} />);
    const cards = screen.getAllByTestId('next-cycle-move-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toMatch(/BKAGG/);
    expect(cards[1].textContent).toMatch(/BKAES/);
  });

  it('dispatches a mapped ActionIntent (partial_accept) on Open click', () => {
    render(<NextCycleMovesStrip moves={moves} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Open/i })[0]);

    expect(runActionMock).toHaveBeenCalledTimes(1);
    const intent = runActionMock.mock.calls[0][0];
    expect(intent.drawer).toBeDefined();
    expect(intent.drawer.formKind).toBe('partial_accept');
    expect(intent.drawer.title).toMatch(/Partial acceptance/i);
    expect(intent.drawer.context.cluster).toBe('BKAGG');
    expect(intent.drawer.context.sourceScreen).toBe('forecasting');
    expect(intent.drawer.context.sourceKind).toBe('next-cycle-move');
    expect(intent.drawer.context.headline).toMatch(/BKAGG/);
  });

  it('dispatches queue_renewal with articles payload preserved', () => {
    render(<NextCycleMovesStrip moves={moves} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Open/i })[1]);

    expect(runActionMock).toHaveBeenCalledTimes(1);
    const intent = runActionMock.mock.calls[0][0];
    expect(intent.drawer.formKind).toBe('queue_renewal');
    expect(intent.drawer.title).toMatch(/Queue renewal/i);
    expect(intent.drawer.context.cluster).toBe('BKAES');
    expect(intent.drawer.context.articles).toEqual(['A-100', 'A-101']);
  });

  it('falls back to a read-only drawer for unknown intent kinds', () => {
    const unknown: NextMove[] = [
      {
        id: 'mx',
        rank: 1,
        cluster: 'MBDIV',
        headline: 'MBDIV: review recommended',
        forecastImpactEur: 50_000,
        sourceSignal: 'anomaly',
        actionIntent: { kind: 'open_studio', payload: { cluster: 'MBDIV' } },
      },
    ];
    render(<NextCycleMovesStrip moves={unknown} />);
    fireEvent.click(screen.getByRole('button', { name: /Open/i }));

    const intent = runActionMock.mock.calls[0][0];
    expect(intent.drawer.formKind).toBeUndefined();
    expect(intent.drawer.items?.some((i: { label: string }) => i.label === 'Cluster')).toBe(true);
    expect(intent.drawer.context.cluster).toBe('MBDIV');
  });
});
