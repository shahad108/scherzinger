import type { ActionIntent } from './uiActions';

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

/* Action Center page payload */

export interface ActionCenterDrawerItem {
  label: string;
  value: string;
}

export interface ActionCenterHeader {
  greeting: string;
  week: string;
  dateRange: string;
  stats: { label: string; value: string }[];
  /** Items the "Workspace scope" toolbar drawer should render. Empty
   *  array today; backend populates from ``user_view_state`` once the
   *  Phase 2 unlock lands (plan §4 / §2.1 F2). */
  workspaceScope?: ActionCenterDrawerItem[];
  /** Items the "Export" toolbar drawer should render. Empty array
   *  today; backend populates from the report registry once that
   *  unlock lands (plan §4 / §2.1 F2). */
  exportContext?: ActionCenterDrawerItem[];
}

export interface MovableHero {
  value: string;
  delta: string;
  deltaDirection: 'up' | 'down' | 'flat';
  totalRevenue: string;
  windowLabel?: string;
  movablePct: number;
  skusInScope: number;
  skusTotal: number;
  lockedValue: string;
  lockedPct: number;
  spark: number[];
  action?: ActionIntent;
  heuristic?: {
    label: string;
    rule: string;
    qualifier?: string;
  };
}

/**
 * BucketFilterRow chip (plan §2.5).
 *
 * Composed in `buckets.py` from the resolved decisions block — so chip
 * counts always agree with what DecisionCards renders. `id === 'all'`
 * is the pinned chip that clears the filter; its `queueRoute` is a
 * typed noop intent. Every other chip is one of the canonical decision
 * queues (`churn` / `cost_riser` / `margin_erosion` / `other`).
 */
export interface BucketFilter {
  id: string;
  label: string;
  count: number;
  queueRoute: ActionIntent;
  tone: 'neutral' | 'warning' | 'positive';
}

export interface BucketsBlock {
  filters: BucketFilter[];
}

export interface DecisionMeta {
  k: string;
  v: string;
  tone: Tone;
}

export interface DecisionCluster {
  label: string;
  confidence: number;
  n: number;
}

export interface DecisionFact {
  label: string;
  value: string;
  detail: string;
  tone?: 'negative' | 'positive' | 'neutral';
}

export interface DecisionTrend {
  label: string;
  value: string;
  delta: string;
  spark: number[];
}

export interface DecisionCard {
  rank: string;
  severity: Severity;
  title: string;
  why: string;
  tags: Tag[];
  meta: DecisionMeta[];
  cta: string;
  headline?: string;
  tag?: string;
  daysOpenLabel?: string;
  authorityLabel?: string;
  cluster?: DecisionCluster;
  contract?: 'movable' | 'locked' | 'abtest';
  recommendation?: string;
  timeMinutes?: number;
  confLabel?: string;
  facts?: DecisionFact[];
  trend?: DecisionTrend;
  primaryCta?: string;
  secondaryCta?: string;
  primaryAction?: ActionIntent;
  secondaryAction?: ActionIntent;
  partialAction?: ActionIntent;
  snoozeAction?: ActionIntent;
  sliceAbAction?: ActionIntent;
  recommendationId?: string;
  /**
   * Stable queue id (`churn` / `cost_riser` / `margin_erosion` / `other`)
   * attached by the backend ranker. Drives the BucketFilterRow chip
   * counts and filtering — plan §2.5.
   */
  queue?: string;
  /**
   * Backend (decisions.py) attaches a typed financialImpact block so the
   * TodaySummaryStrip can sum recoverableMargin across decisions without
   * parsing facts/headline strings.
   */
  financialImpact?: {
    recoverableMargin: { value: number; currency: 'EUR' } | null;
  };
  status?:
    | 'open'
    | 'accepted_as_proposal'
    | 'partial_proposed'
    | 'rejected'
    | 'snoozed'
    | 'queued_for_renewal'
    | 'in_ab_test'
    | 'implemented'
    | 'cancelled';
}

export interface TrustTile {
  label: string;
  value: string;
  caption: string;
  action?: ActionIntent;
}

export interface QuoteInvoiceGap {
  overall: {
    n: number;
    mean_gap_pp: number | null;
    median_gap_pp: number | null;
    std_gap_pp: number | null;
  } | null;
  byYear: {
    year: number;
    n: number;
    mean_gap_pp: number | null;
    median_gap_pp: number | null;
  }[];
}

export interface LostQuoteData {
  wonAvg: number;
  lostAvg: number;
  differential: number;
  pValue: number;
  implication: string;
  linkedRecords?: number;
  quoteInvoiceGap?: QuoteInvoiceGap;
  action?: ActionIntent;
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
  decisionState?: string;
  simulation?: {
    stage?: string;
    recommendation?: string;
    label?: string;
    tone?: Tone;
    expectedLift?: number | null;
    downsideProbability?: number | null;
    blockers?: string[];
    warnings?: string[];
  };
  significance?: string;
  promotionEligible?: boolean;
  promotionBlockers?: string[];
  actions?: {
    hold?: ActionIntent;
    stop?: ActionIntent;
    promote?: ActionIntent;
  };
}

// Phase 3 — canonical per-SKU recommendation contract served by both
// /studio.skus[] and /action-center.skuTable[]. The pricing logic is a
// transparent pilot heuristic; UI renders the heuristic block as a
// honest tooltip identical to the movable-hero pattern.
export interface PerSkuRecommendationDriver {
  code: string;
  label: string;
  weight: number;
  tone: 'positive' | 'negative' | 'neutral';
}

export interface PerSkuRecommendation {
  article_id: string;
  current_price: number | null;
  recommended_price: number | null;
  floor: number | null;
  ceiling: number | null;
  cluster_id: string | null;
  cluster_confidence: number | null;
  movable_share: number | null;
  is_movable: boolean;
  top_drivers: PerSkuRecommendationDriver[];
  guardrail_clamped: boolean;
  heuristic?: {
    label: string;
    rule: string;
    qualifier?: string;
  };
}

export interface SkuRow {
  article: string;
  description: string;
  commodity: string;
  clusterConf: number;
  clusterTone: 'high' | 'mid' | 'low';
  marginDelta: string;
  marginTone: Tone;
  status: 'movable' | 'locked' | 'abtest' | 'outlier';
  statusLabel: string;
  actionLabel: string;
  action?: ActionIntent;
  recommendation?: PerSkuRecommendation | null;
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
  subhead?: string;
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
  // Present when the BFF wants to disclose a data-quality treatment for
  // this row (e.g. KA — code that functions as "reason unrecorded"). Render
  // as an inline note so the user sees the caveat, not just the rank.
  // DATA-AUDIT-2026-05-17 defect #8.
  data_quality?: string;
}

export interface AuditRow {
  ts: string;
  actor: string;
  change: string;
  delta: string;
}

export type ActionCenterBlockStatus = 'live' | 'empty' | 'degraded' | 'locked';

export interface ActionCenterBlockMeta {
  status: ActionCenterBlockStatus;
  reason?: string | null;
  coverage?: {
    tone: 'green' | 'amber' | 'red';
    label: string;
    n?: number | null;
  };
}

// Convenience alias used by the CoverageBadge component.
export type BlockMeta = ActionCenterBlockMeta;

export interface DataFreshness {
  invoicesThrough?: string | null;
  quotesThrough?: string | null;
  linksUpdatedAt?: string | null;
}

export interface ActionCenterMeta {
  generatedAt: string;
  traceId: string;
  dataFreshness?: DataFreshness;
  blocks: {
    header: ActionCenterBlockMeta;
    movableHero: ActionCenterBlockMeta;
    buckets: ActionCenterBlockMeta;
    decisions: ActionCenterBlockMeta;
    trust: ActionCenterBlockMeta;
    lostQuote: ActionCenterBlockMeta;
    skuTable: ActionCenterBlockMeta;
    longTail: ActionCenterBlockMeta;
    negotiation: ActionCenterBlockMeta;
    rejections: ActionCenterBlockMeta;
    audit: ActionCenterBlockMeta;
    abTests: ActionCenterBlockMeta;
    summary?: ActionCenterBlockMeta;
  };
}

/**
 * TodaySummaryStrip tile — mirrors backend ``summary.py`` exactly.
 *
 * Tile order is fixed in the composer (movable_revenue, open_actions,
 * recoverable_margin, blocked_quotes, model_trust) so the frontend
 * renders by index without sorting.
 */
export type SummaryTileId =
  | 'movable_revenue'
  | 'open_actions'
  | 'recoverable_margin'
  | 'blocked_quotes'
  | 'model_trust';

export interface SummaryTile {
  id: SummaryTileId;
  label: string;
  value: string | null;
  delta?: string | null;
  deltaDirection: 'up' | 'down' | 'flat';
  tone: 'positive' | 'negative' | 'neutral' | 'warning';
  sourceBlockId: string;
  action: ActionIntent;
  locked: boolean;
}

export interface SummaryBlock {
  tiles: SummaryTile[];
}

export interface ActionCenterData {
  meta?: ActionCenterMeta;
  header: ActionCenterHeader;
  movableHero: MovableHero;
  buckets: BucketsBlock;
  decisions: DecisionCard[];
  trust: TrustTile[];
  lostQuote: LostQuoteData;
  skuTable: SkuRow[];
  longTail: LongTailData;
  negotiation: NegotiationData;
  rejections: RejectionRow[];
  audit: AuditRow[];
  abTests: AbTestCard[];
  summary?: SummaryBlock;
}

/* Margin Cockpit page payload */

export interface MarginPageHeader {
  crumbTrail: string[];                   // ["Cockpit","Pricing Analyst · Frank","Margin Intelligence"]
  title: string;                          // "Margin Intelligence"
  subPills: string[];                     // ["Predictive Portfolio Pricing","Diagnostics"]
  subStats: { label: string; value: string }[]; // {label:"refreshed today",value:"LTM"}
  auditTag: string;                       // "Audit-ready · hash-signed"
  filters: { label: string; value: string }[]; // Cluster/Family/Tier
}

export interface BriefingParagraph {
  /** HTML allowed: <b>, <code>, color spans. Already styled in mock; rendered via dangerouslySetInnerHTML. */
  html: string;
}

export interface BriefingMemoData {
  title: string;                          // "Margin briefing · auto-drafted, editable · audit-ready"
  paragraphs: BriefingParagraph[];
  signature: string;                      // "— Frank, Pricing Analyst..."
  auditHash: string;                      // "m4r9bx"
}

export interface MarginHealthCell {
  id: 'score' | 'actual' | 'belowPlan' | 'closable';
  label: string;
  value: string;
  trend?: string;                         // e.g. "↓ −1.9pp"
  trendTone?: 'up' | 'down' | 'flat';
  sub?: string;
  benchmark?: string;
  scoreRing?: number;                     // only for id==='score'
  scoreVerdict?: string;                  // "Watch"
  scoreTone?: 'green' | 'amber' | 'red';
  authSplit?: { yours: string; needsMd: string };
  jumpTo?: string;                        // route, e.g. "/action-center"
}

export interface ClusterChip {
  code: string;                           // "BKAES"
  margin: string;                         // "25%"
  target: string;                         // "target 28%"
  conf: string;                           // "82%"
  tone: 'green' | 'amber' | 'red';
  warning?: string;                       // "⚠ low-n" badge text
  filterToast: string;
}

export interface ShiftedRow {
  dotTone: 'red' | 'green' | 'amber' | 'muted';
  text: string;                           // HTML allowed (delta chips, ab-test note)
  delta: { value: string; tone: 'up' | 'down' | 'flat' };
  jumpLabel: string;                      // "→ Cost trajectory"
  jumpTo: { kind: 'route'; to: string } | { kind: 'tab'; tab: string; segTab?: string };
}

export type WaterfallBucketClassification = 'strategic' | 'unintended' | 'mixed';

export interface WaterfallBucket {
  id: string;                             // "target","mix","discount","cost","rebate","erosion","actual"
  name: string;
  endpoint?: 'green-start' | 'green-end'; // for non-clickable target/actual rows
  pct: string;                            // "−1.4pp" or "28.0%"
  eur: string;                            // "€150K" or "plan"
  source?: string;                        // small line under name
  delta?: { label: string; tone: 'up' | 'down' | 'flat' };
  jumpLabel?: string;                     // "→ Cost trajectory"
  jumpTo?: ShiftedRow['jumpTo'];
  // Phase 4 — strategic-vs-unintended classification + low-n warning.
  classification?: WaterfallBucketClassification;
  classificationNote?: string;
  movableShare?: number;                  // 0..1 — share of bucket Frank can act on this cycle
  lowNClusters?: { code: string; n: number; conf: number }[];
}

export interface WaterfallChartPoint {
  label: string;                          // matches bucket name
  cumulative: number;                     // running margin % after this bucket
  delta: number;                          // negative for losses, positive endpoints
  kind: 'endpoint' | 'loss';
}

export interface MovableLockedSplit {
  totalLeakage: string;                   // "€417K"
  movable: { label: string; pct: number; }; // "Movable €260K (62%)" → label includes amount
  locked: { label: string; pct: number; };
  source: string;                         // "Pilot estimate · derived from price_governance.price_rules + frame-contract dates"
}

export interface WaterfallMovableView {
  title: string;
  buckets: WaterfallBucket[];
  chart: WaterfallChartPoint[];
  totalChip: string;
  heuristic: { label: string; rule: string; qualifier?: string };
}

export interface WaterfallCardData {
  title: string;
  subtitle: string;
  totalChip: string;                      // "€417K total leakage"
  infoPanel: string[];                    // info paragraphs
  buckets: WaterfallBucket[];
  chart: WaterfallChartPoint[];
  movableLocked: MovableLockedSplit;
  movableView?: WaterfallMovableView;     // Phase 4 — precomputed movable-only render
}

export interface LostQuoteDifferentialData {
  title: string;
  subtitle: string;
  significance: string;                   // "p = 0.006 · statistically significant"
  tiles: { id: 'won' | 'lost' | 'diff'; label: string; value: string; sub: string }[];
  /** HTML allowed: <b>, <span>; rendered via dangerouslySetInnerHTML. */
  interpretationHtml: string;
  /** HTML allowed: <b>, <span>; rendered via dangerouslySetInnerHTML. */
  sourceHtml: string;
}

export interface CostVsPriceData {
  title: string;
  subtitle: string;
  indexedTag: string;                     // "Indexed Apr 2024 = 100"
  infoPanel: string[];
  series: { month: string; cost: number; price: number }[]; // 24 points, base=100
  passThrough: {
    label: string;
    value: string;                        // "61%"
    pct: number;                          // 61
    /** HTML allowed: <b>, <span>; rendered via dangerouslySetInnerHTML. */
    sub: string;
    /** HTML allowed: <b>, <span>; rendered via dangerouslySetInnerHTML. */
    breakdownHtml: string;
  };
  recovery: {
    label: string;
    value: string;                        // "€147K"
    /** HTML allowed: <b>, <span>; rendered via dangerouslySetInnerHTML. */
    sub: string;
    spark: number[];                      // 12 monthly cumulative points
  };
}

export interface CrossCustomerRow {
  article: string;
  cluster: { code: string; conf: string; tone: 'green' | 'amber' | 'red' };
  customerA: string;
  priceA: string;
  customerB: string;
  priceB: string;
  tier: string;
  spreadPct: string;                      // "66%"
  highlight?: boolean;
  studioLabel: string;                    // "Open in Studio →"
}

export interface SkuLeakageRow {
  article: string;
  description: string;
  volume: string;
  quotedMargin: string;
  actualMargin: string;
  gapPp: string;                          // "−17pp"
  opportunityEur: string;
  abStatus: string;                       // "—" or "🧪 running 3/14"
  auditHash: string;
  primary?: boolean;
}

export interface SegmentRow {
  label: string;                          // first column
  tier?: 'A' | 'B' | 'C' | 'D';           // for tier sub-pane
  cells: string[];                        // remaining columns
  trendTone?: 'up' | 'down' | 'flat';
  notes?: string;
  storyHtml?: string;                     // injected as last row's story (handled by pane)
}

export interface SegmentSubPane {
  id: 'family' | 'tier' | 'size' | 'region';
  label: string;
  headers: string[];
  rows: SegmentRow[];
  storyHtml: string;
  caveatHtml?: string;                    // BKAGG region warning
}

export interface ErosionRow {
  article: string;
  cluster: { code: string; conf: string; tone: 'green' | 'amber' | 'red' };
  lastUpdateMonths: number;               // for the age bar width %
  lastUpdateLabel: string;                // "14 mo"
  costChange: string;
  listChange: string;
  effectiveErosion: string;
  marginCompression: string;
  authorHash: string;                     // "Frank · a3f9c1"
  actionLabel: string;                    // "Open in Studio →" or "healthy · no action"
  isAction: boolean;
  primary?: boolean;
}

export interface CustomerTrendRow {
  customer: string;
  ytdRevenue: string;
  ytdMargin: string;
  trend: string;                          // "↓ −6pp"
  trendTone: 'up' | 'down' | 'flat';
  status: 'action' | 'watch' | 'healthy';
  statusLabel: string;
  primaryAction?: { label: string; jumpTo: string };
  drillLabel: string;                     // "Drill →"
}

export interface MarginTabs {
  cross: { description: string; infoPanel: string[]; rows: CrossCustomerRow[]; footerNote: string; tabFooterText: string };
  leak: { description: string; infoPanel: string[]; rows: SkuLeakageRow[]; tabFooterText: string };
  seg: { description: string; infoPanel: string[]; subPanes: SegmentSubPane[]; tabFooterText: string };
  erode: {
    description: string;
    infoPanel: string[];
    rows: ErosionRow[];
    cycleNote: string;
    cycleButtonLabel: string;
    tabFooterText: string;
  };
  cust: { description: string; infoPanel: string[]; rows: CustomerTrendRow[]; tabFooterText: string };
}

export interface CrossLink {
  label: string;
  jumpTo: string;                         // route
}

export interface MarginCockpitData {
  header: MarginPageHeader;
  briefing: BriefingMemoData;
  health: MarginHealthCell[];             // 4 cells
  clusters: ClusterChip[];
  shifted: { title: string; rows: ShiftedRow[]; netLine: string }; // "Net month-over-month..."
  waterfall: WaterfallCardData;
  lostQuote: LostQuoteDifferentialData;
  costVsPrice: CostVsPriceData;
  tabs: MarginTabs;
  crossLinks: CrossLink[];
}
