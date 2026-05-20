// Pricing Studio v3 / Phase K1 — Responsive viewport tests.
//
// Verifies the studio layout holds together at the three desktop
// widths the design contract calls out (1280 / 1440 / 1920). At each
// width we assert:
//   1. No horizontal scrollbar on <html> (allowing 1px slack for
//      sub-pixel rounding from Recharts SVG measurement).
//   2. The DecisionFooter's last button stays within the viewport
//      (no buttons clipped off the right edge).
//   3. Core blocks (SkuPicker / EvidenceTabs / RecommendationHero)
//      render with non-zero bounding rects.
//   4. The three charts (WinProbCurve / WtpBandStrip / CostHistory)
//      fit within their parent card — i.e. no chart overflow.
//   5. ShareDecisionDrawer width === 560 on desktop (K7 contract).
//
// Mock harness layered on top of installStudioMocks, matching the
// pattern in pricing-studio-evidence-tabs.spec.ts so meta.blocks
// comes up "live" and the workbench actually mounts.

import { test, expect, type Page } from '@playwright/test';
import {
  buildStudioPayload,
  installStudioMocks,
  gotoStudio,
} from './_helpers/mock-studio';

// ---- Mock harness ---------------------------------------------------------

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

async function installResponsiveMocks(page: Page) {
  await installStudioMocks(page);

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

  await page.route('**/api/v1/pricing/sku/**/audit**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: [], total: 0, lineage_ref: null }),
    }),
  );
}

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

// ---- Tests ----------------------------------------------------------------

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

test.describe('Pricing Studio — Responsive viewports (Phase K1)', () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.width}x${vp.height} — no horizontal scroll + core blocks visible + charts fit`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installResponsiveMocks(page);
      const aid = await resolveDefaultAid(page);
      await gotoStudio(page, `?aid=${aid}`);

      // (1) No horizontal scrollbar — allow 1px slack for sub-pixel
      // rounding which Recharts occasionally produces inside SVG
      // viewport calculations.
      const overflow = await page.evaluate(() => ({
        docScroll: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
      }));
      expect(overflow.docScroll).toBeLessThanOrEqual(overflow.winWidth + 1);

      // (3) Core blocks render with non-zero bounding rects.
      const skuPicker = page.locator('.ws-picker');
      const hero = page.getByTestId('recommendation-hero');
      const evidence = page.getByTestId('evidence-tabs');

      await expect(skuPicker).toBeVisible();
      await expect(hero).toBeVisible();
      await expect(evidence).toBeVisible();

      const skuBox = await skuPicker.boundingBox();
      const heroBox = await hero.boundingBox();
      const evidenceBox = await evidence.boundingBox();
      expect(skuBox?.width ?? 0).toBeGreaterThan(0);
      expect(skuBox?.height ?? 0).toBeGreaterThan(0);
      expect(heroBox?.width ?? 0).toBeGreaterThan(0);
      expect(heroBox?.height ?? 0).toBeGreaterThan(0);
      expect(evidenceBox?.width ?? 0).toBeGreaterThan(0);
      expect(evidenceBox?.height ?? 0).toBeGreaterThan(0);

      // (2) DecisionFooter — last button fully inside viewport.
      const footer = page.locator('.ws-decision');
      await expect(footer).toBeVisible();
      const lastBtn = footer.locator('button:visible').last();
      const lastBtnBox = await lastBtn.boundingBox();
      expect(lastBtnBox).not.toBeNull();
      expect(lastBtnBox!.x + lastBtnBox!.width).toBeLessThanOrEqual(
        vp.width + 1,
      );

      // (4) Charts fit their parent cards.
      //
      // WinProbCurve, WtpBandStrip, CostHistory each render inside a
      // card wrapper. We compare each chart's bounding rect against
      // its nearest ancestor `[class*="ws-card"], .pz-card, .ws-block`
      // — i.e. the wrapping card surface — and assert the chart's
      // right edge does not exceed the card's right edge.
      const winProb = page.getByTestId('win-prob-curve');
      const wtp = page.getByTestId('wtp-band-strip');
      const costHist = page.getByTestId('cost-traj-sparkline');

      // Each chart may be hidden behind the locked/empty state; only
      // verify those that mounted.
      for (const [name, locator] of [
        ['win-prob-curve', winProb],
        ['wtp-band-strip', wtp],
        ['cost-traj-sparkline', costHist],
      ] as const) {
        if ((await locator.count()) === 0) continue;
        if (!(await locator.first().isVisible())) continue;
        const result = await locator.first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          // Walk up until we find a card-like wrapper.
          let parent: HTMLElement | null = el.parentElement;
          let card: HTMLElement | null = null;
          while (parent) {
            const cls = parent.className || '';
            if (
              typeof cls === 'string' &&
              (cls.includes('ws-card') ||
                cls.includes('pz-card') ||
                cls.includes('ws-block') ||
                cls.includes('rounded'))
            ) {
              card = parent;
              break;
            }
            parent = parent.parentElement;
          }
          const pr = card?.getBoundingClientRect() ?? null;
          return {
            childRight: r.right,
            childWidth: r.width,
            parentRight: pr?.right ?? null,
            parentWidth: pr?.width ?? null,
          };
        });
        expect(result.childWidth, `${name} width > 0`).toBeGreaterThan(0);
        if (result.parentRight !== null) {
          // Allow 1px slack for sub-pixel measurement.
          expect(
            result.childRight,
            `${name} right <= parent card right`,
          ).toBeLessThanOrEqual(result.parentRight + 1);
        }
      }
    });

    test(`${vp.width}x${vp.height} — ShareDecisionDrawer width is 560px (K7 contract)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await installResponsiveMocks(page);
      const aid = await resolveDefaultAid(page);
      await gotoStudio(page, `?aid=${aid}`);

      // Open the drawer via the Share button in the footer.
      await page.getByTestId('decision-footer-share').click();
      const drawer = page.getByTestId('share-decision-drawer');
      await expect(drawer).toBeVisible();

      const box = await drawer.boundingBox();
      expect(box).not.toBeNull();
      // K7 contract: 560px on desktop. Allow 1px slack for rounding.
      expect(box!.width).toBeGreaterThanOrEqual(559);
      expect(box!.width).toBeLessThanOrEqual(561);
    });
  }
});
