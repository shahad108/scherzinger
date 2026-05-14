// v2.1 — fixture extras for the new components (PlanTrackingStrip,
// PocketWaterfallCard, BiasCard, NextCycleMovesStrip) and the canonical
// dataThrough timestamp + filterScope. Kept here rather than in
// `src/data/mocks/forecast.json` so the unit tests' fixture stays minimal.
function v21FixtureExtras() {
  return {
    dataThrough: new Date().toISOString(),
    filterScope: { tier: null, family: null, cluster: null, scenarioId: null },
    planTracking: {
      points: [
        { month: '2026-01', plan: 510_000, actual: 480_000 },
        { month: '2026-02', plan: 545_000, actual: 530_000 },
        { month: '2026-03', plan: 470_000, actual: 458_000 },
        { month: '2026-04', plan: 530_000, actual: null },
        { month: '2026-05', plan: 555_000, actual: null },
        { month: '2026-06', plan: 600_000, actual: null },
      ],
      cumulativeGapEur: -57_000,
      cumulativeGapPct: -3.7,
      recentMonthAttribution: { price: -95_000, volume: -40_000, mix: -25_000, cost: 20_000 },
      resetLog: [
        { at: '2026-02-12T09:00:00Z', by: 'Manuel', reason: 'Steel S355 spike priced in', priorValue: 510_000 },
      ],
    },
    pocketWaterfall: {
      steps: [
        { name: 'list', value: 100, leakagePct: null },
        { name: 'quoted', value: 88, leakagePct: 12 },
        { name: 'booked', value: 80, leakagePct: 9.09 },
        { name: 'invoiced', value: 76, leakagePct: 5 },
        { name: 'db2', value: 18, leakagePct: 76.32 },
      ],
      perCluster: [
        { cluster: 'BKAES', histogram: [{ bin: '70', count: 1 }, { bin: '80', count: 4 }, { bin: '90', count: 2 }], median: 80, p10: 72, p90: 92 },
        { cluster: 'BKAGG', histogram: [{ bin: '60', count: 2 }, { bin: '70', count: 3 }, { bin: '80', count: 1 }], median: 68, p10: 60, p90: 78 },
        { cluster: 'BKAIZ', histogram: [{ bin: '75', count: 2 }, { bin: '82', count: 5 }, { bin: '90', count: 1 }], median: 82, p10: 75, p90: 90 },
        { cluster: 'MBDIV', histogram: [{ bin: '65', count: 1 }, { bin: '75', count: 3 }, { bin: '85', count: 2 }], median: 75, p10: 67, p90: 84 },
      ],
      unit: 'pct_of_list' as const,
    },
    bias: {
      rows: [
        { cluster: 'BKAES', cmeOverMad: 1.2, hitRatePct: 78, trailing6moDirection: 'flat' as const },
        { cluster: 'BKAGG', cmeOverMad: 3.5, hitRatePct: 65, trailing6moDirection: 'over' as const },
        { cluster: 'BKAIZ', cmeOverMad: -1.0, hitRatePct: 82, trailing6moDirection: 'flat' as const },
        { cluster: 'MBDIV', cmeOverMad: -4.5, hitRatePct: 50, trailing6moDirection: 'under' as const },
      ],
      windowMonths: 6,
      footnote: 'Tracking signal = cumulative ME / MAD. |value| > 4 conventionally flags bias.',
    },
    // v2.2 Phase B — actionIntent.kind uses real FormDrawerKind values so the
    // mapped ActionIntent opens the global ActionFeedback drawer host.
    nextMoves: [
      { id: 'm1', rank: 1, cluster: 'BKAGG', headline: 'BKAGG cluster: 12 SKUs below cost-floor', forecastImpactEur: 420_000, sourceSignal: 'cost crossing list price', actionIntent: { kind: 'partial_accept', payload: { cluster: 'BKAGG', sourceScreen: 'forecasting', sourceKind: 'next-cycle-move', headline: 'BKAGG cluster: 12 SKUs below cost-floor' } } },
      { id: 'm2', rank: 2, cluster: null, headline: '38% of quotes lost to PA-code last 90d', forecastImpactEur: 280_000, sourceSignal: 'win-loss · price too high', actionIntent: { kind: 'partial_accept', payload: { sourceScreen: 'forecasting', sourceKind: 'next-cycle-move', headline: '38% of quotes lost to PA-code last 90d', rejectionCode: 'PA', rejectionCount: 38 } } },
      { id: 'm3', rank: 3, cluster: 'BKAES', headline: 'BKAES: 8 renewals overdue', forecastImpactEur: 180_000, sourceSignal: 'renewal queue', actionIntent: { kind: 'queue_renewal', payload: { cluster: 'BKAES', sourceScreen: 'forecasting', sourceKind: 'next-cycle-move', headline: 'BKAES: 8 renewals overdue', articles: ['A-101', 'A-102'] } } },
    ],
  };
}

// Phase 7 helper: deterministic API mocking for the v2 dev server.
//
// We can't depend on the FastAPI backend being up in the test environment, so
// we route every `/api/v1/**` request through Playwright's `page.route`. The
// `forecast.json` mock fixture (the same one the v2 frontend uses in unit
// tests) feeds the forecasting page, and `me.json` lets `RequireAuth` pass.
//
// Overrides get an in-memory stateful mock so the "save → reload → diamond
// persists" leg of the click-to-actual spec works without hitting Postgres.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';

// Resolve mock fixtures relative to this file. Node ESM refuses to import
// JSON without `assert { type: 'json' }`, which Playwright's loader doesn't
// pass through, so we read the files directly.
const here = dirname(fileURLToPath(import.meta.url));
const mocksDir = resolve(here, '../../../src/data/mocks');
const forecastFixture = JSON.parse(
  readFileSync(resolve(mocksDir, 'forecast.json'), 'utf8'),
);
const meFixtureRaw = JSON.parse(
  readFileSync(resolve(mocksDir, 'me.json'), 'utf8'),
);
// Ensure the optional `features` array exists — the auth store types it as
// required and several components rely on it being iterable.
const meFixture = { features: [], ...meFixtureRaw };
const shellFixture = JSON.parse(
  readFileSync(resolve(mocksDir, 'shell.json'), 'utf8'),
);
const actionCenterFixture = JSON.parse(
  readFileSync(resolve(mocksDir, 'action-center.json'), 'utf8'),
);

interface MockOverride {
  id: string;
  month: string;
  cluster: string | null;
  mode: string;
  actual: number;
  modelP50: number;
  adjustmentPct: number;
  source: string;
  confidence: string;
  reason: string;
  author: string;
  createdAt: string;
  fvaDelta: number | null;
}

export interface MockState {
  overrides: MockOverride[];
}

/**
 * Install all API mocks for the forecasting screen onto the page.
 *
 * Returns a `MockState` object the test can inspect (e.g. to assert "a POST
 * happened"). The state is shared across the page lifetime, including
 * across `page.reload()`, which is what makes the persistence leg of the
 * click-to-actual spec work.
 */
export async function installForecastMocks(page: Page): Promise<MockState> {
  const state: MockState = { overrides: [] };

  // Playwright matches routes in REVERSE registration order (last-registered
  // wins), so the catch-all has to come FIRST. Specific endpoints register
  // afterwards and shadow it for their matching URLs.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  );

  await page.route('**/api/v1/forecast/overrides**', (route) =>
    handleOverrides(route, state),
  );
  await page.route('**/api/v1/screens/forecast**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // v2.1 — merge in plan-tracking / pocket-waterfall / bias / next-moves /
      // dataThrough / filterScope so the new components render in visual specs.
      body: JSON.stringify({ ...forecastFixture, ...v21FixtureExtras() }),
    }),
  );
  await page.route('**/api/v1/screens/action-center**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(actionCenterFixture),
    }),
  );
  await page.route('**/api/v1/screens/shell**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(shellFixture),
    }),
  );
  // Register the more general `/me**` first; the more specific
  // `/me/preferences**` afterwards so it wins under Playwright's
  // last-registered-wins matching.
  await page.route('**/api/v1/me**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(meFixture),
    }),
  );
  await page.route('**/api/v1/me/preferences**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ language: 'en' }),
    }),
  );
  await page.route('**/api/v1/saved-views**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  );
  await page.route('**/api/v1/scenarios**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // ScenarioLibrary expects buckets keyed by `system`, `saved`,
      // `teamShared` — `.length` is read on each.
      body: JSON.stringify({ system: [], saved: [], teamShared: [] }),
    }),
  );
  await page.route('**/api/v1/notes**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  );
  await page.route('**/api/v1/forecast/customers**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 }),
    }),
  );
  await page.route('**/api/v1/forecast/lineage**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  );
  await page.route('**/api/v1/forecast/tornado**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  );
  await page.route('**/api/v1/forecast/distributions**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  );
  await page.route('**/api/v1/audit/recent**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  );

  return state;
}

/**
 * Navigate to the v2 forecasting page, working around the app's
 * login → /action-center auto-redirect race (Login.tsx auto-navigates to
 * `defaultLandingFor(user)` the instant `user` becomes truthy, without
 * honoring the `?next=` query param). We accept the bounce: wait for the
 * action-center route to settle, then navigate to the forecast URL.
 */
export async function gotoForecasting(page: Page): Promise<void> {
  // Land on action-center first — RequireAuth + Login.tsx auto-redirect
  // hydrates the zustand auth store with Frank. Once that's done a
  // sidebar-link click to Forecasting goes via React Router (the auth
  // store survives) and a follow-up history.replaceState sets layout=v2.
  await page.goto('/action-center');
  await page
    .waitForSelector('main h1, main h2, main h3', { timeout: 10_000 })
    .catch(() => {});

  // Click the Forecasting sidebar link.
  const forecastingLink = page.getByRole('link', { name: /^Forecasting$/i });
  await forecastingLink.first().click();
  await page
    .waitForURL((url) => url.pathname.includes('/forecasting'), {
      timeout: 10_000,
    })
    .catch(() => {});

  // Toggle to the v2 layout via a router-aware in-place query update so
  // we don't trigger another full reload that would wipe the auth store
  // (the auto-redirect race only happens on cold loads).
  await page.evaluate(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('layout', 'v2');
    window.history.replaceState({}, '', u.toString());
    // Dispatch popstate so react-router-dom's useSearchParams re-reads
    // the URL and re-renders the page in v2 mode.
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await page
    .waitForSelector('[data-testid="hero-kpi-strip"]', { timeout: 15_000 })
    .catch(() => {});

  if (!page.url().includes('/forecasting')) {
    throw new Error(
      `gotoForecasting: expected to land on /forecasting but at ${page.url()}`,
    );
  }
}

async function handleOverrides(route: Route, state: MockState) {
  const req = route.request();
  const method = req.method();
  const url = req.url();

  if (method === 'GET') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: state.overrides }),
    });
  }
  if (method === 'POST') {
    const body = req.postDataJSON() as Partial<MockOverride>;
    const created: MockOverride = {
      id: `mock-${state.overrides.length + 1}`,
      month: String(body.month ?? ''),
      cluster: body.cluster ?? null,
      mode: String(body.mode ?? 'revenue'),
      actual: Number(body.actual ?? 0),
      modelP50: Number(body.modelP50 ?? 0),
      adjustmentPct:
        body.modelP50 && body.actual
          ? Number(body.actual) / Number(body.modelP50) - 1
          : 0,
      source: String(body.source ?? 'manual'),
      confidence: String(body.confidence ?? 'medium'),
      reason: String(body.reason ?? ''),
      author: 'frank-mock',
      createdAt: new Date().toISOString(),
      fvaDelta: null,
    };
    state.overrides.push(created);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(created),
    });
  }
  if (method === 'PATCH') {
    const id = url.split('/').pop()?.split('?')[0];
    const patch = req.postDataJSON() as Partial<MockOverride>;
    const idx = state.overrides.findIndex((o) => o.id === id);
    if (idx >= 0) {
      state.overrides[idx] = { ...state.overrides[idx], ...patch };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.overrides[idx]),
      });
    }
  }
  if (method === 'DELETE') {
    const id = url.split('/').pop()?.split('?')[0];
    state.overrides = state.overrides.filter((o) => o.id !== id);
    return route.fulfill({ status: 204, body: '' });
  }
  return route.fulfill({ status: 405, body: '' });
}
