---
title: Forecasting research — foundation models, hierarchy, intermittent demand, conformal PIs
date: 2026-05-17
author: research-bot
context: Scherzinger SME forecaster — ~30 monthly observations, 2–3 years daily invoices, strong Aug/Dec seasonality, exogenous regressors (FRED commodities, EUR/USD, Bund yield)
---

# Forecasting research: foundation models, hierarchy, intermittent SKUs, conformal PIs

## 1. Foundation time-series models (2024–2026 SOTA)

Six candidates were investigated against the question: "does this run locally, does it ingest exogenous regressors, and does the published evidence beat the M5 LightGBM ensemble in a relevant regime?"

| Model | arXiv | Repo | License | Exogenous | Local? | Notes |
|---|---|---|---|---|---|---|
| Chronos / Chronos-2 (Amazon) | 2403.07815 / 2510.15821 | amazon-science/chronos-forecasting | Apache-2.0 | Chronos-2 yes (covariate-informed) | Yes (HF weights, 20M–710M; Chronos-2 is 120M encoder-only) | Tokenises values via scaling+quantisation, trains a T5 LM with cross-entropy. Chronos-2 supports univariate / multivariate / covariate-informed in one model; #1 on GIFT-Eval Q4 2025. |
| TimesFM / TimesFM-2.5 (Google) | 2310.10688 | google-research/timesfm | Apache-2.0 | Yes, since 2.5 (XReg head, static + dynamic, num + categorical) | Yes (200M / 500M HF weights) | Decoder-only, pretrained on 100B real points. ICML 2024. Original release lacked covariates; XReg in 2.5 closed the gap. |
| TimeGPT-1 (Nixtla) | (closed; whitepaper only) | Nixtla/nixtla (client) | API only | Yes, well-supported `X_df` interface | No (managed API) | Trained on >100B points. Reports 14% better MAE than specialised models on M5 with exogenous + log transform. Easiest exogenous ergonomics of the bunch. |
| Moirai / Moirai-MoE / Moirai-2.0 (Salesforce) | 2402.02592 / 2410.10469 / 2511.11698 | SalesforceAIResearch/uni2ts | Apache-2.0 | Yes via "any-variate" attention; covariates as extra channels | Yes (Small/Base/Large + MoE variants) | Patch-based masked encoder, LOTSA pretrain (27B obs). Moirai-2.0 ranks 5–6 on GIFT-Eval MASE/CRPS at far smaller param count. |
| Lag-Llama | 2310.08278 | time-series-foundation-models/lag-llama | Apache-2.0 | No (univariate only; lags as covariates) | Yes (small checkpoint, fits on a laptop) | First open-source TS foundation model (Feb 2024). Decoder-only. Strong zero-shot but no exogenous — disqualifying for our case unless used as a baseline. |
| Tiny Time Mixers (IBM) | 2401.03955 | ibm-granite/granite-tsfm | Apache-2.0 | Yes — explicit exogenous mixer block (TTMQ-CM ranked #1 in ablation) | Yes (~1M–5M params; CPU-feasible) | TSMixer + gated attention, NeurIPS 2024. The only foundation model in this list explicitly architected around exogenous channels at small scale. Best fit for short series + commodity regressors. |

**vs M5 winning ensemble.** The M5 winner was an equal-weighted ensemble of LightGBM models pooled at store / store-category / store-department (Makridakis et al., 2022). Every "pure ML" top finisher beat all statistical benchmarks. Published foundation-model evidence against the M5 winner is mixed: TimeGPT claims 14% MAE improvement on the M5 subset *with* exogenous + log transform, but on raw daily M5 the LightGBM ensemble still wins. On M4 yearly (23k series, no exogenous), Chronos and TimesFM beat the M4 statistical winner (Theta-family ensemble) and Smyl's ES-RNN winner in zero-shot mode per their own papers and the GIFT-Eval reproduction. **Honest read:** foundation models match or beat M4-like univariate problems zero-shot; M5-like wide-panel daily retail still favours boosted-tree ensembles with hand-engineered calendar + price features unless you fine-tune.

**Exogenous-capable, local-runnable shortlist for us:** TTM, Chronos-2, TimesFM-2.5, Moirai-2.0. TimeGPT is the API-only outlier — useful as a baseline if data residency is acceptable.

## 2. Hierarchical reconciliation (revenue = price × volume; cost streams → margin)

The canonical references are Hyndman, Athanasopoulos, Ahmed (2011) for bottom-up/top-down/middle-out, and Wickramasuriya, Athanasopoulos, Hyndman (JASA 2019) for **MinT** — minimum-trace optimal reconciliation that finds projection matrix P minimising total forecast-error variance over the space of coherent forecasts. Probabilistic extensions: Panagiotelis et al. 2023 (PERMBU, bootstrap), and the Nixtla `hierarchicalforecast` package implements BottomUp, TopDown (forecast-proportions, average-historical-proportions), MiddleOut, MinTrace (`ols`, `wls_var`, `wls_struct`, `mint_shrink`, `mint_cov`), and ERM, plus probabilistic Normality / Bootstrap / PERMBU reconcilers.

For our decomposition `revenue = price × volume`, this isn't strictly an additive hierarchy — it's multiplicative. Two clean options:

1. **Log-additive hierarchy:** forecast `log(price)`, `log(volume)`, and `log(revenue)` as a 3-node hierarchy with the constraint `log(rev) = log(price) + log(volume)`. MinT in log-space, exponentiate. Coherent in expectation under lognormal residuals.
2. **Bottom-up:** forecast price and volume independently, multiply for revenue. Simple, but loses any direct signal in aggregate revenue and gives no uncertainty coupling.

For **margin** with material/energy cost as a driver, treat `gross_margin = revenue − COGS` as a standard additive hierarchy: forecast revenue, forecast each cost stream (material indexed to FRED commodities, energy to gas/power, labour separately), reconcile with MinT-shrink (robust to short series — 30 months barely supports `mint_cov`). Wickramasuriya 2019 shows MinT-shrink dominates `wls_struct` when series length is short and cross-correlations are estimated noisily.

## 3. Hybrid / two-stage for margin: components vs ratio

The accounting literature is clear: forecast **components, then derive the ratio**. Chen, Lewis, Yan (Review of Accounting Studies 2020, "Analyst forecasts: sales and profit margins") finds analyst sales forecasts have systematically lower error than margin forecasts, and margin forecasts inherit most of their accuracy from the sales side. Restated: forecast `revenue` and `cost` directly, derive `margin = (rev − cost)/rev`, beats forecasting the ratio directly.

Mechanistic reasons: (a) the ratio is bounded and non-stationary at low denominators — a tiny revenue miss explodes margin error; (b) exogenous drivers act on the *levels* (commodity prices push cost, EUR/USD pushes pricing power, Bund yield correlates with demand cycles), not on the ratio; (c) at SME scale, fixed costs make margin highly non-linear in revenue, so a learned ratio doesn't transfer across volume regimes.

Caveat: when revenue and cost are nearly cointegrated (a high pass-through industry), forecasting the ratio can win because it cancels common shocks. Test empirically: fit both, compare on rolling-origin CV. Default to components.

## 4. Intermittent / lumpy SKU demand

`statsforecast` (Nixtla) implements the standard family at scale. Sane defaults for intermittent (zero-inflated, lumpy) SKUs:

- **Croston Classic** (1972) — baseline; biased upward.
- **CrostonSBA** — Syntetos-Boylan Approximation (2005), debiasing factor `1 − α/2` on inter-demand interval. Consistently outperforms Croston; **recommended default** per Syntetos et al. and reproduced in the M5 uncertainty competition.
- **TSB** (Teunter, Syntetos, Babai 2011) — replaces inter-demand interval with demand-probability update. Better than SBA when intermittence shifts (new/dying SKUs).
- **ADIDA** (Nikolopoulos et al. 2011) — aggregate to bucket of size = mean inter-demand interval, SES, disaggregate. Cheap, surprisingly competitive.
- **IMAPA** (Petropoulos & Kourentzes 2015) — ADIDA across multiple aggregation levels, average. Captures multi-scale dynamics.

Decision rule (Syntetos-Boylan classification by CV² and ADI): smooth → SES; intermittent → Croston/SBA; erratic → SBA; lumpy → TSB or IMAPA. `statsforecast` runs all five in parallel via `StatsForecast(models=[CrostonClassic(), CrostonSBA(), TSB(), ADIDA(), IMAPA()])`. For our SKU-level monthly data, run `MSTL + CrostonSBA` for "normal" SKUs and `IMAPA` for true lumpy ones, picked per-series by CV² > 0.49 and ADI > 1.32.

## 5. Conformal prediction intervals for short series

Three relevant methods:

- **Stankeviciute et al. 2021** ("Conformal Time-Series Forecasting", NeurIPS) — RNN + split conformal across *multiple* series; finite-sample joint validity under series-level exchangeability. Requires a panel — fits us (we have many SKUs / many monthly series), not a single 30-point series.
- **EnbPI** (Xu & Xie, ICML 2021, arXiv 2010.09107) — bootstrap-ensemble conformal, no exchangeability assumption, designed for a single dynamic series. Recent benchmarks (arXiv 2601.18509) find EnbPI **fails to hit nominal coverage** in several regimes — over-optimistic on autocorrelated residuals.
- **ACI** (Gibbs & Candès 2021, arXiv 2106.00170; Zaffran et al. ICML 2022 "Adaptive Conformal Predictions for Time Series", arXiv 2202.07282) — adapts quantile level online via gradient on miscoverage; guaranteed long-run coverage even under distribution shift. Empirically the most robust on short, autocorrelated, regime-changing series.

Recent benchmark (Conformal Prediction Algorithms for Time Series, 2026): **Global-CP, AcMCP, MSCP, ACI, and Parametric-PI hit ≥90% target; Nixtla-CP, EnbPI, SPCI undercover.** For P80 coverage on ~30 monthly points: use **ACI on the residuals of whatever point forecast we choose**, with Stankeviciute-style cross-series calibration if/when we move to per-SKU intervals. Avoid EnbPI as a primary method — keep as a comparison only.

---

## Recommended picks for our Scherzinger SME context

Given ~30 monthly observations, daily invoice history, strong seasonal peaks, and FRED/FX/yield exogenous regressors:

1. **Point forecast (monthly revenue, volume, cost streams).** Run an ensemble of three:
   - **TTM (IBM, granite-tsfm)** as the foundation-model anchor — small, CPU-feasible, explicit exogenous mixer, designed exactly for short multivariate series with covariates.
   - **TimeGPT** (if API-allowed) for a strong second opinion with effortless exogenous handling — useful even just as a benchmark.
   - **AutoARIMA / AutoETS with exogenous** from `statsforecast` as the interpretable baseline; we will be asked "why did the forecast move" and ARIMAX gives that answer.
   Combine with a simple inverse-MAE weighted blend on rolling-origin CV; foundation models are not yet a reliable solo pick at this sample size.

2. **Decomposition.** Forecast `volume`, `unit_price`, and `cost-per-unit` separately. Derive `revenue = price × volume` and `margin = (rev − cost)/rev`. **Do not** forecast the margin ratio directly (Chen-Lewis-Yan 2020). Use log-additive MinT-shrink reconciliation via Nixtla `hierarchicalforecast` to keep the three forecasts coherent.

3. **SKU-level intermittent.** `statsforecast` with per-SKU model selection: SBA for intermittent, TSB for shifting intermittence, IMAPA for lumpy. Classify by CV² and ADI thresholds.

4. **Prediction intervals.** Use **ACI** (Zaffran 2022) on residuals for P80 / P95 bands on the headline monthly series. Move to Stankeviciute-style panel conformal once we have ≥20 SKU-level series sharing structure. Skip EnbPI as primary.

5. **What we explicitly are not doing.** No Lag-Llama (univariate-only). No vanilla Chronos-1 (no covariates). No M5-style LightGBM mega-ensemble — we don't have the panel width to justify it; revisit once daily invoice → SKU × week panel has ≥100 series.

The shortest credible path: ship **TTM + ARIMAX + statsforecast(SBA/TSB)** behind `hierarchicalforecast` MinT-shrink with ACI bands. That covers revenue, volume, margin, SKU intermittency, and valid P80 intervals on 30 monthly observations, all locally runnable, all Apache-2.0.

---

### Key references

- Ansari et al., *Chronos: Learning the Language of Time Series*, arXiv:2403.07815
- Auer et al., *Chronos-2: From Univariate to Universal Forecasting*, arXiv:2510.15821
- Das et al., *A decoder-only foundation model for time-series forecasting* (TimesFM), arXiv:2310.10688
- Woo et al., *Unified Training of Universal Time Series Forecasting Transformers* (Moirai), arXiv:2402.02592
- Liu et al., *Moirai-MoE*, arXiv:2410.10469
- Salesforce, *Moirai 2.0*, arXiv:2511.11698
- Rasul et al., *Lag-Llama*, arXiv:2310.08278
- Ekambaram et al., *Tiny Time Mixers*, arXiv:2401.03955 (NeurIPS 2024)
- Wickramasuriya, Athanasopoulos, Hyndman, *Optimal forecast reconciliation through trace minimization*, JASA 2019
- Hyndman, Ahmed, Athanasopoulos, Shang, *Optimal combination forecasts for hierarchical time series*, CSDA 2011
- Olivares et al., *HierarchicalForecast: A Python Benchmarking Framework*, 2022
- Chen, Lewis, Yan, *Analyst forecasts: sales and profit margins*, Review of Accounting Studies 2020
- Syntetos & Boylan, *The accuracy of intermittent demand estimates*, IJF 2005
- Teunter, Syntetos, Babai, *Intermittent demand: linking forecasting to inventory obsolescence*, EJOR 2011
- Petropoulos & Kourentzes, *Forecast combinations for intermittent demand*, JORS 2015
- Stankeviciute, Alaa, van der Schaar, *Conformal Time-Series Forecasting*, NeurIPS 2021
- Xu & Xie, *Conformal prediction interval for dynamic time-series* (EnbPI), ICML 2021, arXiv:2010.09107
- Zaffran et al., *Adaptive Conformal Predictions for Time Series* (ACI), ICML 2022, arXiv:2202.07282
- Makridakis, Spiliotis, Assimakopoulos, *M5 accuracy competition: Results, findings, and conclusions*, IJF 2022
