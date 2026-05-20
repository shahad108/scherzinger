# Pricing Optimisation Engine — Design Spec

**Status:** approved 2026-05-19 · **Owner:** Pryzm Research
**Artefacts:** `notebooks/pricing_engine_v1/` (engine), `docs/whitepaper/pryzm_pricing_methodology.tex` (investor-facing methodology), this file (internal design spec).

---

## 1. Goal

Prove a real, defensible price-recommendation engine on a notebook *before* a single line of backend wiring. Backtest on 2025; run forward on 2026. If the math passes the acceptance gates, promote the validated module into `backend/services/pricing/pricing_engine.py` and the Studio UI.

The current production engine in `scherzinger-platform/backend/services/pricing/recommendation.py` scores only `(price − cost) × win_prob`. It does not use `customer_fanout`, churn, expected loss, forecast volume, or LTV. The simulator hardcodes `db2_delta = revenue_delta * 0.45`. The memo claims "recovery exceeds loss" even when the numbers show the opposite. Wiring more onto that foundation is wasted work.

## 2. Why a notebook first

A notebook gives us full traceability on real Scherzinger data:
1. We can read every parquet, fit every model, evaluate every assumption.
2. We can backtest cleanly against 2025 actuals before touching production.
3. Promotion is a deliberate gate, not a default.

If the engine doesn't clear the gates in §8, we ship a diagnostic report explaining *which input is broken or missing* and wiring is paused.

## 3. Research underpinning (web search)

| Theme | Source |
|---|---|
| B2B price optimisation: maximise expected contribution LTV = Σ retain-weighted margin − churn-weighted loss; treat LTV as a distribution, not a point | [Omnibound B2B Pricing 2026 Guide](https://www.omnibound.ai/blog/b2b-pricing); [Influencers Time — Dynamic Pricing 2025](https://www.influencers-time.com/dynamic-pricing-in-2025-balancing-revenue-and-trust/); [Influencers Time — AI Dynamic Pricing for LTV 2025](https://www.influencers-time.com/ai-dynamic-pricing-for-long-term-ltv-optimization-in-2025/) |
| Monte Carlo for propagating input uncertainty into score → CI on price | [Monetizely — MC for Pricing Risk](https://www.getmonetizely.com/articles/how-to-use-monte-carlo-simulation-for-saas-pricing-risk-assessment); [FasterCapital — MC Pricing Strategies](https://fastercapital.com/content/Monte-Carlo-simulation-and-optimization--Pricing-Strategies-for-New-Ventures--Insights-from-Monte-Carlo-Models.html) |
| Constrained optimisation: maximise margin s.t. churn cap per cohort; scipy.optimize / CVXPY / Pyomo | [DataCamp Pyomo Tutorial](https://www.datacamp.com/tutorial/pyomo); [CVXPY Refinery Example](https://mobook.github.io/MO-book/notebooks/05/05-refinery-production.html) |
| Thompson sampling / contextual bandits for the post-AB exploration phase (+55% case study) | [Wikipedia — Thompson Sampling](https://en.wikipedia.org/wiki/Thompson_sampling); [Agrawal — TS Contextual Bandits](https://arxiv.org/pdf/1209.3352); [MDPI — Improved TS for Dynamic Pricing](https://www.mdpi.com/2227-7390/12/8/1123) |
| Forecast-as-input | `notebooks/forecasting_v3/` Chronos / TTM / AutoETS bake-off |

## 4. Data inventory (verified)

| File | Rows | Span | Use |
|---|---|---|---|
| `Data/cleaned/invoices_clean.parquet` | 5{,}565 | 2022-2025 | revenue, volume, customer-SKU history, cost |
| `Data/cleaned/quotes_clean.parquet` | 4{,}539 (37.1% win-rate) | 2022-2025 | win-prob fitting |
| `Data/cleaned/products.parquet` | 1{,}798 | — | SKU metadata, commodity group |
| `Data/cleaned/customers.parquet` | 1{,}438 | — | segment, region |
| `notebooks/output/churn_predictions.csv` | per-customer | — | `p_churn_{1q,2q,4q}` baselines |
| `notebooks/output/sku_forecasts.parquet` | per-SKU monthly | 2025+ | revenue / volume forecast inputs |
| `notebooks/forecasting_v3/output/forecast_v3_*` | aggregate monthly | 2026 | sanity reference for portfolio totals |

No external data needed for v1.

## 5. Engine math

Per-customer expected value:
```
EV(p, c, sku) =  P_win(p | sku, segment)
              ×  P_retain(p | c)
              ×  E[V_12 | p, sku, c]
              ×  (p − k_12(sku))
              −  P_churn(p | c) × LTV_loss(c, sku)
```

Cluster aggregate:
```
S(p) = Σ_{c ∈ eligible} EV(p, c, sku)
```

Constrained optimum:
```
p* = argmax S(p)  s.t.
     p ≥ cost_floor(sku) + τ_k         (cost-floor + safety margin)
     p ≤ market_ceiling(sku)           (competitor band when available)
     |p − p_cur| / p_cur ≤ Δ_max       (contract cap, default 10–15%)
     mean_c[ P_churn(p|c) − P_churn(p_cur|c) ] ≤ κ   (churn cap, +2pp)
```

Outputs per SKU: `p*`, `S(p*)`, breakeven price, full score curve, driver attribution, 90% MC confidence band.

## 6. Module layout

```
notebooks/pricing_engine_v1/
├── pricing_engine.ipynb                ← narrative notebook (this is the deliverable)
├── run_backtest.py                     ← script wrapper for the 2025 walk-forward
├── run_2026.py                         ← script wrapper for the 2026 forward run
├── lib/
│   ├── __init__.py
│   ├── data_loader.py                  ← parquet → tidy DataFrames; as-of cutoff
│   ├── win_prob.py                     ← logistic per SKU, bootstrap CI, ≥12-deal rule
│   ├── churn_response.py               ← α(c) + (1-α)·η(Δp) two-stage decomposition
│   ├── cost_demand.py                  ← trailing 12mo cost + forecast-driven volume + elasticity
│   ├── ltv.py                          ← 24mo discounted contribution (default r=8%)
│   ├── scorer.py                       ← EV(p) + optimise() + driver attribution
│   ├── monte_carlo.py                  ← 5,000 draws over win-prob/cost/volume/churn
│   └── backtest.py                     ← walk-forward harness + gate aggregation
└── output/
    ├── backtest_2025_rows.parquet
    ├── backtest_2025_gates.json
    └── recommendations_2026.{parquet,csv}
```

## 7. Notebook structure (14 sections)

1. Setup + data load
2. EDA (win-rate by cluster, price spread, churn distribution, cost trajectory)
3. Fit win-prob (bootstrap logistic per SKU, ≥12-deal rule)
4. Fit churn-response (two-stage)
5. Wire forecasts
6. LTV (24mo @ 8%)
7. Score function demo on 3 SKUs
8. Optimiser demo (p*, breakeven, drivers, constraint flags)
9. Monte Carlo CI band
10. 2025 walk-forward backtest
11. Acceptance-gate report
12. 2026 forward recommendations export
13. Sensitivity & failure analysis
14. Promotion checklist for FastAPI wiring

## 8. Acceptance gates

The engine ships when **all** of:

| Gate | Target |
|---|---|
| Median per-SKU engine-claimed lift on 2025 backtest | ≥ +3% |
| 90% MC-CI empirical coverage of realised contribution (on harmonised horizon) | ≥ 80% |
| Share of SKUs with realised `net_recovery < 0` at recommended price for >5% of customers | ≤ 5% |
| Portfolio churn delta (predicted vs realised) | ±2pp |
| Per-SKU runtime (incl. Monte Carlo) | <500ms |
| Every `lib/*.py` module has a smoke-test cell at the bottom of the notebook | — |

If any gate fails, the notebook ships a diagnostic report (which input is broken) and wiring is paused.

## 9. Decisions baked in (no bikeshedding)

- Win-prob: logistic per SKU, bootstrap CI, ≥12-deal threshold (matches existing prod rule). Bayesian/HMC swap is a v1.x drop-in.
- Optimiser: 25-point linear grid + (optional) golden-section refinement; no MIP solver dependency.
- Monte Carlo: 5,000 draws (down-scoped to 400 during dev for runtime; target 5,000 in production wiring).
- LTV horizon: 24 months at 8% annual discount.
- Volume + cost: derived from existing forecasting_v3 + invoice rolling-12mo.
- Backtest: walk-forward train ≤ 2024-12 → recommend → score vs 2025 invoices.

## 10. Open switches (defaults unless overridden)

- Churn cap κ: +2pp portfolio average.
- Contract cap Δ_max: ±15% (15% in v1, can be tightened to 10% in production).
- Discount rate r: 8%.
- Output: per-SKU parquet + one summary CSV + one gates JSON.

## 11. Out of scope for v1

- Multi-SKU portfolio optimisation (cross-SKU substitution effects).
- Live competitor signal (data source not connected — confirmed in UI).
- Reinforcement learning / live Thompson sampling (post-AB only).
- Batch repricing of 1,798 SKUs at once — single-SKU loop is fine.

## 12. Production wiring plan (only if §8 gates pass)

1. Port `lib/*.py` → `backend/services/pricing/pricing_engine.py` with the same interface as the current `build_recommendation`. FastAPI surface unchanged.
2. Add `/pricing/score_curve` endpoint exposing the full `{p : S(p)}` map + MC band for the UI's score curve.
3. Replace `simulator.py` hardcoded `* 0.45` with `option_margin`-driven contribution rate; replace fake Custom-card strings with debounced live `/pricing/simulate` calls.
4. `RationaleMemo.tsx` — gate the recovery-vs-loss callout on `net > 0`, surface breakeven, expose drivers in a "Why this price?" expander.
5. Thompson sampling lands as a post-rollout exploration policy behind a feature flag, enabled only after ≥3 months of per-cluster AB outcomes.

## 13. Bibliography

Same as the whitepaper. See `docs/whitepaper/pryzm_pricing_methodology.tex` Bibliography section for the canonical list.
