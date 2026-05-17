// Phase 12 — Pricing Studio v3 Playwright mock harness.
//
// The dev BFF can't always be brought up in CI (real DB / Postgres /
// seed data dependencies), so this helper intercepts the
// `/api/v1/**` calls the Studio page makes and returns canned JSON.
//
// Strategy:
//   1. Catch-all returns `{}` so any unmapped endpoint resolves
//      successfully without breaking the page.
//   2. `/screens/studio` returns the bundled studio.json, augmented with
//      a recommendation block + trigger_context + customer_fanout +
//      option_margins so the Phase 1/2/3 surfaces render.
//   3. Targeted handlers for the drawer/approval/alert/batch
//      endpoints exercised by the spec.
//
// Keep this file mock-only. Anything that needs to actually exercise
// backend logic belongs in the pytest suite.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';

// Resolve mock fixtures relative to this file. Node ESM refuses to import
// JSON without `assert { type: 'json' }`, which Playwright's loader doesn't
// pass through, so we read the files directly.
const here = dirname(fileURLToPath(import.meta.url));
const mocksDir = resolve(here, '../../../src/data/mocks');
const studioFixture = JSON.parse(
  readFileSync(resolve(mocksDir, 'studio.json'), 'utf8'),
);
const meFixtureRaw = JSON.parse(
  readFileSync(resolve(mocksDir, 'me.json'), 'utf8'),
);
const meFixture = { features: [], ...meFixtureRaw };
const shellFixture = JSON.parse(
  readFileSync(resolve(mocksDir, 'shell.json'), 'utf8'),
);
const actionCenterFixture = JSON.parse(
  readFileSync(resolve(mocksDir, 'action-center.json'), 'utf8'),
);

// Pricing Studio v3 / Phase 1+3+5+9 — typed BFF blocks injected into the
// shipped studio.json so the new Studio v3 surfaces (RecommendationHero,
// TriggerBanner, ApprovalStepper, AlertButton, ...) all render.
function buildStudioPayload(opts: { source?: string; reason?: string } = {}) {
  const recommendation = {
    aid: '200832-E',
    recommended_price: '4.65',
    confidence: '0.78',
    confidence_level: 'high' as const,
    band: {
      min: '4.45',
      max: '4.92',
    },
    drivers: [
      {
        kind: 'cost_trajectory',
        label: 'Cost trajectory',
        weight: 0.42,
        direction: 'up',
        details: 'Steel S355 +6.4% in 60d',
      },
      {
        kind: 'competitor_signal',
        label: 'Competitor signal',
        weight: 0.28,
        direction: 'up',
        details: 'Bosch list +3% on equivalent SKU',
      },
      {
        kind: 'win_prob_optimum',
        label: 'Win-prob optimum',
        weight: 0.18,
        direction: 'down',
        details: '€4.65 maximises expected margin',
      },
      {
        kind: 'customer_mix',
        label: 'Customer mix',
        weight: 0.12,
        direction: 'flat',
        details: '74% of customers are price-tolerant',
      },
    ],
    rationale_md:
      'Cost has moved +6.4% in 60d. Win-prob curve still favours €4.65 even at the new cost. Recommend counter-propose.',
    lineage_ref: {
      id: 'lr-rec-200832-E',
      source_kind: 'pricing.recommendation',
      source_id: '200832-E',
      sql: null,
      model: 'recommendation_v3',
      computed_at: new Date().toISOString(),
      computed_by: 'pricing.recommender',
    },
  };

  const trigger_context =
    opts.source && opts.reason
      ? {
          source: opts.source,
          reason: opts.reason,
          headline:
            opts.reason === 'cost-spike'
              ? 'Steel S355 spike priced in — cost +6.4% in 60d'
              : 'Margin erosion flagged',
          details: 'Cost crossed the working floor. Recommend a counter-propose.',
          link_label:
            opts.source === 'forecasting' ? 'Open Forecasting cost decomposition'
              : opts.source === 'margin' ? 'Open Margin Cockpit cost lens'
              : 'Open source',
          link_target:
            opts.source === 'forecasting' ? '/forecasting?cluster=BKAGG#commodities'
              : opts.source === 'margin' ? '/margin?aid=200832-E#cost'
              : '/',
          lineage_ref: {
            id: 'lr-trigger-200832-E',
            source_kind: 'pricing.cost_trajectory',
            source_id: '200832-E',
            sql: null,
            model: 'cost_trajectory_v1',
            computed_at: new Date().toISOString(),
            computed_by: 'pricing.cost_trajectory',
          },
        }
      : null;

  const wtp = {
    aid: '200832-E',
    tier: 'B',
    p10: '4.20',
    p50: '4.62',
    p90: '5.05',
    n_deals: 142,
    window_days: 365,
    confidence: 'high' as const,
  };

  const win_prob_curve = {
    aid: '200832-E',
    points: [
      { price: '4.20', win_prob: '0.92' },
      { price: '4.45', win_prob: '0.86' },
      { price: '4.65', win_prob: '0.78' },
      { price: '4.85', win_prob: '0.62' },
      { price: '5.05', win_prob: '0.42' },
    ],
    optimum_price: '4.65',
  };

  const customer_fanout = {
    aid: '200832-E',
    proposed_price: null,
    rows: [
      {
        customer_id: 'C-001',
        customer_name: 'BKAGG Alpha GmbH',
        cluster: 'BKAGG',
        last_price_paid: '4.20',
        revenue_12mo: '180000',
        risk_if_moved: '0.18',
        accepts_at: '4.65',
        margin_if_accepts: '0.082',
      },
      {
        customer_id: 'C-002',
        customer_name: 'BKAGG Beta KG',
        cluster: 'BKAGG',
        last_price_paid: '4.30',
        revenue_12mo: '92000',
        risk_if_moved: '0.06',
        accepts_at: '4.65',
        margin_if_accepts: '0.094',
      },
    ],
    summary: {
      total_revenue: '272000',
      weighted_risk: '0.14',
      n_customers: 2,
    },
  };

  const option_margins = [
    {
      price: '4.45',
      list_price: '4.45',
      unit_cost: '4.30',
      gross_margin: '0.034',
      net_margin: '0.018',
    },
    {
      price: '4.65',
      list_price: '4.65',
      unit_cost: '4.30',
      gross_margin: '0.075',
      net_margin: '0.055',
    },
    {
      price: '4.85',
      list_price: '4.85',
      unit_cost: '4.30',
      gross_margin: '0.113',
      net_margin: '0.092',
    },
  ];

  const cost_history = {
    aid: '200832-E',
    points: Array.from({ length: 12 }).map((_, i) => ({
      at: new Date(Date.now() - (11 - i) * 30 * 86400 * 1000).toISOString(),
      unit_cost: (4.05 + i * 0.02).toFixed(2),
    })),
    moves: [
      {
        at: new Date(Date.now() - 60 * 86400 * 1000).toISOString(),
        from: '4.20',
        to: '4.30',
        delta_pct: 0.0238,
        commodity: 'steel_s355',
      },
    ],
  };

  return {
    ...studioFixture,
    workbench: {
      ...studioFixture.workbench,
      recommendation,
      trigger_context,
      wtp,
      win_prob_curve,
      customer_fanout,
      option_margins,
      cost_history,
      competitor_ref: null,
      active_ab_test: null,
    },
  };
}

// Pricing Studio v3 / Phase 4 — audit feed mock.
function auditFeedFixture() {
  const now = Date.now();
  return {
    items: [
      {
        id: 'a-1',
        at: new Date(now - 60_000).toISOString(),
        actor: 'frank-mock',
        action: 'proposal_created',
        target_kind: 'sku',
        target_id: '200832-E',
        before: null,
        after: { aid: '200832-E', recommended_price: '4.65' },
        reason: 'Steel S355 spike',
        lineage_ref: null,
      },
    ],
    next_cursor: null,
  };
}

// Pricing Studio v3 / Phase 5 — approval inbox mock with one pending row.
// Shape is `ApprovalInboxResponse` = { items, total, cached? }.
function approvalInboxFixture() {
  return {
    items: [
      {
        approval_instance_id: 'ai-001',
        aid: '200832-E',
        proposed_price: 4.65,
        current_price: 4.2,
        status: 'pending',
        approvers_required: ['till@scherzinger.de'],
        approvers_acted: [],
        created_at: new Date().toISOString(),
      },
    ],
    total: 1,
  };
}

// Pricing Studio v3 / Phase 9 — alerts inbox mock. Shape is
// `AlertInboxResponse` = { events: PricingAlertEvent[] }.
function alertsInboxFixture() {
  return { events: [] };
}

/**
 * Install Pricing Studio v3 API mocks on a Playwright page. Mocks are
 * idempotent — the same handlers can be re-installed between tests.
 *
 * The catch-all is registered FIRST (Playwright uses last-registered-wins
 * matching). Specific handlers register afterwards.
 */
export async function installStudioMocks(
  page: Page,
  opts: { source?: string; reason?: string } = {},
): Promise<void> {
  // Catch-all — everything else resolves with `{}`. The Studio page
  // tolerates missing optional blocks gracefully.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  );

  // /me and /screens/shell hydrate the auth store and sidebar so the
  // Studio page actually renders past RequireAuth.
  await page.route('**/api/v1/me**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(meFixture),
    }),
  );
  await page.route('**/api/v1/screens/shell**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(shellFixture),
    }),
  );

  // Action Center (in case any redirect bounces us there).
  await page.route('**/api/v1/screens/action-center**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(actionCenterFixture),
    }),
  );

  // Studio shell.
  await page.route('**/api/v1/screens/studio**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildStudioPayload(opts)),
    }),
  );

  // Phase 2 — fanout re-score POST returns the same fanout block.
  await page.route('**/api/v1/screens/studio/fanout**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildStudioPayload(opts).workbench.customer_fanout),
    }),
  );

  // Phase 1/10 — lineage detail (GET /lineage/{refId}).
  await page.route('**/api/v1/lineage/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'lr-rec-200832-E',
        source_kind: 'pricing.recommendation',
        source_id: '200832-E',
        sql: null,
        model: 'recommendation_v3',
        computed_at: new Date().toISOString(),
        computed_by: 'pricing.recommender',
        preview: [
          { field: 'window_days', value: 365 },
          { field: 'n_deals', value: 142 },
        ],
      }),
    }),
  );

  // Phase 4 — audit feed.
  await page.route('**/api/v1/audit/recent**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(auditFeedFixture()),
    }),
  );

  // Phase 5 — approval inbox.
  await page.route('**/api/v1/approvals/inbox**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(approvalInboxFixture()),
    }),
  );

  // Phase 7 — proposals list + publish + price-book.
  await page.route('**/api/v1/pricing/proposals**', (route) =>
    handleProposals(route),
  );
  await page.route('**/api/v1/pricing/publish**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        published_at: new Date().toISOString(),
        effective_at: new Date().toISOString(),
        notified_count: 3,
      }),
    }),
  );

  // Phase 6 — batch endpoints.
  await page.route('**/api/v1/pricing/batches**', (route) =>
    handleBatch(route),
  );

  // Phase 9 — alerts. Order matters: Playwright matches LAST-registered
  // first, so register the more-specific `/alerts/inbox` AFTER the
  // generic `/alerts` handler so it wins for GET inbox calls.
  await page.route('**/api/v1/pricing/alerts**', (route) =>
    handleAlerts(route),
  );
  await page.route('**/api/v1/pricing/alerts/inbox**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(alertsInboxFixture()),
    }),
  );

  // SSE stream — return an empty stream (just keep the connection alive
  // with an immediate close so the EventSource fallback retries are not
  // observable in the visual tests).
  await page.route('**/api/v1/events/stream**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
      body: ':\n\n',
    }),
  );

  // Saved views (Phase 11).
  await page.route('**/api/v1/saved-views**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  );

  // User language (Phase 10 German toggle).
  await page.route('**/api/v1/users/me/language**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ language: 'en' }),
    }),
  );

  // Preferences.
  await page.route('**/api/v1/me/preferences**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ language: 'en' }),
    }),
  );
}

async function handleProposals(route: Route) {
  const method = route.request().method();
  if (method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'p-00000001',
            aid: '200832-E',
            article_id: '200832-E',
            recommendation_id: null,
            status: 'draft',
            proposed_price: 4.65,
            current_price: 4.2,
            payload: { created_by: 'frank-mock' },
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        next_cursor: null,
      }),
    });
  }
  return route.fulfill({ status: 405, body: '' });
}

let mockBatchId = 0;

async function handleBatch(route: Route) {
  const req = route.request();
  const method = req.method();
  const url = req.url();

  if (method === 'POST' && /\/batches\/?(\?|$)/.test(url)) {
    const body = req.postDataJSON() as { aids?: string[] };
    mockBatchId += 1;
    const batchId = `b-${mockBatchId.toString().padStart(3, '0')}`;
    const aids = body.aids ?? [];
    let autoApprove = 0;
    let blocked = 0;
    const items = aids.map((aid, i) => {
      const isAuto = i % 3 === 0;
      const isBlocked = i % 3 === 2;
      if (isAuto) autoApprove += 1;
      if (isBlocked) blocked += 1;
      return {
        id: `bi-${i + 1}`,
        aid,
        before_price: (4.0 + i * 0.1).toFixed(2),
        after_price: (4.5 + i * 0.1).toFixed(2),
        status: 'preview',
        proposal_id: null,
        per_sku_lineage_ref: null,
        preview: {
          aid,
          before_price: (4.0 + i * 0.1).toFixed(2),
          after_price: (4.5 + i * 0.1).toFixed(2),
          delta: '0.50',
          delta_pct: '0.125',
          projected_db2: '0.075',
          win_prob_at_new: '0.78',
          risk_score: '0.20',
          lineage_ref: null,
          approval_route: isBlocked ? ['till', 'mfd'] : isAuto ? [] : ['till'],
          auto_approve: isAuto,
          block: isBlocked,
          note: null,
        },
      };
    });
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        batch_id: batchId,
        status: 'preview',
        created_by: 'frank-mock',
        rule: { kind: 'floor_plus', margin_pp: '8' },
        scope_filter: {},
        items,
        approval_routing_summary: {
          auto_approve: autoApprove,
          block: blocked,
          till: Math.max(items.length - autoApprove - blocked, 0),
          heiko: 0,
          mfd: blocked,
        },
        kpi_summary: {
          count: items.length,
          total_revenue_impact: '12500',
          total_margin_impact: '4200',
          avg_win_prob_at_new: '0.78',
        },
        created_at: new Date().toISOString(),
        committed_at: null,
      }),
    });
  }

  if (method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_cursor: null }),
    });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({}),
  });
}

async function handleAlerts(route: Route) {
  const method = route.request().method();
  const url = route.request().url();
  if (method === 'POST') {
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        alert: {
          id: 'al-001',
          kind: 'cost_threshold',
          scope: 'sku',
          params: { pct: '5', days: 30 },
          channels: ['inbox'],
          created_at: new Date().toISOString(),
        },
      }),
    });
  }
  // GET /alerts → AlertsListResponse = { alerts: [] }; the /inbox path
  // is routed via the more-specific handler below.
  if (url.includes('/inbox')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: [] }),
    });
  }
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ alerts: [] }),
  });
}

/**
 * Navigate to /pricing and wait for the workbench to mount. Mirrors the
 * gotoForecasting helper — Login auto-redirects on cold load, so we land
 * on /action-center first and then click into Pricing.
 *
 * For deep-link tests, pass `query` and we'll go directly there once
 * auth is hydrated.
 */
export async function gotoStudio(
  page: Page,
  query: string = '?aid=200832-E',
): Promise<void> {
  // Login.tsx auto-redirects to `defaultLandingFor(persona)` without
  // honouring the `?next=` query when /me succeeds in the background.
  // So a cold `page.goto('/pricing')` bounces:
  //   /pricing → /login?next=/pricing → /action-center.
  //
  // Mirror gotoForecasting: land on /action-center first, then once the
  // auth store is hydrated do an in-place router navigation to /pricing
  // (which RequireAuth happily lets through because user is now set).
  await page.goto('/action-center');
  await page
    .waitForSelector('main h1, main h2, main h3', { timeout: 10_000 })
    .catch(() => {});

  // Click the Pricing Studio sidebar link, then merge in the deep-link
  // query via a router-aware history.replaceState + popstate so we don't
  // trigger a fresh /pricing cold load (which would re-bounce).
  const link = page.getByRole('link', { name: /Pricing Studio/i });
  await link.first().click();
  await page
    .waitForURL((url) => url.pathname.includes('/pricing'), { timeout: 10_000 })
    .catch(() => {});

  if (query) {
    await page.evaluate((q) => {
      const u = new URL(window.location.href);
      const incoming = new URL(q, window.location.href);
      incoming.searchParams.forEach((v, k) => u.searchParams.set(k, v));
      window.history.replaceState({}, '', u.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, query);
  }

  await page.waitForSelector('[data-testid="recommendation-hero"]', {
    timeout: 15_000,
  });
}
