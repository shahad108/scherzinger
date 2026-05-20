# Pricing Studio v3 — defect inventory (2026-05-17)

Captured live against http://localhost:5174/pricing (AID 200832-E).

## Visible symptoms

| # | Section | Symptom | Root cause | Priority |
|---|---|---|---|---|
| 1 | Recommendation hero | "No recommendation" | Frontend never calls `/screens/studio/workbench/{aid}`; `wb.recommendation` is undefined | P0 |
| 2 | KPI rail | "No data" on Recommended / Δ / Projected DB2 / Win prob / Confidence | Same — no recommendation source | P0 |
| 3 | Win-prob curve | "No win-prob model" | Same — no curve source | P0 |
| 4 | Drivers | "No drivers" | Same | P0 |
| 5 | WTP band strip | "Insufficient won-deal sample" | Same | P0 |
| 6 | Price options (Hold/Cost-floor/Market/Custom) | All show "cost data unavailable" status | cost_state empty for studio AIDs | P0 |
| 7 | Customer fan-out | Same 6 hard-coded rows for every SKU (101580, 102330, …) | Reads static seed `wb.fanout`; `/screens/studio/workbench/{aid}.customer_fanout` exists but isn't consumed | P0 |
| 8 | Cost composition (Material/Labor/Outsourcing/Overhead 52/28/12/8%) | Identical for every SKU | Reads static seed `wb.cost`; should consume `cost_outlook` endpoint | P1 |
| 9 | 4-yr cluster cost trajectory | Hard-coded sparkline + "Material +18.4% '22→'25" | Same as #8 | P1 |
| 10 | Repricing history | Hard-coded 2024-Q1 / 2022-Q3 / … for every SKU | Reads static seed `wb.history`; should consume `/pricing/sku/{aid}/audit` | P1 |
| 11 | Rationale memo | Hard-coded paragraphs for every SKU | Reads static seed `wb.memo`; should consume `/briefing/sku/{aid}` | P1 |
| 12 | Cross-links footer (Action queue / Cluster forecast / Approval flow / Margin trajectory) | All buttons disabled with "TODO" badge | `crossLinks` payload not wired | P2 |
| 13 | Customer drill-in | `/pricing/customer/{cid}/sku/{aid}/drill-in` → 500 | SQL: `SELECT name, tier FROM customers` — `tier` column doesn't exist on `customers` (it's on `customer_on_sku`) | P0 |
| 14 | Trigger banner | Never shown | `?source=&reason=` params unwired in URL contract | P2 |

## Backend route inventory

Live (✓) vs not consumed by FE (✗):

| Route | Status |
|---|---|
| GET /screens/studio | ✓ consumed |
| GET /screens/studio/workbench/{aid} | ✗ exists, **not consumed** |
| GET /screens/studio/comparable/{aid} | partial |
| POST /screens/studio/fanout | ✓ consumed (re-score on price change) |
| GET /pricing/proposals | ✓ |
| POST /pricing/proposals | ✓ |
| GET /pricing/proposals/{id}/approval | ✓ |
| POST /pricing/proposals/{id}/submit | ✓ |
| POST /pricing/proposals/{id}/approve | ✓ |
| POST /pricing/proposals/{id}/recall | ✓ |
| GET /pricing/sku/{aid}/cost-outlook | ✗ |
| GET /pricing/sku/{aid}/audit | ✗ (only used inside AuditDrawer) |
| GET /pricing/sku/{aid}/diff | ✓ |
| POST /pricing/sku/{aid}/publish | ✓ |
| POST /pricing/sku/{aid}/rollback | ✓ |
| GET /pricing/sku/{aid}/price-book | ✗ |
| POST /pricing/simulate | ✗ |
| GET /pricing/customer/{cid}/sku/{aid}/drill-in | ✗ + 500 bug |
| GET /briefing/sku/{aid} | ✗ |
| GET /pricing/alerts* | ✓ |
| POST /pricing/alerts | ✓ |
| GET /approvals/inbox | ✓ |
| POST /approvals/{instance_id}/decision | ✓ |
| GET /pricing/batches | ✗ |
| POST /pricing/batches | ✓ |
| GET /lineage/{ref_id} | partial |

## DB data state

| Table | Rows | Notes |
|---|---|---|
| price_state | 14 | All synthetic EPA-* AIDs; **none for studio AIDs** |
| cost_state | 0 | Empty — recommendation always fallback |
| customer_on_sku | 0 | Empty — customer fan-out returns 0 rows |
| customers | 1896 | Has `customer_id, name, first_seen_date, created_at` (no `tier` column) |
| pricing_audit | (exists) | Empty — no audit events recorded |

## Fix plan (sequential, one subagent per task)

| # | Task | Owner |
|---|---|---|
| A | Backend: fix `_load_customer_master` SQL (drop `tier`, derive from `customer_on_sku`) + seed price_state/cost_state/customer_on_sku for the 10 studio AIDs | implementer + reviewer |
| B | Frontend: wire `useStudioWorkbench(effectiveAid)` in `index.tsx`, merge into `wb` so recommendation/wtp/win_prob_curve/customer_fanout/option_margins/cost_history/active_ab_test become populated | implementer + reviewer |
| C | Frontend: wire `RationaleMemo` → `/briefing/sku/{aid}`; wire repricing history → `/pricing/sku/{aid}/audit`; wire cost composition + trajectory → `/pricing/sku/{aid}/cost-outlook` | implementer + reviewer |
| D | Frontend: enable Cross-links footer with real routes (`/action-center?aid=…`, `/forecasting?cluster=…#commodities`, etc.) | implementer + reviewer |
| E | Playwright spot-check + visual diff after each phase | controller |
