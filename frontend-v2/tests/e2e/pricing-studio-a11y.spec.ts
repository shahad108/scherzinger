// Pricing Studio v3 / Phase K5 — axe-core accessibility scan.
//
// Asserts zero serious/critical violations on:
//   1. Initial page load
//   2. EvidenceTabs Quotes pane (?tab=quotes)
//   3. EvidenceTabs Lineage pane (?tab=lineage)
//   4. ShareDecisionDrawer open
//   5. PublishConfirmationDrawer open
//
// Plus a keyboard-sweep test that walks Tab focus from SkuPicker
// through RecommendationHero / EvidenceTabs / DecisionFooter, asserting
// every focus stop is a real interactive element (not a div with no
// role / tabindex) and that focus actually visits each of those four
// regions.
//
// Moderate / minor violations are logged (not failed) so we know what
// the next polish pass should look at.

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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

function quoteHistoryFixture() {
  return {
    status: 'live',
    reason: null,
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
    ],
    summary: { n_total: 1, n_won: 1, n_lost: 0, win_rate: '1.0000' },
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
    ],
  };
}

async function installA11yMocks(page: Page) {
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

  await page.route('**/api/v1/pricing/sku/**/quote-history**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(quoteHistoryFixture()),
    }),
  );

  await page.route('**/api/v1/pricing/sku/**/lineage**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(lineageListFixture()),
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

// ---- Helpers --------------------------------------------------------------

interface AxeViolation {
  id: string;
  impact: string | null | undefined;
  description: string;
  help: string;
  nodes: { target: string[]; html?: string; failureSummary?: string }[];
}

function bucketViolations(violations: AxeViolation[]) {
  const buckets: Record<string, AxeViolation[]> = {
    critical: [],
    serious: [],
    moderate: [],
    minor: [],
    other: [],
  };
  for (const v of violations) {
    const impact = v.impact ?? 'other';
    if (buckets[impact]) buckets[impact].push(v);
    else buckets.other.push(v);
  }
  return buckets;
}

function formatViolations(label: string, vs: AxeViolation[]): string {
  if (vs.length === 0) return '';
  const lines = [`\n[${label}] ${vs.length} violation(s):`];
  for (const v of vs) {
    lines.push(`  - ${v.id} (${v.impact}): ${v.help}`);
    const targets = v.nodes.flatMap((n) => n.target).slice(0, 3);
    if (targets.length) lines.push(`      target: ${targets.join(' | ')}`);
  }
  return lines.join('\n');
}

async function runAxe(page: Page, label: string) {
  // Radix dialog focus management is sometimes flagged by axe's
  // `aria-hidden-focus` rule when a focus trap moves focus to an
  // element while parent siblings get aria-hidden by the dialog
  // overlay. Since Radix correctly traps focus and is widely
  // accepted as a11y-compliant, we suppress that one rule. We do
  // NOT suppress any other rule. (Documented inline so it doesn't
  // silently become broader over time.)
  const builder = new AxeBuilder({ page }).disableRules([
    'aria-hidden-focus',
  ]);
  const result = await builder.analyze();
  const buckets = bucketViolations(result.violations as AxeViolation[]);
  // Log moderate / minor for context (don't fail on them).
  const moderate = formatViolations(`${label} moderate`, buckets.moderate);
  const minor = formatViolations(`${label} minor`, buckets.minor);
  if (moderate) console.log(moderate);
  if (minor) console.log(minor);
  // Fail on serious / critical with details so the report is actionable.
  if (buckets.critical.length || buckets.serious.length) {
    const details = [
      formatViolations(`${label} critical`, buckets.critical),
      formatViolations(`${label} serious`, buckets.serious),
    ]
      .filter(Boolean)
      .join('\n');
    // Log per-violation nodes (with html snippet + failureSummary) so the
    // CI log is enough to triage without re-running with a trace.
    for (const v of [...buckets.critical, ...buckets.serious]) {
      for (const n of v.nodes) {
        console.log(
          `    [${label} ${v.id}] target=${n.target.join(' | ')}\n      html=${n.html ?? '?'}`,
        );
      }
    }
    throw new Error(
      `[${label}] axe-core found ${buckets.critical.length} critical + ${buckets.serious.length} serious violations:${details}`,
    );
  }
  expect(buckets.critical.length).toBe(0);
  expect(buckets.serious.length).toBe(0);
}

// ---- Tests ----------------------------------------------------------------

test.describe('Pricing Studio — Accessibility (Phase K5)', () => {
  test.beforeEach(async ({ page }) => {
    await installA11yMocks(page);
  });

  test('1. initial page load — zero serious/critical violations', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);
    await expect(page.getByTestId('recommendation-hero')).toBeVisible();
    await runAxe(page, 'initial');
  });

  test('2. EvidenceTabs Quotes pane — zero serious/critical violations', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}&tab=quotes`);
    await expect(
      page.getByTestId('evidence-tabpanel-quotes'),
    ).toBeVisible();
    await runAxe(page, 'quotes-tab');
  });

  test('3. EvidenceTabs Lineage pane — zero serious/critical violations', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}&tab=lineage`);
    await expect(
      page.getByTestId('evidence-tabpanel-lineage'),
    ).toBeVisible();
    await runAxe(page, 'lineage-tab');
  });

  test('4. ShareDecisionDrawer open — zero serious/critical violations', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);
    await page.getByTestId('decision-footer-share').click();
    await expect(page.getByTestId('share-decision-drawer')).toBeVisible();
    await runAxe(page, 'share-drawer');
  });

  test('5. PublishConfirmationDrawer open — zero serious/critical violations', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);
    const pushBtn = page.getByTestId('decision-footer-push');
    await expect(pushBtn).toBeEnabled();
    await pushBtn.click();
    await expect(
      page.getByTestId('publish-confirmation-drawer'),
    ).toBeVisible();
    await runAxe(page, 'publish-drawer');
  });

  test('6. keyboard sweep — SkuPicker → hero → tabs → footer reaches each region', async ({
    page,
  }) => {
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);
    await expect(page.getByTestId('recommendation-hero')).toBeVisible();

    // Seed focus on the first interactive element inside SkuPicker so
    // Tab sweeps start at the top of the workbench (skipping nav).
    const seed = page.getByTestId('sku-picker-mode-single');
    await seed.focus();
    await expect(seed).toBeFocused();

    const reached = {
      skuPicker: true, // seeded
      hero: false,
      evidence: false,
      footer: false,
    };

    // Walk forward Tab presses — cap at 60 stops which is well above
    // the count needed to traverse the workbench without being so high
    // it masks a dead-end loop. After each press assert focus is on a
    // genuine interactive element (real role, button/input/etc, or
    // a node with explicit [tabindex]).
    for (let i = 0; i < 60; i++) {
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const tabindex = el.getAttribute('tabindex');
        const isInteractiveTag =
          tag === 'button' ||
          tag === 'input' ||
          tag === 'select' ||
          tag === 'textarea' ||
          tag === 'a' ||
          tag === 'summary';
        // Walk ancestors and capture nearest container marker for the
        // four regions we care about.
        let region: string | null = null;
        let cur: HTMLElement | null = el;
        while (cur) {
          const cls = cur.className || '';
          const tid = cur.getAttribute?.('data-testid') ?? '';
          if (cur.classList?.contains('ws-picker')) {
            region = 'skuPicker';
            break;
          }
          if (tid === 'recommendation-hero') {
            region = 'hero';
            break;
          }
          if (tid === 'evidence-tabs') {
            region = 'evidence';
            break;
          }
          if (
            cur.classList?.contains('ws-decision') ||
            tid?.startsWith('decision-footer')
          ) {
            region = 'footer';
            break;
          }
          // Use class-string fallback for SSR-stripped class lists.
          if (typeof cls === 'string') {
            if (cls.includes('ws-picker')) {
              region = 'skuPicker';
              break;
            }
            if (cls.includes('ws-decision')) {
              region = 'footer';
              break;
            }
          }
          cur = cur.parentElement;
        }
        return {
          tag,
          role,
          tabindex,
          isInteractive:
            isInteractiveTag || !!role || tabindex !== null,
          region,
        };
      });

      if (info === null) {
        // Focus escaped to body — surface that as a real failure.
        throw new Error(`Tab sweep step ${i}: focus landed on <body>`);
      }
      expect(
        info.isInteractive,
        `Tab step ${i}: focus on non-interactive ${info.tag} (role=${info.role}, tabindex=${info.tabindex})`,
      ).toBe(true);
      if (info.region && info.region in reached) {
        (reached as Record<string, boolean>)[info.region] = true;
      }
      // Early exit once all four regions have been visited.
      if (
        reached.skuPicker &&
        reached.hero &&
        reached.evidence &&
        reached.footer
      ) {
        break;
      }
      await page.keyboard.press('Tab');
    }

    expect(reached.skuPicker, 'focus reached SkuPicker').toBe(true);
    expect(reached.hero, 'focus reached RecommendationHero').toBe(true);
    expect(reached.evidence, 'focus reached EvidenceTabs').toBe(true);
    expect(reached.footer, 'focus reached DecisionFooter').toBe(true);
  });
});
