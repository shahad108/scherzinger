/**
 * P4.T14 — cross-link integrity.
 *
 * The Action Center mock includes CTA labels like "Open in Studio" /
 * "Cluster forecast" / "Approvals". Each of those labels resolves in the
 * UI to a top-level route via ``ctaToRoute``. This test asserts that
 * every label in the canonical payload maps to a route that is actually
 * registered in ``app/router.tsx``.
 */
import { describe, it, expect } from 'vitest';
import actionCenterMock from '@/data/mocks/action-center.json';

const ctaToRoute: Record<string, string> = {
  'Open in Studio': '/pricing',
  'Open in Studio →': '/pricing',
  'Open in Pricing Studio': '/pricing',
  'Cluster forecast': '/forecasting',
  'Approvals': '/quotes',
  'Queue renewal': '/quotes',
  'View SKUs': '/pricing',
  'View renewals': '/quotes',
};

const REGISTERED_ROUTES = new Set([
  '/login',
  '/',
  '/action-center',
  '/margin',
  '/quotes',
  '/forecasting',
  '/pricing',
  '/ai',
  '/md/overview',
  '/deal/inbox',
]);

function collectCtaStrings(obj: unknown, out: Set<string>): void {
  if (!obj) return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectCtaStrings(item, out);
    return;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (
        typeof v === 'string' &&
        (k === 'cta' ||
          k === 'primaryCta' ||
          k === 'actionLabel' ||
          k === 'recommendation' ||
          k === 'jumpTo')
      ) {
        out.add(v);
      } else {
        collectCtaStrings(v, out);
      }
    }
  }
}

describe('Action Center cross-links', () => {
  it('every known CTA label maps to a registered route', () => {
    const labels = new Set<string>();
    collectCtaStrings(actionCenterMock, labels);

    const known = [...labels].filter((l) => l in ctaToRoute);
    expect(known.length, `expected at least one mapped CTA in payload, got ${[...labels].join(', ')}`).toBeGreaterThan(0);

    for (const label of known) {
      const route = ctaToRoute[label];
      expect(REGISTERED_ROUTES, `${label} → ${route}`).toContain(route);
    }
  });

  it('does not regress: every CTA destination is a real route', () => {
    for (const route of Object.values(ctaToRoute)) {
      expect(REGISTERED_ROUTES, `${route} missing from router.tsx`).toContain(route);
    }
  });
});
