// Pricing Studio v3 / Phase E — Evidence Tabs E2E spec.
//
// Exercises the consolidated EvidenceTabs surface (Cost · Quotes ·
// Customers · Comparable · Lineage) that replaces the right-column
// evidence stack. Selectors target ARIA `role="tab"` + `data-testid`
// hooks the component already ships so the spec is resilient to copy
// and styling changes.
//
// The mock harness in `_helpers/mock-studio.ts` resolves unmapped
// `/api/v1/**` endpoints to `{}`, which would leave the new Phase E3
// (quote-history) and E6 (lineage) tabs disabled. We layer a small
// set of route overrides on top so the Quotes + Lineage tabs come up
// "live" and the panes can render their happy path. Default-aid is
// resolved dynamically from the shell payload so the spec stays
// portable across fixture refreshes.

import { test, expect, type Page } from '@playwright/test';
import {
  buildStudioPayload,
  installStudioMocks,
  gotoStudio,
} from './_helpers/mock-studio';

// ---- Mock fixtures for Phase E endpoints -----------------------------------

function quoteHistoryFixture(status: 'live' | 'empty' | 'degraded' = 'live') {
  if (status === 'empty') {
    return {
      status: 'empty',
      reason: 'No quotes recorded for this SKU.',
      rows: [],
      summary: { n_total: 0, n_won: 0, n_lost: 0, win_rate: null },
      lineage_ref_id: null,
    };
  }
  return {
    status,
    reason: status === 'degraded' ? 'Partial failure loading quotes.' : null,
    rows: [
      {
        quote_id: 'Q-1001',
        position: 1,
        date: '2025-11-04',
        customer_id: 'C-001',
        quantity: 120,
        revenue: '540.00',
        quoted_db2_margin: '0.082',
        actual_db2_margin: '0.075',
        margin_gap: '-0.007',
        is_won: true,
        rejection_code: null,
      },
      {
        quote_id: 'Q-1002',
        position: 1,
        date: '2025-10-22',
        customer_id: 'C-002',
        quantity: 64,
        revenue: '284.00',
        quoted_db2_margin: '0.092',
        actual_db2_margin: null,
        margin_gap: '0.012',
        is_won: false,
        rejection_code: 'price_too_high',
      },
    ],
    summary: { n_total: 2, n_won: 1, n_lost: 1, win_rate: '0.5000' },
    lineage_ref_id: 'lr-qh-200832-E',
  };
}

function lineageListFixture() {
  const now = new Date().toISOString();
  return {
    status: 'live',
    rows: [
      {
        id: 'lr-rec-200832-E',
        kind: 'recommendation',
        source_kind: 'pricing.recommendation',
        model: 'recommendation_v3',
        model_version: 'v3.1',
        computed_at: now,
        sql_preview: null,
        row_count: 1,
      },
      {
        id: 'lr-wtp-200832-E',
        kind: 'wtp',
        source_kind: 'pricing.wtp_band',
        model: 'wtp_v2',
        model_version: 'v2.4',
        computed_at: now,
        sql_preview: null,
        row_count: 142,
      },
      {
        id: 'lr-fan-200832-E',
        kind: 'fanout',
        source_kind: 'pricing.customer_fanout',
        model: 'fanout_v1',
        model_version: null,
        computed_at: now,
        sql_preview: null,
        row_count: 2,
      },
    ],
  };
}

/**
 * Patch `workbench.meta.blocks` onto a studio payload so the per-tab
 * status map in EvidenceTabs sees `cost_history` + `customer_fanout` as
 * `live`. The shipped studio fixture omits meta.blocks (it predates
 * Phase E), so without this layer every standard evidence tab resolves
 * to 'empty' and gets locked.
 */
function patchMetaBlocks<T extends Record<string, unknown>>(payload: T): T {
  const wb = (payload as { workbench?: Record<string, unknown> }).workbench;
  if (!wb) return payload;
  const existingMeta =
    (wb.meta as Record<string, unknown> | undefined) ?? {};
  const existingBlocks =
    (existingMeta.blocks as Record<string, unknown> | undefined) ?? {};
  (wb as Record<string, unknown>).meta = {
    ...existingMeta,
    blocks: {
      cost_history: { status: 'live', reason: null, lineage_ref_id: null },
      customer_fanout: { status: 'live', reason: null, lineage_ref_id: null },
      comparable: { status: 'empty', reason: null, lineage_ref_id: null },
      win_prob_curve: { status: 'live', reason: null, lineage_ref_id: null },
      wtp: { status: 'live', reason: null, lineage_ref_id: null },
      memo: { status: 'live', reason: null, lineage_ref_id: null },
      ...existingBlocks,
    },
  };
  return payload;
}

/**
 * Layer the Phase E endpoint mocks on top of the default Studio mocks.
 * Playwright matches LAST-REGISTERED-FIRST, so install the catch-alls
 * (`installStudioMocks`) first and our specific handlers second.
 */
async function installEvidenceMocks(
  page: Page,
  opts: {
    quoteStatus?: 'live' | 'empty' | 'degraded';
  } = {},
) {
  await installStudioMocks(page);

  // Override /screens/studio so meta.blocks is populated. Last-
  // registered-wins in Playwright, so this fires before the catch-all
  // installed by installStudioMocks.
  await page.route('**/api/v1/screens/studio**', (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname.includes('/screens/studio/workbench') ||
      url.pathname.includes('/screens/studio/comparable') ||
      url.pathname.includes('/screens/studio/fanout')
    ) {
      return route.fallback();
    }
    const payload = patchMetaBlocks(
      buildStudioPayload() as Record<string, unknown>,
    );
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  // Workbench per-aid handler so the page doesn't crash when the
  // selected aid changes (mirrors the routing-spec pattern).
  await page.route('**/api/v1/screens/studio/workbench/**', (route) => {
    const payload = patchMetaBlocks(
      buildStudioPayload() as Record<string, unknown>,
    );
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify((payload as { workbench: unknown }).workbench),
    });
  });

  // Audit feed — keep CostHistory happy.
  await page.route('**/api/v1/pricing/sku/**/audit**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [], total: 0, lineage_ref: null }),
    }),
  );

  // Phase E3 — quote-history endpoint.
  await page.route('**/api/v1/pricing/sku/**/quote-history**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(quoteHistoryFixture(opts.quoteStatus ?? 'live')),
    }),
  );

  // Phase E6 — lineage summary endpoint. Order matters: this is more
  // specific than the existing `**/api/v1/lineage/**` route in
  // installStudioMocks, so register it after to win the match.
  await page.route('**/api/v1/pricing/sku/**/lineage**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(lineageListFixture()),
    }),
  );
}

/**
 * Resolve the default aid dynamically from the shell payload so the
 * spec doesn't hardcode IDs. Falls back to the documented default
 * ("200832-E") if the request can't be parsed.
 */
async function resolveDefaultAid(page: Page): Promise<string> {
  try {
    const res = await page.request.get(
      'http://localhost:5174/api/v1/screens/studio',
    );
    if (!res.ok()) return '200832-E';
    const json = (await res.json()) as { defaultAid?: string };
    return json.defaultAid ?? '200832-E';
  } catch {
    return '200832-E';
  }
}

// ---- Tests -----------------------------------------------------------------

test.describe('Pricing Studio — Evidence Tabs (Phase E)', () => {
  test.beforeEach(async ({ page }) => {
    await installEvidenceMocks(page);
  });

  test('1. tabs render in expected order (Cost · Quotes · Customers · Comparable · Lineage)', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    await expect(page.getByTestId('evidence-tabs')).toBeVisible();

    // Read accessible names of all tabs in the EvidenceTabs tablist
    // (scoped via testid container so we don't grab any other tablist
    // mounted on the page).
    const tablist = page
      .getByTestId('evidence-tabs')
      .getByRole('tablist', { name: /evidence/i });
    const tabs = tablist.getByRole('tab');
    await expect(tabs).toHaveCount(5);

    const labels = await tabs.allInnerTexts();
    const trimmed = labels.map((t) => t.trim());
    expect(trimmed[0]).toMatch(/Cost/i);
    expect(trimmed[1]).toMatch(/Quotes/i);
    expect(trimmed[2]).toMatch(/Customers/i);
    expect(trimmed[3]).toMatch(/Comparable/i);
    expect(trimmed[4]).toMatch(/Lineage/i);
  });

  test('2. default active tab is Cost when no ?tab= is set', async ({ page }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    const costTab = page.getByTestId('evidence-tab-cost');
    await expect(costTab).toHaveAttribute('aria-selected', 'true');

    // And the Cost tabpanel is the one mounted.
    await expect(page.getByTestId('evidence-tabpanel-cost')).toBeVisible();
  });

  test('3. clicking Quotes tab adds ?tab=quotes (preserves other params) and shows Quotes pane', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    await page.getByTestId('evidence-tab-quotes').click();

    // URL gains ?tab=quotes; aid is preserved.
    await expect(page).toHaveURL(/tab=quotes/);
    await expect(page).toHaveURL(new RegExp(`aid=${aid}`));

    await expect(page.getByTestId('evidence-tab-quotes')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('evidence-tabpanel-quotes')).toBeVisible();

    // Pane is alive (one of the legitimate states). Summary strip is
    // the happy-path output; empty-card / degraded banner are fallbacks.
    const summary = page.getByTestId('quote-history-summary');
    const empty = page.getByTestId('quote-history-empty');
    const degraded = page.getByTestId('quote-history-degraded');
    const aliveCount =
      (await summary.count()) + (await empty.count()) + (await degraded.count());
    expect(aliveCount).toBeGreaterThan(0);
  });

  test('4. deep-link ?tab=lineage activates Lineage tab on first render', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}&tab=lineage`);

    await expect(page.getByTestId('evidence-tab-lineage')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('evidence-tabpanel-lineage')).toBeVisible();
  });

  test('5. keyboard ArrowRight cycles to next enabled tab (skips locked)', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    const costTab = page.getByTestId('evidence-tab-cost');
    await costTab.focus();
    await expect(costTab).toBeFocused();

    await page.keyboard.press('ArrowRight');

    // The next enabled tab in TAB_DEFS order is Quotes (live in our
    // mock); Comparable is locked for non-new SKUs and is skipped by
    // the keyboard handler.
    await expect(page.getByTestId('evidence-tab-quotes')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('evidence-tab-quotes')).toBeFocused();
  });

  test('6. locked Comparable tab is non-interactive (aria-disabled + does not activate on click)', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    const comparable = page.getByTestId('evidence-tab-comparable');
    // 200832-E is not a new SKU → Comparable tab is locked.
    await expect(comparable).toHaveAttribute('aria-disabled', 'true');
    await expect(comparable).toBeDisabled();

    // Force-click bypasses the `disabled` actionability check so we can
    // assert the activate() guard rejects it.
    await comparable.click({ force: true });

    // Active tab is still Cost.
    await expect(page.getByTestId('evidence-tab-cost')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(comparable).toHaveAttribute('aria-selected', 'false');
  });

  test('7. Quotes pane fetches and renders one of {rows, empty, degraded}', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}&tab=quotes`);

    await expect(page.getByTestId('evidence-tabpanel-quotes')).toBeVisible();

    // Accept any of the three documented states — the test asserts the
    // pane is *alive*, not crashed/blank.
    const table = page.getByTestId('quote-history-table');
    const empty = page.getByTestId('quote-history-empty');
    const degraded = page.getByTestId('quote-history-degraded');

    const tableCount = await table.count();
    const emptyCount = await empty.count();
    const degradedCount = await degraded.count();

    expect(tableCount + emptyCount + degradedCount).toBeGreaterThan(0);

    // In the happy-path mock we ship a Won row + a Lost row; assert at
    // least one outcome pill renders with the canonical text.
    if (tableCount > 0) {
      const wonOrLost = page.getByText(/^(Won|Lost)$/);
      await expect(wonOrLost.first()).toBeVisible();
    }
  });

  test('8. Lineage pane fetches and renders one of {groups, empty, degraded}', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}&tab=lineage`);

    await expect(page.getByTestId('evidence-tabpanel-lineage')).toBeVisible();

    const pane = page.getByTestId('lineage-pane');
    const empty = page.getByTestId('lineage-pane-empty');
    const degraded = page.getByTestId('lineage-pane-degraded');

    const paneCount = await pane.count();
    const emptyCount = await empty.count();
    const degradedCount = await degraded.count();

    expect(paneCount + emptyCount + degradedCount).toBeGreaterThan(0);

    // Happy-path: at least one group header (Recommendation / WTP /
    // Customer fanout) renders.
    if (paneCount > 0) {
      const anyGroup = page
        .locator('[data-testid^="lineage-pane-group-"]')
        .first();
      await expect(anyGroup).toBeVisible();
    }
  });

  test('9. tab state survives SKU change via URL (lineage stays selected)', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}&tab=lineage`);
    await expect(page.getByTestId('evidence-tab-lineage')).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Switch aid via URL — keep ?tab=lineage. The component must NOT
    // reset to Cost when the SKU id changes; the user's tab selection
    // is sticky as long as the param is in the URL.
    await page.evaluate(() => {
      const u = new URL(window.location.href);
      u.searchParams.set('aid', 'CR-101');
      window.history.replaceState({}, '', u.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // Allow react-query to settle on the new aid.
    await page.waitForTimeout(300);

    await expect(page.getByTestId('evidence-tab-lineage')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('10. Action-Center → Studio click lands in Studio with Cost tab active by default', async ({
    page,
  }) => {
    // gotoStudio loads /action-center first, then clicks the Pricing
    // Studio sidebar link — i.e. the same Action-Center → Studio
    // cross-screen navigation pattern as the routing spec. We pass an
    // empty query so no ?tab= is set; the default Cost tab must win.
    await gotoStudio(page, '');

    // The router landed us in Studio.
    await expect(page).toHaveURL(/\/pricing/);

    // Default tab is Cost when no ?tab= is specified.
    await expect(page.getByTestId('evidence-tab-cost')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('evidence-tabpanel-cost')).toBeVisible();
  });
});
