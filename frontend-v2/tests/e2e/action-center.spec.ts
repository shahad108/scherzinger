// Task 6 — Exhaustive Playwright E2E for /action-center.
//
// Covers every block, every button, every numeric value sourced from the
// BFF, inline expansions, drawer/route intents, sorting, filtering,
// bulk-select, accept/reject optimistic, degraded/locked states, and the
// ``?queue=`` deep-link.
//
// All BFF endpoints are mocked via ``installActionCenterMocks`` — tests
// must pass with the backend down.

import { test, expect, type Page } from '@playwright/test';
import {
  buildActionCenterPayload,
  gotoActionCenter,
  installActionCenterMocks,
} from './_helpers/mock-action-center';

const payload = buildActionCenterPayload();

interface SummaryTile {
  id: string;
  value: string;
}
interface DecisionRow {
  id: string;
  rank: string;
  queue: string;
}
interface SkuRowFixture {
  article: string;
  marginDelta: string;
  lastMoveDays: number | null;
}
interface BucketFilterFixture {
  id: string;
  count: number;
}

const summaryTiles = (payload as { summary: { tiles: SummaryTile[] } }).summary.tiles;
const decisions = (payload as { decisions: DecisionRow[] }).decisions;
const skuRows = (payload as { skuTable: SkuRowFixture[] }).skuTable;
const buckets = (payload as { buckets: { filters: BucketFilterFixture[] } }).buckets.filters;
const movableValue = (payload as { movableHero: { value: string } }).movableHero.value;
const lostQuoteDifferential = (payload as { lostQuote: { differential: number } }).lostQuote.differential;

test.describe('Action Center — page loads and every block renders', () => {
  test.beforeEach(async ({ page }) => {
    await installActionCenterMocks(page);
  });

  test('every block has a stable testid and renders on first paint', async ({ page }) => {
    await gotoActionCenter(page);

    await expect(page.getByTestId('ac-breadcrumb')).toBeVisible();
    await expect(page.getByTestId('ac-greeting')).toBeVisible();
    await expect(page.getByTestId('ac-week-chip')).toContainText('Week 18');

    await expect(page.getByTestId('ac-summary-strip')).toBeVisible();
    for (const tile of summaryTiles) {
      await expect(page.getByTestId(`summary-tile-${tile.id}`)).toBeVisible();
    }

    await expect(page.getByTestId('ac-movable-hero')).toBeVisible();
    await expect(page.getByTestId('bucket-filter-row')).toBeVisible();
    await expect(page.getByTestId('ac-decisions')).toBeVisible();
    await expect(page.getByTestId('ac-trust-strip')).toBeVisible();
    await expect(page.getByTestId('ac-lost-quote-card')).toBeVisible();
    await expect(page.getByTestId('ac-sku-table')).toBeVisible();
    await expect(page.getByTestId('ac-negotiation')).toBeVisible();
    await expect(page.getByTestId('ac-report-card')).toBeVisible();
    // AbTests, Rejections, Audit, LongTail render their headings.
    await expect(page.getByText(/A\/B Test Tracker/i)).toBeVisible();
    await expect(page.getByText(/Audit trail/i).first()).toBeVisible();
  });
});

test.describe('Action Center — values are sourced from the BFF payload', () => {
  test.beforeEach(async ({ page }) => {
    await installActionCenterMocks(page);
  });

  test('summary tile values, movable hero value, bucket counts and lost-quote differential all match payload', async ({ page }) => {
    await gotoActionCenter(page);

    // Summary tile values.
    for (const tile of summaryTiles) {
      await expect(page.getByTestId(`summary-tile-${tile.id}-value`)).toHaveText(tile.value);
    }

    // Movable hero value.
    await expect(page.getByTestId('ac-movable-value')).toHaveText(movableValue);

    // Bucket filter counts.
    for (const f of buckets) {
      const chip = page.getByTestId(`bucket-filter-${f.id}`);
      await expect(chip).toContainText(String(f.count));
    }

    // Lost-quote differential.
    await expect(page.getByTestId('ac-lost-quote-differential')).toContainText(`${lostQuoteDifferential}pp`);

    // SKU table — assert the margin delta is rendered for each fixture row.
    for (const row of skuRows) {
      const tr = page.getByTestId(`ac-sku-row-${row.article}`);
      await expect(tr).toBeVisible();
      await expect(tr).toContainText(row.marginDelta);
    }
  });
});

test.describe('Action Center — BucketFilterRow filters DecisionCards', () => {
  test.beforeEach(async ({ page }) => {
    await installActionCenterMocks(page);
  });

  test('clicking a queue chip filters to just that queue; All restores; Cmd-click navigates to /pricing', async ({ page }) => {
    await gotoActionCenter(page);

    // All three decisions visible by default.
    for (const d of decisions) {
      await expect(page.getByTestId(`ac-decision-card-${d.id}`)).toBeVisible();
    }

    // Click the churn chip → only the churn-queue card is visible.
    await page.getByTestId('bucket-filter-churn').click();
    await expect(page.getByTestId('bucket-filter-churn')).toHaveAttribute('aria-pressed', 'true');
    for (const d of decisions) {
      const card = page.getByTestId(`ac-decision-card-${d.id}`);
      if (d.queue === 'churn') {
        await expect(card).toBeVisible();
      } else {
        await expect(card).toHaveCount(0);
      }
    }

    // Click All — every card visible again.
    await page.getByTestId('bucket-filter-all').click();
    for (const d of decisions) {
      await expect(page.getByTestId(`ac-decision-card-${d.id}`)).toBeVisible();
    }

    // Cmd-click the cost_riser chip → navigate to /pricing?queue=cost_riser.
    await page.getByTestId('bucket-filter-cost_riser').click({ modifiers: ['Meta'] });
    await page.waitForURL(/\/pricing\?.*queue=cost_riser/, { timeout: 5_000 });
    expect(page.url()).toContain('queue=cost_riser');
    expect(page.url()).toContain('source=action-center');
  });
});

test.describe('Action Center — TodaySummaryStrip click intents', () => {
  test.beforeEach(async ({ page }) => {
    await installActionCenterMocks(page);
  });

  test('movable_revenue scrolls to #sec-movable', async ({ page }) => {
    await gotoActionCenter(page);
    // Scroll the page far down first so the smooth-scroll on click has a
    // distance to travel and is observable.
    await page.evaluate(() => window.scrollTo(0, 1800));
    await page.waitForFunction(() => window.scrollY > 1000);
    const beforeY = await page.evaluate(() => window.scrollY);
    expect(beforeY).toBeGreaterThan(1000);

    await page.getByTestId('summary-tile-movable_revenue').click();
    // Wait for the scroll to land — boundingBox y is viewport-relative,
    // so after a successful scroll the hero should be at or near the top.
    await expect.poll(async () => {
      const box = await page.getByTestId('ac-movable-hero').boundingBox();
      return box?.y ?? Number.POSITIVE_INFINITY;
    }, { timeout: 5_000 }).toBeLessThan(400);
  });

  test('blocked_quotes navigates to /quotes?status=blocked', async ({ page }) => {
    await gotoActionCenter(page);
    await page.getByTestId('summary-tile-blocked_quotes').click();
    await page.waitForURL(/\/quotes\?.*status=blocked/, { timeout: 5_000 });
    expect(page.url()).toContain('source=action-center');
  });

  test('model_trust opens the TrustDrawer', async ({ page }) => {
    await gotoActionCenter(page);
    await page.getByTestId('summary-tile-model_trust').click();
    await expect(page.getByTestId('ac-trust-drawer')).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Action Center — DecisionCards inline evidence & lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await installActionCenterMocks(page);
  });

  test('rank toggle and "Why this?" both expand the evidence panel', async ({ page }) => {
    await gotoActionCenter(page);
    const first = decisions[0];
    const panelTestId = `evidence-panel-${first.id}`;

    // Rank chip toggle.
    await page.getByTestId(`ac-decision-rank-${first.id}`).click();
    await expect(page.getByTestId(panelTestId)).toBeVisible();
    await page.getByTestId(`ac-decision-rank-${first.id}`).click();
    await expect(page.getByTestId(panelTestId)).toHaveCount(0);

    // Why this? toggle.
    await page.getByTestId(`ac-decision-why-${first.id}`).click();
    await expect(page.getByTestId(panelTestId)).toBeVisible();
    // Panel shows evidence numbers from the fixture (invoiceCount=412).
    await expect(page.getByTestId(panelTestId)).toContainText('412');
    await expect(page.getByTestId(panelTestId)).toContainText('Sample size');
  });

  test('decision with empty featureImportance + null model renders LockedDrivers placeholder', async ({ page }) => {
    await gotoActionCenter(page);
    // Third fixture row has empty featureImportance AND model.id = null.
    const target = decisions[2];
    await page.getByTestId(`ac-decision-why-${target.id}`).click();
    const panel = page.getByTestId(`evidence-panel-${target.id}`);
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('locked-drivers')).toBeVisible();
    await expect(panel.getByTestId('locked-drivers')).toContainText('Feature importance');
  });

  test('every card shows a lifecycle chip', async ({ page }) => {
    await gotoActionCenter(page);
    for (const d of decisions) {
      const card = page.getByTestId(`ac-decision-card-${d.id}`);
      // Each fixture sets lifecycleState = 'open'.
      await expect(card.getByTestId('lifecycle-chip-open')).toBeVisible();
    }
  });

  test('Accept removes the card optimistically', async ({ page }) => {
    await gotoActionCenter(page);
    const first = decisions[0];
    const card = page.getByTestId(`ac-decision-card-${first.id}`);
    await expect(card).toBeVisible();
    await page.getByTestId(`ac-decision-accept-${first.rank}`).click();
    await expect(card).toHaveCount(0, { timeout: 5_000 });
  });

  test('Reject removes the card optimistically', async ({ page }) => {
    await gotoActionCenter(page);
    const second = decisions[1];
    const card = page.getByTestId(`ac-decision-card-${second.id}`);
    await expect(card).toBeVisible();
    await page.getByTestId(`ac-decision-reject-${second.rank}`).click();
    await expect(card).toHaveCount(0, { timeout: 5_000 });
  });

  test('primary CTA dispatches the backend secondaryAction route', async ({ page }) => {
    await gotoActionCenter(page);
    const third = decisions[2];
    await page.getByTestId(`ac-decision-primary-${third.id}`).click();
    // secondaryAction route is /pricing?aid=205169&...
    await page.waitForURL(/\/pricing\?.*aid=205169/, { timeout: 5_000 });
  });
});

test.describe('Action Center — SkuTable controls', () => {
  test.beforeEach(async ({ page }) => {
    await installActionCenterMocks(page);
  });

  test('default sort is revenueAtRisk desc; clicking marginDelta switches the active column', async ({ page }) => {
    await gotoActionCenter(page);
    await expect(page.getByTestId('ac-sku-header-revenueAtRisk')).toHaveAttribute('data-active', 'true');

    await page.getByTestId('ac-sku-header-marginDelta').click();
    await expect(page.getByTestId('ac-sku-header-marginDelta')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('ac-sku-header-revenueAtRisk')).toHaveAttribute('data-active', 'false');

    // localStorage state persisted.
    const stored = await page.evaluate(() => window.localStorage.getItem('pryzm.v2.actionCenter.skuSort'));
    expect(stored).toContain('marginDelta');
  });

  test('selecting two rows shows the bulk toolbar; clicking it navigates with aids csv', async ({ page }) => {
    await gotoActionCenter(page);

    const row1 = page.getByTestId(`ac-sku-row-${skuRows[0].article}`);
    const row2 = page.getByTestId(`ac-sku-row-${skuRows[1].article}`);

    await row1.locator('input[type="checkbox"]').check();
    await row2.locator('input[type="checkbox"]').check();

    const toolbar = page.getByTestId('sku-bulk-toolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar).toContainText('Open all in Pricing Studio (2)');

    await toolbar.getByRole('button', { name: /Open all in Pricing Studio/ }).click();
    await page.waitForURL(/\/pricing\?.*aids=/, { timeout: 5_000 });
    expect(page.url()).toContain('aids=');
    expect(page.url()).toContain('source=action-center');
  });

  test('row with lastMoveDays >= 365 renders the stale chip', async ({ page }) => {
    await gotoActionCenter(page);
    // Fixture row #3 (article 205169) has lastMoveDays = 380.
    const stale = skuRows.find((r) => (r.lastMoveDays ?? 0) >= 365)!;
    expect(stale).toBeDefined();
    await expect(page.getByTestId(`ac-sku-stale-chip-${stale.article}`)).toBeVisible();
  });
});

test.describe('Action Center — other block interactions', () => {
  test.beforeEach(async ({ page }) => {
    await installActionCenterMocks(page);
  });

  test('LostQuoteCard "Open analysis" navigates to /margin?focus=lost_quote', async ({ page }) => {
    await gotoActionCenter(page);
    await page.getByTestId('ac-lost-quote-cta').click();
    await page.waitForURL(/\/margin\?.*focus=lost_quote/, { timeout: 5_000 });
  });

  test('NegotiationCockpit Expand reveals the body', async ({ page }) => {
    await gotoActionCenter(page);
    const expand = page.getByTestId('ac-negotiation-expand');
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(page.getByTestId('ac-negotiation-body')).toBeVisible();
  });

  test('ReportCard generate → preview tile → send to Till', async ({ page }) => {
    await gotoActionCenter(page);
    await page.getByTestId('ac-report-generate').click();
    await expect(page.getByTestId('report-preview-tile')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('ac-report-send').click();
    // Send button transitions to disabled after success.
    await expect(page.getByTestId('ac-report-send')).toBeDisabled({ timeout: 5_000 });
  });
});

test.describe('Action Center — degraded & locked block states', () => {
  test('decisions block renders DegradedBlock when status=degraded', async ({ page }) => {
    await installActionCenterMocks(page, {
      blockOverrides: {
        decisions: { status: 'degraded', reason: 'Decision ranker timed out.' },
      },
    });
    await gotoActionCenter(page);
    const banner = page.getByTestId('ac-degraded-block').filter({ hasText: /Decision/ });
    await expect(banner.first()).toBeVisible();
    await expect(banner.first()).toContainText('Decision ranker timed out.');
  });

  test('negotiation block renders LockedBlock when status=locked', async ({ page }) => {
    await installActionCenterMocks(page, {
      blockOverrides: {
        negotiation: { status: 'locked', reason: 'Commodity feed not yet wired.' },
      },
    });
    await gotoActionCenter(page);
    const banner = page.getByTestId('ac-locked-block').filter({ hasText: /Negotiation/ });
    await expect(banner.first()).toBeVisible();
    await expect(banner.first()).toContainText('Locked — data source not yet connected');
  });
});

test.describe('Action Center — disabled-action quality gates', () => {
  test('bucket chip with count=0 renders disabled and has pointer-events-none semantics', async ({ page }) => {
    const custom = buildActionCenterPayload() as { buckets: { filters: { id: string; count: number; queueRoute: unknown; tone: string; label: string }[] } };
    // Add a zero-count chip whose queueRoute is still typed.
    custom.buckets.filters.push({
      id: 'overdue',
      label: 'Overdue renewals',
      count: 0,
      queueRoute: { sourceScreen: 'action-center', noop: true },
      tone: 'neutral',
    });
    await installActionCenterMocks(page, { payload: custom as unknown as Record<string, unknown> });
    await gotoActionCenter(page);
    const chip = page.getByTestId('bucket-filter-overdue');
    await expect(chip).toBeVisible();
    await expect(chip).toBeDisabled();
  });

  test('SkuTable row with null action renders a disabled button', async ({ page }) => {
    const custom = buildActionCenterPayload() as { skuTable: Array<Record<string, unknown>> };
    // Strip the action intent from the first SKU.
    custom.skuTable[0].action = undefined;
    await installActionCenterMocks(page, { payload: custom as unknown as Record<string, unknown> });
    await gotoActionCenter(page);
    const row = page.getByTestId(`ac-sku-row-${(custom.skuTable[0] as { article: string }).article}`);
    const btn = row.getByRole('button', { name: /Open in Studio/ });
    await expect(btn).toBeDisabled();
  });
});

test.describe('Action Center — ?queue= deep link', () => {
  test('?queue=churn seeds the active filter chip', async ({ page }) => {
    await installActionCenterMocks(page);
    // Hydrate auth on /action-center first so RequireAuth doesn't strip
    // the query string via a login bounce. After auth is set, navigate
    // BACK to the deep-link URL via in-app history mutation so React
    // Router picks up the query without RequireAuth re-firing.
    await gotoActionCenter(page);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/action-center?queue=churn');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The page is still mounted from the first goto, so useState() won't
    // re-init. Force a remount by navigating to a different route and
    // back — React Router unmounts the route component on path change.
    await page.evaluate(() => {
      window.history.pushState({}, '', '/notifications');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.history.pushState({}, '', '/action-center?queue=churn');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForSelector('[data-testid="ac-greeting"]', { timeout: 15_000 });
    await expect(page.getByTestId('bucket-filter-churn')).toHaveAttribute('aria-pressed', 'true');
    // Only the churn decision is visible.
    for (const d of decisions) {
      const card = page.getByTestId(`ac-decision-card-${d.id}`);
      if (d.queue === 'churn') {
        await expect(card).toBeVisible();
      } else {
        await expect(card).toHaveCount(0);
      }
    }
  });
});

// ----- helpers ---------------------------------------------------------------

// Re-export so a future test file can use the same Page type alias without
// pulling in `@playwright/test`.
export type ActionCenterPage = Page;
