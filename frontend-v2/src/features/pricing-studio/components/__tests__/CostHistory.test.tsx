// Pricing Studio v3 / Phase 3 — CostHistory tests.
//
// Verifies the Phase 3 wiring: when the BFF ships `cost_history.points`,
// the bottom sparkline renders from the live values instead of the
// legacy hardcoded SVG point strings; sparkline click + outlook pill
// both call `onOpenCostDrawer`.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CostHistory } from '../CostHistory';
import { costHistory } from './fixtures-phase3';
import type { CostPane, HistoryRow } from '@/types/studio';

const baseCost: CostPane = {
  paneSub: 'this SKU · 4yr',
  unitCost: '€4.74',
  floorCalc: 'floor = unit_cost / (1 − target_margin)',
  components: [
    { key: 'material', name: 'Material', pct: 38 },
    { key: 'labor', name: 'Labor', pct: 24 },
    { key: 'outsourcing', name: 'Outsourcing', pct: 30 },
    { key: 'overhead', name: 'Overhead', pct: 8 },
  ],
  note: 'Outsourcing 30% (flange-machining)',
  trajectory: {
    title: 'Material cost vs quoted price',
    delta: 'Outsourcing +12% 2022→2025',
    yearStart: '2022',
    yearEnd: '2025',
    materialPoints: '4,30 84,24 164,16 236,8',
    quotedPoints: '4,28 84,25 164,18 236,12',
    legend: 'gap = pass-through deficit',
  },
};

const baseHistory: HistoryRow[] = [
  { date: '2024-Q1', move: '€148 → €156 (+5.4%)', vol: 'vol +1%', volTone: 'up', by: 'Frank', hash: 'b21f0c' },
];

describe('CostHistory', () => {
  it('falls back to legacy hardcoded points when costHistory is not supplied', () => {
    render(<CostHistory cost={baseCost} history={baseHistory} />);
    const sparkline = screen.getByTestId('cost-traj-sparkline');
    const materialLine = sparkline.querySelector('polyline');
    expect(materialLine?.getAttribute('points')).toBe('4,30 84,24 164,16 236,8');
  });

  it('uses BFF cost_history.points for the material sparkline when supplied', () => {
    render(
      <CostHistory
        cost={baseCost}
        history={baseHistory}
        costHistory={costHistory()}
      />,
    );
    const sparkline = screen.getByTestId('cost-traj-sparkline');
    const lines = sparkline.querySelectorAll('polyline');
    // First polyline (material) must NOT be the hardcoded legacy string.
    const materialPts = lines[0].getAttribute('points') ?? '';
    expect(materialPts).not.toBe('4,30 84,24 164,16 236,8');
    // Should produce 5 comma-pair points (one per quarter in the fixture).
    expect(materialPts.trim().split(/\s+/)).toHaveLength(5);
  });

  it('clicking the sparkline calls onOpenCostDrawer', () => {
    const onOpen = vi.fn();
    render(
      <CostHistory
        cost={baseCost}
        history={baseHistory}
        costHistory={costHistory()}
        onOpenCostDrawer={onOpen}
      />,
    );
    fireEvent.click(screen.getByTestId('cost-traj-sparkline'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders the "View 6mo outlook" pill when onOpenCostDrawer is wired and fires it on click', () => {
    const onOpen = vi.fn();
    render(
      <CostHistory
        cost={baseCost}
        history={baseHistory}
        costHistory={costHistory()}
        onOpenCostDrawer={onOpen}
      />,
    );
    const pill = screen.getByTestId('cost-outlook-pill');
    expect(pill).toBeInTheDocument();
    fireEvent.click(pill);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not render the outlook pill when no onOpenCostDrawer handler is supplied', () => {
    render(<CostHistory cost={baseCost} history={baseHistory} />);
    expect(screen.queryByTestId('cost-outlook-pill')).not.toBeInTheDocument();
  });
});
