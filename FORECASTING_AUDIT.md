# FORECASTING PAGE — FULL AUDIT (2026-05-14)

**Scope:** every section, every chart, every button, every list, every table on `/forecasting` (Frank persona).
**Method:** Playwright snapshot + backend code inspection + DB sampling.
**Truth source:** if a block reads `load_seed()[...]` it is **fake**. If it queries `invoices` / `margin_forecasts` / `backtest_results` / `quotes` / etc. it is **real**.

Legend: ✅ live & correct · ⚠ partly live · ❌ pure seed/mock · 🪲 functional bug · 🔇 dead click handler · 📝 label problem

---

## 1. PAGE HEADER

| Element | Status | Issue |
|---|---|---|
| Breadcrumb "Cockpit / Pricing Analyst · Frank / Forecast" | ✅ | static text, OK |
| Title "Revenue Forecast — Next 12 Months" | ❌ | hard-coded title — should switch when mode toggle changes (Revenue → "Revenue Forecast", Margin → "Margin Forecast", Volume → "Volume Forecast"). Also "Next 12 Months" doesn't update when horizon changes to 3 or 6mo. |
| "Predictive Portfolio Pricing" chip | ❌ | hardcoded |
| "Updated Mon 06:14" | ❌ | hardcoded; should be `MAX(invoices.date)` or `forecast_date` |
| "Band +€8K WoW" | ❌ | hardcoded; should be week-over-week Δ vs the previous forecast snapshot |
| "Revenue" chip | ❌ | hardcoded; should reflect active mode |
| **Filters: Tier · All ▾** | 🔇 | dropdown opens but selecting a tier has no effect on the page (filter param accepted but Pareto/PriceFloor seed ignores it) |
| **Filters: Family · All ▾** | 🔇 | same — filter param exists but seed data is static |
| **Filters: Cluster lens · All ▾** | 🔇 | same — should narrow the per-cluster sections to one cluster |
| **"Generate forecast briefing →" button** | ⚠ | opens modal, modal accepts input, returns receipt with `Open PDF →` link, but the PDF endpoint returns a placeholder HTML, not a true PDF |

## 2. EXTERNAL MARKET DIRECTION (8 tiles)

| Element | Status | Issue |
|---|---|---|
| "WoW: Mixed: copper +3.1%, energy −2.4%; steel still up." caption | ❌ | hardcoded |
| Steel HRC (Eurofer) 1180 €/t ↑ +1.2% | ❌ | seed |
| EUR / USD 1.08 FX ↓ -0.3% | ❌ | seed |
| Alloys (Cr-Mo, Ni) 2840 €/t | ❌ | seed |
| Copper LME 8420 €/t | ❌ | seed |
| Energy (DE industrial) 0.184 €/kWh | ❌ | seed |
| ifo Business Climate 87.2 idx | ❌ | seed |
| German PMI 49.6 idx | ❌ | seed |
| VDMA orders (3mo MA) -3.2% YoY | ❌ | seed |
| Each tile is a button → drawer with synthetic 12-month series | ⚠ | drawer opens but its series is random per render |

**Backend:** `market_direction.py` → 100% seed. **Real fix:** integrate Eurofer/LME/ECB feeds OR mark this as "External · synthetic for demo" honestly.

## 3. SCENARIO LIBRARY

| Element | Status | Issue |
|---|---|---|
| "Base case" / "Steel shock +10%" / "Multi-input shock" chips | ✅ | wired to backend `/scenarios`, applies perturbation on click |
| "+ New scenario" button | ✅ | opens builder modal, save works |
| Shift-click to compare | ✅ | works |
| Compare view | ✅ | works |
| Active scenario banner | ✅ | renders Δ on Revenue when scenario is active |

## 4. MODE TOGGLE (Revenue / Margin / Volume + horizon)

| Element | Status | Issue |
|---|---|---|
| Mode tabs Revenue / Margin / Volume | ⚠ | switching works, but it doesn't propagate to **Hero forecast** (Hero has its OWN duplicate internal tabs) or the **header title** |
| Horizon select 3 / 6 / 12 mo | ⚠ | switching changes Tornado + Distributions ✅ but does NOT change Margin trajectory / Cost decomposition / Hero — those are quarter-locked regardless |
| Help text "Toggle re-runs the tornado..." | 📝 | misleading — claims it re-runs hero too, but hero is seed-locked |

## 5. AGGREGATE/CUSTOMERS TABS

| Element | Status | Issue |
|---|---|---|
| "Aggregate & clusters" tab | ✅ | works |
| "Per customer" tab | ⚠ | works, but only 5 hard-coded "curated" customer IDs (`_SEED_TOP_AT_RISK`); should be top-N from `customer_risk_scores` |

## 6. TORNADO (input sensitivity)

| Element | Status | Issue |
|---|---|---|
| Header "n=1,000 simulations · shock mode bootstrap" | ❌ | the n=1000 is hard-coded; we don't actually run 1k simulations per request |
| MAPE chip "P80 hit 81% · n=1000" | ❌ | hard-coded — has no relationship to actual model performance |
| 8 input bars (Steel S355, List-price uplift, Pass-through, Demand, EUR/USD, Alloys, Energy, Copper) | ❌ | the bar values are pre-computed in `monte_carlo_results` table but we never query that table — the FE shows the seed numbers |
| "±1σ historical" claim | 📝 | bogus — no σ was computed |
| Bar click → DistributionDrawer | ⚠ | drawer renders but uses synthesized histogram, not real simulation results |
| "Notify me" button | ✅ | modal opens, POST works |

## 7. PER-ENTITY DISTRIBUTIONS (4 cards)

| Element | Status | Issue |
|---|---|---|
| BKAES · Frame & shafts — €5.15M median | ❌ | seed values; product label "Frame & shafts" not in DB |
| BKAGG · Bearings — €4.59M | ❌ | seed |
| BKAIZ · Couplings — €4.01M | ❌ | seed; LTM revenue actually €248K not €4M |
| SOPU · Specials (low-n) — €3.32M | ❌ | "SOPU" cluster does NOT exist in the DB (real cluster is MBDIV) — visible mismatch with the per-cluster forecast lens below which shows MBDIV |
| MAPE 6.9% chip (all 4) | ❌ | identical hard-coded value across all cards — should be per-cluster MAPE from `backtest_results` |
| Click card → DistributionDrawer | ⚠ | renders synthetic histogram |
| P5/P50/P95 numbers | ❌ | invented |

## 8. PIPELINE · QUOTE-TO-REVENUE BRIDGE

| Element | Status | Issue |
|---|---|---|
| WAPE 21.0% chip | ❌ | hard-coded; we have backtest_results.mape but no WAPE per pipeline |
| 38 open quotes / €699K pipeline | ❌ | quotes table has real data, but `quote_to_revenue.py` returns seed |
| Win rate 62.4% / Avg margin 18.7% | ❌ | seed; should compute from quotes where status='won' |
| Expected GP €82K / Expected revenue €436K | ❌ | seed |
| Closing horizon 30d / 60d / 90d tabs | 🔇 | tabs visible but switch nothing — all 3 horizons return identical numbers |

## 9. MARGIN TRAJECTORY (12 quarters + 4q projection)

| Element | Status | Issue |
|---|---|---|
| Chart Q2 23 → Q1 27 | ❌ | seed quarters & values — does not match invoices DB which goes Q1 22 → Q4 25 |
| Floor line at 60% with red "Crosses Q3 26" tag | ❌ | crossover quarter is hard-coded |
| MAPE 6.9% chip | ❌ | repeated everywhere; not real |
| "Notify me" button | ✅ | works |
| Methodology note "4-quarter weighted MA (0.4/0.3/0.2/0.1)" | 📝 | accurate description but applied to fake data |

## 10. COST DECOMPOSITION (material / direct / full mfg)

| Element | Status | Issue |
|---|---|---|
| 3 lines × 12 quarters | ❌ | seed values; `product_cost_trends` table has real cost data per article — never queried |
| Insights "Material costs declining 3pp" / "Direct labor rising 4pp" / "Full cost rising 5pp" | ❌ | text is hard-coded — not derived from the displayed series |
| MAPE 4.0% chip | ❌ | invented |

## 11. SEASONAL PATTERN (12 months, current-month deviation)

| Element | Status | Issue |
|---|---|---|
| 12-month index chart | ⚠ | `seasonal_patterns` table exists with real `seasonal_index` rows — but `seasonal_overlay.py` returns the **seed** values, not the table |
| "May actual 105.3 · +3.1% vs expected" | ❌ | hardcoded — should compare current-month invoice revenue to seasonal index |
| MAPE 5.0% chip | ❌ | hardcoded |

## 12. COMMODITY-GROUP MARGIN TRAJECTORIES

| Element | Status | Issue |
|---|---|---|
| 4 lines BKAES / BKAGG / BKAIZ / **SOPU** | ❌ | seed; "SOPU" is invented (DB has MBDIV) — directly contradicts the per-cluster forecast lens that shows MBDIV |
| YoY trend chips ↓ -2.2pp / -2.7pp / -2.9pp / -4.3pp | ❌ | invented numbers |
| 12 quarters (Q2 23 → Q1 26) | ❌ | seed; `commodity_benchmarks` table has the real per-quarter data per `commodity_group` — never queried |
| MAPE 6.9% chip | ❌ | invented |

## 13. PER-CLUSTER BACKTEST ACCURACY ✅

| Element | Status | Issue |
|---|---|---|
| Heading "Per-cluster backtest accuracy" | 📝 | user complains they don't understand the title — rename to "How accurate is each cluster's forecast?" |
| 3 cards BKAES (1.48% MAPE / 45% directional / tight), BKAGG (3.53% / 18% / ok), BKAIZ (6.56% / 0% / noisy) | ✅ | real DB values from `backtest_results` |
| Missing 4th card | 📝 | no backtest row exists for MBDIV; should display "MBDIV — not enough data" |
| "Notify me" button | ✅ | works |

## 14. HERO FORECAST CHART 🪲

| Element | Status | Issue |
|---|---|---|
| **Y-axis €3.7M–€8.0M when "Margin %" tab is active inside the chart** | 🪲 BUG | CRITICAL — the chart's internal Revenue/Margin/Volume tabs (e848-851) don't actually swap the data series; only the labels |
| Internal tabs duplicate the page-level mode toggle | 🪲 | confusing — kill one or the other |
| P50+P80 / P50+P80+P95 toggle | ✅ | works visually |
| "Walk-forward · solid line = primary · shaded = envelope" | 📝 | accurate description |
| Y-axis: €3.7M / €5.7M / €7.7M / €8.0M | ❌ | seed series — no real walk-forward output |
| Prediction interval calibration panel "4/4 in-window actuals landed inside P80 (100%)" | ❌ | n=4 is fake; real backtest_results have n=10–12 |
| **"What changed since last week — top 3 movers"** | ❌ | hard-coded: "Band +€8K WoW driven by 102330", "Steel PPI +1.2pp WoW", "101900 conf High→Medium" |
| **"Movable / Locked 62% / 38% · €3.88M movable · €2.37M locked"** | ❌ | hardcoded |
| **"Why the band moves — seasonality annotations"** (Aug +22%, Dec −31%, Mar +18%) | ❌ | hardcoded |

## 15. PER-CLUSTER FORECAST LENS ✅⚠

| Element | Status | Issue |
|---|---|---|
| BKAES LTM €4.4M / 67.3% margin / ±5% / 99% confidence | ✅ | real from margin_forecasts + invoices LTM |
| BKAGG LTM €1.5M / 52.1% / ±11% / 96% | ✅ | real |
| BKAIZ LTM €248K / 59.0% / ±18% / 93% | ✅ | real |
| MBDIV LTM €59K / 62.8% / ±44% / — | ✅ | real (no backtest data, so confidence = —) |
| MAPE 6.9% chip on each card | ❌ | identical placeholder — should reflect per-cluster real MAPE |
| Click card to "filter the main chart" | 🔇 | description claims filtering but the click does nothing |

## 16. WALK-FORWARD BACKTEST + METHODOLOGY COMPARISON ✅

| Element | Status | Issue |
|---|---|---|
| 4 bars: Overall / BKAES / BKAGG / BKAIZ | ✅ | real `backtest_results` |
| KPI tiles (Best model: Ema / Overall MAPE 2.1% / Best BKAES 1.5% / Hardest BKAIZ 6.6%) | ✅ | real |
| Methodology table (Ema/Linear/Seasonal) with winner stars | ✅ | real |
| "Recommended · Ema" chip + note | ✅ | works |
| "Target <5.0%" tag | 📝 | hardcoded threshold — fine for a constant |

## 17. INPUT COST TRAJECTORY (4 commodity tiles)

| Element | Status | Issue |
|---|---|---|
| Steel S355 €1,180/t ↑ +6.8% | ❌ | hardcoded |
| Alloys (Cr-Mo, Ni) €2,840/t → +0.4% | ❌ | hardcoded |
| Copper €8,420/t ↑ +3.1% | ❌ | hardcoded |
| Energy €0.184/kWh ↓ -2.4% | ❌ | hardcoded |
| Sub-text "62% pass-through · WoW +1.6pp accelerating" | ❌ | invented |
| Tile click → drawer | 🔇 | no drawer wired; tile shows `cursor=pointer` but click is a no-op |

## 18. STRESS TEST (worst-case steel +10%)

| Element | Status | Issue |
|---|---|---|
| "Compresses margin by €42K across 47 SKUs" | ❌ | hardcoded |
| "€18–28K compression next quarter" | ❌ | hardcoded |
| "38% of revenue is fixed-price" | ❌ | hardcoded |

## 19. PARETO LAYER (top 10 customers + SKUs)

| Element | Status | Issue |
|---|---|---|
| Tabs "By customer · top 10" / "By SKU · top 10" | ⚠ | tabs render but BOTH show the same hardcoded customer rows |
| Tier filter chips A / B / C / D | 🔇 | clicking does NOT filter the table |
| Row 1: 101580 BKAES 82% €487K | ❌ | customer 101580 doesn't exist in DB; real top customer is 103466 / 101858 / 100883 |
| Row 2: 102330 BKAES | ❌ | fake customer ID |
| Row 3: 103044 BKAGG | ❌ | fake |
| Row 4: 101582 BKAES | ❌ | fake |
| Row 5: 101900 SOPU 38% below band | ⚠ | 101900 IS real (€138K LTM in BKAES, not SOPU) — cluster mislabelled |
| Row 6: 102801 BKAGG | ❌ | fake |
| Row 7: 104210 BKAES | ❌ | fake |
| "Top 7 of 10 · show all 10" link | 🔇 | link `#` — dead |
| Renewal column ("Q2 2026 · churn flag", "Annual · Q4") | ❌ | hardcoded |
| Confidence column | ❌ | hardcoded; should derive from `customer_risk_scores` |
| Row click → drill drawer | ⚠ | drawer opens but with the same seed customer detail |

## 20. PRICE FLOOR (per customer × SKU)

| Element | Status | Issue |
|---|---|---|
| Top 10 ▾ / All customers ▾ / Export buttons | 🔇 | all three are dead clicks |
| Customer IDs 101580 / 102330 / 103044 / 101582 / 101900 / 102801 / 104210 | ❌ | same fake-customer set as Pareto |
| Article IDs 200832-E / 201104-G / 205415-B / 205418-A / 211094-C / 218750-D / 205169 | ❌ | fake article numbers (real ones in DB are 5-digit) |
| Current price / Floor / Headroom values | ❌ | seed |
| "Open in Studio →" buttons | 🔇 | dead — no routing |
| "+ Queue" buttons | 🔇 | dead |
| "Quote #12848 · review now" links | 🔇 | href="#" — dead |
| "Renewal note →" button | 🔇 | dead |
| Footnote "2 quotes below floor this week · €1.50/unit at risk on 1,680 units" | ❌ | hardcoded |

## 21. NEW PRODUCT FORECAST (comparable cluster)

| Element | Status | Issue |
|---|---|---|
| "203 new SKUs (last 12mo)" | ❌ | hardcoded; `products.created_at` could give a real number |
| "€1.5M revenue" / "8.3% of total" | ❌ | hardcoded |
| Chart Jun–Apr | ❌ | empty/seed |
| Item 1: 218812-K · Sleeve variant · BKAES 76% similarity | ❌ | fake SKU |
| Item 2: 220114-A · Bearing housing · BKAGG 68% | ❌ | fake |
| Item 3: 221305 · Custom pump · SOPU 38% (low-n) | ❌ | fake (SOPU again) |
| "Assigned cluster" dropdowns | 🔇 | look interactive but selecting another option does nothing — no POST |
| "View cluster average" / "Assign to cluster →" / "Manual review →" buttons | 🔇 | all dead |
| MAPE 6.9% chip | ❌ | placeholder |

## 22. ASSUMPTIONS FOOTER (sidebar)

| Element | Status | Issue |
|---|---|---|
| Data through 2026-04-30 | ❌ | hardcoded; real `MAX(invoices.date)` = 2025-12-17 |
| Growth-rate prior +3.4% YoY | ❌ | hardcoded |
| Pass-through 62%/28%/15% | ❌ | hardcoded |
| Seasonality "3-year monthly indices" | 📝 | description correct but the data isn't actually loaded from the table |
| Cost-trend method "4-quarter WMA" | 📝 | description correct, data isn't |
| Win rate 62.4% trailing 90d | ❌ | hardcoded |

## 23. METHODOLOGY DRAWER

| Element | Status | Issue |
|---|---|---|
| "Last reviewed 14/05/2026, 01:11:41" | ✅ | uses current time |
| Drawer content (assumptions / sources / models lists) | ❌ | static text |

## 24. CROSS-LINK STRIP (bottom)

| Element | Status | Issue |
|---|---|---|
| "Action queue → Action Center" | ✅ | navigates |
| "Negotiation cockpit → Action Center" | ✅ | navigates |
| "SKU drill → Pricing Studio" | ✅ | navigates |

## 25. RIGHT RAIL (notifications + sections)

| Element | Status | Issue |
|---|---|---|
| "New SKU recommendation Article 205418-A entered A/B" | ❌ | hardcoded — refers to the fake SKU |
| "Phase deadline soon" | ❌ | hardcoded |
| "PRO mode activated" | ❌ | hardcoded — irrelevant noise |
| Notification click | 🔇 | dead |
| Reviewers (HM, TH, FK, NB, +6) | ❌ | hardcoded initials |
| "Add reviewer" + | 🔇 | dead |
| Sections: Movable revenue / Today's decisions / Model trust / Lost-quote / SKU pricing engine | ⚠ | links go to other pages but the numbers in each are seed |
| "Abschnitt hinzufügen" button | 🔇 | dead |

---

## SUMMARY

| Bucket | Count |
|---|---|
| ✅ Fully live & correct | 6 sections |
| ⚠ Partly live | 5 sections |
| ❌ Pure seed/mock | **14 sections** |
| 🪲 Functional bug | 2 (mode toggle dedup, hero internal tabs swap labels not data) |
| 🔇 Dead click handlers | **18 distinct interactive elements** |
| 📝 Label / wording problems | 7 |

## FIX PRIORITY (for parallel agents)

**P0 — Critical (Frank cannot ship without)**
1. Pareto layer → real customers from invoices (top 10 by LTM)
2. Price floor → real customers + real `pricing_proposals` data
3. Hero forecast chart fix — Y-axis must match selected mode (Margin → %, Revenue → €, Volume → units)
4. Dropdown filters Tier / Family / Cluster lens — wire to backend
5. Replace SOPU with MBDIV everywhere (consistency)

**P1 — Important**
6. Quote-to-Revenue → query `quotes` table for real win-rate / open-pipeline
7. Margin trajectory → real `invoices` quarterly aggregation
8. Cost decomposition → `product_cost_trends`
9. Seasonal pattern → `seasonal_patterns` table
10. Commodity trajectories → `commodity_benchmarks`
11. Input cost trajectory → wire or label honestly as external
12. Per-customer risk → `customer_risk_scores`

**P2 — Polish / label hygiene**
13. Rename "Per-cluster backtest accuracy" → "Forecast accuracy by cluster"
14. Kill duplicate mode tabs inside Hero chart
15. Wire all dead buttons (Open in Studio, + Queue, View cluster average, etc.) or remove them
16. Right-rail notifications — remove fake ones
17. Per-entity MAPE chips — use real per-cluster MAPE
18. Update header timestamp / page title to reflect mode + horizon

---

## EXECUTION PLAN

I'm dispatching FOUR PARALLEL AGENTS:

1. **Agent A — backend-data-1**: wire `pareto`, `priceFloor`, `customers`, `newProduct`, `quoteToRevenue`
2. **Agent B — backend-data-2**: wire `marginTrajectory`, `costDecomposition`, `seasonalOverlay`, `commodityTrajectories`, `marketDirection`, `inputCost`, `methodology`
3. **Agent C — frontend-bugs**: fix hero chart mode swap, dedupe mode toggles, wire Tier/Family/Cluster filters, wire dead buttons, rename calibration panel, fix label/title to be mode-aware, kill fake right-rail items
4. **Agent D — playwright-verifier**: keep walking the page top-to-bottom, log a green/red checklist per item until 100% green

When all agents return I'll commit + push and you can verify.
