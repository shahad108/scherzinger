// Phase 7 — E2E spec for Frank's click-to-actual workflow on the v2
// forecasting layout. We mock every backend dependency so the test is
// deterministic and does not require FastAPI + Postgres to be up.
//
// Two tests:
//   A. Layout: KPI strip + hero are in the first viewport (y < 900).
//   B. Click month → ActualEntryPanel → FVA warning under 5% → bigger
//      adjustment hides the warning → Save → diamond appears → reload →
//      diamond still there.
//
// Click strategy: HeroForecast uses Recharts' `activeDot` for the primary
// (forecast) line, so there are no permanent `.recharts-line-dots circle`
// elements for forecast months. We hover the chart to surface the active
// dot, then click on it. If that flakes, the fallback is a direct mouse
// click near the rightmost x of the plotting area.

import { test, expect } from '@playwright/test';
import { installForecastMocks, gotoForecasting } from './_helpers/mock-api';

test.describe('Frank — Forecasting v2 click-to-actual', () => {
  test.beforeEach(async ({ page }) => {
    await installForecastMocks(page);
  });

  test('layout puts KPI strip + hero in first viewport', async ({ page }) => {
    await gotoForecasting(page);
    const kpi = page.getByTestId('hero-kpi-strip');
    await expect(kpi).toBeVisible();

    // Hero title lives inside HeroForecast — it's the load-bearing chart
    // heading and the y-coord we want to assert lives above the fold.
    const heroTitle = page.getByTestId('hero-title');
    await expect(heroTitle).toBeVisible();
    const heroBox = await heroTitle.boundingBox();
    expect(heroBox?.y ?? 9999).toBeLessThan(900);
  });

  test('click month opens entry panel, FVA warns small, save persists diamond', async ({
    page,
  }) => {
    await gotoForecasting(page);

    // Wait for the chart to render. ResponsiveContainer mounts the SVG
    // asynchronously; if we click too early the activeDot won't exist.
    await expect(page.getByTestId('hero-kpi-strip')).toBeVisible();
    const chartSvg = page.locator('.recharts-surface').first();
    await expect(chartSvg).toBeVisible();

    // Open the actual-entry panel. The primary line uses `dot={false}` so
    // the only way in is via the activeDot — hover near the right edge of
    // the chart (= forecast region) to surface it, then click.
    await openEntryPanelViaChart(page);

    const panel = page.getByTestId('actual-entry-panel');
    await expect(panel).toBeVisible();

    // Pull the model P50 from the panel's "Model forecast" block. The
    // display is `€{toLocaleString()}` — typically "€6.55" or
    // "€1,234,567" depending on scale. We parse by stripping the euro
    // sign and group separators while preserving the decimal point. The
    // browser locale here is German-ish (en-US fallback in dev), so the
    // decimal separator is `.` and groups are `,`. We strip commas first
    // and parse as float.
    const modelP50Text = await panel
      .locator('text=/€[0-9.,]+/')
      .first()
      .textContent();
    const cleaned = (modelP50Text ?? '0').replace(/[€\s]/g, '').replace(/,/g, '');
    const modelP50 = Number(cleaned);
    expect(modelP50).toBeGreaterThan(0);

    // Step 1: small (~2%) adjustment → FVA warning should show. We use a
    // higher-precision number for small modelP50s (the fixture revenue is
    // ratio-scale ~6.55, so 2% above is ~6.68 — rounding loses that
    // entirely). Toggle between integer and 2-decimal precision based on
    // magnitude.
    const fmt = (n: number) => (modelP50 >= 100 ? String(Math.round(n)) : n.toFixed(2));
    const smallAdjust = modelP50 * 1.02;
    await page.getByTestId('actual-input').fill(fmt(smallAdjust));
    await page
      .getByTestId('reason-input')
      .fill('Customer confirmed forecast number this morning');
    await expect(page.getByTestId('fva-warning')).toBeVisible();

    // Step 2: bigger (~15%) adjustment → FVA warning should disappear.
    const bigAdjust = modelP50 * 1.15;
    await page.getByTestId('actual-input').fill(fmt(bigAdjust));
    await expect(page.getByTestId('fva-warning')).toHaveCount(0);

    // Step 3: save and verify the panel closes + the diamond appears.
    await page.getByRole('button', { name: /Save actual/i }).click();
    await expect(panel).toBeHidden({ timeout: 3_000 });

    // Diamond glyph from the Scatter override series renders as a polygon.
    await expect(
      page.locator('.recharts-scatter-symbol').first(),
    ).toBeVisible({ timeout: 5_000 });

    // Step 4: reload — stateful mock keeps the override, so the diamond
    // should still be there. A raw `page.reload()` triggers the same
    // login → /action-center auto-redirect race as the initial cold
    // load (the zustand store is in-memory and is wiped on reload), so
    // we use the same bounce-aware helper instead.
    await gotoForecasting(page);
    await expect(page.getByTestId('hero-kpi-strip')).toBeVisible();
    const scatter = page.locator('.recharts-scatter-symbol');
    await scatter.first().waitFor({ state: 'attached', timeout: 5_000 });
    await expect(scatter.first()).toBeVisible({ timeout: 5_000 });
  });
});

/**
 * Open the ActualEntryPanel by triggering a Recharts activeDot click. The
 * primary forecast line has `dot={false}` and only surfaces an activeDot on
 * hover — only the primary line's activeDot has the `onClick` that opens
 * the panel (the actual line has activeDot but no handler). We hover the
 * chart at multiple x positions across the forecast region until a
 * `.recharts-active-dot` is rendered, then click it.
 */
async function openEntryPanelViaChart(page: import('@playwright/test').Page) {
  const chartSvg = page.locator('.recharts-surface').first();
  // The chart sits below a 900px viewport; scroll into view first.
  await chartSvg.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  // Re-capture the bounding box AFTER scrolling — playwright's mouse
  // takes viewport-relative coords so the y must reflect the post-scroll
  // position.
  const box = await chartSvg.boundingBox();
  if (!box) throw new Error('chart svg has no bounding box');

  const activeDot = page.locator('.recharts-active-dot');

  // Sweep x and y with Playwright's mouse. Recharts surfaces an
  // activeDot when the cursor is over the primary forecast line. Once
  // the dot is visible we click via Playwright (which produces a real
  // browser click event so Recharts' onClick receives the proper
  // payload, not just a synthetic MouseEvent dispatch).
  for (let py = 30; py <= 80; py += 10) {
    const y = box.y + (box.height * py) / 100;
    for (let px = 92; px >= 35; px -= 4) {
      const x = box.x + (box.width * px) / 100;
      await page.mouse.move(x, y, { steps: 3 });
      await page.waitForTimeout(80);
      if ((await activeDot.count()) > 0) {
        // Use mouse.click (not locator.click) so we click at exactly the
        // hovered coords without Playwright re-resolving the element.
        await page.mouse.click(x, y);
        const opened = await page
          .getByTestId('actual-entry-panel')
          .waitFor({ state: 'visible', timeout: 1_500 })
          .then(() => true)
          .catch(() => false);
        if (opened) return;
      }
    }
  }
}
