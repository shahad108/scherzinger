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
