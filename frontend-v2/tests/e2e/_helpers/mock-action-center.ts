// Task 6 — Playwright mock harness for the Action Center page.
//
// Returns a deterministic payload covering every block (header, summary,
// movableHero, buckets, decisions, trust, lostQuote, skuTable, longTail,
// negotiation, abTests, rejections, audit, meta) with every block set to
// ``status: 'live'``. The test spec calls ``installActionCenterMocks`` and
// can override the payload (e.g. to flip a block status to degraded/locked)
// via the ``payload`` option.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const mocksDir = resolve(here, '../../../src/data/mocks');
const meFixtureRaw = JSON.parse(readFileSync(resolve(mocksDir, 'me.json'), 'utf8'));
const meFixture = { features: [], ...meFixtureRaw };
const shellFixture = JSON.parse(readFileSync(resolve(mocksDir, 'shell.json'), 'utf8'));

/** Canonical block keys used by ``meta.blocks``. */
const BLOCK_KEYS = [
  'summary',
  'movableHero',
  'buckets',
  'decisions',
  'trust',
  'lostQuote',
  'skuTable',
  'longTail',
  'negotiation',
  'abTests',
  'rejections',
  'audit',
] as const;

type BlockKey = (typeof BLOCK_KEYS)[number];
type BlockStatus = 'live' | 'degraded' | 'locked' | 'empty';

interface InstallOptions {
  /** Override or extend the canned action-center payload. Deep-merge is
   *  NOT performed — callers should supply a complete object or merge it
   *  themselves before passing it in. */
  payload?: Record<string, unknown>;
  /** Convenience for flipping specific block statuses without rewriting
   *  the entire payload. */
  blockOverrides?: Partial<Record<BlockKey, { status: BlockStatus; reason?: string }>>;
}

export function buildActionCenterPayload(): Record<string, unknown> {
  const blocks: Record<string, { status: BlockStatus; reason: string | null; coverage: { dataset: string; coveragePct: number } }> = {};
  for (const key of BLOCK_KEYS) {
    blocks[key] = {
      status: 'live',
      reason: null,
      coverage: { dataset: 'invoices', coveragePct: 99 },
    };
  }

  return {
    header: {
      greeting: 'Good morning, Frank.',
      week: 'Week 18',
      dateRange: 'Apr 27 – May 3, 2026',
      stats: [
        { label: 'records', value: '1,313' },
        { label: 'SKUs', value: '1,015' },
        { label: 'commodity groups', value: '4' },
      ],
      workspaceScope: [],
      exportContext: [],
    },
    meta: {
      traceId: 'trace-e2e-action-center',
      dataFreshness: {
        invoices: '2026-05-14T08:00:00Z',
        quotes: '2026-05-14T08:00:00Z',
        models: '2026-05-12T08:00:00Z',
      },
      blocks,
    },
    summary: {
      tiles: [
        {
          id: 'movable_revenue',
          label: 'Movable revenue',
          value: '€3.88M',
          delta: '+9.2% vs Wk 17',
          deltaDirection: 'up',
          tone: 'positive',
          sourceBlockId: 'movableHero',
          locked: false,
          action: { sourceScreen: 'action-center', scroll: '#sec-movable' },
        },
        {
          id: 'open_actions',
          label: 'Open actions',
          value: '5',
          delta: null,
          deltaDirection: 'flat',
          tone: 'warning',
          sourceBlockId: 'decisions',
          locked: false,
          action: { sourceScreen: 'action-center', scroll: '#sec-decisions' },
        },
        {
          id: 'recoverable_margin',
          label: 'Recoverable margin',
          value: '€186k',
          delta: null,
          deltaDirection: 'flat',
          tone: 'positive',
          sourceBlockId: 'decisions',
          locked: false,
          action: { sourceScreen: 'action-center', scroll: '#sec-decisions' },
        },
        {
          id: 'blocked_quotes',
          label: 'Blocked quotes',
          value: '3',
          delta: null,
          deltaDirection: 'flat',
          tone: 'warning',
          sourceBlockId: 'quotes',
          locked: false,
          action: {
            sourceScreen: 'action-center',
            route: '/quotes',
            query: { status: 'blocked', source: 'action-center' },
            toast: 'Opening blocked quotes.',
          },
        },
        {
          id: 'model_trust',
          label: 'Model trust',
          value: '82%',
          delta: null,
          deltaDirection: 'flat',
          tone: 'neutral',
          sourceBlockId: 'trust',
          locked: false,
          action: {
            sourceScreen: 'action-center',
            drawer: {
              title: 'Pattern accuracy details',
              description: 'directional accuracy · top cluster',
              items: [],
            },
          },
        },
      ],
    },
    movableHero: {
      value: '€3.88M',
      delta: '+9.2% vs Wk 17',
      deltaDirection: 'up',
      totalRevenue: '€6.25M',
      movablePct: 62,
      skusInScope: 628,
      skusTotal: 1015,
      lockedValue: '€2.37M',
      lockedPct: 38,
      spark: [2.8, 2.95, 3.05, 3.1, 3.2, 3.18, 3.25, 3.4, 3.45, 3.55, 3.62, 3.7, 3.78, 3.88],
      action: {
        sourceScreen: 'action-center',
        route: '/pricing',
        query: { queue: 'repricing', source: 'action-center' },
        toast: 'Opening the repricing queue in Pricing Studio.',
      },
    },
    buckets: {
      filters: [
        { id: 'all',            label: 'All',            count: 3, queueRoute: { sourceScreen: 'action-center', noop: true }, tone: 'neutral' },
        { id: 'churn',          label: 'Churn risk',     count: 1, queueRoute: { sourceScreen: 'action-center', route: '/pricing', query: { queue: 'churn',          source: 'action-center' }, toast: 'Opening Churn risk queue in Pricing Studio.' }, tone: 'warning' },
        { id: 'cost_riser',     label: 'Cost risers',    count: 1, queueRoute: { sourceScreen: 'action-center', route: '/pricing', query: { queue: 'cost_riser',     source: 'action-center' }, toast: 'Opening Cost risers queue in Pricing Studio.' }, tone: 'warning' },
        { id: 'margin_erosion', label: 'Margin erosion', count: 1, queueRoute: { sourceScreen: 'action-center', route: '/pricing', query: { queue: 'margin_erosion', source: 'action-center' }, toast: 'Opening Margin erosion queue in Pricing Studio.' }, tone: 'warning' },
      ],
    },
    decisions: [
      decisionRow({
        rank: '1',
        queue: 'margin_erosion',
        cardId: 'rec-margin-200832',
        recommendationId: 'margin_erosion:200832-E',
        articleId: '200832-E',
        headline: 'Article 200832-E (Elektro-Zahnradpumpe, BKAES) · margin 30.6% → 6.4%',
        cluster: { label: 'BKAES', confidence: 82, n: 627 },
        contract: 'movable',
        confidence: { score: 84, tone: 'positive', model: { id: 'margin_erosion_v3', version: '0.7.1', trainedAt: '2026-04-29T08:00:00Z' } },
        featureImportance: [
          { feature: 'unit_cost_trend',  weightPct: 36 },
          { feature: 'win_prob_curve',   weightPct: 22 },
          { feature: 'competitor_index', weightPct: 18 },
        ],
        lifecycleState: 'open',
        linkedQuoteIds: ['Q-2026-04-1182'],
        linkedSkuIds: ['200832-E'],
      }),
      decisionRow({
        rank: '2',
        queue: 'cost_riser',
        cardId: 'rec-cost-204604',
        recommendationId: 'cost_riser:204604',
        articleId: '204604',
        headline: 'Article 204604 (Zahnradpumpe, BKAGG) · margin 32.7% → 11.8%',
        cluster: { label: 'BKAGG', confidence: 74, n: 370 },
        contract: 'movable',
        confidence: { score: 72, tone: 'warning', model: { id: 'cost_riser_v3', version: '0.6.0', trainedAt: '2026-04-22T08:00:00Z' } },
        // Empty feature importance with a populated model → "No driver decomposition available yet."
        featureImportance: [],
        lifecycleState: 'open',
        linkedQuoteIds: [],
        linkedSkuIds: ['204604'],
      }),
      decisionRow({
        rank: '3',
        queue: 'churn',
        cardId: 'rec-churn-205169',
        recommendationId: 'churn:205169',
        articleId: '205169',
        headline: 'Customer 102330 churn risk · 205169',
        cluster: { label: 'BKAGG', confidence: 74, n: 370 },
        contract: 'locked',
        confidence: { score: 65, tone: 'neutral', model: { id: null, version: null, trainedAt: null } },
        featureImportance: [], // empty + null model.id → LockedDrivers placeholder
        lifecycleState: 'open',
        linkedQuoteIds: [],
        linkedSkuIds: ['205169'],
        primaryCta: 'Open customer',
      }),
    ],
    trust: [
      { label: 'Churn model F1',  value: '0.76', caption: 'precision 0.72 · recall 0.81 · n=827 customers' },
      { label: 'Forecast error',  value: '<5%',  caption: 'Q1 2025 actuals · walk-forward · MC bands' },
      { label: 'Anomalies caught', value: '33',  caption: '15 negative-margin · 18 missing · €342k exposure' },
      { label: 'Data coverage',   value: '99.2%', caption: 'Invoices 99.2% · Margin 89.4% · Quote 73.1% (gap)' },
    ],
    lostQuote: {
      wonAvg: 70.6,
      lostAvg: 72.4,
      differential: 1.8,
      pValue: 0.006,
      implication: 'Customers walk away from premium-margin quotes.',
      linkedRecords: { quotes: 312, invoices: 274 },
      quoteInvoiceGap: {
        overall: { n: 274, mean_gap_pp: 2.1, median_gap_pp: 1.9 },
        byYear: [
          { year: '2022', mean_gap_pp: 1.4, median_gap_pp: 1.1, n: 62 },
          { year: '2023', mean_gap_pp: 1.8, median_gap_pp: 1.7, n: 71 },
          { year: '2024', mean_gap_pp: 2.2, median_gap_pp: 2.0, n: 73 },
          { year: '2025', mean_gap_pp: 2.5, median_gap_pp: 2.4, n: 68 },
        ],
      },
      action: {
        sourceScreen: 'action-center',
        route: '/margin',
        query: { focus: 'lost_quote', source: 'action-center' },
        toast: 'Opening lost-quote margin analysis.',
      },
    },
    skuTable: [
      skuRow({
        article: '200832-E',
        commodity: 'BKAES',
        margin: '30.6% → 6.4%',
        marginTone: 'negative',
        clusterConf: 82,
        clusterTone: 'high',
        confidence: { score: 84, sampleSize: 627 },
        revenueAtRisk: 220_000,
        lastMoveDays: 42,
        priceBookFloor: 3.95, priceBookCeiling: 4.80,
      }),
      skuRow({
        article: '204604',
        commodity: 'BKAGG',
        margin: '32.7% → 11.8%',
        marginTone: 'negative',
        clusterConf: 74,
        clusterTone: 'mid',
        confidence: { score: 72, sampleSize: 370 },
        revenueAtRisk: 145_000,
        lastMoveDays: 120,
        priceBookFloor: 5.0, priceBookCeiling: 6.0,
      }),
      skuRow({
        article: '205169',
        commodity: 'BKAGG',
        margin: '70.1% → 44.2%',
        marginTone: 'warning',
        clusterConf: 74,
        clusterTone: 'mid',
        confidence: { score: 65, sampleSize: 370 },
        revenueAtRisk: 88_000,
        lastMoveDays: 380, // → triggers stale chip
        priceBookFloor: 7.5, priceBookCeiling: 10.5,
      }),
      skuRow({
        article: '205418-A',
        commodity: 'BKAES',
        margin: '24.0% → 27.3%',
        marginTone: 'positive',
        clusterConf: 82,
        clusterTone: 'high',
        confidence: { score: 80, sampleSize: 627 },
        revenueAtRisk: 32_000,
        lastMoveDays: null, // → no audit history
        priceBookFloor: null, priceBookCeiling: null,
      }),
    ],
    longTail: {
      tiles: [
        { label: 'Top-10 SKU concentration', value: '38%', caption: 'of revenue' },
        { label: 'SKUs below DB-II target',  value: '207', caption: 'warning 145 + critical 62' },
        { label: 'New products (last 12mo)', value: '203', caption: '€1.5M revenue · 8.3% of total' },
        { label: 'C-tier price-frozen',      value: '47',  caption: 'SKUs untouched >9 months' },
      ],
      mix: [
        { label: 'A · 38%', subtitle: 'top 10% (well-covered)', pct: 38, tone: 'rose' },
        { label: 'B · 35%', subtitle: 'mid 40% (partial)',      pct: 35, tone: 'amber' },
        { label: 'C · 27%', subtitle: 'bottom 50% (gap)',       pct: 27, tone: 'muted' },
      ],
    },
    negotiation: {
      discountGap: '17.4%',
      discountGapDelta: '−15pp',
      commodities: [
        { name: 'Steel',         delta: '+5.8% YTD', tone: 'positive', note: 'pass-through 3pp behind cost' },
        { name: 'Aluminum',      delta: '+2.1%',     tone: 'positive' },
        { name: 'Copper',        delta: '−1.4%',     tone: 'negative' },
        { name: 'Brass',         delta: '+3.2%',     tone: 'positive' },
      ],
      summary: ['Steel pass-through 3pp behind cost', 'Raw materials moderating', 'Negotiation window: Sep–Nov 2026'],
    },
    rejections: [
      { rank: '1', code: 'KA · Data quality', subtitle: 'Quote pipeline missing competitor price field.', lostRevenue: '€842k', share: '41%', owner: 'Frank' },
      { rank: '2', code: 'Price too high',    subtitle: 'Customers comparing against incumbent.',         lostRevenue: '€612k', share: '30%', owner: 'Heiko' },
      { rank: '3', code: 'Lead time',         subtitle: 'Manufacturing capacity constraint.',            lostRevenue: '€198k', share: '10%', owner: 'Operations' },
    ],
    abTests: [
      {
        id: 'ab-1', rank: 'A', title: '205418-A · Coupling B', subtitle: 'slice 12% · day 9 of 21',
        trend: 'trending positive', trendTone: 'positive', preMargin: '24.0%', postMargin: '27.3%',
        lift: '+3.3pp', liftTone: 'positive', status: 'Day 9 / 21',
        actions: {
          hold:    { abTestId: 'ab-1', articleId: '205418-A', sourceScreen: 'action-center', drawer: { title: 'Hold A/B test · 205418-A', description: 'Pause without ending.', formKind: 'ab_hold', context: { abTestId: 'ab-1', articleId: '205418-A' } } },
          stop:    { kind: 'stop_ab_test', targetType: 'ab_test', targetId: 'ab-1', abTestId: 'ab-1', articleId: '205418-A', sourceScreen: 'action-center', body: { test_id: 'ab-1', aid: '205418-A' }, toast: 'ab-1 stopped.', toastSeverity: 'warning' },
          promote: { abTestId: 'ab-1', articleId: '205418-A', sourceScreen: 'action-center', drawer: { title: 'Promote A/B · 205418-A', description: 'Promote treatment.', formKind: 'ab_promote', context: { abTestId: 'ab-1', articleId: '205418-A' } } },
        },
      },
    ],
    audit: [
      { ts: '2026-04-30 14:22', actor: 'Frank',    change: 'Updated rule "Min DB II margin 45%"', delta: 'pre: 42% → post: 45% · 531 violations affected' },
      { ts: '2026-04-28 09:15', actor: 'System',   change: 'Churn model retrained',               delta: '2022-Q1 to 2024-Q3 · 827 customers · F1 0.74→0.76' },
      { ts: '2026-04-26 16:48', actor: 'Frank',    change: 'Adjusted catalog price 200832-E',     delta: '€4.10 → €4.38 · A/B initiated' },
    ],
  };
}

interface DecisionInput {
  rank: string;
  queue: 'churn' | 'cost_riser' | 'margin_erosion';
  cardId: string;
  recommendationId: string;
  articleId: string;
  headline: string;
  cluster: { label: string; confidence: number; n: number };
  contract: 'movable' | 'locked' | 'abtest';
  confidence: {
    score: number;
    tone: 'positive' | 'warning' | 'negative' | 'neutral';
    model: { id: string | null; version: string | null; trainedAt: string | null };
  };
  featureImportance: { feature: string; weightPct: number }[];
  lifecycleState: 'open' | 'accepted' | 'rejected' | 'partial' | 'snoozed';
  linkedQuoteIds: string[];
  linkedSkuIds: string[];
  primaryCta?: string;
}

function decisionRow(d: DecisionInput) {
  return {
    id: d.cardId,
    rank: d.rank,
    queue: d.queue,
    severity: 'warning',
    title: d.headline,
    headline: d.headline,
    why: 'Evidence summary from the BFF.',
    tag: 'Margin Erosion',
    daysOpenLabel: '1 day open',
    authorityLabel: 'Your authority',
    tags: [],
    meta: [],
    cluster: d.cluster,
    contract: d.contract,
    recommendation: 'Open in Pricing Studio',
    timeMinutes: 10,
    confLabel: d.confidence.tone === 'positive' ? 'High' : d.confidence.tone === 'warning' ? 'Medium' : 'Low',
    facts: [
      { label: 'Margin drift',      value: '30.6% → 6.4%',  detail: 'over 2 years',    tone: 'negative' },
      { label: 'Customer mismatch', value: '€4.10 vs €6.80', detail: 'same tier-2 volume', tone: 'neutral' },
      { label: 'Expected impact',   value: '€18,600 / yr',  detail: 'High confidence', tone: 'positive' },
    ],
    trend: { label: 'Margin · 2yr', value: '6.4%', delta: '↓ 24.2pp', spark: [30.6, 26.5, 22.0, 17.8, 12.1, 6.4] },
    primaryCta: d.primaryCta ?? 'Open in Studio →',
    secondaryCta: 'Insert From Library',
    cta: d.primaryCta ?? 'Open in Studio →',
    recommendationId: d.recommendationId,
    status: 'open',
    lifecycleState: d.lifecycleState,
    evidence: {
      invoiceCount: 412,
      quoteCount: 38,
      lastInvoiceDate: '2026-04-30T08:00:00Z',
      sampleSize: 627,
    },
    confidence: d.confidence,
    featureImportance: d.featureImportance,
    linkedQuoteIds: d.linkedQuoteIds,
    linkedSkuIds: d.linkedSkuIds,
    primaryAction: {
      kind: 'accept_recommendation',
      targetType: 'recommendation',
      targetId: d.recommendationId,
      recommendationId: d.recommendationId,
      articleId: d.articleId,
      cluster: d.cluster.label,
      sourceScreen: 'action-center',
      body: { recommendation_id: d.recommendationId, target_type: 'recommendation', target_id: d.recommendationId, article_id: d.articleId, cluster: d.cluster.label },
      toast: `Accepted recommendation for ${d.articleId}.`,
    },
    secondaryAction: {
      recommendationId: d.recommendationId,
      articleId: d.articleId,
      cluster: d.cluster.label,
      sourceScreen: 'action-center',
      route: '/pricing',
      query: { aid: d.articleId, recommendation: d.recommendationId, source: 'action-center' },
      toast: `Opening ${d.articleId} in Pricing Studio.`,
    },
    partialAction: {
      drawer: {
        title: 'Partial acceptance',
        description: `Soft proposal for ${d.articleId}.`,
        formKind: 'partial_accept',
        context: { recommendationId: d.recommendationId, articleId: d.articleId, cluster: d.cluster.label, headline: d.headline },
      },
    },
    snoozeAction: {
      drawer: {
        title: 'Snooze recommendation',
        description: 'Hide until a future review window.',
        formKind: 'snooze',
        context: { recommendationId: d.recommendationId, articleId: d.articleId, cluster: d.cluster.label, headline: d.headline },
      },
    },
    sliceAbAction: {
      drawer: {
        title: 'Start A/B test',
        description: `Slice a measured price test for ${d.articleId}.`,
        formKind: 'ab_setup',
        context: { articleId: d.articleId, cluster: d.cluster.label, headline: `A/B ${d.articleId}` },
      },
    },
  };
}

interface SkuInput {
  article: string;
  commodity: string;
  margin: string;
  marginTone: 'negative' | 'positive' | 'warning' | 'neutral';
  clusterConf: number;
  clusterTone: 'high' | 'mid' | 'low';
  confidence: { score: number; sampleSize: number };
  revenueAtRisk: number | null;
  lastMoveDays: number | null;
  priceBookFloor: number | null;
  priceBookCeiling: number | null;
}

function skuRow(s: SkuInput) {
  return {
    article: s.article,
    description: 'Zahnradpumpe',
    commodity: s.commodity,
    clusterConf: s.clusterConf,
    clusterTone: s.clusterTone,
    confidence: { score: s.confidence.score, tone: 'positive', sampleSize: s.confidence.sampleSize, model: { id: 'sku_v3', version: '0.5.0', trainedAt: '2026-04-22T08:00:00Z' } },
    marginDelta: s.margin,
    marginTone: s.marginTone,
    status: 'movable',
    statusLabel: 'Movable',
    actionLabel: 'Open in Studio',
    revenueAtRisk: s.revenueAtRisk,
    lastMoveDays: s.lastMoveDays,
    priceBookFloor: s.priceBookFloor,
    priceBookCeiling: s.priceBookCeiling,
    action: {
      articleId: s.article,
      sourceScreen: 'action-center',
      route: '/pricing',
      query: { aid: s.article, source: 'action-center' },
      toast: `Opening ${s.article} in Pricing Studio.`,
    },
  };
}

/** Install every route the action-center page touches. */
export async function installActionCenterMocks(page: Page, opts: InstallOptions = {}) {
  const basePayload = opts.payload ?? buildActionCenterPayload();
  // Apply block-status overrides on top of the canned payload.
  if (opts.blockOverrides) {
    const meta = (basePayload as { meta?: { blocks?: Record<string, unknown> } }).meta;
    if (meta?.blocks) {
      for (const [key, override] of Object.entries(opts.blockOverrides)) {
        const existing = (meta.blocks as Record<string, Record<string, unknown>>)[key] ?? {};
        (meta.blocks as Record<string, Record<string, unknown>>)[key] = {
          ...existing,
          status: override?.status,
          reason: override?.reason ?? existing.reason ?? null,
        };
      }
    }
  }

  // Catch-all must register FIRST (Playwright resolves routes in REVERSE
  // registration order). Targeted handlers shadow the catch-all.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
  );

  await page.route('**/api/v1/screens/action-center**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(basePayload),
    }),
  );

  await page.route('**/api/v1/screens/shell**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(shellFixture) }),
  );

  await page.route('**/api/v1/me**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(meFixture) }),
  );
  await page.route('**/api/v1/me/preferences**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ language: 'en' }) }),
  );

  // Saved-views + scenarios + notes endpoints (Sidebar/Layout calls).
  await page.route('**/api/v1/saved-views**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
  await page.route('**/api/v1/scenarios**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ system: [], saved: [], teamShared: [] }) }),
  );
  await page.route('**/api/v1/notes**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );

  // Action / Decision write-side.
  await page.route('**/api/v1/actions**', (route) => handleActions(route));

  // Trust drawer.
  await page.route('**/api/v1/models/trust-drawer**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tiles: [
          {
            key: 'directional_accuracy',
            label: 'Pattern accuracy',
            value: '82%',
            caption: 'top cluster',
            explainer: 'Directional accuracy on the top cluster.',
            source: { metric: 'directional_accuracy', dataset: 'invoices' },
            top_clusters: [
              { entity_label: 'BKAES', entity_id: 'BKAES', model_name: 'margin_v3', metric: 'directional_accuracy', metric_value: 0.84, n: 627 },
            ],
          },
        ],
        models: [
          {
            model_name: 'margin_v3',
            version: '0.7.1',
            last_trained_at: '2026-04-29T08:00:00Z',
            holdout_months: 6,
            clusters: ['BKAES', 'BKAGG'],
            features: ['unit_cost_trend', 'win_prob_curve'],
            notes: null,
          },
        ],
      }),
    }),
  );

  // Report job — Playwright resolves routes in REVERSE registration order
  // (last wins). Register the generic fetch FIRST so the more specific
  // generate / send handlers shadow it for their matching URLs.
  await page.route('**/api/v1/reports/*', (route) => handleReportFetch(route));
  await page.route('**/api/v1/reports/*/send**', (route) => handleReportSend(route));
  await page.route('**/api/v1/reports/action-center**', (route) => handleReportGenerate(route));

  // Audit + approvals (Sidebar bell etc.).
  await page.route('**/api/v1/audit/recent**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
  await page.route('**/api/v1/approvals**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
}

async function handleActions(route: Route) {
  const method = route.request().method();
  if (method === 'POST') {
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'act-' + Math.floor(Math.random() * 1e9), status: 'ok' }),
    });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
}

let reportJobCounter = 0;

async function handleReportGenerate(route: Route) {
  const method = route.request().method();
  if (method !== 'POST') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  }
  reportJobCounter += 1;
  const id = `rep-${reportJobCounter.toString().padStart(8, '0')}`;
  return route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({
      id,
      status: 'ready',
      traceId: 'trace-e2e-report',
      download_url: 'about:blank',
      payload: { artifact_html: '<html><body>preview</body></html>' },
      preview: {
        recommendation_count: 7,
        proposal_count: 4,
        draft_proposal_count: 2,
        pending_approval_count: 1,
        ab_test_count: 1,
        audit_count: 12,
        generated_for_name: 'Frank',
        generated_at: new Date().toISOString(),
      },
    }),
  });
}

async function handleReportSend(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'rep-00000001',
      status: 'sent',
      traceId: 'trace-e2e-report',
      preview: {
        recommendation_count: 7,
        proposal_count: 4,
        draft_proposal_count: 2,
        pending_approval_count: 1,
        ab_test_count: 1,
        audit_count: 12,
        generated_for_name: 'Frank',
        generated_at: new Date().toISOString(),
      },
    }),
  });
}

async function handleReportFetch(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'rep-00000001', status: 'ready' }),
  });
}

/** Navigate to the Action Center and wait for the page-head greeting. */
export async function gotoActionCenter(page: Page, search = ''): Promise<void> {
  const path = search.startsWith('?') ? `/action-center${search}` : `/action-center${search ? `?${search}` : ''}`;
  await page.goto(path);
  await page.waitForSelector('[data-testid="ac-greeting"]', { timeout: 15_000 });
}
