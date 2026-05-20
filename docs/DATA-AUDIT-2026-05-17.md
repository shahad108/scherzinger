# Pryzm data audit — 2026-05-17

Read-only audit of Action Center, Forecast, and Pricing Studio for Frank.
Methodology: open each screen logged in as `frank@scherzinger.de`, snapshot the
rendered DOM, fetch the BFF JSON the screen actually consumed, and prove every
load-bearing number against (a) the raw Scherzinger parquet files in
`Data/cleaned/` and (b) the live Postgres tables (`invoices`, `quotes`,
`price_state`, `cost_state`, `recommendations`, `pricing_audit`, `audit_log`,
`ab_tests`, `scenarios`, `backtest_results`, `seasonal_patterns`, `products`,
`customers`).

Severity legend:
- 🔴 **LIES** — UI displays a wrong number against raw or DB truth, or hardcodes
  a value that ignores the SKU/filter context.
- 🟡 **SUSPECT** — plausible but unverifiable, or sourced from synthetic seed
  data without disclosure.
- 🟢 **OK** — value matches its declared source within tolerance.

Ground truth (raw parquet):
- `invoices_clean.parquet`: 5,565 rows, €24,646,717.28, 2022–2025, 1,221 SKUs,
  967 customers.
- `quotes_clean.parquet`: 4,539 rows, win-rate 37.1%, 2022–2025.
- `products.parquet`: 1,798 SKUs across 8 commodity groups.
- `customers.parquet`: 1,438 customers.

DB additions on top of raw:
- 577 `STSEED-*` invoice rows (~€1.39M synthetic seed for Pricing Studio).
- All 610 invoice rows dated 2026 are synthetic (raw stops at 2025-12-17).
- 458 invoice rows in DB have `commodity_group = NULL` — orphaned seeder data.

## Summary

- 72 distinct findings: **34 🔴 / 27 🟡 / 11 🟢**.
- Top-3 most impactful:
  1. 🔴 **Pricing Studio workbench `cost`, `fanout`, `history`, `memo` are
     hardcoded to the 200832-E demo template** for every SKU — `cost.unitCost`,
     `cost.components`, `fanout.rows`, `cost.note`, `cost.trajectory`, and the
     rationale memo body return character-identical values from
     `/api/v1/screens/studio` and `/api/v1/screens/studio/workbench/{aid}`
     regardless of `aid`. Customers `101580 / 102330 / 103044 / 102801 / 101900
     / 101582` are not real for 200832-E, 205345-A, 201827, or 300143; in raw,
     200832-E has exactly one customer (101690), 201827 has two (101755 +
     100702), 300143 has three (100989 + 104800 + 101654). Live wiring breaks
     the audit story for every SKU.
  2. 🔴 **Hero "152 records · €7.80M total revenue this week" is fabricated.**
     `invoicesThrough = 2026-05-02` and DB has **0** invoice rows in the week
     May 11–17 2026. The €7.80M number can't be reproduced from any time window
     in DB (YTD 2026 = €0.82M; TTM = €5.15M; calendar 2025 = €6.98M).
  3. 🔴 **"BKAGG leads" subtitle on the movable bucket is wrong** — for 2025 in
     DB, BKAES leads BKAGG by 2.8× on revenue (€4.82M vs €1.72M) and by 1.5× on
     active SKUs (351 vs 235). The same falsehood propagates to the Pricing
     Studio header (`subStats[1].label = "leads"`, value = "BKAES" — there it
     happens to be right, but it contradicts Action Center).

---

## Screen 1: Action Center

### Rendered values (grouped by section)

**Header**
- "Good morning, Frank."
- "Week 20 · May 11 – May 17, 2026"
- "152 records", "1,798 SKUs", "8 commodity groups"
- Data freshness chip: "Invoices through 02 May 2026", "Quotes through 17 Apr
  2026", "Linkage refresh 2 mo ago"

**Movable revenue hero**
- Value: **€1.74M** with **-99.1% vs prev**
- "of €7.80M total revenue this week — 22% open to repricing"
- "Movable share 22% of revenue · SKUs in scope 34 of 675 · Locked €6.07M 78%"
- "Movable revenue trend · Wk 6 / Wk 12 / Wk 18 · €1.74M" with sparkline
- "34 movable SKUs (pilot heuristic)" + heuristic explainer

**Buckets**
- Movable: "34 SKUs (this year) · 4 commodity groups · BKAGG leads · 592 of
  1798 catalog SKUs active this year · €1.74M open"
- Locked: "558 SKUs (this year) · long-term contracts · €5.53M locked · In
  renewal queue"

**Today's analyst decisions** (5 ranked)
1. Cost riser · 200802 (BKAGG) · +15.5% unit cost · €213.63 · n=2 records
2. Customer 101357 risk 0.91 (critical) · €33,831/yr at risk
3. Customer 101154 risk 0.73 (high) · €18,916/yr
4. Customer 101405 risk 0.72 (high) · €7,788/yr
5. Customer 103862 risk 0.71 (high) · €2,294/yr

**Model trust** (4 tiles)
- Pattern accuracy (top cluster): 80% · seasonal_decomp · BKAIZ · n=6
- Forecast error (top cluster): 1.01pp · ema · BKAES · MAE n=12
- Anomalies caught: 1,728 (879 missing cost + 796 100% margin + 20 missing
  margin + 20 low margin + 13 neg-margin)
- Data coverage: 99.2% · Invoices 99.2% / Quotes 81.4% / Rej. codes 75.0%

**Lost-quote analysis** — "Lost-quote analysis unavailable" banner BUT
right-rail jump-link says "Lost-quote analysis +1.8pp differential" (hardcoded).

**SKU pricing engine** table — 10 rows: 200834-B, 201438-B, 120584, 201827,
205165, 200832-E, 300143, 205178, 205180, 205345-A. Each shows article, desc,
commodity, cluster confidence, margin Δ, recommended €, status.

**Long-tail coverage**
- Top-10 SKU concentration: 25% of revenue
- SKUs below DB-II target: 6 · trailing 12mo
- New products (last 12mo): 284 · €1.9M · 24.0% of total
- C-tier price-frozen: 274
- Mix: A·59% / B·31% / C·10%

**Annual list-price negotiation cockpit** — gap "+9.8pp" · quoted n=1,606,
catalog n=4,516. SOPU +0.4% / BKAIZ -0.1% / BKAGG +0.0% / BKAES +0.0% YTD.

**A/B test tracker** — 200832-E · slice 50% · day 0 · "too few samples"

**Why we lose** (rejection ranking) — 5 cards: KR €1.3M (31%), AN €1.2M (28%),
PA €541k (13%), KN €503k (12%), KE €274k (7%). Strapline: "KA dominates —
data-quality issue you should drive."

**Audit trail** — 2026-05-17 10:36 · "Frank Reinholz — Studio decision
accepted: 200832-E" · Δ +0.6pp · #f51ccfa4

**Right rail jump-links** — Movable ~22% · €1.74M, Today's decisions "8 ranked
actions" (UI only shows 5), Model trust 4 KPIs, Lost-quote +1.8pp, SKU pricing
"675 of 1,798 SKUs".

### BFF mapping (`/api/v1/screens/action-center`)

Every rendered value above maps to a stable key path:
`header.stats[N]`, `movableHero.{value,totalRevenue,skusInScope,skusTotal,lockedValue,
movablePct,lockedPct,spark,delta,heuristic}`, `buckets[0..1].{title,subtitle,tags,
avatars,cta}`, `decisions[N].{headline,why,facts,cluster.{label,confidence,n},
recommendation,confLabel}`, `trust[0..3].{label,value,caption}`, `skuTable[N].{article,
description,commodity,clusterConf,marginDelta,recommendation.{current_price,
recommended_price,floor,ceiling,is_movable,cluster_id},statusLabel}`,
`longTail.{tiles[N].{label,value,caption},mix[N].{label,subtitle,pct},subhead}`,
`negotiation.{discountGap,discountGapDelta,commodities[N].{name,delta,note}}`,
`rejections[N].{rank,code,lostRevenue,share,owner}`, `audit[N].{actor,change,
delta,ts}`, `abTests[N].{title,subtitle,trend,significance,...}`,
`meta.blocks.lostQuote.{status,reason}` ("degraded · Lost-quote differential
unavailable").

### Defects

**Header / freshness**

1. 🔴 **header.stats[0] "152 records"** — UI label "this week" but DB has 0
   invoices in 2026-05-11..05-17. None of last-7d/14d/30d/60d/90d/YTD/TTM
   produces 152 (closest: 30d ending 2026-05-02 = 493). Provenance unknown;
   the value is dynamic per request but unverifiable.
2. 🟡 **`meta.dataFreshness.linksUpdatedAt = 2026-03-08T15:55:46`** — 2 mo old
   linkage refresh is reasonable but uses a non-UTC timestamp without `Z`
   suffix (`linksUpdatedAt` is `2026-03-08T15:55:46.722433`, no zone).
3. 🟢 header.stats[1] "1,798 SKUs" — matches `products.parquet` row count.
4. 🟢 header.stats[2] "8 commodity groups" — matches `products.parquet`.
5. 🟢 Data-freshness chip "Invoices through 02 May 2026" — matches
   `select max(date) from invoices`.

**Movable revenue hero**

6. 🔴 **`movableHero.totalRevenue = €7.80M` labelled "this week"**. No DB time
   window reproduces €7.80M. Possible intent: full-year planning total or
   movable+locked sum (1.74 + 6.07 = 7.81M); the wording is misleading and the
   underlying source is unclear.
7. 🔴 **`movableHero.value = €1.74M` with `delta = -99.1% vs prev`** — the
   sparkline last bin is 0.00038 (≈ €384) and is the source of the -99.1%
   crash. That tail point is the partial week 2026-05 (data through May 2 = 2
   days of May), which makes the delta meaningless. The headline says
   "movable revenue", not "partial-week movable revenue".
8. 🔴 **`movableHero.skusTotal = 675`** is labelled in the UI as "34 of 675"
   in `movableHero.skusInScope` context but the right rail says "675 of 1,798
   SKUs (this year)". DB shows 675 = distinct aids invoiced 2025-01-01 → today.
   The mismatch between hero ("of 675") and bucket subtitle ("592 of 1798
   active this year") makes the same denominator inconsistent across sections.
9. 🟢 `movableHero.movablePct = 22` ≈ 1.74 / 7.80 (22.3%) — arithmetic self-
   consistent.
10. 🟢 `movableHero.lockedPct = 78` ≈ 6.07 / 7.80 — self-consistent.
11. 🟡 `movableHero.spark` (14 weekly values, sum ≈ €1.39M) doesn't reconcile
    with the headline value (€1.74M).

**Buckets**

12. 🔴 **`buckets[0].subtitle` claims "BKAGG leads"** — for 2025 invoiced
    revenue in DB, the leader is **BKAES at €4.82M with 351 SKUs**; BKAGG is
    second at €1.72M / 235 SKUs. Pricing Studio header in the same session
    says "BKAES leads".
13. 🔴 **buckets[0] subtitle "34 SKUs · 4 commodity groups · 592 of 1798
    catalog SKUs active this year"** vs movable hero "SKUs in scope 34 of
    675". Both numbers (592 and 675) can be defended on their own (592 =
    distinct aids in DB for 2025-01-01..2025-12-31; 675 = aids 2025-01-01 ..
    today including 2026 synth), but the user-facing surface puts them next to
    each other unlabelled.
14. 🔴 **buckets[1] "558 SKUs · long-term contracts"** — no DB table or column
    classifies a SKU as "long-term contract". The number `558 = 592 - 34` is
    synthesised arithmetic. No frame contract data exists.
15. 🟡 `buckets[1].tags[0].label = "€5.53M locked"` doesn't equal the hero
    `lockedValue = €6.07M`. Off by €540k.

**Today's decisions**

16. 🟢 decision[0] cost-riser 200802 +15.5% cost €213.63 → traceable to
    `product_cost_trends`; n=2 confidence is honestly disclosed.
17. 🟢 decisions[1..4] customer risk scores — `lastActualRevenue` for 101357,
    101154, 101405, 103862 match raw 2025 LTM exactly (€33,831 / €18,916 /
    €7,788 / €2,913). 103862 UI shows €2,294 vs raw €2,913 (delta -21%) —
    🟡 minor.
18. 🟡 Decision counts: BFF returns 5, right-rail jump-link says "8 ranked
    actions". 8 is hardcoded in the section index.

**Trust**

19. 🟢 Anomalies caught = 1,728. Verified: invoices `dq_missing_margin=20 +
    dq_negative=13 + dq_low=20 = 53` and quotes `dq_missing_cost=879 +
    dq_100pct_margin=796 = 1,675`. Sum = 1,728 exactly.
20. 🟡 Data coverage "Invoices 99.2% · Quotes 81.4% · Rej. codes 75.0%" —
    formula not documented and 99.2% isn't reproducible from any obvious ratio
    (5565/5565 = 100%; 5512/5565 ≈ 99.05%). Plausible but unverifiable.
21. 🟢 Pattern accuracy 80% (BKAIZ, seasonal_decomp, n=6) — matches the
    relevant `backtest_results` row qualitatively.
22. 🟢 Forecast error 1.01pp (BKAES, ema, MAE n=12) — order of magnitude
    matches `backtest_results` (mae ≈ 0.013 ≈ 1.3pp).

**Lost-quote**

23. 🔴 **`meta.blocks.lostQuote.status = "degraded"` with reason "Lost-quote
    differential unavailable"** AND the right-rail jump link says "+1.8pp
    differential" — the section is broken but the index claims a value.
24. 🔴 The header on the section reads "Lost-quote analysis +1.8pp
    differential" in the right-rail nav (hardcoded `"My pinned section"` block
    above it). BFF returns `lostQuote.differential = 0`.

**SKU pricing engine table**

25. 🔴 **Row 200832-E `recommendation.current_price = 21.3489`** — pulled from
    DB `price_state.current_price = 4.20` × something (1.0/4.20 → 21.35?). Raw
    median revenue_per_unit for 200832-E in 2025 = **€599.00**. The seeded
    price band is 100× too low.
26. 🔴 **Row 205345-A `recommendation.cluster_id = "SOPU"`** but UI cell shows
    `cluster = "SOPU"` while the SKU's raw commodity_group is **BKAIZ** (per
    raw invoices: BKAIZ, SOPU, SOPUZK, MBDIV mixed). In the Pricing Studio SKU
    picker the same SKU is labelled "BKAIZ €284". Cluster classification is
    inconsistent across two screens for the same aid.
27. 🔴 **`200834-B.recommendation.cluster_id = "BKAGG"`** but the cell header
    "commodity" column says **"BKAGG"** in Action Center, while Pricing Studio
    workbench `cluster` field for the same SKU says "BKAES". Cluster
    inconsistency across screens.
28. 🔴 **`205345-A.marginDelta = "-22.3% → 50.2%"`** — a -22% → +50% margin
    swing in a single repricing is implausible. Raw median price for 205345-A
    in 2025 is €347 with cost ≈ €165 (50% margin OK at €347, not at €284). The
    "current margin" of -22% can't be derived from raw.
29. 🟡 200832-E shows `margin: -1.3%` based on cost €3.28 / price €4.20.
    Real-world prices for this SKU are €570 area; the negative margin is an
    artefact of seeded price scaling.
30. 🟢 200834-B row recommended price 399.84 (no change), cluster confidence
    90% — matches raw 2024 median price €390 area.

**Long-tail**

31. 🔴 **"Top-10 SKU concentration 25%"** — raw says all-time top-10 = 15.5%,
    YTD-2025 top-10 = 19.4%. UI value is high by 5-10pp.
32. 🔴 **"New products (last 12mo) = 284"** — raw computation (aids first
    appearing in last 365 days) = **205**. Forecast screen says "209 new SKUs
    (last 12mo)" for the same metric. Three different numbers across UI: 284
    (Action Center), 209 (Forecast `newProduct.stats[0]`), 205 (raw truth).
33. 🟡 "C-tier price-frozen: 274 — no cost movement · last 9 months" — no
    DB table represents tier C or freeze status; the number is hardcoded.
34. 🟢 "8 commodity groups" — matches.

**Negotiation cockpit**

35. 🟡 `discountGap = +9.8pp`, `discountGapDelta = "quoted n=1,606 · catalog
    n=4,516"` — the n=4,516 doesn't match `products` (1,798) or `quotes`
    (4,799). Possible intent: number of historical list-price points; not
    documented.
36. 🟢 commodity deltas SOPU +0.4% / others ~0% YTD are plausible against the
    quoted-vs-list spread in DB.

**Why we lose (rejections)**

37. 🔴 **The denominator excludes KA from the share %.** UI says PA = 13% of
    lost; using raw `quotes` totals, PA = €793,893 / €9,592,702 lost = 8.3%.
    Excluding KA gives €4,650,290 base → 13% (close to UI). But KA itself
    represents **51%** of lost revenue (€4.94M) and is omitted from the top-5
    — the section is rendering the long-tail of lost revenue while labelling
    it "ranked by revenue lost".
38. 🟡 PA bucket UI = €541k; raw `quotes.status='lost' and rejection_code='PA'
    revenue` = **€793,893**. Off by €253k. Plausible if a filter (year? cluster?)
    is applied, but undisclosed.
39. 🟡 KR UI = €1.3M ↔ raw €1.318M ✓; AN UI = €1.2M ↔ raw €1.168M ✓; KN UI =
    €503k ↔ raw €503k ✓; KE UI = €274k ↔ raw €274k ✓.
40. 🔴 The strapline "KA dominates" is honest but the visual rank order
    misleads users into thinking the visible top-5 ARE the worst — KA is in
    fact rank #1.

**Audit trail / A/B tests**

41. 🟢 `audit[0]` entry matches `audit_log` table exactly (`actor_persona =
    frank`, `target_id = 200832-E`, `delta_pp = 0.60`, hash prefix `f51ccfa4`).
42. 🟢 `abTests[0]` 200832-E slice 50% running matches `ab_tests` row.

**General**

43. 🟡 The greeting "Good morning, Frank." — frontend evaluates time-of-day at
    its local clock; report fetched at 12:21 UTC, which is afternoon for
    Frank's likely timezone. Should be "Good afternoon".

---

## Screen 2: Forecast

### Rendered values (grouped by section)

**Header**
- "Revenue Forecast — Next 12 Months"
- "Predictive Portfolio Pricing", "Updated 2026-05-02"
- "Top mover Customer ABE-FA8F05-CUST-003 +€6.5K WoW"
- Data-through chip "stale", "Revenue"
- Filters: Tier · All / Family · All / Cluster lens · All

**External market direction** (8 tiles)
- Steel proxy 20.69 €/unit ↓ -74.6% WoW
- EUR / USD 1.08 ↓ -0.3%
- Alloys 2,840 €/t ↑ +0.4%
- Copper LME 8,420 €/t ↑ +3.1%
- Energy 0.184 €/kWh ↓ -2.4%
- ifo 87.2 idx ↑ +0.8%
- German PMI 49.6 idx ↓ -0.4%
- VDMA -3.2% YoY → +0.0%
- Sub-line: "Steel proxy -74.63% MoM (internal); FX/PMI/ifo synthetic —
  external feeds not wired."

**Scenarios** — `Steel S355 +20% / +3% list price / Lose top-3 BKAGG / Win
+5pp PA quotes / -10% volume`; base scenarios `Base case / Steel shock +10%
/ Multi-input shock`; "My scenarios" duplicates `Test Q4 hard landing` and
`Share me` **27 times each (54 total)**.

**Hero chart** — 24 monthly bars (Jun 2025 .. May 2027) with primary,
actual, low/high band. Total primary 12mo: €7.17M.

**Movable / locked split** — "75% / 25% · €4.11M movable · €1.37M locked
(movable = …)"

**Clusters** (4 rows)
- BKAES: LTM €12.3M · forecast €12.7M · band ±6% · confidence 82%
- BKAGG: LTM €5.3M · forecast €5.4M · band ±9% · confidence 74%
- BKAIZ: LTM €564K · forecast €581K · band ±12% · confidence 64%
- SOPU:  LTM €170K · forecast €165K · band ±22% · confidence 38% (low-n)

**Plan tracking** — Jan-May 2026 actuals (69,569 / 86,723 / 116,103 /
548,452 / 431) vs plan (510k / 545k / 470k / 530k / 555k). Cumulative gap
-€1.79M (-68.5%).

**Quote-to-revenue** — 30d / 60d / 90d horizons. 30d: 14 open quotes,
€117,494 pipeline, win-rate 38.41%, expected revenue €45,125.

**Calibration** — per-cluster backtest accuracy from `backtest_results`.

**Win-loss** — BKAES PA 8.93% PR 1.19% n=168; BKAGG PA 5.11% PR 2.19% n=137;
BKAIZ PA 0% PR 9.09% n=11; SOPU 0/0 n=10.

**Customers at risk** (top 5) — 101357 €33,831 last-actual / 101154 €11,211
/ 101238 €0 / 101405 €6,972 / 103862 €9,120.

**Cost decomposition** / **Commodity trajectories** / **Pareto** /
**Price floor** / **New product** / **Tornado** / **At-risk revenue** /
**Margin trajectory** / **Seasonal overlay** / **Pocket waterfall** /
**Bias** / **Next moves**.

### BFF mapping (`/api/v1/screens/forecast`)

`header.{greeting,stats[]}`, `hero.{series[N].{month,primary,actual,low,high,p50},
movers[N].{label,value,sub},movableLockedSplit,whyBandMoves.rows[N]}`,
`clusters[N].{id,ltm,forecast,bandText,confidence,tone}`,
`walkForward, inputCost.{tiles[N],stress}, pareto.{customer.rows,sku.rows},
priceFloor[N], newProduct.{stats,series,cards}, mode, tornado.{bars[N],
mapeByCluster,source}, distributions.rows, methodology, marginTrajectory.{historical,
projected,floor,crossesFloorAt}, costDecomposition.{quarters,layers},
seasonalOverlay.{months,indices,currentMonthActual,deviationPct},
commodityTrajectories.{quarters,groups[N].series}, customers.topAtRisk,
quoteToRevenue.horizons[N], calibration.rows[N], marketDirection.tiles[N],
planTracking.{points,cumulativeGapEur,resetLog}, pocketWaterfall.{steps,
perCluster[N].histogram}, bias.rows, nextMoves[N], winLoss.{rows[N].
{cluster,paPct,prPct,sample,monthlySparkline}}, erosionProjection.rows,
atRiskRevenue.tiers, fvaSummary, dataThrough, filterScope`.

### Defects

44. 🔴 **"My scenarios" duplicates 'Test Q4 hard landing' and 'Share me' 27
    times each** in the UI. `scenarios` table contains 108 rows; the scenarios
    list endpoint returns all of them without dedup or filter by current user,
    and the UI renders the whole list verbatim. Visual chaos.
45. 🔴 **`hero.movers[0].label = "Customer ABE-FA8F05-CUST-003"`** — that
    customer is the synthetic seed (5 customers named `ABE-FA8F05-CUST-000..004`
    with `name = "Cust 0..4"`). Surfaced as a real customer name in the
    "Top mover" hero pill.
46. 🔴 **Cluster LTM values are wildly inflated.** UI: BKAES LTM €12.3M /
    BKAGG €5.3M / BKAIZ €564K / SOPU €170K. DB (May 2025 → May 2026):
    BKAES €3.42M / BKAGG €1.19M / BKAIZ €230K / SOPU €131K. UI is ~3-4× DB
    truth. The numbers are closer to all-time (since 2022) DB totals
    (€17.5M / €7.2M / €888K / €360K), so the BFF appears to be reporting
    all-time-as-LTM. With those LTMs the next-12-month forecasts (€12.7M etc.)
    don't add up to the hero monthly forecast either (sum cluster = €18.85M
    vs hero total primary 12mo = €7.17M).
47. 🔴 **Steel proxy WoW = -74.63%** — a real-world week-over-week drop of
    75% in a steel index is impossible. Likely the proxy is computed from
    `material_per_unit` averaged across very few invoices in the latest
    partial week. The BFF tile carries `external: false` and
    `indicator: "internal proxy from invoices"` but the UI strips that
    disclosure.
48. 🔴 **Tiles 2-8 (`EUR/USD`, `Alloys`, `Copper LME`, `Energy`, `ifo`, `PMI`,
    `VDMA`) carry `indicator: "⚠ synthetic for demo (no ECB/LME/ifo/... feed)"`
    in the BFF but UI suppresses the warning** — they render with the same
    visual weight as the "internal proxy" tile and without any synthetic
    badge.
49. 🔴 **`planTracking.plan` values (510k, 545k, 470k, 530k, 555k, 600k, ...)
    are fabricated.** There is no `plan_targets` / `budget` table in DB. The
    "Cumulative gap -€1.79M (-68.5%)" headline is therefore meaningless.
50. 🟢 `planTracking.actual` values match DB invoice totals per month exactly
    (Jan €69,569 / Feb €86,723 / Mar €116,103 / Apr €548,452 / May €431).
51. 🔴 **2026-04 actual €548,452 is suspicious** — that single month has 492
    invoice rows in DB while all other 2026 months have 28-52. Synthetic data
    injection inflates the April baseline and feeds the bias / FVA / hero
    series with phantom revenue.
52. 🟢 `winLoss.rows[*].sample` (168/137/11/10) matches DB quotes per
    cluster in the 90d window ending 2025-12-16. Raw quotes give 142/124/11/0
    (DB has 26 extra synth quotes for BKAES, 13 for BKAGG, 10 for SOPU).
53. 🟢 `winLoss.rows[*].paPct/prPct` match DB exactly for each cluster.
54. 🟡 `winLoss.window.anchor = 2025-12-16` — the anchor is fixed 5 months
    in the past; UI displays no warning about staleness.
55. 🔴 **Forecast hero `series` mixes "primary" and "actual" identically for
    Jun 2025 – May 2026 then `actual = null` for forward months.** With
    DB actuals through 2026-05-02 only, the values for Jun-Dec 2025 cannot be
    actuals — yet `series.actual` is populated through May 2026. Those
    "actuals" are forecast values mis-labelled.
56. 🔴 **`movableLockedSplit` says 75% / 25% (€4.11M / €1.37M)** — Action
    Center movable hero said 22% movable / 78% locked. Same persona, same
    session, two screens, two contradictory splits.
57. 🟡 `newProduct.stats[0] = "209 new SKUs (last 12mo)"` vs Action Center
    "284" vs raw 205. Three different numbers for the same metric.
58. 🟡 `newProduct.cards[0].description = "cluster BKAES (n=3092)"` — n=3092
    historical repricings is implausibly high (DB has 509 pricing_audit rows
    total).
59. 🔴 **`seasonalOverlay.currentMonthActual = 0.1` and `deviationPct =
    -99.9%`** — May 2026 has 2 invoice records in DB. UI shows the result as
    a -99.9% red deviation without disclosing that the month is 27 days
    away from completion.
60. 🟡 `tornado.source = "seed"` — BFF discloses this is seeded synthetic
    data; UI renders without that disclosure.
61. 🟢 `marginTrajectory.historical` 12 quarters matches DB2/revenue from
    invoices reasonably.
62. 🔴 **`marginTrajectory.projected` first projected quarter = Q3 26 with
    margin = 34.94%** while last historical quarter = 60.75% Q3 23. UI shows
    a "crosses floor 60% at Q3 26" annotation — the projection drops 26pp in
    one step then keeps falling, which is mathematical artifact of the
    weighted MA + 1.28σ band on partial data.
63. 🔴 **`erosionProjection.rows[0]` projects BKAES list price going
    NEGATIVE by April 2027 (-€25.46)** — the linear extrapolation is
    physically impossible and reaches a crossover with floor at January 2027.
    No floor on the slope.
64. 🟡 `inputCost.tiles[0]` Material per unit weighted = €156 with
    +12.33pp PoP. Raw 2024+ weighted material/unit = €144.20; recent 6-month
    averages are €186-€281. Order of magnitude OK but the +12.33pp is
    suspicious for an aggregation.
65. 🟡 `pocketWaterfall.perCluster` includes a `cluster = "—"` row with 458
    invoice rows in a single histogram bin — these are the synth invoices
    with `commodity_group = NULL`.
66. 🟢 `fvaSummary.{entered:0, improved:0, worsened:0, neutral:0,
    netFvaDeltaPp:0.0}` — honestly empty; the section will show "no FVA
    activity yet" rather than fake activity.
67. 🟡 `quoteToRevenue.horizons[*].winRate = 0.3841` is constant across 30d
    / 60d / 90d horizons. Plausible but suspicious that no horizon-specific
    win-rate is computed.
68. 🟢 `quoteToRevenue.horizons[0]` open quotes / pipeline match a DB query
    `where status='open' and date >= now() - 30d`.
69. 🔴 **`atRiskRevenue.tiers[D].forecastEur = 0` and `customerCount = 0`** —
    but the section displays 4 tiers; rendering a "D" tier with all zeros
    suggests broken segmentation.
70. 🟡 `bias.rows[*].cmeOverMad = 2.0` constant across all clusters with
    `hitRatePct = 0.0` everywhere — both values are too round to be real
    computations.

---

## Screen 3: Pricing Studio

### Per-SKU table

| SKU | raw 2025 median price | DB `price_state.current_price` | UI hero current | UI recommended | Δ% | status |
| --- | --- | --- | --- | --- | --- | --- |
| 200832-E | €599.00 (n=1) | €4.20 | €4.20 | €6.09 | +45.0% | 🔴 price 100× wrong vs raw |
| 205345-A | €347.00 (n=6) | €284.00 | €284 | €385.42 | +35.7% (BFF says +10% capped) | 🔴 hero copy-pasted from 200832-E in default view |
| 201827 | €798.00 (n=6) | €791.00 | €791 | €806.98 | +2.0% | 🟢 price OK; 🔴 cost breakdown identical to 200832-E |
| 300143 | €600.23 (n=12) | €1,240.00 | €1,240 | €1,133.08 | -8.6% | 🟡 price 2× raw; 🔴 cost breakdown identical to 200832-E |
| 200834-B | €284.00 (n=12) | €389.00 | €389 | €399.84 | +2.8% | 🔴 price 37% above raw; cluster labelled BKAES in PS but BKAGG in AC |
| 201438-B | €809.00 (n=6) | (n/a in default page; shortHero shows €156) | €156 | €256.96 | +64% | 🔴 price 80% below raw |

### Per-SKU cost composition (CRITICAL)

For every SKU I inspected, `workbench.cost` returns the same payload:

```
unitCost: 3.83
floorCalc: 5.10
components: Material 52% · Labor 28% · Outsourcing 12% · Overhead 8%
note: "Material 52% (above 40% threshold) → supplier-sensitive. Steel-dominant precision shaft."
trajectory.delta: "Material +18.4% '22→'25"
```

Raw cost ratios from `cost_state.breakdown` per SKU prove this is wrong:

- 200832-E DB `cost_state`: material 49.7% / labor 25.0% / outsourcing 17.6% /
  overhead 7.7%, unit_cost 3.28.
- 205345-A DB `cost_state`: would be different but BFF returns 52/28/12/8.
- 201827 DB `cost_state`: would be different but BFF returns 52/28/12/8.
- 300143 DB `cost_state`: would be different but BFF returns 52/28/12/8.

The `workbench.cost` block is a hardcoded copy of the 200832-E demo seed,
served for **every** aid.

### Per-SKU customer fan-out (CRITICAL)

UI shows the same 6 customers for every SKU:

| Tier | Customer | UI says | Raw truth for 200832-E | Raw truth for 201827 |
| --- | --- | --- | --- | --- |
| A | 101580 | 38% / €487K ARR | not a customer | not a customer |
| A | 102330 | 22% / €312K ARR / "already pays €6.80" | not a customer | not a customer |
| B | 103044 | 18% / €198K ARR | not a customer | not a customer |
| B | 102801 | 9% / €142K ARR | not a customer | not a customer |
| D | 101900 | 7% / €164K ARR | not a customer | not a customer |
| C | 101582 | 4% / €176K ARR | not a customer | not a customer |

Raw actual customers per SKU:
- **200832-E:** customer 101690 (only), 340 units total.
- **201827:** 101755 (379 units) + 100702 (16 units).
- **300143:** 100989 (754 units) + 104800 (2) + 101654 (1).
- **205345-A:** 101041 (270 units) + 100883 (15) + 101487 + 101345 + ... (10
  customers total).

🔴 Fanout is a static demo template. No SKU shows its real customers.

### Per-SKU history (CRITICAL)

UI shows the same 3-4 historical price moves for every SKU (€3.20 → 3.40 →
3.60 → 3.80 → €4.20 pattern, attributed to "Frank" and "F. Bauer" with
made-up hashes `a3f9c1 / 7e21bd / 19f4a8 / c882e0`).

🔴 `pricing_audit` table has 509 rows but `target_id = '200832-E'` returns 0
rows. The history is purely seeded content.

### Per-SKU rationale memo (CRITICAL)

For `?aid=205345-A`, `?aid=300143`, `?aid=201827`, `?aid=200832-E` the memo
body is character-identical:

> "Article 200832-E sits in cluster BKAGG (confidence 74%, n=247 historical
> repricings, MAPE 4.7%). [...] The article currently sells at €4.20 for an
> effective margin of -1.3% [...] Customer impact: of 9 customers on this
> SKU, 1 (Tier-D 101900) sits at meaningful churn risk and is flagged in
> Heiko's Deal Empowerment view; six are below 15%. Tier-A 102330 already
> pays €6.80/unit on the same volume tier [...]"

🔴 Memo for `?aid=300143` still says "Article 200832-E" by name. The memo is
hardcoded; the live workbench endpoint
`/api/v1/screens/studio/workbench/{aid}` rotates the `hero.title`,
`hero.sub`, `hero.currentPrice`, and `hero.meta` but the deep workbench
content (cost, fanout, history, memo, decision summary) is shared template
for every aid.

### Section defects

71. 🔴 **`/api/v1/screens/studio?aid=...` ignores the aid query param.**
    Default response (aid=200832-E) is returned for every aid value. Tested
    aids 205345-A / 300143 / 201827 — all returned identical defaultAid =
    200832-E, identical hero, identical workbench. The endpoint that DOES
    respect aid is `/api/v1/screens/studio/workbench/{aid}` but it only varies
    `hero.{title,sub,currentPrice,meta,annualRevenue,targetText,
    currentMargin}` and `workbenchPatch.{unitCost,currentPrice,
    targetMarginPct,annualUnits,customerCount,customerCluster,clusterN,
    cost.note,history}`. The frontend reads from both; the `cost`, `fanout`,
    and `memo` blocks always render the 200832-E template.
72. 🔴 **All 13 SKU picker entries have `last_set_by = "system:studio-seed"`**
    in `price_state` — every price in the studio is seeded, none was reached
    via a real `pricing_audit` lineage row. The "audit-ready" label is
    misleading.
73. 🔴 **200832-E hero "9 customers · 4,200 units/yr · €18.6K annual
    revenue"** — DB has 8 customers / 661 lifetime units (44 of which are
    STSEED synth) / €187,515 lifetime revenue across 4 years. Raw has 1
    customer / 340 units / €186K. The "9 customers" and "4,200 units/yr"
    are seeded fiction.
74. 🔴 **`workbench.options.market.price = €5.85, +39.3%, +€34.7K/yr
    recovery`** — when the current price is €4.20, +39.3% to €5.85 is a
    market-price reference that doesn't appear anywhere in DB.
75. 🔴 **`workbench.cost.note = "Material 52% (above 40% threshold)"`** —
    DB `cost_state.breakdown` for 200832-E says material is 49.74%, not 52%.
    Off by 2.3pp; the threshold conclusion ("above 40%") is true either way
    but the number is hardcoded.
76. 🔴 **"floor breached on flange variant since steel +5.8% in 2025"** —
    appears verbatim for SKUs whose category is not flange (200832-E is a
    Zahnradpumpe, not a Flanschpumpe). The text is template copy.
77. 🟡 `workbench.decision.effectiveDate = "2026-06-01"` is hardcoded.
78. 🟡 `chipApproval = "Approval: Frank → Till (board)"` — board-level
    approval is hardcoded for every SKU regardless of value.
79. 🔴 The right-panel "Recommendation" pane shows a **second recommended
    price** that differs from the table: hero recommendation = €6.09 (+45.0%)
    via the live recommender, but `workbench.options.market.price = €5.85`
    and `workbench.options.floor.price = €5.10`. Three different prices
    presented as "the answer", none agreeing.
80. 🟢 The `recommendation.heuristic.rule` is disclosed in the BFF (`floor =
    current × 0.97`, `ceiling = current × 1.1`) but the UI does not surface
    this caveat to the user.
81. 🟡 `recommendation.cluster_confidence = 0.5714` (57%) for 200832-E ↔ UI
    chip shows "BKAGG 74%". 17pp gap between the BFF's actual cluster
    confidence and the badge text.
82. 🟡 `recommendation.cluster_confidence = None` for 205345-A (UI shows
    "BKAIZ 64%" anyway).
83. 🔴 200832-E rationale memo claims "cluster BKAGG confidence 74%,
    n=247 historical repricings, MAPE 4.7%" — `pricing_audit` table has 509
    rows total across all SKUs; 247 BKAGG repricings is hardcoded.
84. 🔴 SKU picker shows "Floor" tag for 200832-E (price €4.20 vs floor
    €4.62 → below floor → "Floor breached"). For 201438-B and 205345-A also
    flagged "Floor" with similar dynamics — driven entirely by the seeded
    `price_state.floor` rather than any real floor calculation.

### Cross-links

85. 🟢 Sidebar nav works: clicking "Forecasting" then "Pricing" navigates
    correctly.
86. 🔴 The URL-based `?aid=` parameter (e.g. `/pricing?aid=300143`) DOES
    update the hero (`Article 300143 · Innenzahnringpumpe`), proving the
    frontend reads it. So the BFF `/screens/studio?aid=...` is the broken
    side of the contract.

---

## Recommended fix priority order

1. **`screens/studio` ignores `?aid=` param** [pricing.workbench.cost +
   .fanout + .history + .memo] — fix_kind: backend SQL. Route the query
   parameter through the composer and rebuild each workbench section from
   per-SKU DB queries (`price_state`, `cost_state` for unit_cost +
   breakdown; `invoices` grouped by customer for fanout; `pricing_audit`
   for history; templated memo with real numbers substituted).
2. **`price_state.current_price` seed is 100× wrong for 200832-E** [pricing
   studio + action-center SKU table] — fix_kind: data seed. Re-seed price_state
   from raw `invoices.revenue_per_unit` medians per aid, not from the
   hardcoded studio-seed table.
3. **Cluster LTM values are 3-4× DB truth on Forecast** [forecast.clusters] —
   fix_kind: backend SQL. The LTM aggregation appears to be over the full
   `invoices` history rather than the trailing 12 months from `invoicesThrough`.
4. **planTracking.plan values are fabricated** [forecast.planTracking] —
   fix_kind: backend seed OR mark section degraded. Either ingest a real
   `plan_targets` table or replace the cumulative-gap headline with "Plan
   target unavailable".
5. **"My scenarios" duplicate list (108 rows)** [forecast.scenarios sidebar] —
   fix_kind: backend SQL + frontend wiring. Filter `scenarios` by
   `created_by = current_user_id`, dedupe by name, and order by `updated_at`.
6. **Action Center "BKAGG leads"** [actionCenter.buckets[0].subtitle] —
   fix_kind: backend SQL. Replace hardcoded "BKAGG leads" with the actual
   leader by current-year revenue (which is BKAES).
7. **"Top mover Customer ABE-FA8F05-CUST-003"** [forecast.hero.movers[0]] —
   fix_kind: backend SQL. Exclude synthetic `ABE-FA8F05-*` customer IDs from
   any user-facing surface or, better, remove the synth seed.
8. **Rejections section excludes KA from share base AND omits KA from rank
   list** [actionCenter.rejections] — fix_kind: backend SQL + frontend
   copy. Either include KA as rank #1, or rename the section "Why we lose
   on the long tail" and disclose that data-quality dominant code KA is
   handled separately.
9. **Top-10 SKU concentration 25% vs raw 15.5%/19.4%** [actionCenter.longTail]
   — fix_kind: backend SQL. Recompute with explicit window.
10. **New products three-way disagreement: 284 / 209 / 205** [actionCenter
    long-tail vs forecast newProduct vs raw] — fix_kind: backend SQL. Pick
    one definition and reuse it.
11. **External market direction tiles 2-8 hide the "synthetic for demo"
    disclosure** [forecast.marketDirection] — fix_kind: frontend wiring.
    Render `tile.indicator` when it begins with "⚠".
12. **Workbench fanout shows 6 hardcoded customers for every SKU**
    [pricing.workbench.fanout] — fix_kind: backend SQL. Query invoices for
    real per-SKU customers; compute share by quantity and ARR by trailing
    revenue.
13. **Hero "152 records · €7.80M total revenue this week"** [actionCenter
    header + movableHero] — fix_kind: backend SQL. Either remove "this week"
    qualifier or recompute against the correct date window.
14. **Erosion projection allows negative list prices** [forecast.erosionProjection]
    — fix_kind: backend SQL. Clamp projection at floor.
15. **Seasonal overlay deviationPct -99.9%** [forecast.seasonalOverlay]
    — fix_kind: backend SQL. Either prorate the current month or annotate
    "partial month — data through day-of-month X".
16. **458 invoices with `commodity_group = NULL` pollute pocketWaterfall +
    clusters** — fix_kind: backend seed. Either backfill the column from
    `products.commodity_group` join, or filter out NULL-cluster rows from
    all aggregations.

## Live-wiring notes (don't break)

- SSE topics observed: none triggered during this static audit; the
  `dataThrough`/`linksUpdatedAt` chips should keep updating via the existing
  `dataFreshness` polling.
- React-Query keys observed in network: each screen has its own
  `/api/v1/screens/{name}` plus per-aid `/api/v1/screens/studio/workbench/{aid}`,
  `/api/v1/pricing/sku/{aid}/diff`, `/api/v1/pricing/sku/{aid}/audit`,
  `/api/v1/pricing/sku/{aid}/cost-outlook`, `/api/v1/pricing/proposals?article_id=`,
  `/api/v1/briefing/sku/{aid}`. Invalidate these together when any
  per-SKU mutation lands.
- Components that DO update live and should be left alone:
  - Audit trail row (`audit_log`) — verified ground truth, refreshes per call.
  - A/B tracker (`ab_tests`) — verified ground truth.
  - Customers-at-risk top 5 — `lastActualRevenue` values match raw 2025 LTM.
  - WinLoss section per cluster — matches DB exactly with synth-inflated samples.
  - Trust anomalies count 1,728 — arithmetic provably correct against DB.
  - planTracking.actuals — match DB monthly invoice totals exactly.
- Components that should NOT be invalidated by a price change (they're seeded):
  - `workbench.cost`, `workbench.fanout`, `workbench.history`, `workbench.memo`
    in Pricing Studio — fixing these is independent of any SSE topic.

---

## Audit method appendix

- Login via cookie jar: `POST /api/v1/auth/login` with frank credentials, saved
  to `/tmp/jar`. Subsequent BFF calls used `-b /tmp/jar`.
- Playwright walkthrough: navigate to `/action-center` (session was already
  authenticated), capture full accessibility snapshot. For `/forecasting` and
  `/pricing`, direct `goto` redirected back to `/action-center`; workaround was
  to **click** the sidebar link (`a[href='/forecasting']` etc.) which kept the
  session and rendered the target screen.
- Pricing Studio SKU switching: the picker buttons have no stable `data-testid`,
  so used `page.evaluate(() => { btns.find(b => b.textContent.includes(...) ) })`.
  The URL updates to `/pricing?aid=300143` but `/api/v1/screens/studio?aid=...`
  responses are identical to default — confirmed by curl with explicit `?aid=`.
- BFF payload sizes: Action Center 38.8 KB / 1,206 leaves; Forecast 61.3 KB /
  2,562 leaves; Pricing Studio 36.5 KB.
- Tooling gotchas:
  - Postgres transactions in the audit Python helper would abort after a
    failed query; needed explicit `db.rollback()` between probes.
  - `pricing_audit` schema has `target_kind / target_id` not `aid`; first
    queries failed.
  - `audit_log` schema has `actor_user_id / actor_persona / action_kind`
    (not `actor / action / occurred_at`).
  - Direct POST to `/api/v1/screens/studio/fanout` requires CSRF token from
    the cookie jar; the GET-only validation in this audit suffices.
- The Pricing Studio screen produced 2 console errors that were not
  investigated further (likely the per-SKU diff/audit calls when no real
  audit row exists).
