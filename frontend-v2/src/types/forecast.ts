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
}
