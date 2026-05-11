# Demo Claims Defense — Action Center

**Walk-through date:** 12 May 2026
**Walked as:** Frank (primary), Till (secondary), Heiko (deferred — not in this cut)
**Endpoint:** `GET /api/v1/screens/action-center` (auth: Frank)
**Goal:** every demo claim points to a real row, a real table, or an honest coverage badge.

Format below: **what we say** → **where it comes from** → **how we defend it on stage**.

---

## 1. Top-of-page · data freshness

> *"You're looking at invoices through 2025-12-17 and quotes through 2025-12-23 — the linkage was refreshed today."*

- **Source:** `meta.dataFreshness` from composer's `_data_freshness()` query → `MAX(date)` on invoices/quotes + `MAX(created_at)` on `quote_invoice_links`.
- **Defense:** if asked "is this live?", click any number and offer to re-run `scripts/load_data.py --all` on the spot. Latest dates auto-update.

## 2. Movable hero · €1.32M / 21% movable

> *"Of €6.25M of revenue this week, €1.32M (21%) is open to repricing. The rest is locked. This split is a pilot heuristic refined once contract data lands."*

- **Source:** `movable_hero.build()` — joins invoices × product_cost_trends and active ab_tests. Heuristic: "had a cost movement this period OR running A/B".
- **Honesty:** amber **Pilot heuristic** pill (Batch 4) with full rule on hover, qualifier in subtitle, coverage badge "33 movable SKUs (pilot heuristic)" — Batch 6.
- **Defense:** if asked "why amber?", point to badge and contracts ask in `Data/onboarding_checklist.md`.

## 3. Buckets · 33 movable / 559 locked SKUs

> *"33 SKUs are movable this year across 4 commodity groups; BKAES leads. 559 are locked under long-term contracts."*

- **Source:** `buckets.build()` — same classification CTE as the hero.
- **Defense:** the two bucket totals (33 + 559) plus locked-this-year (559 of 592 active) reconcile exactly with `invoices` GROUP BY article_id.
- **Caveat:** "long-term contracts" is heuristic-derived ("not movable") until contracts table arrives. Already labelled honestly in the hero pill.

## 4. Decisions · 5 ranked, real facts attached

> *"Top-ranked decision: Article 205345-A unit cost +43.8% — pass-through pending. Cluster SOPU, n=2, confidence 20%."*

- **Source:** `decisions.build()` ranks from `product_cost_trends` (cost risers) + `customer_risk_scores` (margin erosion). Each card carries `cluster.confidence`, `cluster.n`, `facts[]`, `recommendation`, `timeMinutes`.
- **Defense — the strongest demo beat:** zoom into the decision card's `cluster: {label: "SOPU", confidence: 20, n: 2}`. Tell Till: *"the model says SOPU cluster has only 2 backtest steps, so confidence is 20% — Frank should NOT auto-act on this without reviewing it. That caveat lives on the card by default."* That **is** the wedge from the vision doc § 1.2.

## 5. Trust strip · **80% top-cluster pattern accuracy**

> *"Top-cluster pattern accuracy: 80% — seasonal_decomp on commodity_group BKAIZ over 6 walk-forward steps. Forecast error 1.3%. Anomalies caught: 1,728. Data coverage 99.0%."*

- **Source:** `trust.build()` — now reads `model_registry` directly (Batch 8 fix) so the headline number is the **best single cluster**, not a noisy aggregate that averages signal with randomness.
- **Drawer (Batch 3):** click any tile → drawer opens with top-5 cluster table sourced from `/api/v1/models/trust-drawer`.
- **Defense:** if Till asks "what about the bad clusters?", click the tile, scroll the drawer's top-5 table down, point to amber/red rows. Honest by construction.
- **Coverage badge:** green · "4/4 trust signals live".

## 6. Lost-quote card · 5.4pp mean / 1.9pp median gap on 1,949 links

> *"Across 1,949 linked quote-invoice records, the mean margin gap is 5.4 percentage points — median 1.9. On 2025 volume that's ~60,000 EUR/year of leakage. The gap is also widening: 4.2 → 5.6 → 6.4 → 5.3 by year."*

- **Source:** `quote_service.get_quote_to_invoice_gap()` → `quote_invoice_links` joined on (quote_id, position) — verified Batch 5 to match `linkage_report.txt` exactly.
- **Defense — this is the headline "Till leans in" number.** It is the only place where the vision doc's "+5pp / p<0.01" claim materializes on real data.
- **Secondary panel** (won-vs-lost t-test, p=0.38): *"Sales is NOT systematically losing the highest-margin deals — the price-lost group is statistically indistinguishable from won. The leakage isn't in lost quotes; it's between quote and invoice."* That reframing is itself a demo beat.
- **Coverage badge:** green · "1,949 linked quote-invoice records · 4-yr depth".

## 7. SKU table · 50 rows with cluster confidence + movable flag

> *"Each row carries the article's commodity group, cluster confidence, movable / locked chip, and a recommended-price column."*

- **Source:** `sku_table.build()` joining `products` × `invoices` × the movable-articles CTE.
- **Defense:** open the Pricing Studio (`/pricing`) for any SKU; the workbench shows the same numbers + per-driver breakdown.
- **Open gap:** the recommendation engine for `recommended_price`/`floor`/`ceiling` is Batch 3 (Studio per-SKU contract — Phase 3 in the vision doc § 4.2), so we demo *what the table shows* but defer interactive recommendation generation.

## 8. Long-tail coverage · "C-tier price-frozen, 280 SKUs >9mo"

> *"Top-10 SKUs are 19% of revenue. 280 C-tier SKUs have been price-frozen for over 9 months — that's where the long-tail discipline gap lives."*

- **Source:** `long_tail.build()` — Pareto bin (A 54% / B 36% / C 10% by revenue).
- **Defense:** the 19% top-10 concentration is verifiable with `SELECT SUM(revenue) ... ORDER BY ... LIMIT 10` against `invoices`.

## 9. Negotiation cockpit · **+7.4pp catalog-vs-quoted spread**

> *"Quoted deals carry 7.4 percentage points more DB2 margin than walk-in catalog orders. Sample sizes: 1,606 quoted vs 3,939 catalog."*

- **Source:** `negotiation._discount_gap()` → `margin_service.get_catalog_vs_quoted()`. Was rendering "—" before Batch 8 because the service returns a list and `_discount_gap` was treating it as a dict.
- **Defense:** Frank reads this as "our negotiated deals are better than our published prices — push more of the long-tail through quotes, not catalog."
- **Commodity tiles** (SOPU +0.4% YTD etc.): real `product_cost_trends` movers. Honest "lead mover" note attaches to the largest.

## 10. Rejections ranked · KR / AN / PA / KN / KE

> *"KR (no response) leads at €1.3M lost / 31% share. The 'no information' rejection codes are themselves a data-quality work item — they're an opportunity loop, not a finding."*

- **Source:** `rejections.build()` → `quote_service.get_rejection_codes(year=2025)`.
- **Defense — Frank's social job (vision doc § 3.3):** instead of treating KA "no information" as a number, frame it as a Sales feedback loop. *"Half the lost-quote tonnage is unexplained — that's a workflow gap we can close."*

## 11. Audit + A/B blocks · **honestly amber, not blank**

> *"No audited actions or A/B tests yet — every Accept/Decline writes to audit_log, every Slice button on a decision card starts an A/B test."*

- **Source:** `audit_stub.build()` + `abtests_stub.build()` — return empty arrays.
- **Coverage badges** (Batch 6): both amber with explicit "no activity yet" copy. No fake data.
- **Defense — the integrity story:** *"We do not seed audit or A/B with synthetic rows for the demo. When you click Accept on a Decision card the first row writes here."*

---

## Till's secondary walk

Till consumes Frank's screens; he doesn't have a dedicated board pack (Phase 10, deferred). For the demo, walk Till through:

| Stop                  | What Till hears                                                                 |
|-----------------------|---------------------------------------------------------------------------------|
| Header KPIs           | "5,545 records / 1,798 SKUs / 8 commodity groups, all live."                    |
| Movable hero          | "21% of revenue is open to repricing this week."                                |
| Lost-quote card       | "Quote-to-invoice gap is 5.4pp mean, ~60k EUR/year. Trend is up across 4 yrs."  |
| Trust strip           | "Top cluster is 80% accurate. We tell Frank when it isn't."                     |
| Coverage badges       | "Anything amber is something we asked Scherzinger to send us next."             |

Till's purchasing question is: *"is this defensible enough to scale?"* — the answer is: the coverage badges + the trust drawer + the audit-trail-being-honestly-empty pattern.

## Heiko's walk — deferred

The Heiko cut (deal inbox, mobile, sales-rep watchlist) is Phase 11 per the vision doc §6. The `/quotes` page had a "By sales rep" tab — Batch 6 removed it from Frank's view and the default analysis tab is now SKU. **Do not demo Heiko's flow this cut.**

---

## What is still indefensible — flagged for follow-up

These are not blockers for the demo; they are claims we should *not* make on stage until the next batch closes them:

1. **"Forecast error 1.3%"** caption says `n=1` — only one overall backtest. The drawer shows real per-cluster MAE; the strip tile should be relabelled "Forecast error · top cluster" to mirror the Pattern Accuracy fix. → Batch 8.5 candidate or carry-forward.
2. **"Anomalies caught: 1,728"** — the caption breakdown (13 + 20 + 20 = 53) does not match 1,728. Either the tile value or the caption is miscounting; check `quality_service.get_quality_issues` for off-by-one before the demo. → Batch 8.5 candidate.
3. **Recommendation engine** — SKU table renders rows from real data but the `recommended_price/floor/ceiling` triple is not yet computed per SKU. We demo the table; do not click into Studio Workbench on a dead SKU.
4. **AI Monday memo** (`/ai`) — Phase 10, behind a flag, do not demo.
5. **Branded PDF export** — Phase 9, do not demo.

---

## Pre-flight checklist on demo morning

- [ ] `docker compose -f docker-compose.dev.yml up -d` and wait for healthy.
- [ ] `scripts/load_data.py --all` (verify counts 1,438 / 5,565 / 1,798 / 4,539).
- [ ] `scripts/link_quotes_invoices.py` (re-stamp linkage refresh time).
- [ ] `scripts/run_backtests.py` then `scripts/build_model_registry.py` (so the Trust drawer has fresh per-cluster numbers).
- [ ] Hit `/api/v1/screens/action-center` and **eyeball the meta.blocks coverage map** — every status should be `live` or honestly `empty`. No `degraded`.
- [ ] Confirm `meta.dataFreshness.linksUpdatedAt` is today's date (otherwise re-run linkage script).
