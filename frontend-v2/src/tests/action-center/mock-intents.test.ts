import { describe, it, expect } from 'vitest';
import mock from '@/data/mocks/action-center.json';

// Phase 1 acceptance — every block that the production composer enriches
// with a typed action intent must surface those intents in mock mode too,
// so mock-only demos exercise the same backend-intent path the live API
// will use. If you delete one of these assertions you are also dropping
// the Phase 1 contract for that block.
describe('action-center mock — Phase 1 intents', () => {
  it('movableHero carries an action intent', () => {
    expect(mock.movableHero.action).toBeTruthy();
    expect(mock.movableHero.action.route).toBe('/pricing');
  });

  it('every bucket carries an action intent', () => {
    expect(mock.buckets.length).toBeGreaterThan(0);
    for (const b of mock.buckets) expect(b.action).toBeTruthy();
  });

  it('every decision carries primaryAction + secondaryAction + recommendationId', () => {
    expect(mock.decisions.length).toBeGreaterThan(0);
    for (const d of mock.decisions) {
      expect(d.recommendationId).toBeTruthy();
      expect(d.primaryAction?.kind).toBeTruthy();
      expect(d.primaryAction?.targetId).toBe(d.recommendationId);
      expect(d.secondaryAction).toBeTruthy();
    }
  });

  it('every trust tile carries a drawer-shaped action', () => {
    for (const t of mock.trust) {
      expect(t.action?.drawer?.title).toBeTruthy();
    }
  });

  it('lostQuote carries an action intent', () => {
    expect(mock.lostQuote.action?.route).toBe('/margin');
  });

  it('every SKU row carries an action intent matching its status', () => {
    for (const r of mock.skuTable) {
      expect(r.action).toBeTruthy();
      if (r.status === 'locked') {
        expect(r.action.drawer).toBeTruthy();
      } else {
        expect(r.action.route).toBe('/pricing');
      }
    }
  });

  it('every A/B test carries hold + stop + promote intents', () => {
    for (const t of mock.abTests) {
      // Phase 3 — Hold + Promote open form drawers (no direct kind);
      // Stop stays a direct mutation.
      expect(t.actions?.hold?.drawer?.formKind).toBe('ab_hold');
      expect(t.actions?.promote?.drawer?.formKind).toBe('ab_promote');
      expect(t.actions?.stop?.kind).toBe('stop_ab_test');
    }
  });

  it('every decision carries partialAction + snoozeAction form drawers', () => {
    for (const d of mock.decisions) {
      expect(d.partialAction?.drawer?.formKind).toBe('partial_accept');
      expect(d.partialAction?.drawer?.context?.recommendationId).toBe(d.recommendationId);
      expect(d.snoozeAction?.drawer?.formKind).toBe('snooze');
      expect(d.snoozeAction?.drawer?.context?.recommendationId).toBe(d.recommendationId);
    }
  });

  it('locked SKU rows open the queue_renewal form drawer', () => {
    const locked = mock.skuTable.filter((r) => r.status === 'locked');
    expect(locked.length).toBeGreaterThan(0);
    for (const r of locked) {
      expect(r.action.drawer?.formKind).toBe('queue_renewal');
      expect(r.action.drawer?.context?.articleId).toBe(r.article);
    }
  });
});
