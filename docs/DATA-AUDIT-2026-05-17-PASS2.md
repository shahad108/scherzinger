# Pryzm post-fix verification — 2026-05-17 (Pass 2)

Branch audited: `pricing-studio-v3`
Frontend: http://localhost:5174 · Backend BFF: http://localhost:8000
Persona: `frank@scherzinger.de`
Scope: Action Center, Forecasting, Pricing Studio (4 SKUs).

## Summary

- **Fixes verified: 5 / 16 ✅ landed, 11 / 16 ❌ still broken (fully or partially)**
- **New defects found: 12 🔴 lies, 5 🟡 suspect**
- **Worst regression**: workbench "Today's options" (hold / floor / market) shows the same hardcoded `€4.20 / €5.10 / €5.85` for every SKU regardless of cost or price — present on all 4 audited SKUs (200832-E, 201827, 205345-A, 300143).
- **Worst data lie**: Action Center hero "of €8.39M total revenue this week" — actual revenue for the week ending 2026-05-02 is €16,767 (≈ 500× lower); €8.39M does not match any plausible rolling window.

## Fix verification matrix

| # | Defect | Expected post-fix | Actual | Status |
|---|---|---|---|---|
| 1 | studio.json prices fabricated | 200832-E hero €599, 201438-B €809, 300143 €600 | studio.skus picker shows `current_price: 621.142` for 200832-E (BFF self-contradicts hero `€599`). Hero is right; picker payload is stale. | 🟡 PARTIAL |
| 2 | price_state 100× wrong | 200832-E=599, 201438-B=809, 300143=600, 201827=798, 205345-A=347 | DB query confirms exactly those values. | ✅ |
| 3 | Forecast cluster LTM too high | BKAES €3.8M, BKAGG €1.3M, BKAIZ €228K, MBDIV €41K | UI shows those values, BUT raw LTM is BKAES €4.42M, BKAGG €1.52M, BKAIZ €248K, MBDIV €59K. So now systematically LOW by 14–30% across every cluster. Also "SOPU LTM €179K" appears in UI but raw has zero SOPU in LTM. | ❌ regressed direction |
| 4 | planTracking.plan fabricated | status="degraded", plan values null | `meta.blocks.planTracking` missing from action-center; in forecast `planTracking.meta.status="degraded"`, plan=null. Forecast side ✅. But April 2026 "actual €603K" only exists because DB was seeded forward; raw parquet ends 2025-12-17. | 🟡 PARTIAL — only forecast surface fixed |
| 5 | "My scenarios" 108 dupes | ~2 unique names per user | UI shows two scenarios: "Share me", "Test Q4 hard landing" — looks de-duplicated. | ✅ |
| 6 | "BKAGG leads" hardcoded | "BKAES leads · 351 SKUs · €5.07M" | buckets[0].subtitle = "33 SKUs (this year) · 4 commodity groups · BKAES leads · 351 SKUs · €5.07M (2025) · 592 of 1798 catalog SKUs active this year". BKAES leads — correct. But **€5.07M (2025) is wrong: raw BKAES 2025 revenue = €4.42M, raw BKAES SKUs 2025 = 349 (not 351)**. | 🟡 PARTIAL — leader-cluster name fixed, numbers stale |
| 7 | Synthetic ABE-* in movers | No ABE- customer IDs anywhere | Action Center decisions/skuTable/lostQuote clean ✅. **Pricing Studio workbench customer_fanout still contains ABE- IDs**: 201827 (`ABE-B6DA3D-CUST-001`), 205345-A (`ABE-2DDECD-CUST-003`, `ABE-1AA984-CUST-006`, `ABE-7079E4-CUST-002`), 300143 (`ABE-7E7910-CUST-002`, `ABE-1AA984-CUST-000`). | ❌ |
| 8 | Rejection KA hidden | KA at rank #10 with data-quality disclosure | `rejections` list has only 5 rows, ranks 1–5 (KR, AN, PA, KN, KE). **KA is the largest lost-revenue code in raw (€4.94M, 19.8% of lost) and is still suppressed entirely**. Shares sum to 91 %, not 100 %, because denominator is normalized without KA. No data-quality disclosure. | ❌ |
| 9 | Top-10 SKU concentration 25 % wrong | ~18 % | UI 18 %, raw 19.4 %. Acceptable rounding (depends on STSEED exclusion). | ✅ |
| 10 | New products three-way disagreement | Same number on AC and Forecast (~214) | AC longTail: "New products (last 12mo) 214"; Forecast newProduct.stats: "214 new SKUs (last 12mo)". Match. | ✅ |
| 11 | Synthetic market direction tiles hidden | All 8 tiles show indicator badge | Tiles render 7 amber `⚠ SYNTHETIC FOR DEMO (NO … FEED)` chips and 1 "internal proxy from invoices". 8/8 disclosed. | ✅ |
| 12 | Workbench fanout hardcoded customers | Each SKU shows DIFFERENT real customers | **Catastrophically not fixed.** 200832-E raw has 1 unique customer (101690) — UI fans out to 6 customers including 5 customer IDs (104128, 102635, 104472, 101880, 104777) that have ZERO invoices for this SKU. Other SKUs similarly mix in ABE-* synthetics and unrelated customer IDs. See "New defects #2" below. | ❌ |
| 13 | "152 records this week" fabricated | "492 invoice records · last 30d" with reproducible SQL | Header chip "492 invoice records · last 30d" matches DB seed (April 2026 has 492 rows). Self-consistent with DB; not consistent with `Data/cleaned/invoices_clean.parquet` which ends 2025-12-17. The number itself is reproducible from the DB. | ✅ |
| 14 | Revenue forecast bands negative | No negative € in hero.series | Verified: 0 negative values across all 7 band fields × 17 months. Y-axis ≥ €0. | ✅ |
| 14b | Erosion projection negative list prices | All listPrice ≥ 0 | Verified across 6 rows · 24 projection points. Min listPrice = €14.03. | ✅ |
| 15 | Seasonal overlay -99.9 % | Meaningful deviationPct or partial-month disclosed | seasonalOverlay.deviationPct = `10.0 %`, currentMonthLabel="Apr", dataComplete=true. Honest. | ✅ |
| 16 | commodity_group NULL pollution | Cluster aggregations don't drop to fallback | Buckets, clusters, walkForward all reference real commodity groups; no `null` / "Unknown" cluster in displayed rows. | ✅ |

**Verified ✅: 1, 2 (partial 1), 5, 9, 10, 11, 13, 14, 14b, 15, 16 = 9-ish**
**Broken ❌: 3, 6, 7, 8, 12; partial 🟡: 1, 4 = 7 still problematic**

## Screen 1: Action Center

Source: GET `/api/v1/screens/action-center?hide_locked=false&limit=5&lang=de` → 38 401 bytes.

### Rendered values vs raw

| Section | UI value | BFF value | Raw value | Verdict |
|---|---|---|---|---|
| Header chip — invoice records last 30d | "492 invoice records · last 30d" | header.stats[0]: `492` | DB: April 2026 = 492 rows (data seeded). Parquet (`invoices_clean.parquet`) ends 2025-12-17. | ✅ self-consistent with DB |
| Header chip — SKUs | "1,798 SKUs" | `1,798` | Products.parquet = 1798 rows | ✅ |
| Header chip — commodity groups | "8 commodity groups" | `8` | Raw distinct commodity_group = 8 (BKAES, BKAGG, BKAIZ, BKAVF, MBDIV, SOPU, STSEED, plus one) | ✅ |
| Data freshness — Invoices through | "02 May 2026" | `meta.dataFreshness.invoicesThrough = 2026-05-02` | DB max date = 2026-05-02 | ✅ vs DB |
| Data freshness — Quotes through | "17 Apr 2026" | `2026-04-17` | quotes_clean parquet ends 2025 — quotes also seeded forward | ✅ vs DB |
| Linkage refresh | "2 mo ago" | `2026-03-08T15:55:46` | (not raw-verifiable) | 🟡 |
| Movable hero — value | "€1.68M" | `movableHero.value = "€1.68M"` | (depends on what "this week" means; see next row) | 🟡 |
| Movable hero — "of €8.39M total revenue this week" | "€8.39M total revenue this week" | `movableHero.totalRevenue = "€8.39M"` | **DB**: week ending 2026-05-02 = €16,766.89 · 2-week = €26,705 · April-only = €603,524 · YTD 2026 = €1,020,167 · rolling-12mo to 2026-05-02 = €5,661,585. €8.39M matches **nothing**. | 🔴 |
| Movable hero — delta | "-100.0% vs prev" | `delta = "-100.0% vs prev"` | Implies prior period = 0 (because the seeded DB only has rows for April–May 2026 and the "this week" anchor is empty). The −100 % delta is mathematically meaningful but the label hides that "prev" is empty. | 🟡 |
| Movable hero — SKUs in scope | "33 of 675" | `skusInScope:33 / skusTotal:675` | Raw: 2025 active SKUs = 592, all-time = 1221. "675" is unexplained — not 2024+2025 (849), not LTM (592), not catalog (1798). | 🟡 |
| Movable hero — locked | "€6.72M 80%" | `lockedValue = "€6.72M"` | Implied total = €8.39M; same fabrication source as above | 🔴 |
| Bucket 0 subtitle | "33 SKUs (this year) · 4 commodity groups · BKAES leads · 351 SKUs · €5.07M (2025) · 592 of 1798 catalog SKUs active this year" | identical | Raw BKAES 2025: 349 SKUs, €4.42M (not 351 SKUs, €5.07M). 592 / 1798 ✅. | 🔴 numbers |
| Decision #1 cost claim | "Article 200802 unit cost +15.5% — pass-through pending · unit cost ≈ €213.63" | identical | Raw 200802: 27 invoice rows, mean material_per_unit = €25.60 (latest €26.10). +3 % move 2024→2025, not +15.5 %. **€213.63 is 8× the real unit cost.** | 🔴 |
| Decision #2 — 200834-B margin drift | "47.3% → 41.3% · −6.0pp" | identical | Raw db2_margin 200834-B: aligns approx (full calculation in BFF) — acceptable | ✅ |
| Decisions #3–5 customer risk | 101357 €33,831, 101154 €18,916, 101405 €7,788 | identical | Customers exist in raw; revenue-at-risk = last-year revenue per row — not verified end-to-end | 🟡 |
| Trust strip — Pattern accuracy 80 % | "80 %" | `trust[0].value = "80%"` | Reasonable for ema walk-forward; depends on internal model | 🟡 |
| Trust — Anomalies caught | "1,728 · 879 missing cost · 796 100% margin · 20 missing margin · 20 low margin · 13 neg-margin" | identical | Raw flag counts: 879+796+20+20+13 = 1728 ✅ | ✅ |
| Trust — Data coverage | "99.2 % · Invoices 99.2 % · Quotes 81.4 % · Rej. codes 75.0 %" | identical | Not raw-verifiable to four sig figs but in the right ballpark | 🟡 |
| Lost-quote analysis | "Lost-quote differential unavailable" | `lostQuote.implication = "Live lost-quote evidence is currently unavailable"`, all fields 0 / null | But sidebar mini-card still says "+1.8pp differential" — **conflicts with main panel**. | 🔴 conflict |
| skuTable.aid | UI rows show 200834-B, 201438-B, 120584 … 205345-A | `aid` field is **null** for every row in BFF response | UI clearly renders the AIDs, so they're sourced elsewhere (description?) | 🟡 schema gap |
| skuTable — 200832-E recommended | "€621.14 no change" | row.recommendedPrice = €621.14 | DB price_state.current_price = €599. **UI claims €621.14 is recommended for a SKU whose current is €599 — and labels it "no change"**, which is internally inconsistent. (€621.14 is the picker's stale price.) | 🔴 |
| skuTable — 205345-A margin | "-18.8% → 62.9% · +10.0% capped" | identical | A 81.7-point margin swing in a single SKU with no explanation; raw db2_margin shows wide variance (some 100% rows) — looks like data-quality leakage into "improvement" | 🟡 |
| LongTail tiles — Top-10 concentration 18 % | "18 % · Trailing 12 months (real invoices only)" | `tiles[0]={value:18%}` | Raw LTM top-10 / total = 19.44 %. Rounded to 18 % vs 19 % — close. | ✅ |
| LongTail — New products | "214 · €1.4M revenue · 29.0% of total" | identical | 29 % "of total" of what? Raw 2025 revenue = €6.25M; €1.4M / €6.25M = 22.4 %. Raw LTM = €6.25M; same. **29.0 % does not reconcile.** | 🔴 |
| Mix A/B/C | "A 51 % top 10 %, B 37 % mid 40 %, C 12 % bottom 50 %" | identical | Sums to 100 ✅. Roughly typical Pareto. | ✅ |
| Negotiation — discountGap | "+9.6pp · quoted n=1,606 · catalog n=4,497" | identical | Not directly raw-checkable in this run | 🟡 |
| Negotiation commodities — SOPU "+0.4% YTD largest YTD move" | identical | All four commodities show "≤0.4 % YTD" — implausibly flat across an entire industrial portfolio | 🟡 |
| Rejections | KR 31 %, AN 28 %, PA 13 %, KN 12 %, KE 7 % (sum 91 %) | identical | Raw share of total lost: KA 19.8 %, KR 5.3 %, AN 4.7 %, PA 3.2 %. **Suppressing KA inflates all other shares by ≈ 25×; the displayed shares are normalized against ≈ €4.19M, not the €24.9M true lost revenue.** Fix #8 not landed. | 🔴 |
| Audit trail | "2026-05-17 16:05 Frank Reinholz — Studio decision accepted: 200832-E · Δ +0.6pp" | identical | Plausible (matches Frank session), not raw-verifiable | 🟡 |
| Right-rail summary chip | "Lost-quote analysis · +1.8pp differential" | hard-coded in shell | Contradicts main lost-quote panel which says "unavailable". | 🔴 |
| Right-rail summary chip | "SKU pricing engine · 675 of 1,798 SKUs (this year)" | shell | 675 ≠ 592 active 2025 SKUs in raw; ≠ 1304 forecasted; another mystery denominator | 🟡 |

### NEW defects on Action Center (not in original audit)

🔴 **AC-1** — `movableHero.totalRevenue = €8.39M` is unsourced. None of {this week, last week, YTD 2026, rolling 12 mo, 2025 full year, all-time} produces €8.39M. Closest is 2025 + early-2026 = €7.27M — still off €1.1M.
🔴 **AC-2** — Right-rail summary chips ("Lost-quote analysis +1.8pp", "SKU pricing engine 675 of 1,798") contradict main-screen panels on the same page.
🔴 **AC-3** — `skuTable[i].aid` is null in BFF response but UI renders article codes; UI must be reading description or out-of-band — adds invisible source of drift.
🔴 **AC-4** — LongTail new-products percentage 29.0 % doesn't reconcile against any LTM denominator (€1.4M / 29 % = €4.83M which matches nothing — not LTM total €6.25M, not 2025 €6.25M).
🔴 **AC-5** — Decision #1 unit-cost claim (€213.63 / +15.5 %) is 8× too high and trend is wrong sign vs raw.
🟡 **AC-6** — Movable hero says "-100.0 % vs prev" without disclosing that prev was empty.
🟡 **AC-7** — Negotiation commodities show "≤0.4 % YTD" for all 4 commodities — implausibly flat; consistent with the same low-amplitude synthetic that's mocking input costs elsewhere.

## Screen 2: Forecasting

Source: GET `/api/v1/screens/forecast?mode=revenue&horizon=12&lang=de` → 61 497 bytes. Note the rest of the system uses the bare `/forecasting` path on the frontend, but the BFF endpoint is `/screens/forecast` (no `-ing`).

### Rendered values vs raw

| Section | UI value | Raw / cross-check | Verdict |
|---|---|---|---|
| Header | "Updated 2026-05-02 · Top mover Customer 103830 +€5.0K WoW · STALE" | DB max date 2026-05-02 ✅. **Customer 103830 in raw: 3 invoices total, last one 2024-07-03**. They cannot be a 2026 WoW mover. | 🔴 mover |
| Hero movers — Customer 101199 +€3.8K WoW | – | **Customer 101199 has 0 rows in raw invoices**. Pure fabrication. | 🔴 |
| Hero movers — Customer 103862 -€1.9K WoW | – | Last raw invoice 2025-07-30. Cannot WoW in May 2026. | 🔴 |
| Forecast (next 12 mo) | "€2.6M" | Trailing 12 mo raw = €6.25M; forecast €2.6M is 41 % of trailing → severe drop with no narrative explanation. Implied by 12-step ema sum of hero.series? Sum of `primary` ≈ €5.86M, not €2.6M. **Self-contradiction with the hero chart values.** | 🔴 |
| Variance vs plan | "0.0 %" | Plan is null (degraded). 0.0 % is misleading — should say "n/a". | 🟡 |
| MAPE trailing 6 mo | "5.0 %" | `walkForward.series[0]={mape:2.12}` overall; cluster MAPEs 1.48 % / 3.53 % / 6.59 %. The "5.0 %" doesn't match any single block. | 🟡 |
| Prediction interval coverage | "12/12 in-window actuals inside P80 (100 %)" | If 100 % of actuals fall inside the P80 band, the band is way too wide (expected ~80 %). Same for P95. Either band is over-wide or "actuals" are reused as primary. | 🟡 |
| Pocket waterfall | List 6.80M → Quoted 6.80M (-0.0%) → Booked 2.29M (-66.3%) → Invoiced 2.29M → DB2 2.29M | A 66 % leakage at "quoted→booked" with no leakage elsewhere is implausible — and "DB2 = 2.29M" means margin = 0 % of list (the visible "pocket 0 % of list" chip on every option agrees). Internally inconsistent with cluster margins ≥ 50 %. | 🔴 |
| Cluster card — BKAES LTM | "€3.8M · 67.3% margin · MAPE 1.5%" | Raw LTM BKAES = €4.42M. UI is 14 % low. | 🔴 |
| Cluster card — BKAGG LTM | "€1.3M · 52.1% margin · MAPE 3.5%" | Raw LTM BKAGG = €1.52M. UI 14 % low. | 🔴 |
| Cluster card — BKAIZ LTM | "€228K · 59.0% margin" | Raw LTM BKAIZ = €248K. 8 % low. | 🟡 |
| Cluster card — MBDIV LTM | "€41K · 62.8% margin" | Raw = €59K. 30 % low. | 🔴 |
| Cluster card — SOPU | "LTM €179K — no forecast in margin_forecasts" | Raw LTM SOPU = €0 (no SOPU revenue in LTM). UI fabricates LTM revenue. | 🔴 |
| Movable / Locked split | "77 % / 23 % · €4.60M movable · €1.40M locked" | Sums to €6.00M (vs LTM raw €6.25M — close); but rule "movable = high/critical risk + ½ medium" is upside-down vs the Action Center rule ("movable = cost moved OR in A/B test"). Two different definitions on two screens. | 🔴 conflict |
| At-risk revenue tiers | Tier A 2 cust · 0 % at risk · €445K, Tier B 8 cust · 0 % at risk · €956K, Tier C/D 0 cust | 100 % safe across all tiers contradicts the churn scores in Action Center (Customer 101357 risk 0.91 critical, €33,831 at risk). They should both lift from the same risk table. | 🔴 conflict |
| Pareto top customer — 101690 LTM | "€367,016 · YoY trend ↓ -71%" | Raw 101690 LTM = €468,114. Yearly: 2022 €391K → 2025 €468K. **YoY 2024→2025 is +59 %, not -71 %.** Wrong magnitude AND wrong direction. | 🔴 |
| Pareto drill — 101690 top SKU | "201438-B €85K (31 %)" | Raw top SKU for 101690 is 200832-E (€186K), 204430 (€172K), 200834-B (€167K), 201438-B (€125K). **Drill misses the #1 SKU entirely**, order is wrong. | 🔴 |
| Pareto customer 103466 forecast | "€121,875 · ↓ -100 % YoY" | "-100 %" YoY is internally meaningless when forecast is non-zero. | 🟡 |
| Next-cycle moves | "BKAES: Tighten quoting … 16 quotes lost to PA in last 90d · 158k €" | rejection-code analysis at cluster level — raw lost-to-PA in 90 d window not verified in this pass | 🟡 |
| Win-loss strip | BKAES paPct 8.93, prPct 1.19, sample 168 | – | 🟡 |
| Seasonal overlay | Apr expected 98.8 · actual 108.7 · deviation 10.0 % · dataComplete=true | Raw 2025 April revenue = €588K; long-term April index 98.84 — the +10pp claim is plausible if Apr 2026 invoiced more than expected | 🟡 |
| Market direction | 8 tiles all show synthetic/internal indicator | ✅ all disclosed | ✅ |
| Steel proxy "4.28 €/unit · ↓ -96.8% WoW" | – | A -97 % weekly move is a numerical artifact (denominator near 0) — should be suppressed or floor-bounded. | 🔴 |
| Plan-vs-actual | "Plan target unavailable · DATA MISSING" with 5 monthly actuals | meta.status="degraded", plan=null ✅. But "actual €603K for April 2026" is from seeded DB, while raw parquet has 0 rows in 2026. Disclosure says "Plan targets not configured" but doesn't note that the actuals are seed data. | 🟡 |

### NEW defects on Forecasting

🔴 **FC-1** — Hero "Forecast (next 12 mo) = €2.6M" doesn't reconcile against `hero.series.primary` sum (~€5.86M) or against trailing 12 mo (€6.25M). The headline KPI contradicts its own chart.
🔴 **FC-2** — Cluster LTMs are systematically 14–30 % below raw across BKAES, BKAGG, BKAIZ, MBDIV. SOPU LTM €179K shown despite raw LTM = €0.
🔴 **FC-3** — Pareto customer YoY trend has wrong direction for #1 customer (101690: UI -71 %, raw +59 %).
🔴 **FC-4** — Pareto drill omits the #1 SKU for the top customer (200832-E for 101690 is missing).
🔴 **FC-5** — `movableLockedSplit` definition contradicts Action Center hero definition.
🔴 **FC-6** — `atRiskRevenue` tier table says all customers are 0 % at risk, but Action Center decisions list 3 customers with risk ≥ 0.72.
🔴 **FC-7** — Pocket waterfall shows DB2 = €2.29M = booked = invoiced — i.e., 0 % margin loss after booking, which is impossible when cluster margins are 52–67 %.
🔴 **FC-8** — Steel proxy "-96.82 % WoW" — denominator-near-zero artifact escaping into a headline tile.
🟡 **FC-9** — P80/P95 coverage = 100 % suggests over-wide bands or actuals reused as primary.
🟡 **FC-10** — "Top mover Customer 101199 +€3.8K WoW" — customer 101199 has zero rows in raw.

## Screen 3: Pricing Studio

Audited 4 SKUs via `/api/v1/screens/studio` + `/screens/studio/workbench/<aid>`.

### Per-SKU summary

| SKU | hero.currentPrice | hero.currentMargin | rec € | rec confidence | cost.unitCost | cost.floorCalc | options hold/floor/market € | fanout customers (raw / UI) | Status |
|---|---|---|---|---|---|---|---|---|---|
| 200832-E | €599 | -1.3 % | 868.55 | med (0.65) | 467.22 | **5.10** | 4.20 / 5.10 / 5.85 | raw 1 (101690) · UI 6 (104128, 102635, 104472, 101690, 101880, 104777 — 5 fake) | 🔴 |
| 201827 | €798 | 40.8 % | 1157.10 | med | 472.40 | **5.10** | 4.20 / 5.10 / 5.85 | raw 2 (101755, 100702) · UI 6 incl. `ABE-B6DA3D-CUST-001` | 🔴 |
| 205345-A | €347 | 57.1 % | 503.15 | low | 148.77 | **5.10** | 4.20 / 5.10 / 5.85 | raw 10 real · UI 6 incl. 3× ABE-* | 🔴 |
| 300143 | €600.23 | 42.5 % | 870.33 | med | 345.38 | **5.10** | 4.20 / 5.10 / 5.85 | raw 3 (100989, 101654, 104800) · UI 6 incl. 2× ABE-* | 🔴 |

### Critical findings

🔴 **PS-1** — `cost.floorCalc = "5.10"` is identical across all 4 SKUs despite unit costs ranging €148–€472. The floor in `price_state` for 200832-E is `€658.90`, but workbench cost panel still surfaces `5.10`. Floor is hardcoded.
🔴 **PS-2** — `options.hold = "€4.20"`, `options.floor = "€5.10"`, `options.market = "€5.85"` for every SKU regardless of price (€347 → €798). The hero shows "Today €599" and immediately below the options compare to "€4.20" — i.e., the "no change" baseline says €4.20 while current is €599. Demonstrably hardcoded.
🔴 **PS-3** — `hero.currentMargin = "-1.3 %"` for 200832-E, but unitCost €467.22 and price €599 gives a 22 % margin (which is exactly what the Action Center skuTable shows: 21.0 % → 22.2 %). Hero margin is wrong on the workbench for 200832-E.
🔴 **PS-4** — Fanout populated with synthetic / unrelated customers (Fix #12 / Fix #7 not landed). For 200832-E the raw has exactly one customer for this SKU (101690 · €186K LTM · 340 units) — UI fans out to six customers and shows 101690 with LTM €29,950 / 50 units, which is 7× too low.
🔴 **PS-5** — `picker.skus[200832-E].recommendation.current_price = 621.142` while hero shows `€599`. BFF self-contradicts on the same payload.
🔴 **PS-6** — `picker.skus[200832-E].recommendation.recommended_price = 621.142` while workbench `recommendation.recommended_price = "868.55"`. Two different recommendations for the same SKU in the same screen response.
🟡 **PS-7** — Hero meta string: "Last repriced 2024-Q1 (€3.80→€4.20) by Frank · 23 months ago" — talks about €4.20 prices for a SKU whose price is €599, mixing the seed-fixture story with reality.
🟡 **PS-8** — `Margin Δ` chip on picker for 200832-E reads "-1.3 %" while skuTable/forecast both say 21.0 %. Three margin values for the same SKU on the same page.

## Self-reconciliation checks

| Check | Result |
|---|---|
| AC buckets[0] "351 SKUs" vs movableHero.skusTotal 675 | Different (351 ≠ 675) — but they're different scopes (BKAES vs all). Subtitle reads as the same scope, which is misleading. |
| AC longTail "29.0 % of total" — does €1.4M / 0.29 = €4.83M reconcile? | €4.83M matches no displayed denominator. Should be 22.4 % vs LTM €6.25M. ❌ |
| Rejection shares sum | 91 % (missing KA). ❌ |
| AC hero "€1.68M of €8.39M" — does (movable + locked) match total? | €1.68M + €6.72M = €8.40M ≈ €8.39M ✅ (internally consistent), but €8.39M doesn't exist in raw. |
| Forecast hero "Forecast €2.6M" vs sum(hero.series.primary) | €2.6M vs €5.86M. ❌ self-contradiction. |
| Forecast cluster LTMs sum (BKAES + BKAGG + BKAIZ + MBDIV + SOPU) | €3.8 + €1.3 + €0.228 + €0.041 + €0.179 = €5.55M. Raw LTM €6.25M. ❌ 11 % short. |
| FC atRiskRevenue (Tier A €445K + Tier B €956K) = €1.40M vs FC movable/locked locked=€1.40M | Coincidence? Same number for two semantically different things on the same page. 🟡 |
| FC pareto top-10 customer LTMs vs raw top-10 | UI €367K/€227K/€182K/€165K/€163K/€144K/€134K — raw €468K/€328K/€325K/€287K/€269K/€230K/€138K. UI uniformly 20–50 % low. |
| Studio picker.current_price (621.14) vs price_state.current_price (599.00) vs hero (599) | Mismatch ❌. |
| Studio workbench.cost.floorCalc (5.10) vs price_state.floor (658.90) | Off by 129×. ❌ |

## New defects (consolidated, not in original audit)

🔴 #1 (AC-1) — Total revenue "this week" €8.39M unsourced (raw ≤ €17K).
🔴 #2 (AC-2 + skuTable-vs-rail) — Right-rail summary chips contradict main panels (lost-quote unavailable vs +1.8 pp; SKUs 675 vs 1304).
🔴 #3 (AC-4) — New-products 29 % share has no valid denominator.
🔴 #4 (AC-5) — Decision #1 unit cost €213.63 / +15.5 % is 8× too high and wrong sign.
🔴 #5 (FC-1) — Forecast headline €2.6M contradicts its own series sum.
🔴 #6 (FC-2) — Cluster LTMs 14–30 % below raw; SOPU fabricated.
🔴 #7 (FC-3) — Pareto YoY direction wrong for top customer 101690 (UI -71 %, raw +59 %).
🔴 #8 (FC-4) — Pareto drill omits the #1 SKU for the top customer.
🔴 #9 (FC-5 / movable-locked) — Movable definition differs between AC and Forecast.
🔴 #10 (FC-6) — at-risk revenue tiers contradict AC churn decisions.
🔴 #11 (FC-7) — Pocket waterfall ends at 0 % margin despite cluster cards showing 52–67 %.
🔴 #12 (FC-8) — Steel proxy -96.82 % WoW is a near-zero-denominator artifact.
🔴 #13 (PS-1/2) — Options block hardcoded (4.20 / 5.10 / 5.85) and cost floor hardcoded (5.10) across all SKUs.
🔴 #14 (PS-3) — 200832-E hero margin -1.3 % vs computable 22 %.
🔴 #15 (PS-5/6) — Studio picker recommendation diverges from workbench recommendation for same AID.
🟡 #16 (AC-6 / AC-7 / FC-9 / FC-10 / PS-7 / PS-8) — Six lower-severity inconsistencies enumerated above.

## Recommended next-pass fixes (priority order)

1. **Workbench options block** (PS-1/2) — single highest-impact lie; recompute from current price + cost + cluster floor per SKU, never hardcoded.
2. **Rejections KA disclosure** (Fix #8 not landed) — restore KA to top of list with a data-quality flag, renormalize shares to 100 % over the true denominator.
3. **Action Center "€8.39M total revenue this week"** (AC-1) — replace with the actual week revenue from invoices and label the window correctly, or call out empty-week.
4. **Cluster LTMs** (Fix #3 incomplete) — recompute from invoices LTM rather than whatever upstream table is 15–30 % low.
5. **Forecast headline €2.6M** — reconcile with hero.series sum or relabel.
6. **Movable definition** — unify across AC and Forecast (one rule, one engine).
7. **at-risk revenue tiers** — drive from the same customer-risk table that the AC decisions block uses.
8. **Pareto YoY trend math** — currently wrong direction; recompute as (LTM revenue − prior LTM revenue) / prior LTM revenue.
9. **Customer fanout** (Fix #12 not landed) — drop synthetic ABE-* IDs in workbench, and bound fanout to customers actually invoiced for the SKU.
10. **Picker vs workbench price/recommendation mismatch** — single source of truth (price_state.current_price + latest recommendation row).
11. **Steel proxy floor / smoothing** — suppress single-week swings beyond ±50 %.
12. **Right-rail summary chips** — drive from the same data block, not a hardcoded shell template.

## Audit method appendix

- Tools used: `mcp__plugin_playwright_playwright__browser_*` (navigate, click, evaluate, take_screenshot, network_requests); curl with cookie jar `/tmp/jar`; psycopg2 against `postgresql://pryzm:pryzm_dev@localhost:5432/scherzinger_margin_db`; pandas against `Data/cleaned/*.parquet`.
- BFF endpoints exercised: `/api/v1/screens/action-center`, `/api/v1/screens/forecast`, `/api/v1/screens/studio`, `/api/v1/screens/studio/workbench/<aid>` for 200832-E, 201827, 205345-A, 300143.
- Screenshots saved to `.playwright-mcp/action-center-full.png`, `.playwright-mcp/forecast-full.png`, `.playwright-mcp/pricing-200832E.png`; raw text dumps in `.playwright-mcp/*-text.txt`.

### Gotchas

1. **Two data sources behind the same screen** — `Data/cleaned/invoices_clean.parquet` ends 2025-12-17 (5,565 rows, €24.6M), but the live DB has been seeded forward through 2026-05-02 (6,581 rows, €27.3M). "Raw" verification has to use the DB for anything after 2025-12-17, not the parquet. Many UI numbers like "April 492 records" only validate against the seeded DB.
2. **Frontend route `/forecasting` does NOT map 1:1 to BFF route `/screens/forecast`** — fetching `/api/v1/screens/forecasting` returns 404. Future audits should derive endpoints from the network panel rather than the URL pathname.
3. **Pricing Studio redirects to `/action-center`** on a fresh `goto` — must click the sidebar `a[href='/pricing']` to actually land on the page.
4. **`skuTable[i].aid` is null in the action-center BFF response** but the UI clearly renders article IDs — the UI is sourcing AIDs from some other field (description / decision linkage). Audits must read both the BFF and the rendered DOM to spot drift.
5. **"€4.20 / €5.10 / €5.85" hardcodes** — these are legacy seed-fixture prices from an earlier German-pump-pricing demo (e.g., 4.20 EUR per unit-style); they're now masquerading as today's price-options inside a workbench whose actual prices are €347–€798. Any string ending in `.20 / .10 / .85` in the next pass is a red flag.
6. **Hero says "STALE"** on the forecast — good honest signal, but immediately followed by a "WoW" mover for a customer with zero recent invoices.
7. **Two unique "scenarios" in the picker** ("Share me", "Test Q4 hard landing") — Fix #5 landed but the scenario names look like garbage placeholders, may want a follow-up dedup-and-rename pass.
8. **Synthetic indicator chips on Market Direction tiles** all carry the same German phrasing — visually inert; users may still treat them as real numbers despite the badge.

---

Report file: `/Users/dharmendersingh/Documents/Scherzinger_new/docs/DATA-AUDIT-2026-05-17-PASS2.md`
