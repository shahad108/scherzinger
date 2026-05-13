export type ForecastMode = 'revenue' | 'margin' | 'volume';
export type ConfTone = 'h' | 'm' | 't';
export type Tier = 'A' | 'B' | 'C' | 'D';
export type ClusterConf = 'green' | 'amber' | 'red';
export type TrendDir = 'up' | 'down' | 'flat';

export interface ForecastHeader {
  greeting: string;
  subPill: string;
  stats: { label: string; value: string }[];
  modeLabel: string;
  filters: { label: string }[];
}

export interface ForecastSeriesPoint {
  month: string;
  primary: number;
  low: number;
  high: number;
  actual?: number;
  // Phase 6 — named prediction-interval bands.
  p50?: number;
  p80Low?: number;
  p80High?: number;
  p95Low?: number;
  p95High?: number;
}

export interface ForecastIntervalBand {
  id: 'p50' | 'p80' | 'p95';
  name: string;
  desc: string;
  calibration: string | null;
}

export interface ForecastIntervals {
  title: string;
  bands: ForecastIntervalBand[];
  disclosure: string;
  calibration: {
    windowMonths: number;
    p80Hit: number;
    p95Hit: number;
    p80HitPct: number | null;
    p95HitPct: number | null;
    footnote: string;
  };
  heuristic: { label: string; rule: string; qualifier?: string | null };
}

export interface ForecastHero {
  caption: string;
  series: ForecastSeriesPoint[];
  movers: { label: string; value: string; tone: 'red' | 'green' | 'amber'; sub: string }[];
  movableLockedSplit: {
    label: string;
    value: string;
    movablePct: number;
    sub: string;
  };
  whyBandMoves: {
    title: string;
    sub: string;
    rows: { label: string; value: string; tone: 'red' | 'green' | 'amber'; sub: string }[];
  };
  intervals?: ForecastIntervals;
}

export interface ClusterCard {
  id: string;
  ltm: string;
  forecast: string;
  bandText: string;
  confidence: string;
  tone: 'status' | 'amber' | 'red';
}

export interface BacktestKpi {
  label: string;
  value: string;
  caption: string;
}

export interface BacktestPanel {
  series: { month: string; mape: number }[];
  target: number;
  kpis: BacktestKpi[];
}

export interface InputCostTile {
  label: string;
  value: string;
  unit: string;
  capRich: { tone: 'red' | 'green' | 'amber' | 'ink-3'; arrow: string; main: string; rest: string };
}

export interface InputCostStress {
  title: string;
  sub: string;
  bullets: string[];
  centralLabel: string;
  centralValue: string;
  centralCaption: string;
}

export interface InputCostTrajectory {
  tiles: InputCostTile[];
  stress: InputCostStress;
}

export interface SkuMixRow {
  aid: string;
  desc: string;
  fc: string;
  share: string;
}

export interface CustomerRow {
  customerId: string;
  tier: Tier;
  cluster: { label: string; conf: ClusterConf };
  ltm: string;
  bookedPct: number;
  bookedText: string;
  forecast: string;
  band: string;
  trendDir: TrendDir;
  trendLabel: string;
  vpVol: string;
  vpPrc: string;
  conf: ConfTone;
  confLabel: string;
  renewal: string;
  belowBand?: boolean;
  drillTitle?: string;
  drill?: SkuMixRow[];
}

export interface SkuRow {
  aid: string;
  cluster: { label: string; conf: ClusterConf };
  desc: string;
  ltmVolume: string;
  forecastVolume: string;
  band: string;
  margin: string;
  marginPos?: boolean;
  conf: ConfTone;
  confLabel: string;
  topCustomer: string;
  primary?: boolean;
  abTest?: boolean;
  queue?: boolean;
}

export interface ParetoLayer {
  customer: { rows: CustomerRow[]; footnote: string };
  sku: { rows: SkuRow[]; footnote: string };
}

export interface FloorRow {
  tier: Tier;
  customerId: string;
  article: string;
  currentPrice: string;
  floor: string;
  floorPos?: boolean;
  headroom: string;
  headroomTone: 'pos' | 'neg' | 'muted';
  movableShare: string;
  movableTone: 'pos' | 'neg';
  cluster: { label: string; conf: ClusterConf };
  next: string;
  nextLink?: string;
  belowFloor?: boolean;
  primary?: boolean;
  queue?: boolean;
  renewalNote?: boolean;
  locked?: boolean;
}

export interface NewProductCard {
  rank: number;
  title: string;
  description: string;
  cluster: string;
  tone: 'status' | 'amber' | 'red';
  confidence: string;
  primaryLabel: string;
  primaryAction: string;
  secondaryLabel: string;
}

export interface NewProductForecast {
  stats: { num: string; label: string }[];
  series: { month: string; value: number }[];
  cards: NewProductCard[];
}

// Phase 1 — simulator surface (tornado + per-entity distributions + mode toggle).
export type SimulatorMetric = 'margin' | 'revenue' | 'quantity';
export type SimulatorHorizon = 3 | 6 | 12;
export type SimulatorEntityType = 'commodity_group' | 'customer' | 'business_unit';
export type ShockMode = 'bootstrap' | 'normal' | 'degenerate';

export interface TornadoClusterDelta {
  cluster: string;
  delta: number;
}

export interface TornadoBar {
  inputName: string;
  unit: string;
  perturbationSize: number | null;
  /** Median delta when this input is perturbed upward. Sign indicates direction. */
  deltaPositive: number;
  /** Median delta when this input is perturbed downward. */
  deltaNegative: number;
  /** P5/P95 of the entire distribution under the perturbation (optional). */
  p5?: number | null;
  p95?: number | null;
  /** Human-readable unit string for the delta value (e.g. "pp margin"). */
  deltaUnit: string;
  clusterBreakdown?: TornadoClusterDelta[] | null;
}

export interface ForecastTornado {
  computedAt: string;
  metric: SimulatorMetric;
  horizonMonths: number;
  entityType: SimulatorEntityType;
  n_simulations: number;
  shockMode: ShockMode;
  source: 'seed' | 'live';
  bars: TornadoBar[];
}

export interface DistributionRow {
  entityId: string;
  entityName: string;
  lastActual: number | null;
  median: number | null;
  mean: number | null;
  p5: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  pBelowThreshold: number | null;
  thresholdValue: number | null;
  thresholdKind: string;
  shockMode: ShockMode;
  nSimulations: number;
}

export interface ForecastDistributions {
  computedAt: string;
  metric: SimulatorMetric;
  horizonMonths: number;
  entityType: SimulatorEntityType;
  source: 'seed' | 'live';
  rows: DistributionRow[];
}

export interface ForecastModeState {
  active: ForecastMode;
  horizonMonths: SimulatorHorizon;
}

// Phase 2 — Methodology + audit lineage + accuracy badges.
export interface MethodologySource {
  name: string;
  kind: 'internal' | 'external';
  description: string;
  lastFetchedAt: string;
}

export interface MethodologyAssumption {
  label: string;
  value: string;
  note?: string;
}

export interface ModelSpec {
  modelName: string;
  version: string;
  trainedAt: string | null;
  holdoutMonths: number | null;
  entityType: string;
  metric: string;
  metricValue: number | null;
  nObservations: number | null;
  notes?: string | null;
}

export interface ForecastMethodology {
  lastReviewedAt: string;
  validationReportMd: string | null;
  sources: MethodologySource[];
  assumptions: MethodologyAssumption[];
  models: ModelSpec[];
  limitations: string[];
}

export interface AccuracyBadgeData {
  metric: 'mape' | 'auc_roc' | 'calibration_p80_hit' | 'wape';
  value: number;
  n: number;
  horizonMonths: number;
  clusterId?: string;
  modelId?: string;
}

export interface LineageAuditEntry {
  kind: string;
  targetType: string;
  targetId: string;
  at: string;
  hash: string;
}

export interface LineagePayload {
  entityType: string;
  entityId: string | null;
  metric: string | null;
  models: (ModelSpec & { featureList?: string[]; entityId?: string | null })[];
  auditChain: LineageAuditEntry[];
  sources: MethodologySource[];
}

export interface ForecastShell {
  header: ForecastHeader;
  hero: ForecastHero;
  clusters: ClusterCard[];
  walkForward: BacktestPanel;
  inputCost: InputCostTrajectory;
  pareto: ParetoLayer;
  priceFloor: FloorRow[];
  priceFloorFootnote: string;
  newProduct: NewProductForecast;
  // Phase 1 — simulator surface.
  mode: ForecastModeState;
  tornado: ForecastTornado;
  distributions: ForecastDistributions;
  // Phase 2 — methodology + lineage.
  methodology: ForecastMethodology;
}
