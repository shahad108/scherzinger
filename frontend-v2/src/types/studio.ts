export type SkuFlag = 'all' | 'floor' | 'stale' | 'cost' | 'frame';
export type SkuTagTone = 'floor' | 'stale' | 'cost' | 'frame';
export type MarginTone = 'lo' | 'mid' | 'hi';
export type ConfTone = 'hi' | 'mid' | 'lo';
export type Tier = 'A' | 'B' | 'C' | 'D';

export interface SkuListEntry {
  aid: string;
  margin: string;
  marginTone: MarginTone;
  productLine: string;
  cluster: string;
  meta: string;
  clusterChip: string;
  clusterTone: ConfTone;
  flag: SkuFlag;
  tag: string;
  tagTone: SkuTagTone;
  locked: boolean;
  isNew: boolean;
  shortHero?: SkuShortHero;
  workbenchPatch?: WorkbenchPatch;
  /** Computed (added by `useStudio` enrichment); not in raw mock JSON. */
  workbench?: WorkbenchData;
}

export type WorkbenchVariant = 'standard' | 'frame-locked' | 'new-sku';

export interface WorkbenchPatch {
  unitCost: number;
  currentPrice: number;
  targetMarginPct: number;
  annualUnits: number;
  customerCount: number;
  customerCluster: 'bkagg' | 'bkaes' | 'bkaiz' | 'sopu';
  clusterN?: number;
  variant?: WorkbenchVariant;
  cost: {
    material: number;
    labor: number;
    outsourcing: number;
    overhead: number;
    note: string;
  };
  trajectory: {
    delta: string;
    yearStart: string;
    yearEnd: string;
    materialPoints?: string;
    quotedPoints?: string;
    legend: string;
  };
  history: HistoryRow[];
  chipsOverride?: HeroChipData[];
  memoOverride?: MemoSection[];
  riskLine?: string;
}

export interface SkuShortHero {
  title: string;
  sub: string;
  chipCluster: string;
  chipApproval: string;
  meta: string;
  currentPrice: string;
  currentMargin: string;
  currentMarginTone: 'bad' | 'good';
  targetText: string;
}

export interface PriceOption {
  price: string;
  delta: string;
  impact: string;
  impactTone: 'pos' | 'neg';
  risk: string;
}

export interface AbOption {
  slice: string;
  meta: string;
  takeaway: string;
  criterion: string;
}

export interface PriceOptionsBundle {
  hold: PriceOption;
  floor: PriceOption;
  market: PriceOption;
  abtest: AbOption;
  customPlaceholder: string;
}

export interface FanoutRow {
  tier: Tier;
  customer: string;
  customerSub: string;
  customerSubExtra?: string;
  amount: string;
  amountSub: string;
  churnPct: string;
  churnTone: 'r' | 'g';
  recommendation: string;
  rowTone: 'alert' | 'warn' | 'plain';
}

export interface CostComponent {
  key: 'material' | 'labor' | 'outsourcing' | 'overhead';
  name: string;
  pct: number;
}

export interface CostTrajectory {
  title: string;
  delta: string;
  yearStart: string;
  yearEnd: string;
  materialPoints: string;
  quotedPoints: string;
  legend: string;
}

export interface HistoryRow {
  date: string;
  move: string;
  vol: string;
  volTone: 'up' | 'down' | 'flat';
  by: string;
  hash: string;
}

export interface MemoSection {
  body: string;
  isSig?: boolean;
}

export interface ComparableTile {
  variant: 'plain' | 'bench' | 'suggest';
  lab: string;
  big: string;
  cap: string;
  capExtra?: string;
  conf?: string;
}

export interface ComparableOther {
  text: string;
  warn?: boolean;
}

export interface ComparablePanel {
  title: string;
  subtitle: string;
  tiles: ComparableTile[];
  others: ComparableOther[];
  source: string;
  jumpLink: { text: string; label: string };
}

export interface DecisionData {
  summary: {
    proposedPrice: string;
    aid: string;
    margin: string;
    recovery: string;
    riskLine: string;
  };
  effectiveDate: string;
  notifyDefaults: { sales: boolean; customers: boolean; escalate: boolean; abTest: boolean };
  notifyLabels: {
    sales: string;
    customers: string;
    escalate: string;
    abTest: string;
  };
}

export interface FanoutPane {
  paneSub: string;
  fanPrice: string;
  clusterNote: string;
  rows: FanoutRow[];
  footNote: string;
}

export interface CostPane {
  paneSub: string;
  unitCost: string;
  floorCalc: string;
  components: CostComponent[];
  note: string;
  trajectory: CostTrajectory;
}

export interface MemoData {
  title: string;
  paragraphs: MemoSection[];
}

export interface WorkbenchData {
  hero: SkuShortHero & {
    eyebrow: string;
    annualRevenue: string;
    chips: HeroChipData[];
  };
  optionsSub: string;
  options: PriceOptionsBundle;
  fanout: FanoutPane;
  cost: CostPane;
  history: HistoryRow[];
  decision: DecisionData;
  memo: MemoData;
  // Pricing Studio v3 / Phase 1 — typed blocks attached by the BFF
  // (`services/studio/workbench_service.py::attach_phase1`). Each block
  // is best-effort: if the backend hit an exception the field is absent
  // and the UI renders <DataMissingBadge> in place of the value.
  recommendation?: RecommendationBlock;
  wtp?: WtpBlock;
  win_prob_curve?: WinProbCurveBlock;
  competitor_ref?: CompetitorRefBlock | null;
  // Pricing Studio v3 / Phase 2 — typed customer-fanout block computed
  // by the BFF (`services/pricing/customer_fanout.py::build_customer_fanout`).
  // Same shape returned by POST /screens/studio/fanout when the user
  // re-scores at a proposed price. Absent if the BFF errored — UI
  // falls back to the legacy `fanout` pane in that case.
  customer_fanout?: CustomerFanoutBlock;
}

// ---- Pricing Studio v3 / Phase 1 wire-shape blocks --------------------------
//
// These mirror the Pydantic models in
// `scherzinger-platform/backend/models/pricing/*`. Decimal arrives as a
// JSON-serialised string (Pydantic `mode="json"` quantises to string);
// numeric values keep their string type until a formatter consumes them.

export type ConfidenceLevel = 'low' | 'med' | 'high';

export type DriverKind =
  | 'cost_trajectory'
  | 'competitor_signal'
  | 'customer_mix'
  | 'win_prob_optimum'
  | 'floor_protection'
  // Catch-all for the wider DriverKind enum on the backend — UI degrades
  // gracefully to a generic label/colour if a new kind arrives.
  | (string & {});

export interface LineageRefBlock {
  id: string;
  source_kind: string;
  source_id: string;
  sql?: string | null;
  model?: string | null;
  computed_at: string;
  computed_by: string;
}

export interface RecommendationDriver {
  kind: DriverKind;
  label: string;
  /** Fractional 0..1 — multiply by 100 for display. */
  contribution_pct: string;
  lineage_ref?: LineageRefBlock | null;
}

export interface RecommendationBand {
  min: string;
  target: string;
  max: string;
}

export interface RecommendationBlock {
  aid: string;
  recommended_price: string;
  /** 0..1 fractional. */
  confidence: string;
  confidence_level: ConfidenceLevel;
  band: RecommendationBand;
  drivers: RecommendationDriver[];
  rationale_md: string;
  lineage_ref?: LineageRefBlock | null;
}

export interface WtpBlock {
  aid: string;
  tier?: string | null;
  p10: string;
  p50: string;
  p90: string;
  n_deals: number;
  window_days: number;
  confidence: ConfidenceLevel;
  anchored_from_cluster: boolean;
  lineage_ref?: LineageRefBlock | null;
}

export interface WinProbCurvePoint {
  price: string;
  /** 0..1 fractional. */
  win_prob: string;
  lower_ci?: string;
  upper_ci?: string;
}

export interface WinProbCurveBlock {
  aid: string;
  tier?: string | null;
  points: WinProbCurvePoint[];
  n_deals: number;
  confidence_band?: 'asymptotic' | 'bootstrap' | null;
  lineage_ref?: LineageRefBlock | null;
}

export interface CompetitorRefBlock {
  aid: string;
  median_price: string;
  sample_count: number;
  last_seen: string;
  window_days: number;
  lineage_ref?: LineageRefBlock | null;
}

// ---- Pricing Studio v3 / Phase 2 wire-shape blocks --------------------------
//
// Customer fanout + per-customer drill-in payloads. All Decimal-typed
// fields arrive as JSON strings — never `number`. The "tone" string is
// the SOURCE OF TRUTH for row colour: NEVER recompute thresholds on
// the client (see `customer_risk.compute_tone` for the BFF rule).

export type FanoutRowTone = 'alert' | 'warn' | 'plain';

export interface PaidBand {
  /** Decimal-as-string. */
  p10: string;
  p50: string;
  p90: string;
}

export interface CustomerFanoutRow {
  customer_id: string;
  customer_name: string;
  aid: string;
  tier: Tier;
  /** Decimal-as-string or null when the customer has no paid history. */
  last_paid: string | null;
  /** ISO date-time string or null. */
  last_paid_at: string | null;
  ltm_units: number;
  ltm_eur: string | null;
  /** Decimal 0..1 (e.g. "0.38" = 38% of customer wallet on this SKU). */
  wallet_share_pct: string | null;
  paid_band: PaidBand | null;
  churn_p: string | null;
  decline_p: string | null;
  risk_if_moved: string | null;
  tone: FanoutRowTone;
  proposal_queued: boolean;
  lineage_ref_id: string | null;
}

export interface CustomerFanoutBlock {
  aid: string;
  /** Decimal-as-string or null when this is the default (no proposed) fanout. */
  proposed_price: string | null;
  /** SF3 (Phase 2.2.5): BFF-computed pane subtitle context — e.g.
   * ``"at proposed €5.10"`` when a price is supplied, ``"cost-floor"`` for
   * the default fanout. The workbench header renders this verbatim so it
   * never goes stale relative to the active re-score. Optional only for
   * backwards compat with older BFF builds. */
  context_label?: string;
  rows: CustomerFanoutRow[];
  lineage_ref: string | null;
}

export interface WalletSkuRow {
  aid: string;
  /** Decimal 0..1. */
  share_pct: string;
  ltm_eur: string;
}

export interface DrillInHistoryPoint {
  /** ISO date — never null in practice, but defensively typed. */
  date: string | null;
  /** Decimal-as-string. */
  price: string | null;
  units: number;
  won: boolean;
}

export interface DrillInAtProposed {
  /** Decimal-as-string Δ vs last_paid (may be null when no paid history). */
  delta_vs_last_paid: string | null;
  /** Decimal-as-string percent (e.g. "7.5" = 7.5%). */
  delta_pct: string | null;
  /** Decimal 0..1 churn-weighted risk. */
  risk_if_moved: string | null;
  /** SF2 (Phase 2.2.5): BFF-computed tone — drawer renders, never re-derives.
   * Sourced from ``customer_risk.compute_tone`` so thresholds live in one
   * place. Optional only for backwards compat with older BFF builds; new
   * code should always read this rather than re-thresholding ``risk_if_moved``. */
  tone?: FanoutRowTone;
}

export interface DrillInThisSku {
  aid: string;
  customer_id: string;
  last_paid: string | null;
  last_paid_at: string | null;
  ltm_units: number;
  ltm_eur: string | null;
  churn_p: string | null;
  decline_p: string | null;
  risk_if_moved: string | null;
  wallet_share_pct: string | null;
  paid_band: PaidBand | null;
  tier: Tier;
}

export interface CustomerDrillInPayload {
  customer: { id: string; name: string; tier: Tier };
  this_sku: DrillInThisSku;
  at_proposed: DrillInAtProposed | null;
  wallet_top_skus: WalletSkuRow[];
  history_on_sku: DrillInHistoryPoint[];
  lineage_ref: string | null;
}

export interface HeroChipData {
  label: string;
  variant?: 'movable' | 'dashed';
}

export interface StudioHeader {
  crumbs: string[];
  title: string;
  subPills: string[];
  subStats: { value: string; label: string }[];
  headPills: { label: string; target?: string }[];
}

export interface FilterDef {
  id: SkuFlag;
  label: string;
}

export interface ToggleDef {
  id: 'hide-locked' | 'new-skus';
  label: string;
  defaultActive: boolean;
}

export interface CrossLink {
  label: string;
  target?: string;
}

export interface StudioShell {
  header: StudioHeader;
  filters: FilterDef[];
  toggles: ToggleDef[];
  skus: SkuListEntry[];
  defaultAid: string;
  workbench: WorkbenchData;
  comparable: ComparablePanel;
  crossLinks: CrossLink[];
  footerNote?: string;
}
