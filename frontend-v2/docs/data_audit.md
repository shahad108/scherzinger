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
| Movable hero | 🟡 | Live SQL CTE: movable = articles with recent cost movement OR running A/B test. Hero KPIs aggregate revenue / SKU counts; sparkline is per-month movable revenue (€M). Falls back to seed | Commit 6 ✅ |
| Buckets (Movable / Locked) | 🟡 | Same classification CTE; bucket cards report €M open + SKU count + commodity-group count + lead group. Falls back to seed | Commit 6 ✅ |
| Trust strip (4 tiles) | 🟡 | `forecast_service.get_forecast_accuracy` + `quality_service.get_quality_summary/get_quality_issues`; falls back to seed | Commit 1 ✅ |
| Today's analyst decisions | 🟡 | Ranking engine across **margin erosion** (invoice db2_margin YoY drop ≥ 5pp) + **cost risers** (product_cost_trends ≥ 10%) + **churn risk** (customer_risk_scores ≥ 0.7). Top-N by impact, paginated by `?limit=`. Falls back to seed | Commit 4 ✅ |
| Lost-quote differential | 🟡 | `quote_service.get_price_sensitivity`; falls back to seed | Commit 1 ✅ |
| SKU pricing engine table | 🟡 | Single SQL pass joining `invoices` (YoY margin) × `products` × `product_cost_trends` (latest cost) × `ab_tests` (running). Sorts by margin drop, paginated by `?limit=`. Falls back to seed | Commit 5 ✅ |
| Long-tail coverage | 🟡 | Pareto bin over per-article revenue (A=top10%, B=mid40%, C=bottom50%) + 4 KPI tiles (top-10 concentration, SKUs below DB-II target, new products, C-tier price-frozen). Falls back to seed | Commit 7 ✅ |
| Negotiation cockpit | 🟡 | `cost_service.get_cost_risers` aggregated by commodity_group; discount-gap headline + summary text remain seed | Commit 1 ✅ |
| Rejection codes ("Why we lose") | 🟡 | `quote_service.get_rejection_codes` paginated by `?limit=` | Commit 1 ✅ |
| Audit feed | ✅ | `audit_service.recent` for the calling user; falls back to seed when empty | Phase 12 |
| A/B test tracker | 🟡 | `AbTest` table joined to latest `AbTestResult`; falls back to seed | Commit 2 ✅ |

## Pagination contract

The endpoint accepts `?limit=` (default 5, max 200). Honoured by:
**rejections** (Commit 1), **decisions** (Commit 4, floored at 3),
**sku_table** (Commit 5, floored at 50).

The frontend exposes a single page-level **"Show all"** pill in
`PageHead` (Commit 8) that flips `?limit=5` → `?limit=200`. Per-block
expanders are an optional follow-up — the global toggle covers the
"show me everything" use case for now.

Cache invalidation already drops the per-limit cache on every audit-
write so a wider view stays fresh.

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
| Commit 5 | 2026-05-10 | SKU pricing engine table (live join over invoices × products × cost trends × ab_tests) |
| Commit 6 | 2026-05-10 | movable hero + buckets (CTE-based movable/locked classification) |
| Commit 7 | 2026-05-10 | long-tail coverage (Pareto bin + 4 KPI tiles) |
| Commit 8 | 2026-05-10 | frontend "Show all" toggle in PageHead — bumps ?limit= for every list block |
