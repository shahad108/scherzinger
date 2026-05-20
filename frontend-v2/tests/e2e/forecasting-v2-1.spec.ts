// v2.1 — E2E specs for the v2.1 / v2.2 forecasting page additions
// (PlanTrackingStrip, NextCycleMovesStrip → Action Center drawer).
//
// v2.2 Phase B: the strip now dispatches a real ActionIntent via
// useUiAction(), so clicking "Open" must open the global ActionFeedback
// drawer host with the matching form. This spec asserts the visible
// drawer title + headline once the click lands — proving the bridge is
// no longer cosmetic.

import { test, expect } from '@playwright/test';
import { installForecastMocks, gotoForecasting } from './_helpers/mock-api';

test.describe('Frank — Forecasting v2.1/v2.2 NextCycleMovesStrip', () => {
  test.beforeEach(async ({ page }) => {
    await installForecastMocks(page);
  });

  test('strip renders one card per move from the fixture', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoForecasting(page);

    const strip = page.getByTestId('next-cycle-moves-strip');
    await expect(strip).toBeVisible();
    const cards = page.getByTestId('next-cycle-move-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.first()).toContainText(/BKAGG/);
  });

  test('clicking Open opens the Action Center drawer with the mapped form', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoForecasting(page);

    const strip = page.getByTestId('next-cycle-moves-strip');
    await expect(strip).toBeVisible();

    // Move #3 ("BKAES: 8 renewals overdue") maps to queue_renewal —
    // the resulting drawer surfaces a visible "Queue for renewal" header.
    const renewalCard = page.getByTestId('next-cycle-move-card').nth(2);
    await expect(renewalCard).toContainText(/BKAES/);
    await renewalCard.getByRole('button', { name: /Open/i }).click();

    // The QueueRenewalForm renders a "Queue for renewal" header inside the
    // drawer; the move's headline appears in the Recommendation block. Scope
    // to the drawer (Radix dialog with sr-only title="Queue renewal") so we
    // don't double-match the headline that's also painted on the strip card.
    const drawer = page.getByLabel('Queue renewal');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: /Queue for renewal/i })).toBeVisible();
    await expect(drawer.getByText('BKAES: 8 renewals overdue')).toBeVisible();
  });

  test('partial_accept move opens the partial-accept form drawer', async ({ page }) => {
    test.setTimeout(60_000);
    await gotoForecasting(page);

    const strip = page.getByTestId('next-cycle-moves-strip');
    await expect(strip).toBeVisible();

    // Move #1 maps to partial_accept; the PartialAcceptForm has a
    // recognizable "Partial acceptance" / "partial" header.
    const card = page.getByTestId('next-cycle-move-card').first();
    await card.getByRole('button', { name: /Open/i }).click();

    // PartialAcceptForm renders its own form title; assert the move headline
    // is preserved inside the drawer so we know the context plumbed through.
    // Scope to the drawer (Radix dialog with sr-only title="Partial acceptance").
    const drawer = page.getByLabel('Partial acceptance');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(/BKAGG cluster: 12 SKUs below cost-floor/)).toBeVisible();
  });
});
