// Pricing Studio plan B2 + B3 + B4 — Action Center → Studio routing.
//
// Asserts that the four URL contracts produced by Action Center decision
// cards arrive at /pricing and drive the Studio shell correctly:
//
//   1. ?aid=205345-A&source=action-center&reason=margin_erosion
//        → selects 205345-A in SkuPicker
//        → trigger banner shows "Opened from … margin_erosion"
//   2. ?customer=101357&source=action-center&reason=churn
//        → SkuPicker shows only that customer's SKUs
//        → top SKU auto-selected
//        → customer badge visible (Active filters strip)
//   3. ?queue=cost_riser&source=action-center
//        → SkuPicker shows only cost-riser SKUs
//        → queue chip visible
//   4. /pricing (no params) → default behaviour preserved.
//
// The mock harness in `_helpers/mock-studio.ts` returns a static fixture;
// we add a thin extra route layer that filters `shell.skus[]` by the
// incoming `customer_id` + `queue` query strings so we can exercise the
// FE filter contract without a backend.

import { test, expect, type Page } from '@playwright/test';
import {
  buildStudioPayload,
  installStudioMocks,
  gotoStudio,
} from './_helpers/mock-studio';

// Two SKUs we synthesise on the fly to give the customer + queue routes
// something deterministic to assert against. We splice them into the
// returned `skus[]` based on the query params so the FE filter contract
// stays observable.
const CUSTOMER_SCOPED_AIDS = ['CUST-FIRST-A', 'CUST-FIRST-B'];
const QUEUE_COST_RISER_AIDS = ['CR-100', 'CR-101', 'CR-102'];

function makeSku(aid: string, cluster = 'BKAGG') {
  return {
    aid,
    cluster,
    clusterChip: `${cluster} 74%`,
    clusterTone: 'mid',
    flag: 'floor',
    isNew: false,
    locked: false,
    margin: '−1.3%',
    marginTone: 'lo',
    meta: `${cluster} · €4.20 · 4 customers`,
    productLine: 'Zahnradpumpe',
    tag: 'Floor',
    tagTone: 'floor',
  };
}

/**
 * Re-route `/screens/studio` BEFORE installing the default mocks so our
 * filter-aware handler wins (Playwright matches last-registered-first).
 * We delegate to the static fixture but rewrite `skus[]` based on the
 * incoming `customer_id` / `queue` query strings.
 */
async function installRoutingStudioMocks(page: Page) {
  await installStudioMocks(page);
  // The default Studio catch-all returns `{}` for `/screens/studio/workbench/:aid`,
  // which causes the page to crash on `wb.fanout.fanPrice` because the
  // empty object wins over the shell's workbench (truthy). Patch in the
  // shell's workbench for every aid so the page renders.
  await page.route(
    '**/api/v1/screens/studio/workbench/**',
    (route) => {
      const payload = buildStudioPayload();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          (payload as { workbench: unknown }).workbench,
        ),
      });
    },
  );
  // Audit-feed handler so CostHistory doesn't crash on `raw.rows.length`.
  await page.route('**/api/v1/pricing/sku/**/audit**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [], total: 0, lineage_ref: null }),
    }),
  );
  // Override AFTER installStudioMocks so this handler wins (last-registered
  // wins in Playwright). We still start from the same augmented payload
  // (recommendation/wtp/win_prob_curve/...) so the Studio v3 surfaces
  // render cleanly — we only mutate `skus[]` + `defaultAid`.
  await page.route('**/api/v1/screens/studio**', (route) => {
    const url = new URL(route.request().url());
    // The `**` glob also matches `/screens/studio/workbench/*` —
    // delegate those to Playwright's next handler so the per-aid
    // workbench mock above (registered earlier here) still wins.
    if (
      url.pathname.includes('/screens/studio/workbench') ||
      url.pathname.includes('/screens/studio/comparable') ||
      url.pathname.includes('/screens/studio/fanout')
    ) {
      return route.fallback();
    }
    const customerId = url.searchParams.get('customer_id');
    const queue = url.searchParams.get('queue');
    const source = url.searchParams.get('source') ?? undefined;
    const reason = url.searchParams.get('reason') ?? undefined;

    const payload = buildStudioPayload({ source, reason }) as Record<
      string,
      unknown
    >;

    if (customerId) {
      (payload as { skus: unknown[] }).skus = CUSTOMER_SCOPED_AIDS.map((aid) =>
        makeSku(aid),
      );
      (payload as { defaultAid: string }).defaultAid = CUSTOMER_SCOPED_AIDS[0];
    } else if (queue) {
      (payload as { skus: unknown[] }).skus = QUEUE_COST_RISER_AIDS.map((aid) =>
        makeSku(aid),
      );
      (payload as { defaultAid: string }).defaultAid =
        QUEUE_COST_RISER_AIDS[0];
    }

    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

test.describe('Pricing Studio routing — Action Center URL contracts', () => {
  test.beforeEach(async ({ page }) => {
    await installRoutingStudioMocks(page);
  });

  test('B2: ?aid=<id>&source=action-center&reason=margin_erosion selects SKU', async ({
    page,
  }) => {
    await gotoStudio(
      page,
      '?aid=205345-A&source=action-center&reason=margin_erosion',
    );

    // The aid in the URL drives initial selection.
    await expect(page).toHaveURL(/aid=205345-A/);
    await expect(page).toHaveURL(/source=action-center/);
    await expect(page).toHaveURL(/reason=margin_erosion/);

    // The SkuPicker row for the deep-linked aid is the selected one.
    // The button has the testid; the parent <div> carries the `active`
    // class — walk one level up to assert selection.
    await expect(
      page.getByTestId('sku-picker-row-205345-A').locator('xpath=..'),
    ).toHaveClass(/active/);

    // Active filters strip surfaces source + reason chips.
    const strip = page.getByTestId('active-filters-strip');
    await expect(strip).toBeVisible();
    await expect(page.getByTestId('active-filter-source')).toContainText(
      'action-center',
    );
    await expect(page.getByTestId('active-filter-reason')).toContainText(
      'margin_erosion',
    );
  });

  test('B3: ?customer=<cid> scopes SkuPicker + auto-selects top SKU + shows customer badge', async ({
    page,
  }) => {
    await gotoStudio(page, '?customer=101357&source=action-center&reason=churn');

    // SkuPicker only renders the customer-scoped fixture rows.
    for (const aid of CUSTOMER_SCOPED_AIDS) {
      await expect(page.getByTestId(`sku-picker-row-${aid}`)).toBeVisible();
    }
    // SKUs from the default fixture (e.g. 200832-E) are NOT in the picker.
    await expect(
      page.getByTestId('sku-picker-row-200832-E'),
    ).toHaveCount(0);

    // Top SKU auto-selected (parent <div> carries the `active` class).
    await expect(
      page
        .getByTestId(`sku-picker-row-${CUSTOMER_SCOPED_AIDS[0]}`)
        .locator('xpath=..'),
    ).toHaveClass(/active/);

    // Customer badge visible with × clear control.
    const chip = page.getByTestId('active-filter-customer');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('101357');
    await expect(
      page.getByTestId('active-filter-customer-remove'),
    ).toBeVisible();
  });

  test('B4: ?queue=cost_riser scopes SkuPicker + shows queue chip', async ({
    page,
  }) => {
    await gotoStudio(page, '?queue=cost_riser&source=action-center');

    // SkuPicker only renders queue-scoped fixture rows.
    for (const aid of QUEUE_COST_RISER_AIDS) {
      await expect(page.getByTestId(`sku-picker-row-${aid}`)).toBeVisible();
    }
    await expect(
      page.getByTestId('sku-picker-row-200832-E'),
    ).toHaveCount(0);

    // Queue chip visible with friendly label + × clear.
    const chip = page.getByTestId('active-filter-queue');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Cost riser');
    await expect(page.getByTestId('active-filter-queue-remove')).toBeVisible();
  });

  test('No params: default behaviour preserved', async ({ page }) => {
    await gotoStudio(page, '');

    // Default fixture's defaultAid (200832-E) is the selected row.
    await expect(
      page.getByTestId('sku-picker-row-200832-E').locator('xpath=..'),
    ).toHaveClass(/active/);

    // The Active filters strip is hidden (no chips).
    await expect(page.getByTestId('active-filters-strip')).toHaveCount(0);

    // Customer + queue badges are absent.
    await expect(page.getByTestId('active-filter-customer')).toHaveCount(0);
    await expect(page.getByTestId('active-filter-queue')).toHaveCount(0);
  });
});
