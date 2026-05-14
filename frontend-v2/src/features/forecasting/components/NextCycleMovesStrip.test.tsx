import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextCycleMovesStrip } from './NextCycleMovesStrip';
import type { NextMove } from '@/types/forecast';

const moves: NextMove[] = [
  {
    id: 'm1', rank: 1, cluster: 'BKAGG',
    headline: 'BKAGG: 12 SKUs at risk · €420k impact',
    forecastImpactEur: 420_000,
    sourceSignal: 'cost crossing list price',
    actionIntent: { kind: 'open_studio', payload: { cluster: 'BKAGG' } },
  },
  {
    id: 'm2', rank: 2, cluster: 'BKAES',
    headline: 'BKAES: renewal queue · 8 articles',
    forecastImpactEur: 180_000,
    sourceSignal: 'renewal window opening in 30d',
    actionIntent: { kind: 'open_renewals', payload: { cluster: 'BKAES' } },
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

  it('dispatches forecast:action-intent on Open click', () => {
    const listener = vi.fn();
    window.addEventListener('forecast:action-intent', listener as EventListener);
    render(<NextCycleMovesStrip moves={moves} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Open/i })[0]);
    expect(listener).toHaveBeenCalled();
    const evt = listener.mock.calls[0][0] as CustomEvent;
    expect(evt.detail.intent.kind).toBe('open_studio');
    expect(evt.detail.move.id).toBe('m1');
    window.removeEventListener('forecast:action-intent', listener as EventListener);
  });
});
