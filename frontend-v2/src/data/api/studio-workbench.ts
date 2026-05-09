import type {
  CostComponent,
  DecisionData,
  FanoutPane,
  FanoutRow,
  HeroChipData,
  MemoData,
  PriceOptionsBundle,
  SkuListEntry,
  Tier,
  WorkbenchData,
  WorkbenchPatch,
} from '@/types/studio';

interface BaseCustomer {
  tier: Tier;
  id: string;
  sharePct: number;
  arrK: number;
  detail: string;
  detailExtra?: string;
  baseChurnPct: number;
  rowTone: 'alert' | 'warn' | 'plain';
  recOverride?: string;
}

const CUSTOMER_SETS: Record<WorkbenchPatch['customerCluster'], BaseCustomer[]> = {
  bkagg: [
    {
      tier: 'A',
      id: '101580',
      sharePct: 38,
      arrK: 487,
      detail: 'last raise 2021-Q2',
      baseChurnPct: 62,
      rowTone: 'alert',
      recOverride: 'Counter-propose conservative (Phase 1)',
    },
    {
      tier: 'A',
      id: '102330',
      sharePct: 22,
      arrK: 312,
      detail: 'pays cluster-high already',
      baseChurnPct: 8,
      rowTone: 'warn',
      recOverride: 'Apply at next renewal',
    },
    {
      tier: 'B',
      id: '103044',
      sharePct: 18,
      arrK: 198,
      detail: 'stable repeat',
      baseChurnPct: 14,
      rowTone: 'warn',
      recOverride: 'Standard tier · proceed',
    },
    {
      tier: 'B',
      id: '102801',
      sharePct: 9,
      arrK: 142,
      detail: 'growing',
      baseChurnPct: 11,
      rowTone: 'plain',
    },
    {
      tier: 'D',
      id: '101900',
      sharePct: 7,
      arrK: 164,
      detail: 'problematic',
      detailExtra: "→ surfaced in Heiko's Deal Empowerment",
      baseChurnPct: 71,
      rowTone: 'alert',
      recOverride: 'Attrition acceptable · Heiko can flag',
    },
    {
      tier: 'C',
      id: '101582',
      sharePct: 4,
      arrK: 176,
      detail: 'volume tier',
      baseChurnPct: 6,
      rowTone: 'plain',
    },
  ],
  bkaes: [
    {
      tier: 'A',
      id: '305412',
      sharePct: 34,
      arrK: 612,
      detail: 'long-term · last raise 2022-Q1',
      baseChurnPct: 28,
      rowTone: 'alert',
      recOverride: 'Phased 60/40 over two quarters',
    },
    {
      tier: 'A',
      id: '312080',
      sharePct: 24,
      arrK: 488,
      detail: 'multi-SKU bundle',
      baseChurnPct: 12,
      rowTone: 'warn',
      recOverride: 'Renew with electric-cluster reference',
    },
    {
      tier: 'B',
      id: '308194',
      sharePct: 18,
      arrK: 224,
      detail: 'predictable repeat',
      baseChurnPct: 9,
      rowTone: 'plain',
      recOverride: 'Proceed',
    },
    {
      tier: 'B',
      id: '311265',
      sharePct: 12,
      arrK: 188,
      detail: 'recently expanded',
      baseChurnPct: 16,
      rowTone: 'warn',
      recOverride: 'Apply at next quote',
    },
    {
      tier: 'C',
      id: '309550',
      sharePct: 8,
      arrK: 92,
      detail: 'price-elastic',
      baseChurnPct: 22,
      rowTone: 'plain',
      recOverride: 'Proceed · monitor',
    },
    {
      tier: 'D',
      id: '314722',
      sharePct: 4,
      arrK: 64,
      detail: 'past dispute on lead time',
      baseChurnPct: 58,
      rowTone: 'alert',
      recOverride: 'Heiko reviews · attrition-OK',
    },
  ],
  bkaiz: [
    {
      tier: 'A',
      id: '412330',
      sharePct: 42,
      arrK: 540,
      detail: 'core BKAIZ customer · stable',
      baseChurnPct: 18,
      rowTone: 'warn',
      recOverride: 'Phase in 2 steps',
    },
    {
      tier: 'B',
      id: '415588',
      sharePct: 28,
      arrK: 286,
      detail: 'bundle pricing in place',
      baseChurnPct: 12,
      rowTone: 'plain',
      recOverride: 'Standard renewal',
    },
    {
      tier: 'B',
      id: '418204',
      sharePct: 18,
      arrK: 198,
      detail: 'low-margin tier',
      baseChurnPct: 24,
      rowTone: 'warn',
      recOverride: 'Apply with care',
    },
    {
      tier: 'C',
      id: '421056',
      sharePct: 12,
      arrK: 142,
      detail: 'volume tier · price-elastic',
      baseChurnPct: 30,
      rowTone: 'alert',
      recOverride: 'Slice as A/B before broad apply',
    },
  ],
  sopu: [
    {
      tier: 'B',
      id: '502810',
      sharePct: 64,
      arrK: 92,
      detail: 'small SOPU customer · 2yr relationship',
      baseChurnPct: 35,
      rowTone: 'warn',
      recOverride: 'Manual review (low-n cluster)',
    },
    {
      tier: 'D',
      id: '504112',
      sharePct: 36,
      arrK: 48,
      detail: 'past pricing dispute',
      detailExtra: '→ low cluster confidence',
      baseChurnPct: 62,
      rowTone: 'alert',
      recOverride: "Heiko's call — model n=6",
    },
  ],
};

const CLUSTER_LABELS: Record<WorkbenchPatch['customerCluster'], { name: string; conf: number }> = {
  bkagg: { name: 'BKAGG', conf: 74 },
  bkaes: { name: 'BKAES', conf: 82 },
  bkaiz: { name: 'BKAIZ', conf: 64 },
  sopu: { name: 'SOPU', conf: 38 },
};

function fmtPrice(value: number): string {
  if (value >= 100) return `€${Math.round(value).toLocaleString('de-DE')}`;
  if (value >= 10) return `€${value.toFixed(2)}`;
  return `€${value.toFixed(2)}`;
}

function fmtRecovery(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `+€${(value / 1_000_000).toFixed(2)}M/yr recovery`;
  if (abs >= 1_000) return `+€${Math.round(value / 1000).toLocaleString('de-DE')}K/yr recovery`;
  return `+€${Math.round(value).toLocaleString('de-DE')}/yr recovery`;
}

function fmtLeak(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `−€${(abs / 1_000_000).toFixed(2)}M/yr leakage continues`;
  if (abs >= 1_000) return `−€${Math.round(abs / 1000).toLocaleString('de-DE')}K/yr leakage continues`;
  return `−€${Math.round(abs).toLocaleString('de-DE')}/yr leakage continues`;
}

function buildOptions(patch: WorkbenchPatch): PriceOptionsBundle {
  const { currentPrice, unitCost, targetMarginPct, annualUnits } = patch;
  const floor = unitCost / (1 - targetMarginPct / 100);
  const market = floor * 1.15;
  const floorDelta = floor - currentPrice;
  const floorPct = (floorDelta / currentPrice) * 100;
  const marketDelta = market - currentPrice;
  const marketPct = (marketDelta / currentPrice) * 100;
  const floorRecovery = floorDelta * annualUnits;
  const marketRecovery = marketDelta * annualUnits;
  const leakage = -floorRecovery * 0.6;

  const churnFloor = Math.max(1, Math.round(patch.customerCount / 9));
  const churnMarket = Math.max(churnFloor + 1, Math.round(patch.customerCount / 3));
  const cluster = CLUSTER_LABELS[patch.customerCluster];

  return {
    hold: {
      price: fmtPrice(currentPrice),
      delta: 'no change',
      impact: fmtLeak(leakage),
      impactTone: 'neg',
      risk: '0 churn · margin keeps falling · ±0pp',
    },
    floor: {
      price: fmtPrice(floor),
      delta: `+€${floorDelta.toFixed(floorDelta < 10 ? 2 : 0)} · +${floorPct.toFixed(1)}%`,
      impact: fmtRecovery(floorRecovery),
      impactTone: 'pos',
      risk: `${churnFloor} of ${patch.customerCount} churn · win-rate −15pp · ±5pp at ${cluster.conf}% conf`,
    },
    market: {
      price: fmtPrice(market),
      delta: `+€${marketDelta.toFixed(marketDelta < 10 ? 2 : 0)} · +${marketPct.toFixed(1)}%`,
      impact: fmtRecovery(marketRecovery),
      impactTone: 'pos',
      risk: `${churnMarket} of ${patch.customerCount} churn · win-rate −31pp · ±8pp at ${cluster.conf}% conf`,
    },
    abtest: {
      slice: '12% slice',
      meta: `21-day test · ${fmtPrice(floor)} vs hold`,
      takeaway: 'Confirm lift before broad rollout',
      criterion: 'Success criterion: margin pre→post, p<0.05 · matches Action Center A/B tracker',
    },
    customPlaceholder: floor.toFixed(2),
  };
}

function buildFanout(patch: WorkbenchPatch): FanoutPane {
  const { unitCost, targetMarginPct, currentPrice, annualUnits } = patch;
  const floor = unitCost / (1 - targetMarginPct / 100);
  const floorDelta = floor - currentPrice;
  const cluster = CLUSTER_LABELS[patch.customerCluster];
  const customers = CUSTOMER_SETS[patch.customerCluster];
  const isLowConf = patch.customerCluster === 'sopu';
  const n = patch.clusterN ?? (patch.customerCluster === 'bkagg' ? 247 : patch.customerCluster === 'bkaes' ? 627 : patch.customerCluster === 'bkaiz' ? 142 : 6);

  const rows: FanoutRow[] = customers.slice(0, 6).map((c) => {
    const units = Math.round((annualUnits * c.sharePct) / 100);
    const amount = units * floorDelta;
    const amountSign = amount >= 0 ? '+' : '−';
    const amountAbs = Math.abs(amount);
    const amountFmt =
      amountAbs >= 1000
        ? `${amountSign}€${Math.round(amountAbs / 1000).toLocaleString('de-DE')}K`
        : `${amountSign}€${Math.round(amountAbs).toLocaleString('de-DE')}`;

    return {
      tier: c.tier,
      customer: c.id,
      customerSub: `${c.sharePct}% · €${c.arrK}K ARR · ${c.detail}`,
      customerSubExtra: c.detailExtra,
      amount: amountFmt,
      amountSub: `on ${units.toLocaleString('de-DE')} units`,
      churnPct: `${c.baseChurnPct}%`,
      churnTone: c.baseChurnPct >= 30 ? 'r' : 'g',
      recommendation: c.recOverride ?? 'Proceed',
      rowTone: c.rowTone,
    };
  });

  const note = isLowConf
    ? `Cluster **${cluster.name}**, n=${n} — **low-n confidence ${cluster.conf}%**, fan-out advisory only. Manual review required.`
    : `Cluster **${cluster.name}**, n=${n} historical repricings, confidence **${cluster.conf}%** — fan-out predictions reliable.`;

  return {
    paneSub: `if priced at **${fmtPrice(floor)}** (cost-floor)`,
    fanPrice: fmtPrice(floor),
    clusterNote: note,
    rows,
    footNote: `Top ${rows.length} of ${patch.customerCount} customers shown · churn modelled on 24-month survival curve across ${n} SKUs`,
  };
}

function buildCost(patch: WorkbenchPatch): WorkbenchData['cost'] {
  const components: CostComponent[] = [
    { key: 'material', name: 'Material', pct: patch.cost.material },
    { key: 'labor', name: 'Labor', pct: patch.cost.labor },
    { key: 'outsourcing', name: 'Outsourcing', pct: patch.cost.outsourcing },
    { key: 'overhead', name: 'Overhead', pct: patch.cost.overhead },
  ];
  const floor = patch.unitCost / (1 - patch.targetMarginPct / 100);
  const cluster = CLUSTER_LABELS[patch.customerCluster];
  return {
    paneSub: `€**${patch.unitCost.toFixed(2)}**/unit · floor €**${floor.toFixed(2)}** at ${patch.targetMarginPct}% target`,
    unitCost: patch.unitCost.toFixed(2),
    floorCalc: floor.toFixed(2),
    components,
    note: patch.cost.note,
    trajectory: {
      title: `4-yr cluster cost trajectory · ${cluster.name}`,
      delta: patch.trajectory.delta,
      yearStart: patch.trajectory.yearStart,
      yearEnd: patch.trajectory.yearEnd,
      materialPoints: patch.trajectory.materialPoints ?? '4,30 84,22 164,14 236,8',
      quotedPoints: patch.trajectory.quotedPoints ?? '4,28 84,25 164,18 236,12',
      legend: patch.trajectory.legend,
    },
  };
}

function buildDecision(sku: SkuListEntry, patch: WorkbenchPatch): DecisionData {
  const floor = patch.unitCost / (1 - patch.targetMarginPct / 100);
  const recovery = (floor - patch.currentPrice) * patch.annualUnits;
  const recoveryFmt =
    recovery >= 1000
      ? `+€${Math.round(recovery / 1000).toLocaleString('de-DE')},${Math.round((recovery / 1000) % 1)}00/yr`.replace(/,000\/yr/, ',000/yr')
      : `+€${Math.round(recovery).toLocaleString('de-DE')}/yr`;
  return {
    summary: {
      proposedPrice: fmtPrice(floor),
      aid: sku.aid,
      margin: `${patch.targetMarginPct}%`,
      recovery: recoveryFmt,
      riskLine: patch.riskLine ?? `${Math.max(1, Math.round(patch.customerCount / 9))} customer at meaningful churn risk`,
    },
    effectiveDate: '2026-06-01',
    notifyDefaults: { sales: true, customers: false, escalate: false, abTest: false },
    notifyLabels: {
      sales: 'Notify **Heiko** (Sales)',
      customers: `Notify customers (${Math.max(1, Math.round(patch.customerCount / 9))} affected)`,
      escalate: 'Escalate to **Till** (MD) for board-level approval',
      abTest: '🧪 Open A/B test (slice 12%, 21 days) before broad rollout',
    },
  };
}

function buildMemo(sku: SkuListEntry, patch: WorkbenchPatch): MemoData {
  if (patch.memoOverride) {
    return {
      title: 'Rationale memo · auto-drafted, editable · audit-ready',
      paragraphs: patch.memoOverride,
    };
  }
  const floor = patch.unitCost / (1 - patch.targetMarginPct / 100);
  const cluster = CLUSTER_LABELS[patch.customerCluster];
  const lock = patch.variant === 'frame-locked';
  const newSku = patch.variant === 'new-sku';
  const churnAffected = Math.max(1, Math.round(patch.customerCount / 9));
  const articleTitle = sku.shortHero?.title ?? `Article ${sku.aid}`;

  return {
    title: 'Rationale memo · auto-drafted, editable · audit-ready',
    paragraphs: [
      { body: `**Subject:** Price proposal — ${articleTitle.replace(/^Article /, '')}` },
      {
        body: `Article ${sku.aid} sits in cluster **${cluster.name}** (confidence **${cluster.conf}%**). ${
          newSku
            ? 'No price history — comparable-cluster pricing applies. Use cluster median × cost as anchor.'
            : lock
              ? 'Frame contract is **locked** — proposal is advisory only and queues for the renewal window.'
              : 'Contract status: **movable** — no frame contract blocks repricing.'
        }`,
      },
      {
        body: `The article currently sells at **${fmtPrice(patch.currentPrice)}** at unit cost €${patch.unitCost.toFixed(2)}. ${patch.cost.note}`,
      },
      {
        body: `**Proposal:** ${
          lock ? 'queue **' : 'raise to **'
        }${fmtPrice(floor)}** (cost-floor at ${patch.targetMarginPct}% target margin), effective **2026-06-01**${
          lock ? ' · contingent on frame renewal' : ''
        }.`,
      },
      {
        body: `**Plan:** open a 21-day A/B at 12% slice (Action Center A/B tracker). If margin lift confirms (p<0.05) we proceed to broad rollout 2026-07-01; if not, revert to hold and re-train cluster model. *Never ship a price change blind.*`,
      },
      {
        body: `Customer impact: of ${patch.customerCount} customers on this SKU, ${churnAffected} sit at meaningful churn risk and ${
          churnAffected === 1 ? 'is' : 'are'
        } flagged in Heiko's Deal Empowerment view.`,
      },
      {
        body: `Net annual recovery: **${fmtRecovery((floor - patch.currentPrice) * patch.annualUnits).replace('+€', '+€').replace('/yr recovery', '')}/yr** before projected churn loss.`,
      },
      {
        body: `**Evidence:** cluster retention curve · 4-year cost trend (price_history_with_margin) · ${cluster.name} cluster benchmark · top driver: ${patch.cost.note.split('.')[0].toLowerCase()}.`,
      },
      {
        body: `— **Frank**, Pricing Analyst / Head of Controlling · drafted by Pryzm · audit hash \`${randomHash(sku.aid)}\` · please review before forwarding to Till.`,
        isSig: true,
      },
    ],
  };
}

function randomHash(seed: string): string {
  // Deterministic pseudo-hash from the SKU id so the memo is stable.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hex = Math.abs(h).toString(16).padStart(6, '0').slice(0, 6);
  return hex;
}

export function buildWorkbench(
  sku: SkuListEntry,
  patch: WorkbenchPatch,
  defaults: WorkbenchData,
): WorkbenchData {
  const chips: HeroChipData[] = patch.chipsOverride ?? [
    { label: sku.shortHero?.chipCluster ?? `Cluster: ${CLUSTER_LABELS[patch.customerCluster].name} · confidence ${CLUSTER_LABELS[patch.customerCluster].conf}%` },
    { label: patch.variant === 'frame-locked' ? 'Frame-locked' : 'Movable', variant: 'movable' },
    { label: 'A/B status: not yet tested', variant: 'dashed' },
    { label: sku.shortHero?.chipApproval ?? 'Approval: Frank → Till (board)' },
  ];

  return {
    hero: {
      eyebrow: defaults.hero.eyebrow,
      title: sku.shortHero?.title ?? `Article ${sku.aid}`,
      sub: sku.shortHero?.sub ?? '',
      chipCluster: sku.shortHero?.chipCluster ?? '',
      chipApproval: sku.shortHero?.chipApproval ?? '',
      annualRevenue: defaults.hero.annualRevenue,
      meta: sku.shortHero?.meta ?? '',
      currentPrice: sku.shortHero?.currentPrice ?? fmtPrice(patch.currentPrice),
      currentMargin: sku.shortHero?.currentMargin ?? '',
      currentMarginTone: sku.shortHero?.currentMarginTone ?? 'bad',
      targetText: sku.shortHero?.targetText ?? `Target ≥ ${patch.targetMarginPct}%`,
      chips,
    },
    optionsSub: `Each option pre-modelled · €recovery, churn risk, win-rate band shown with cluster-confidence (${CLUSTER_LABELS[patch.customerCluster].name} ${CLUSTER_LABELS[patch.customerCluster].conf}%, n=${patch.clusterN ?? 247})`,
    options: buildOptions(patch),
    fanout: buildFanout(patch),
    cost: buildCost(patch),
    history: patch.history,
    decision: buildDecision(sku, patch),
    memo: buildMemo(sku, patch),
  };
}
