// v2.2 Phase C — verifies that the 10 diagnostic cards which do NOT honor the
// active page-level filter render an unfiltered `FilterScopeBadge` when a
// FilterScope is active. One test per card; all card data is faked with
// minimal fixtures.

import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { CalibrationCard } from './CalibrationCard';
import { CommodityTrajectoriesCard } from './CommodityTrajectoriesCard';
import { CostDecompositionCard } from './CostDecompositionCard';
import { DistributionGrid } from './DistributionGrid';
import { InputCostTrajectory } from './InputCostTrajectory';
import { MarginTrajectoryCard } from './MarginTrajectoryCard';
import { QuoteToRevenueBridge } from './QuoteToRevenueBridge';
import { SeasonalOverlayCard } from './SeasonalOverlayCard';
import { TornadoCard } from './TornadoCard';
import { WalkForward } from './WalkForward';

import type {
  BacktestPanel,
  CalibrationPayload,
  CommodityTrajectories,
  CostDecomposition,
  FilterScope,
  ForecastDistributions,
  ForecastTornado,
  InputCostTrajectory as InputCostTrajectoryData,
  MarginTrajectory,
  QuoteToRevenue,
  SeasonalOverlay,
} from '@/types/forecast';

const SCOPE: FilterScope = { cluster: 'BKAES', tier: 'A' };

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function assertUnfilteredBadge() {
  const badges = screen.getAllByTestId('filter-scope-badge');
  // Pick the first badge that is the unfiltered variant — multiple cards may
  // ship nested badges but the one we just rendered is at the top.
  const unfiltered = badges.find((el) => el.getAttribute('data-variant') === 'unfiltered');
  expect(unfiltered).toBeDefined();
  expect(unfiltered!.textContent).toMatch(/unfiltered/i);
}

// ---- fixtures ---------------------------------------------------------------

const marginTrajectory: MarginTrajectory = {
  historical: [{ quarter: 'Q1 25', margin: 62.0 }],
  projected: [{ quarter: 'Q2 25', margin: 61.0, low: 58.0, high: 64.0 }],
  floor: 60,
  crossesFloorAt: null,
  methodologyNote: 'test',
};

const costDecomposition: CostDecomposition = {
  quarters: ['Q1 25'],
  layers: [
    { name: 'Material % of revenue', values: [30], trendDirection: 'flat', insight: 'flat' },
  ],
};

const seasonalOverlay: SeasonalOverlay = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  indices: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  currentMonthLabel: 'May',
  currentMonthExpected: 100,
  currentMonthActual: 102,
  deviationPct: 2,
  deviationTone: 'green',
  note: 'test',
};

const commodityTrajectories: CommodityTrajectories = {
  quarters: ['Q1 25'],
  groups: [{ id: 'BKAES', name: 'BKAES', series: [60], slopePerYear: -1 }],
};

const inputCost: InputCostTrajectoryData = {
  tiles: [
    {
      label: 'Steel',
      value: '€1,000',
      unit: '/t',
      capRich: { tone: 'red', arrow: '↑ +1%', main: 'rising', rest: 'still' },
    },
  ],
  stress: {
    title: 'Stress',
    sub: 'sub',
    bullets: ['bullet'],
    centralLabel: 'central',
    centralValue: 'value',
    centralCaption: 'caption',
  },
};

const quoteToRevenue: QuoteToRevenue = {
  source: 'seed',
  horizons: [
    {
      horizonDays: 30,
      openQuotes: 10,
      openPipelineEur: 100_000,
      winRate: 0.5,
      avgMargin: 0.2,
      expectedRevenue: 50_000,
      expectedGrossProfit: 10_000,
      breakdown: { byTier: [{ tier: 'A', share: 1, expectedRevenue: 50_000 }] },
    },
  ],
};

const walkForward: BacktestPanel = {
  series: [{ month: 'BKAES', mape: 4.5, n: 12 }],
  target: 5,
  kpis: [],
  source: 'live',
};

const calibration: CalibrationPayload = {
  nominalBand: 0.8,
  source: 'live',
  rows: [
    {
      clusterId: 'BKAES',
      actualHitRatePct: null,
      nBacktests: 12,
      tone: 'green',
      mapePct: 4.5,
      directionalPct: 80,
    },
  ],
};

const tornado: ForecastTornado = {
  computedAt: '2026-05-14T00:00:00Z',
  metric: 'revenue',
  horizonMonths: 12,
  entityType: 'commodity_group',
  n_simulations: 1000,
  shockMode: 'normal',
  source: 'seed',
  bars: [
    {
      inputName: 'steel',
      deltaPositive: 0.5,
      deltaNegative: -0.5,
      perturbationSize: 1,
      unit: 'pct',
      deltaUnit: 'pp',
    },
  ],
};

const distributions: ForecastDistributions = {
  computedAt: '2026-05-14T00:00:00Z',
  metric: 'revenue',
  horizonMonths: 12,
  entityType: 'commodity_group',
  source: 'seed',
  rows: [
    {
      entityId: 'BKAES',
      entityName: 'BKAES',
      lastActual: 100,
      median: 100,
      mean: 100,
      p5: 80,
      p25: 90,
      p75: 110,
      p95: 120,
      pBelowThreshold: 5,
      thresholdValue: 90,
      thresholdKind: 'below',
      shockMode: 'normal',
      nSimulations: 1000,
    },
  ],
};

// ---- tests ------------------------------------------------------------------

describe('FilterScope propagation (v2.2 Phase C)', () => {
  it('MarginTrajectoryCard renders unfiltered badge when scope is active', () => {
    wrap(<MarginTrajectoryCard data={marginTrajectory} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('CostDecompositionCard renders unfiltered badge when scope is active', () => {
    wrap(<CostDecompositionCard data={costDecomposition} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('SeasonalOverlayCard renders unfiltered badge when scope is active', () => {
    wrap(<SeasonalOverlayCard data={seasonalOverlay} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('CommodityTrajectoriesCard renders unfiltered badge when scope is active', () => {
    wrap(<CommodityTrajectoriesCard data={commodityTrajectories} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('InputCostTrajectory renders unfiltered badge when scope is active', () => {
    wrap(<InputCostTrajectory data={inputCost} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('QuoteToRevenueBridge renders unfiltered badge when scope is active', () => {
    wrap(<QuoteToRevenueBridge data={quoteToRevenue} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('WalkForward renders unfiltered badge when scope is active', () => {
    wrap(<WalkForward panel={walkForward} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('CalibrationCard renders unfiltered badge when scope is active', () => {
    wrap(<CalibrationCard data={calibration} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('TornadoCard renders unfiltered badge when scope is active', () => {
    wrap(<TornadoCard tornado={tornado} filterScope={SCOPE} />);
    assertUnfilteredBadge();
  });

  it('DistributionGrid renders unfiltered badge when scope is active', () => {
    const { container } = wrap(
      <DistributionGrid distributions={distributions} filterScope={SCOPE} />,
    );
    // Multiple FilterScopeBadge-rendering surfaces are possible inside the
    // card grid; scope the assertion to the section header.
    const header = container.querySelector('h2');
    expect(header).not.toBeNull();
    const badge = within(header!).getByTestId('filter-scope-badge');
    expect(badge.getAttribute('data-variant')).toBe('unfiltered');
  });

  it('renders no badge when no scope is active (MarginTrajectoryCard sanity check)', () => {
    wrap(<MarginTrajectoryCard data={marginTrajectory} />);
    expect(screen.queryByTestId('filter-scope-badge')).toBeNull();
  });
});
