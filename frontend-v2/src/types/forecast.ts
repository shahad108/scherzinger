export type ForecastMode = 'revenue' | 'margin' | 'volume';
export type ConfTone = 'h' | 'm' | 't';
export type Tier = 'A' | 'B' | 'C' | 'D';
export type ClusterConf = 'green' | 'amber' | 'red';
export type TrendDir = 'up' | 'down' | 'flat';

// Forecast override types — v2 redesign (click-to-actual + ML feedback)
export type OverrideSource = 'erp' | 'manual' | 'contracted' | 'other';
export type OverrideConfidence = 'low' | 'medium' | 'high';

export interface ForecastOverride {
  id: string;
  month: string;            // YYYY-MM
  cluster: string | null;
  mode: ForecastMode;
  actual: number;
  modelP50: number;
  adjustmentPct: number;
  source: OverrideSource;
  confidence: OverrideConfidence;
  reason: string;
  author: string;
  createdAt: string;
  fvaDelta: number | null;
}

// Forecast annotation types — v2.2 Phase H (comment layer)
export type AnnotationTargetKind = 'month' | 'cluster';

export interface AnnotationTarget {
  kind: AnnotationTargetKind;
  /** YYYY-MM for `month`; cluster code for `cluster`. */
  value: string;
}

export interface ForecastAnnotation {
  id: string;
  target: AnnotationTarget;
  body: string;
  author: string;
  createdAt: string;
}

export interface HeroKPI {
  forecast12mo: { value: number; unit: 'EUR' | 'pct' | 'units' };
  varianceVsPlan: { value: number; pct: number; trend: TrendDir };
  mape: { value: number; window: string };
  fva: { score: number; verdict: 'helping' | 'neutral' | 'hurting'; n: number };
}

export interface PVMBar {
  factor: 'price' | 'volume' | 'mix' | 'churn' | 'fx' | 'other';
  delta: number;
  pctOfTotal: number;
}

// === v2.1 — plan-first, pocket-margin, prescriptive bridge ===

export interface PlanPoint {
  month: string;            // YYYY-MM
  // `plan` is nullable: the BFF returns null for the entire series when
  // no authoritative plan_targets table is available for the dataset.
  // (DATA-AUDIT-2026-05-17, defect #4)
  plan: number | null;
  actual: number | null;    // null for future months
}

export interface BlockMeta {
  status: 'ok' | 'degraded' | 'missing';
  reason?: string;
}

export interface PlanResetEntry {
  at: string;               // ISO datetime
  by: string;
  reason: string;
  priorValue: number;
}

export interface PlanVarianceAttribution {
  price: number;
  volume: number;
  mix: number;
  cost: number;
  other?: number;
}

export interface PlanTracking {
  points: PlanPoint[];
  // Nullable when the block is degraded — see PlanPoint.plan note.
  cumulativeGapEur: number | null;
  cumulativeGapPct: number | null;
  recentMonthAttribution: PlanVarianceAttribution | null;
  resetLog: PlanResetEntry[];
  meta?: BlockMeta;
}

export interface PocketStep {
  name: 'list' | 'quoted' | 'booked' | 'invoiced' | 'db2';
  value: number;
  leakagePct?: number | null;
}

export interface PocketClusterBand {
  cluster: string;
  histogram: { bin: string; count: number }[];
  median: number;
  p10: number;
  p90: number;
}

export interface PocketWaterfall {
  steps: PocketStep[];
  perCluster: PocketClusterBand[];
  unit: 'eur_per_unit' | 'eur_total' | 'pct_of_list';
}

export interface BiasRow {
  cluster: string;
  cmeOverMad: number;
  hitRatePct: number;
  trailing6moDirection: 'over' | 'under' | 'flat';
}

export interface BiasPanel {
  rows: BiasRow[];
  windowMonths: number;
  footnote?: string;
}

export interface NextMove {
  id: string;
  rank: number;
  cluster: string | null;
  headline: string;
  forecastImpactEur: number;
  sourceSignal: string;
  actionIntent: {
    kind: string;
    payload: Record<string, unknown>;
  };
}

// v2.2 Phase D — per-cluster PA/PR rejection-code lens.
export interface WinLossSparklinePoint {
  month: string; // YYYY-MM
  paPct: number;
  prPct: number;
}

export interface WinLossRow {
  cluster: string;
  paPct: number;
  prPct: number;
  sample: number;
  monthlySparkline: WinLossSparklinePoint[];
}

export interface WinLossPanel {
  window: { days: number; anchor: string };
  rows: WinLossRow[];
}

// v2.2 Phase E — forward list-price erosion projection per cluster.
export interface ErosionProjectionPoint {
  month: string;          // YYYY-MM
  listPrice: number;
  floor: number;
}

export interface ErosionCadence {
  updatesEveryMonths: number | null;
  benchmarkMonths: number;
}

export interface ErosionProjectionRow {
  cluster: string;
  currentListPrice: number;
  currentFloor: number;
  monthlyListSlope: number;
  monthlyCostSlope: number;
  projection: ErosionProjectionPoint[];
  crossoverMonth: string | null;
  cadence: ErosionCadence;
}

export interface ErosionProjection {
  horizonMonths: number;
  rows: ErosionProjectionRow[];
}

// v2.2 Phase G — FVA override drill-down summary.
export interface FvaSummary {
  period: string;
  entered: number;
  improved: number;
  worsened: number;
  neutral: number;
  netFvaDeltaPp: number;
}

// v2.2 Phase F — At-Risk Revenue tier-stacked bar.
export interface AtRiskTierRow {
  tier: string;
  forecastEur: number;
  atRiskEur: number;
  safeEur: number;
  atRiskShare: number;
  customerCount: number;
}

export interface AtRiskRevenue {
  tiers: AtRiskTierRow[];
  totalForecastEur: number;
  totalAtRiskEur: number;
}

export interface FilterScope {
  tier?: string;
  family?: string;
  cluster?: string;
  scenarioId?: string;
}

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
  // v2.1 — pipeline-implied P50 (open quotes × win_prob aggregated by close month).
  pipelineP50?: number;
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
  moversSource?: 'live' | 'synthetic';
  movableLockedSource?: 'live' | 'synthetic';
  whyBandMovesSource?: 'live' | 'synthetic';
  // Phase 2 (forecast redesign v2) — KPI strip inputs. All optional; the v2
  // shell falls back to derived/zero values when omitted (mock data is fine).
  forecast12moTotal?: number;
  varianceVsPlanPct?: number;
  mapeTrailing6mo?: number;
  fva?: { score: number; verdict: 'helping' | 'neutral' | 'hurting'; n: number };
}

export interface ClusterCard {
  id: string;
  ltm: string;
  forecast: string;
  bandText: string;
  confidence: string;
  tone: 'status' | 'amber' | 'red';
  // Phase 4.5: real per-cluster backtest MAPE from the backend (0-1).
  mape?: number | null;
  directional?: number | null;
  predictedMargin?: number;
  predictedLow?: number;
  predictedHigh?: number;
  ltmRevenue?: number;
  model?: string;
}

export interface BacktestKpi {
  label: string;
  value: string;
  caption: string;
}

export interface BacktestMethodRow {
  model: string;
  modelLabel: string;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  directional: number | null;
  nTestPeriods: number | null;
  trainStart: string | null;
  trainEnd: string | null;
  testStart: string | null;
  testEnd: string | null;
  isWinnerMape: boolean;
  isWinnerMae: boolean;
  isWinnerRmse: boolean;
  isWinnerDirectional: boolean;
}

export interface BacktestMethodComparison {
  models: BacktestMethodRow[];
  winner: string | null;
  winnerNote?: string | null;
  trainWindow?: string | null;
  testWindow?: string | null;
  horizonMonths?: number;
}

export interface BacktestPanel {
  series: { month: string; mape: number; model?: string; n?: number }[];
  target: number;
  kpis: BacktestKpi[];
  methodComparison?: BacktestMethodComparison;
  source?: 'live' | 'seed_fallback' | 'seed_no_db';
}

export interface InputCostTile {
  label: string;
  value: string;
  unit: string;
  capRich: { tone: 'red' | 'green' | 'amber' | 'ink-3'; arrow: string; main: string; rest: string };
  source?: 'internal-cost-trends' | 'external' | 'synthetic';
  indicator?: string;
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
  source?: 'live' | 'synthetic' | 'internal-cost-trends';
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
  /** Real per-cluster MAPE (fraction) from backtest_results. MBDIV → null. */
  mapeByCluster?: Record<string, number | null>;
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
  /** Real per-cluster MAPE (fraction) from backtest_results. Null when no history. */
  mape?: number | null;
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

// Phase 3 — diagnostic charts.
export interface MarginTrajectoryHistoricalPoint {
  quarter: string;
  margin: number;
}

export interface MarginTrajectoryProjectedPoint {
  quarter: string;
  margin: number;
  low: number;
  high: number;
}

export interface MarginTrajectory {
  historical: MarginTrajectoryHistoricalPoint[];
  projected: MarginTrajectoryProjectedPoint[];
  floor: number;
  crossesFloorAt: string | null;
  methodologyNote: string;
  source?: 'live' | 'synthetic';
}

export interface CostDecompositionLayer {
  name: string;
  values: number[];
  trendDirection: 'up' | 'down' | 'flat';
  insight: string;
}

export interface CostDecomposition {
  quarters: string[];
  layers: CostDecompositionLayer[];
  source?: 'live' | 'synthetic';
}

export interface SeasonalOverlay {
  months: string[];
  indices: number[];
  currentMonthLabel: string;
  currentMonthExpected: number;
  currentMonthActual: number;
  deviationPct: number;
  deviationTone: 'green' | 'amber' | 'red';
  note: string;
  source?: 'live' | 'synthetic';
}

export interface CommodityTrajectoryGroup {
  id: string;
  name: string;
  series: (number | null)[];
  slopePerYear: number;
}

export interface CommodityTrajectories {
  quarters: string[];
  groups: CommodityTrajectoryGroup[];
  source?: 'live' | 'synthetic';
}

// Phase 4 — per-customer slice.
export type RiskTier = 'high' | 'medium' | 'low' | 'unknown';

export interface CustomerAtRiskRow {
  customerId: string;
  customerName: string;
  lastActualRevenue: number | null;
  median12moRevenue: number | null;
  p5Revenue: number | null;
  p95Revenue: number | null;
  pBelow80pctOfCurrent: number | null;
  pChurn4Q: number | null;
  pMajorDecline: number | null;
  riskTier: RiskTier;
}

export interface CustomersPreview {
  topAtRisk: CustomerAtRiskRow[];
  allCount: number;
  methodology: {
    churnModel: string;
    revenueDeclineModel: string;
    windowMonths: number;
    thresholdRule: string;
  };
}

export interface CustomerDistribution {
  median: number | null;
  p5: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  pBelowThreshold: number | null;
  thresholdValue: number | null;
}

export interface CustomerDetail {
  customerId: string;
  customerName: string;
  riskTier: RiskTier;
  pChurn4Q?: number;
  pMajorDecline?: number;
  distributions: Record<string, Record<string, CustomerDistribution>>;
  historicalRevenue: { month: string; revenue: number }[];
}

// Phase 5 — Scenario library.
export type ScenarioVisibility = 'private' | 'team';
export type ScenarioInputKind = 'market_series' | 'internal_lever' | 'commodity_override';

export interface ScenarioInput {
  name: string;
  kind: ScenarioInputKind;
  unit?: string;
  perturbation: {
    type: 'pct' | 'absolute';
    value: number;
  };
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string;
  inputs: ScenarioInput[];
  visibility: ScenarioVisibility;
  ownerUserId: string | null;
  derivedFromScenarioId: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  isSystem?: boolean;
}

export interface ScenarioListResponse {
  system: ScenarioSummary[];
  saved: ScenarioSummary[];
  teamShared: ScenarioSummary[];
}

export interface ScenarioAppliedReceipt {
  shiftPpMargin: number;
  relativePctOnMetric: number;
  metric: SimulatorMetric;
  inputCount: number;
  // Phase B: input names from the scenario that did NOT map to a calibrated
  // tornado bar. Surfaced so the FE can warn "X was ignored — no calibration".
  unmappedInputs?: string[];
}

// Phase 6 — Quote-to-Revenue bridge.
export interface QuoteToRevenueHorizon {
  horizonDays: number;
  openQuotes: number;
  openPipelineEur: number;
  winRate: number;
  avgMargin: number;
  expectedRevenue: number;
  expectedGrossProfit: number;
  breakdown: {
    byTier: { tier: string; share: number; expectedRevenue: number }[];
  };
}

export interface QuoteToRevenue {
  source: 'seed' | 'live';
  horizons: QuoteToRevenueHorizon[];
}

// Phase 6 — Per-cluster CI calibration.
export interface CalibrationRow {
  clusterId: string;
  actualHitRatePct: number | null;
  nBacktests: number | null;
  tone: 'green' | 'amber' | 'red';
  mapePct?: number | null;
  directionalPct?: number | null;
  /** Free-form note when the cluster is known but has no backtest history. */
  note?: string | null;
}

export interface CalibrationPayload {
  nominalBand: number;
  source: 'seed' | 'live';
  rows: CalibrationRow[];
  title?: string;
  subtitle?: string;
  winnerModel?: string;
}

// Phase 7 — Market direction.
export interface MarketTile {
  name: string;
  value: number;
  unit: string;
  wowPct: number;
  tone: 'green' | 'amber' | 'red' | 'ink-3';
  context: string;
  external?: boolean;
  indicator?: string;
}

export interface MarketDirection {
  source: 'seed' | 'live';
  tiles: MarketTile[];
  digest: {
    wow: string;
    mom: string;
    yoy: string;
    notes: string;
  };
}

// Phase 7 — Threshold alerts.
export interface ForecastAlert {
  id: string;
  userId: string;
  metric: string;
  entityType: string;
  entityId: string | null;
  thresholdKind: 'mape_above' | 'margin_below_pct' | 'revenue_decline_prob_above';
  thresholdValue: number;
  notifyVia: 'in_app' | 'email';
  isActive: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
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
  // Phase 3 — diagnostic charts.
  marginTrajectory: MarginTrajectory;
  costDecomposition: CostDecomposition;
  seasonalOverlay: SeasonalOverlay;
  commodityTrajectories: CommodityTrajectories;
  // Phase 4 — per-customer preview (full tab lives at /forecasting/customers).
  customers: CustomersPreview;
  // Phase 6 — Quote-to-Revenue + Calibration.
  quoteToRevenue: QuoteToRevenue;
  calibration: CalibrationPayload;
  // Phase 7 — Market direction.
  marketDirection: MarketDirection;
  // Scenario perturbation receipt (only present when ?scenario_id= is set).
  scenarioApplied?: ScenarioAppliedReceipt;
  activeScenarioId?: string;
  // Phase 5 (forecast redesign v2) — PVM waterfall. Optional; the v2 shell
  // only renders the waterfall when this payload is present. The BFF will
  // populate this in a follow-up; today mocks omit it.
  pvm?: { periodLabel: string; bars: PVMBar[] };
  // v2.1 — plan-first, pocket-margin, prescriptive bridge. All optional;
  // the v2 shell renders these only when populated (graceful degradation).
  planTracking?: PlanTracking;
  pocketWaterfall?: PocketWaterfall;
  bias?: BiasPanel;
  nextMoves?: NextMove[];
  // v2.2 Phase D — PA/PR rejection-code lens.
  winLoss?: WinLossPanel;
  // v2.2 Phase E — list-price erosion projection.
  erosionProjection?: ErosionProjection;
  // v2.2 Phase F — at-risk revenue tier-stacked bar.
  atRiskRevenue?: AtRiskRevenue;
  // v2.2 Phase G — FVA override drill-down summary.
  fvaSummary?: FvaSummary;
  dataThrough?: string;          // canonical ISO timestamp for freshness chip
  filterScope?: FilterScope;     // mirrors the active URL params so cards can render unfiltered badges
}
