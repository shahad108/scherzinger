export type Persona = 'frank' | 'till' | 'heiko';

export type Density = 'cozy' | 'compact';

export type Severity = 'info' | 'success' | 'warning' | 'error';

export type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'rose';

export type ObjectStatusKind = 'positive' | 'negative' | 'warning' | 'neutral';

export interface Tag {
  label: string;
  tone: Tone;
}

export interface KpiDelta {
  value: number;
  direction: 'up' | 'down' | 'flat';
  good: boolean;
}

export interface KpiData {
  id: string;
  label: string;
  value: string;
  raw?: number;
  delta?: KpiDelta;
  spark?: number[];
}

export interface ActionCard {
  id: string;
  type: 'churn' | 'margin' | 'opportunity' | 'risk' | 'forecast' | 'pricing';
  severity: Severity;
  title: string;
  subtitle: string;
  customer?: string;
  sku?: string;
  amount?: number;
  confidence?: number;
  createdAt: string;
  recommendedAction?: string;
}

/* Action Center page payload */

export interface ActionCenterHeader {
  greeting: string;
  week: string;
  dateRange: string;
  stats: { label: string; value: string }[];
}

export interface MovableHero {
  value: string;
  delta: string;
  deltaDirection: 'up' | 'down' | 'flat';
  totalRevenue: string;
  movablePct: number;
  skusInScope: number;
  skusTotal: number;
  lockedValue: string;
  lockedPct: number;
  spark: number[];
}

export interface BucketCard {
  id: string;
  title: string;
  subtitle: string;
  tags: Tag[];
  avatars: string[];
  cta: string;
}

export interface DecisionMeta {
  k: string;
  v: string;
  tone: Tone;
}

export interface DecisionCard {
  rank: string;
  severity: Severity;
  title: string;
  why: string;
  tags: Tag[];
  meta: DecisionMeta[];
  cta: string;
}

export interface TrustTile {
  label: string;
  value: string;
  caption: string;
}

export interface LostQuoteData {
  wonAvg: number;
  lostAvg: number;
  differential: number;
  pValue: number;
  implication: string;
}

export interface AbTestCard {
  id: string;
  rank: string;
  title: string;
  subtitle: string;
  trend: string;
  trendTone: Tone;
  preMargin: string;
  postMargin: string;
  lift: string;
  liftTone: Tone;
  status: string;
}

export interface SkuRow {
  article: string;
  description: string;
  commodity: string;
  clusterConf: number;
  clusterTone: 'high' | 'mid' | 'low';
  marginDelta: string;
  marginTone: Tone;
  status: 'movable' | 'locked' | 'abtest';
  statusLabel: string;
  actionLabel: string;
}

export interface LongTailMixSegment {
  label: string;
  subtitle: string;
  pct: number;
  tone: 'rose' | 'amber' | 'muted';
}

export interface LongTailData {
  tiles: TrustTile[];
  mix: LongTailMixSegment[];
}

export interface CommodityRow {
  name: string;
  delta: string;
  tone: Tone;
  note?: string;
}

export interface NegotiationData {
  discountGap: string;
  discountGapDelta: string;
  commodities: CommodityRow[];
  summary: string[];
}

export interface RejectionRow {
  rank: string;
  code: string;
  subtitle: string;
  lostRevenue: string;
  share: string;
  owner: string;
}

export interface AuditRow {
  ts: string;
  actor: string;
  change: string;
  delta: string;
}

export interface ActionCenterData {
  header: ActionCenterHeader;
  movableHero: MovableHero;
  buckets: BucketCard[];
  decisions: DecisionCard[];
  trust: TrustTile[];
  lostQuote: LostQuoteData;
  skuTable: SkuRow[];
  longTail: LongTailData;
  negotiation: NegotiationData;
  rejections: RejectionRow[];
  audit: AuditRow[];
  abTests: AbTestCard[];
}
