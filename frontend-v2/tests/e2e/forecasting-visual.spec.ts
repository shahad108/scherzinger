// Phase 7 — visual regression baselines for the v2 forecasting layout.
//
// Two screenshots:
//   1. First viewport — KPI strip + hero chart fully in view.
//   2. ActualEntryPanel open state — same chart with the side panel
//      mounted on the right.
//
// Re-run with `npx playwright test forecasting-visual.spec.ts
// --update-snapshots` to refresh baselines after intentional design
// changes. The 2% pixel-diff tolerance absorbs subpixel rendering
// differences across runs without masking real regressions.

import { test, expect } from '@playwright/test';
import { installForecastMocks, gotoForecasting } from './_helpers/mock-api';

test.describe('Frank — Forecasting v2 visual baseline', () => {
  test.beforeEach(async ({ page }) => {
    await installForecastMocks(page);
  });

  test('first viewport screenshot — v2 layout', async ({ page }) => {
    await gotoForecasting(page);
    await page.waitForSelector('[data-testid="hero-kpi-strip"]');
    // Give Recharts a tick to finish its layout pass. Animations are
    // already disabled (`isAnimationActive={false}` in HeroForecast), but
    // ResponsiveContainer measures asynchronously so the first frame
    // sometimes has a 1-frame-old line position.
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('forecasting-v2-firstview.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('panel open state', async ({ page }) => {
    test.setTimeout(60_000);  // v2.1 — chart sits below more components now
    await gotoForecasting(page);
    await page.waitForSelector('[data-testid="hero-kpi-strip"]');

    // Trigger the ActualEntryPanel via the same chart-hover dance as the
    // E2E spec. We don't care WHICH month opens — just that the panel is
    // up and the layout looks right.
    await openPanel(page);
    await page.waitForSelector('[data-testid="actual-entry-panel"]');
    await page.waitForTimeout(400);
    await expect(page).toHaveScreenshot('forecasting-v2-panel-open.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });
});

async function openPanel(page: import('@playwright/test').Page) {
  // v2.1 — multiple Recharts surfaces on the page now; scope to the hero
  // chart via its testid + nearest `.hero-card` ancestor div, otherwise we
  // would pick PlanTrackingStrip's chart instead.
  const heroSection = page
    .getByTestId('hero-title')
    .locator('xpath=ancestor::div[contains(@class,"hero-card")][1]');
  const chartSvg = heroSection.locator('.recharts-surface').first();
  await chartSvg.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const box = await chartSvg.boundingBox();
  if (!box) return;
  const activeDot = heroSection.locator('.recharts-active-dot');
  for (let py = 30; py <= 80; py += 10) {
    const y = box.y + (box.height * py) / 100;
    for (let px = 92; px >= 35; px -= 4) {
      const x = box.x + (box.width * px) / 100;
      await page.mouse.move(x, y, { steps: 3 });
      await page.waitForTimeout(80);
      if ((await activeDot.count()) > 0) {
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
