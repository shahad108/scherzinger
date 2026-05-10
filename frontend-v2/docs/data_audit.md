# Action Center data audit

Single source of truth for what each block on `/action-center` reads from,
what it should read from, and what's still pending.

## Status legend

- ✅ **live** — block reads from a real service / DB query
- 🟡 **partial** — block has a live path with a seed fallback
- ⛔ **seed** — block returns the bundled seed JSON unchanged

| Block | Status | Source today | Notes |
|---|---|---|---|
| Header KPIs | 🟡 | `margin_service.get_margin_summary` for record count + DISTINCT SKUs / commodity groups; ISO week computed from server clock; falls back to seed | Commit 3 ✅ |
| Movable hero | ⛔ | `seed["movableHero"]` | Needs new `v_movable_revenue` view (Commit 6). |
| Buckets (Movable / Locked) | ⛔ | `seed["buckets"]` | Aggregations of the same view (Commit 6). |
| Trust strip (4 tiles) | 🟡 | `forecast_service.get_forecast_accuracy` + `quality_service.get_quality_summary/get_quality_issues`; falls back to seed | Commit 1 ✅ |
| Today's analyst decisions | 🟡 | Ranking engine across **margin erosion** (invoice db2_margin YoY drop ≥ 5pp) + **cost risers** (product_cost_trends ≥ 10%) + **churn risk** (customer_risk_scores ≥ 0.7). Top-N by impact, paginated by `?limit=`. Falls back to seed | Commit 4 ✅ |
| Lost-quote differential | 🟡 | `quote_service.get_price_sensitivity`; falls back to seed | Commit 1 ✅ |
| SKU pricing engine table | ⛔ | `seed["skuTable"]` (top 50) | Needs `v_sku_pricing_engine` (Commit 5). |
| Long-tail coverage | ⛔ | `seed["longTail"]` | Wraps `margin_service.get_margin_by_product` + Pareto bin (Commit 7). |
| Negotiation cockpit | 🟡 | `cost_service.get_cost_risers` aggregated by commodity_group; discount-gap headline + summary text remain seed | Commit 1 ✅ |
| Rejection codes ("Why we lose") | 🟡 | `quote_service.get_rejection_codes` paginated by `?limit=` | Commit 1 ✅ |
| Audit feed | ✅ | `audit_service.recent` for the calling user; falls back to seed when empty | Phase 12 |
| A/B test tracker | 🟡 | `AbTest` table joined to latest `AbTestResult`; falls back to seed | Commit 2 ✅ |

## Pagination contract

The endpoint accepts `?limit=` (default 5, max 200). Today only the
rejections block honours it. Commits 4 + 5 extend it to decisions and
sku_table.

The frontend exposes a "Show all N" pill at the bottom of each list
card which bumps the param. Cache invalidation already drops the per-
limit cache on every audit-write so a wider view stays fresh.

## Auto-update contract

- React Query `refetchInterval: 60_000` on `useActionCenter` triggers a
  refetch every minute (foreground tabs only).
- `composer.invalidate_cache()` is called after every `POST /actions/{kind}`,
  so the next render reflects the action immediately rather than waiting
  for the 60s server cache to elapse.
- ETag round-trip means an unchanged payload returns 304 with no body —
  the polling cost is negligible.

## Per-commit audit history

| Commit | Date | Blocks moved live |
|---|---|---|
| Phase 12 | 2026-05-10 | audit feed |
| Commit 1 | 2026-05-10 | trust + lost_quote + rejections + negotiation |
| Commit 2 | 2026-05-10 | abtests tracker (live from ab_tests table) |
| Commit 3 | 2026-05-10 | header KPIs (records / SKUs / commodity groups) + real ISO week |
| Commit 4 | 2026-05-10 | decision ranking engine (margin erosion + cost risers + churn risk) |
