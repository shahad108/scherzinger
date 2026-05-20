// Phase 1 — Shared simulator types.
//
// These shapes are re-exported from `types/forecast.ts` for convenience but
// also live here for cross-feature import (e.g. when the AI Briefing or
// Margin Cockpit deep-links into the tornado / distribution drawer).

export type {
  DistributionRow,
  ForecastDistributions,
  ForecastTornado,
  ShockMode,
  SimulatorEntityType,
  SimulatorHorizon,
  SimulatorMetric,
  TornadoBar,
  TornadoClusterDelta,
} from './forecast';

export interface SimulatorQuery {
  entityType?: 'commodity_group' | 'customer' | 'business_unit';
  metric?: 'margin' | 'revenue' | 'quantity' | 'volume';
  horizonMonths?: number;
}
