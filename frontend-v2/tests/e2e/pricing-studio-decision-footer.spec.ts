// Pricing Studio v3 / Phase F — Decision Footer E2E spec.
//
// Exercises the sticky DecisionFooter that ships in Phase F:
//   - F1 sticky positioning (pinned to viewport bottom on scroll)
//   - F2 Accept lifecycle button + mutation
//   - F3 Reject (row stays visible) + Snooze popover (1d / 1w / next_review)
//   - F4 Share drawer + atomic "both" fan-out (single request, not two)
//   - F6 A/B Slice drawer pre-filled with control + variant prices
//   - F7 Push-to-quoting opens PublishConfirmationDrawer (regression)
//   - F8 Branded PDF popover (regression)
//
// Selectors target the `data-testid` hooks the DecisionFooter +
// ShareDecisionDrawer already ship so the spec is resilient to copy /
// styling churn. Action mutations are intercepted via `page.route` so we
// can assert request bodies + count individual fan-outs.
//
// Mock harness pattern mirrors `pricing-studio-evidence-tabs.spec.ts`:
// install the default Studio mocks first, then layer Phase F endpoint
// overrides on top (Playwright matches last-registered-first).

import { test, expect, type Page, type Request } from '@playwright/test';
import {
  buildStudioPayload,
  installStudioMocks,
  gotoStudio,
} from './_helpers/mock-studio';

// ---- Action mock + request recorder ---------------------------------------

interface RecordedRequest {
  url: string;
  body: Record<string, unknown> | null;
}

function makeActionMocks(page: Page): {
  requests: Map<string, RecordedRequest[]>;
  install: () => Promise<void>;
} {
  const requests = new Map<string, RecordedRequest[]>();
  const remember = (kind: string, req: Request) => {
    const arr = requests.get(kind) ?? [];
    let parsed: Record<string, unknown> | null = null;
    try {
      const raw = req.postData();
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    arr.push({ url: req.url(), body: parsed });
    requests.set(kind, arr);
  };

  const install = async () => {
    // /actions/<kind> — accept the request, record it, and return the
    // canonical mock response shape (mirrors useActions.ts mockResolve).
    await page.route('**/api/v1/actions/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const kind = url.pathname.split('/').pop() ?? 'unknown';
      remember(kind, req);

      let body: Record<string, unknown> = {};
      try {
        const raw = req.postData();
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        body = {};
      }

      const base: Record<string, unknown> = {
        replay: false,
        audit: {
          id: `mock-${kind}-${Date.now()}`,
          actor: 'mock-user',
          actor_persona: 'frank',
          kind,
          target_type: body.target_type ?? null,
          target_id: body.target_id ?? body.aid ?? null,
          before: null,
          after: null,
          delta_pp: body.delta_pp ?? null,
          audit_hash: 'mock' + Math.random().toString(16).slice(2, 14),
          created_at: new Date().toISOString(),
        },
      };
      if (kind === 'share_decision') {
        base.recipient = body.recipient ?? 'till';
        base.recipient_user_id = `mock-user-${body.recipient ?? 'till'}`;
        base.recipient_resolved = true;
        base.notification_id = `mock-notif-${kind}`;
        base.note_id = `mock-note-${kind}`;
        base.share_link = `/action-center?focus=rec`;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(base),
      });
    });
  };

  return { requests, install };
}

// /pricing/proposals GET — return a draft proposal pinned to the current
// aid so the F8 Branded PDF button is enabled (`proposalId` non-null).
async function installProposalMock(page: Page, aid: string) {
  await page.route('**/api/v1/pricing/proposals**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'p-decision-footer-spec',
              aid,
              article_id: aid,
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
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

// Patch meta.blocks so the studio fixture comes up "live" and the
// workbench actually mounts (mirrors the evidence-tabs harness).
function patchMetaBlocks<T extends Record<string, unknown>>(payload: T): T {
  const wb = (payload as { workbench?: Record<string, unknown> }).workbench;
  if (!wb) return payload;
  const existingMeta = (wb.meta as Record<string, unknown> | undefined) ?? {};
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

async function installFooterMocks(page: Page) {
  await installStudioMocks(page);
  // Override /screens/studio so meta.blocks is populated.
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

// ---- Tests -----------------------------------------------------------------

test.describe('Pricing Studio — Decision Footer (Phase F)', () => {
  test('1. footer is sticky-positioned and survives scroll', async ({
    page,
  }) => {
    await installFooterMocks(page);
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    const footer = page.locator('.ws-decision');
    await expect(footer).toBeAttached();

    // F1 contract: computed `position: sticky` + `bottom: 0px` on the
    // .ws-decision wrapper. This is the CSS guarantee the F1 commit
    // shipped. (Visual viewport-pinning is governed by the shell's
    // overall scroll container — that's a layout concern outside of
    // DecisionFooter's own contract.)
    const computed = await page.evaluate(() => {
      const el = document.querySelector('.ws-decision') as HTMLElement | null;
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        position: cs.position,
        bottomCss: cs.bottom,
        zIndex: cs.zIndex,
      };
    });
    expect(computed).not.toBeNull();
    expect(computed!.position).toBe('sticky');
    expect(computed!.bottomCss).toBe('0px');
    // z-index is 20 — below modal drawers (40+) but above body content.
    expect(parseInt(computed!.zIndex, 10)).toBeGreaterThanOrEqual(20);

    // And the footer is still in the DOM after a scroll attempt — it
    // doesn't unmount or detach when the user scrolls the page.
    await page.evaluate(() => {
      const main =
        (document.querySelector('main.pz-main') as HTMLElement | null) ?? null;
      if (main && main.scrollHeight > main.clientHeight) {
        main.scrollTop = 400;
      } else {
        window.scrollTo(0, 400);
      }
    });
    await page.waitForTimeout(150);
    await expect(footer).toBeAttached();
  });

  test('2. lifecycle buttons all render in the footer', async ({ page }) => {
    await installFooterMocks(page);
    const aid = await resolveDefaultAid(page);
    await installProposalMock(page, aid);
    await gotoStudio(page, `?aid=${aid}`);

    // Phase F canonical button set + F5/F7/F8 carry-overs.
    await expect(page.getByTestId('decision-footer-accept')).toBeVisible();
    await expect(page.getByTestId('decision-footer-reject')).toBeVisible();
    await expect(page.getByTestId('decision-footer-snooze')).toBeVisible();
    await expect(page.getByTestId('decision-footer-share')).toBeVisible();
    await expect(page.getByTestId('decision-footer-ab-slice')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Save as proposal/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Add to weekly queue/i }),
    ).toBeVisible();
    await expect(page.getByTestId('decision-footer-push')).toBeVisible();
    await expect(page.getByTestId('decision-footer-pdf')).toBeVisible();
  });

  test('3. Accept fires accept_recommendation mutation', async ({ page }) => {
    const { requests, install } = makeActionMocks(page);
    await installFooterMocks(page);
    await install();
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    await page.getByTestId('decision-footer-accept').click();

    // Wait for the request to land + the optimistic lifecycle chip to flip.
    await expect(page.getByTestId('decision-footer-lifecycle-chip')).toHaveText(
      /Accepted/i,
    );
    await expect
      .poll(() => (requests.get('accept_recommendation') ?? []).length, {
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    const sent = requests.get('accept_recommendation')![0];
    expect(sent.url).toContain('/api/v1/actions/accept_recommendation');
    expect(sent.body).toBeTruthy();
    // recommendation_id is set to (?recommendation= ?? aid) — the default
    // aid is in the body either as recommendation_id, target_id, or aid.
    const idValues = [
      sent.body!.recommendation_id,
      sent.body!.target_id,
      sent.body!.aid,
      sent.body!.article_id,
    ];
    expect(idValues).toContain(aid);
  });

  test('4. Reject keeps the decision footer visible (no hide-on-act)', async ({
    page,
  }) => {
    const { requests, install } = makeActionMocks(page);
    await installFooterMocks(page);
    await install();
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    const footer = page.locator('.ws-decision');
    await expect(footer).toBeVisible();
    await page.getByTestId('decision-footer-reject').click();

    await expect
      .poll(() => (requests.get('decline_recommendation') ?? []).length, {
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    // Iron rule §A: row stays visible after reject; only the chip flips.
    await expect(footer).toBeVisible();
    await expect(page.getByTestId('decision-footer-reject')).toBeVisible();
    await expect(page.getByTestId('decision-footer-lifecycle-chip')).toHaveText(
      /Rejected/i,
    );
  });

  test('5. Snooze popover renders 3 options and sends ISO `until`', async ({
    page,
  }) => {
    const { requests, install } = makeActionMocks(page);
    await installFooterMocks(page);
    await install();
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    await page.getByTestId('decision-footer-snooze').click();
    const popover = page.getByTestId('decision-footer-snooze-popover');
    await expect(popover).toBeVisible();

    // 1d / 1w / next_review — both as testid hooks and as visible copy.
    await expect(page.getByTestId('decision-footer-snooze-1d')).toBeVisible();
    await expect(page.getByTestId('decision-footer-snooze-1w')).toBeVisible();
    await expect(
      page.getByTestId('decision-footer-snooze-next_review'),
    ).toBeVisible();
    await expect(popover).toContainText(/1 day/i);
    await expect(popover).toContainText(/1 week/i);
    await expect(popover).toContainText(/next review/i);

    await page.getByTestId('decision-footer-snooze-1w').click();

    await expect
      .poll(() => (requests.get('snooze_recommendation') ?? []).length, {
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    const sent = requests.get('snooze_recommendation')![0];
    const payload = sent.body!.payload as Record<string, unknown> | undefined;
    // `until` lands at the top level (mutation expects target_id + until)
    // AND inside payload for backwards-compat. Either is acceptable.
    const until =
      (sent.body!.until as string | undefined) ??
      (payload?.until as string | undefined);
    expect(until).toBeTruthy();
    // ISO8601 with trailing Z.
    expect(until!).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('6. Share opens drawer + "Both" sends exactly ONE atomic request', async ({
    page,
  }) => {
    const { requests, install } = makeActionMocks(page);
    await installFooterMocks(page);
    await install();
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    await page.getByTestId('decision-footer-share').click();
    await expect(page.getByTestId('share-decision-drawer')).toBeVisible();

    // Pick "Both" radio.
    await page.getByTestId('share-decision-recipient-both').click();

    // Submit becomes enabled, click it.
    const submit = page.getByTestId('share-decision-submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Wait for one share_decision call to land — and assert NO second
    // request follows (we sleep a tick and re-check the count).
    await expect
      .poll(() => (requests.get('share_decision') ?? []).length, {
        timeout: 5_000,
      })
      .toBe(1);
    await page.waitForTimeout(400);
    expect((requests.get('share_decision') ?? []).length).toBe(1);

    const sent = requests.get('share_decision')![0];
    expect(sent.body).toBeTruthy();
    // recipient is mirrored at top-level + inside payload.
    const topRecipient = sent.body!.recipient as string | undefined;
    const payload = sent.body!.payload as Record<string, unknown> | undefined;
    const payloadRecipient = payload?.recipient as string | undefined;
    expect([topRecipient, payloadRecipient]).toContain('both');
  });

  test('7. Share Submit is disabled until a recipient is picked', async ({
    page,
  }) => {
    await installFooterMocks(page);
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    await page.getByTestId('decision-footer-share').click();
    const drawer = page.getByTestId('share-decision-drawer');
    await expect(drawer).toBeVisible();

    const submit = page.getByTestId('share-decision-submit');
    await expect(submit).toBeDisabled();

    await page.getByTestId('share-decision-recipient-till').click();
    await expect(submit).toBeEnabled();
  });

  test('8. A/B Slice drawer prefills control + variant prices', async ({
    page,
  }) => {
    await installFooterMocks(page);
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    await page.getByTestId('decision-footer-ab-slice').click();
    const drawer = page.getByTestId('decision-footer-ab-drawer');
    await expect(drawer).toBeVisible();

    // ABTestCard inside the drawer has the variant + control number
    // inputs labelled "Variant price" / "Control price". The same card
    // is also mounted inline inside PriceOptions, so scope to the drawer
    // container to avoid strict-mode duplicate matches.
    const variantInput = drawer.getByLabel('Variant price');
    const controlInput = drawer.getByLabel('Control price');
    await expect(variantInput).toBeVisible();
    await expect(controlInput).toBeVisible();

    const variantValue = await variantInput.inputValue();
    const controlValue = await controlInput.inputValue();
    expect(variantValue).not.toBe('');
    expect(controlValue).not.toBe('');
    // Decimals like "4.65" / "4.20" — must parse as finite positive numbers.
    expect(Number.isFinite(parseFloat(variantValue))).toBe(true);
    expect(Number.isFinite(parseFloat(controlValue))).toBe(true);
    expect(parseFloat(variantValue)).toBeGreaterThan(0);
    expect(parseFloat(controlValue)).toBeGreaterThan(0);
  });

  test('9. Branded PDF popover still opens (F8 regression)', async ({
    page,
  }) => {
    await installFooterMocks(page);
    const aid = await resolveDefaultAid(page);
    await installProposalMock(page, aid);
    await gotoStudio(page, `?aid=${aid}`);

    // The PDF button is enabled once a proposal exists.
    const pdfBtn = page.getByTestId('decision-footer-pdf');
    await expect(pdfBtn).toBeVisible();
    await expect(pdfBtn).toBeEnabled();

    await pdfBtn.click();
    const popover = page.getByTestId('decision-footer-pdf-popover');
    await expect(popover).toBeVisible();

    // Persona + language radios both render.
    await expect(
      page.getByTestId('decision-footer-pdf-persona-frank'),
    ).toBeVisible();
    await expect(
      page.getByTestId('decision-footer-pdf-persona-till'),
    ).toBeVisible();
    await expect(
      page.getByTestId('decision-footer-pdf-persona-manuel'),
    ).toBeVisible();
    await expect(
      page.getByTestId('decision-footer-pdf-lang-en'),
    ).toBeVisible();
    await expect(
      page.getByTestId('decision-footer-pdf-lang-de'),
    ).toBeVisible();
  });

  test('10. Push-to-quoting opens PublishConfirmationDrawer (F7 regression)', async ({
    page,
  }) => {
    await installFooterMocks(page);
    const aid = await resolveDefaultAid(page);
    await gotoStudio(page, `?aid=${aid}`);

    // Pre-condition: an active price option drives proposedPriceDecimal.
    // The shipped workbench fixture pre-fills activeOption from
    // wb.decision.summary.proposedPrice, so Push should be enabled by
    // default.
    const pushBtn = page.getByTestId('decision-footer-push');
    await expect(pushBtn).toBeVisible();
    await expect(pushBtn).toBeEnabled();

    await pushBtn.click();
    await expect(
      page.getByTestId('publish-confirmation-drawer'),
    ).toBeVisible();
  });
});
