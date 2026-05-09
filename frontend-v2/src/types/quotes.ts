// Pryzm v2 · Quotes & Guardrails
// Types for the Quotes feature — mirrors `Pryzm_Dashboard_Mockup_Frank.html` § 6140-6938.

export type Tier = 'A' | 'B' | 'C' | 'D';
export type Rag = 'r' | 'a' | 'g';
export type DeltaTone = 'up' | 'down' | 'flat';

// ---------- Page head ----------
export interface QuotesPageHeader {
  crumbTrail: string[];
  title: string;
  subPills: string[];                 // "Re-evaluates every 2 min"
  subStats: { label: string; value: string }[];   // "Routed Mon 06:00", "47 active quotes"
  filters: { label: string; value: string }[];    // "Week 18", "All sales reps"
  briefingButtonLabel: string;
  exportLabel: string;
}

// ---------- Briefing memo ----------
export interface QuoteBriefingMemo {
  title: string;
  paragraphs: { html: string }[];
  signature: string;
}

// ---------- Pipeline strip ----------
export type CounterTone = 'default' | 'warn' | 'alert';
export interface PipelineCounter {
  id: string;
  label: string;
  value: string;
  valueTone?: 'red' | 'amber' | 'green' | 'ink';
  sub?: string;                         // optional sub-line
  miniCounters?: { label: string; tone: 'r' | 'a' | 'g' }[];   // for "Active quotes" only
  containerTone?: CounterTone;
  live?: boolean;                       // true → pulsing dot
}

// ---------- "What changed since Monday" ----------
export interface ChangedRow {
  num: string;                         // "5", "2", "11", "1"
  text: string;                        // already includes the description; HTML allowed
  tone: 'red' | 'green' | 'amber';
}

// ---------- Escalation cards ----------
export interface EscalationAction {
  id: string;                          // e.g. "floor", "counter", "approve", "decline"
  label: string;                       // "Approve at €5.10 (floor)"
  variant: 'floor' | 'counter' | 'approve' | 'decline';
  toast: string;
}
export interface EscalationCard {
  rank: number;
  quoteId: string;                     // "12848"
  tier: Tier;
  customer: string;                    // "101580"
  article: string;                     // "200832-E"
  articleDescription?: string;         // "Precision shaft"
  authority: 'you' | 'md';             // ✓ Your authority | ↗ Needs MD
  studioJumpToast: string;
  detailHtml: string;                  // Quoted €... · margin Xpp below... HTML
  evidenceHtml: string;
  metaLine?: string;                   // "Strategic tier · do not lose customer..."
  actions: EscalationAction[];
}

export interface EscalationsSectionData {
  title: string;
  subtitle: string;
  reRankedChip: string;                // "Re-ranked by impact"
  infoPanelHtml: string;
  concentrationHtml: string;           // "All 4 escalations sit with 3 reps · ..."
  bulkRecommendationHtml: string;      // "Pryzm recommends ... total leakage avoided €2,710"
  bulkAcceptLabel: string;             // "Accept all (4)"
  bulkAcceptToast: string;
  cards: EscalationCard[];
}

// ---------- Funnel + aging ----------
export interface FunnelStep {
  id: string;
  count: number;
  label: string;
  detail: string;                      // "€2.61M total"
  tone?: 'won' | 'lost';
}

export interface AgingCell {
  count: number;
  label: string;                       // "< 7 days fresh"
  detail: string;
  tone?: 'normal' | 'warn' | 'alert';
}

export interface FunnelSectionData {
  title: string;
  subtitle: string;
  rangeChip: string;                   // "Last 30 days"
  infoPanelHtml: string;
  funnel: FunnelStep[];
  aging: AgingCell[];
}

// ---------- Guardrail thresholds ----------
export interface GuardrailCard {
  id: string;
  category: string;                    // "Precision shafts"
  threshold: string;                   // "25%"
  meta: string;                        // "Active · 12 SKUs · last raised Apr 14 (was 22%)"
  editToast: string;
}

export interface GuardrailsSectionData {
  title: string;
  subtitle: string;
  historyChipHtml: string;             // "↗ 12 changes in last 90d · ..."
  infoPanelHtml: string;
  cards: GuardrailCard[];
  historyButtonLabel: string;
  historyButtonToast: string;
  editButtonLabel: string;
  editButtonToast: string;
}

// ---------- Active quotes table ----------
export interface ActiveQuoteDetailAction {
  id: string;
  label: string;
  variant: 'floor' | 'counter' | 'approve' | 'decline' | 'hold';
  toast: string;
}

export interface ActiveQuoteRow {
  id: string;                          // quote number "12848"
  rag: Rag;
  tier: Tier;
  customer: string;                    // "101580"
  article: string;
  quotedPrice: string;                 // "€4.20"
  margin: string;                      // "8%"
  marginTone?: 'pos' | 'neg' | 'neutral';
  floorReference: string;              // "↓ floor €5.10 (−€0.90)"
  floorTone?: 'below' | 'above' | 'at';
  age: string;                         // "5d"
  ageTone: 'fresh' | 'warm' | 'stale';
  guardrailLabel: string;              // "Below" / "Marginal" / "Above"
  rowActionLabel: string;              // "Escalation →" / "Open in Studio →"
  rowActionPrimary: boolean;
  rowActionTarget: 'escalation' | 'studio';
  studioToast?: string;
  evidenceHtml: string;
  metaLine: string;
  detailActions: ActiveQuoteDetailAction[];
}

export interface ActiveQuotesSectionData {
  title: string;                       // "All 47 active quotes"
  subtitle: string;
  ragFilters: { id: 'all' | Rag; label: string; count: number }[];
  bulkInfoHtml: string;                // "33 Green ready to send · 9 Amber..."
  bulkActions: { id: string; label: string; toast: string }[];
  rows: ActiveQuoteRow[];
  footerNoteHtml: string;              // "6 of 47 · show all 47 · floors pulled live..."
}

// ---------- Quote analysis tabs ----------
export interface RepRow {
  rep: string;
  ltmQuotes: number;
  breaches: number;
  breachBarPct: number;                // 0-100
  breachRate: string;
  breachRateTone?: 'pos' | 'neg' | 'neutral';
  leakageEur: string;
  leakageTone?: 'pos' | 'neg' | 'neutral';
  trend: string;                       // "↑ worsening"
  trendTone?: 'pos' | 'neg' | 'flat';
  status: 'repeat' | 'coach' | 'ok';
  statusLabel: string;                 // "Repeat offender" / "Coaching" / "On policy"
  isAction: boolean;
  actionLabel?: string;                // "Coaching review →"
  actionPrimary?: boolean;
  actionToast?: string;
}

export interface SkuRow {
  article: string;
  family: string;
  ltmQuotes: number;
  breaches: number;
  breachesTone?: 'pos' | 'neg' | 'neutral';
  avgDiscount: string;                 // "−14%"
  avgDiscountTone?: 'pos' | 'neg' | 'neutral';
  winAtGuardrail: string;              // "68%"
  winBelowGuardrail: string;           // "82%"
  insightHtml: string;                 // "Discounting wins +14pp · review" / "<b>tighten +1pp</b>"
  highlight?: boolean;                 // tinted row (pink) for the single critical SKU
  actions: { id: string; label: string; primary: boolean; toast: string }[];
}

export interface CustomerRow {
  tier: Tier;
  customer: string;
  ltmQuotes: number;
  avgDiscount: string;
  avgDiscountTone?: 'pos' | 'neg' | 'neutral';
  concession: string;
  concessionTone?: 'pos' | 'neg' | 'neutral';
  winRate: string;
  winRateTone?: 'pos' | 'neg' | 'neutral';
  recommendation: string;
}

export interface QuotesAnalysisTab {
  description: string;
  infoPanelHtml: string;
  tabFooterText: string;
  jumpLink?: { label: string; to: string };
}
export interface QuotesAnalysisTabs {
  rep:  QuotesAnalysisTab & { rows: RepRow[] };
  sku:  QuotesAnalysisTab & { rows: SkuRow[] };
  cust: QuotesAnalysisTab & { rows: CustomerRow[] };
}

// ---------- Cross-links ----------
export interface QuotesCrossLink {
  label: string;
  jumpTo: string;
}

// ---------- Top-level shell ----------
export interface QuotesShell {
  header: QuotesPageHeader;
  briefing: QuoteBriefingMemo;
  pipeline: PipelineCounter[];        // 4 counters
  changed: { title: string; rows: ChangedRow[] };
  escalations: EscalationsSectionData;
  funnel: FunnelSectionData;
  guardrails: GuardrailsSectionData;
  active: ActiveQuotesSectionData;
  analysis: QuotesAnalysisTabs;
  crossLinks: QuotesCrossLink[];
}
