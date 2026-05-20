---
title: Forecasting Research Dossier — Thin-Data, Seasonal, Exogenous-Rich Monthly Forecaster
project: Scherzinger Platform (Frank Pricing Studio v3 / Forecast Redesign v2)
context: German metals-fabrication SME, ~30 monthly observations, daily invoices, strong August/December seasonality, exogenous drivers from FRED (steel PPI, Cu/Al LME, Brent, EUR/USD, Bund, US IP)
author: Research agent
created: 2026-05-17T00:00:00Z
updated: 2026-05-17T00:00:00Z
status: research
---

# Forecasting Research Dossier

## 0. Problem framing

We are forecasting monthly revenue, gross margin, and volume for a single German metals-fabrication SME (Scherzinger). Constraints:

- **N ≈ 24–36 monthly observations** (thin) plus a daily invoice stream that can be re-aggregated.
- **Strong calendar seasonality** — German manufacturing collapses in August (Werksferien) and December (Weihnachtspause). One full seasonal period is roughly 12 monthly points; we only have ~2–3 cycles.
- **Exogenous drivers** in a FRED parquet: steel PPI (PCU3311103311101), copper/aluminum LME spot, Brent crude, EUR/USD, German 10-year Bund yield, US Industrial Production (INDPRO).
- **Anomaly months** exist (e.g., 492 invoices in a single April — likely a backlog clearance or merge event).
- **Operational need**: point forecast, P10/P50/P90 prediction intervals, decomposition (trend/seasonality/exog contribution) for explanation, and resilience to a partial last month.

With N ~ 30 and ~6 exogenous regressors, we are dangerously close to the "more parameters than observations" regime for any model that wants to learn long lag structure end-to-end. Bias-injected, low-VC models and global/foundation models that bring outside priors will dominate over high-capacity models trained from scratch.

---

## 1. Candidate methods

### 1.1 Classical / statistical

#### SARIMA
- **Intuition**: Autoregressive + moving-average errors with explicit seasonal differencing. Univariate, no exog.
- **Shines**: Smooth seasonal series with stable autocorrelation structure. Auto-ARIMA (Hyndman & Khandakar 2008) handles model selection well.
- **Fails**: When external drivers (commodity prices) dominate, when seasonality drifts, when N is too small for stable AIC selection.
- **Suitability @ N ~ 30**: Marginal. Seasonal differencing eats 12 observations; with non-seasonal d=1 you have ~17 usable points to fit `(p,d,q)(P,D,Q)_12`. Keep orders tiny — e.g. `(1,1,1)(0,1,1)_12`.
- **Exog**: Not directly — use SARIMAX.
- **Seasonality**: Native via seasonal differencing.
- **Accuracy**: In M4 monthly, ARIMA had sMAPE ≈ 13.4%, beaten by Theta and by combination benchmarks; Theta and ARIMA both beat ETS on monthly ([M4 paper, Makridakis et al. 2020](https://www.sciencedirect.com/science/article/pii/S0169207019301128)).
- **Library**: `statsforecast.AutoARIMA`, `pmdarima`, `statsmodels.tsa.statespace.SARIMAX`.

#### SARIMAX
- **Intuition**: SARIMA + linear regression on exogenous regressors ("regression with SARIMA errors": `y_t = β'x_t + u_t`, where `u_t` is SARIMA — see [statsmodels SARIMAX FAQ](https://www.statsmodels.org/dev/examples/notebooks/generated/statespace_sarimax_faq.html)).
- **Shines**: When exog covariates are themselves forecastable (or known/leading) and have linear effects. Steel PPI → revenue passthrough is roughly linear over a 1–3 month lag.
- **Fails**: With many exogenous regressors on short data (overfitting). Standard errors are known to be inflated until ~100+ observations.
- **Suitability @ N ~ 30**: **Workable if you pre-select 2–3 exogs via LASSO/partial-F.** Don't dump all six FRED series in raw. Regularize.
- **Exog**: First-class — pass as `exog=` to `SARIMAX(...).fit()`. Forecast horizon requires future exog values (use commodity futures curves or AR(1) imputations).
- **Seasonality**: Native.
- **Accuracy**: SARIMAX is the workhorse on industrial/economic monthly series; consistently within 5–10% of ML methods when exog signal is real ([MDPI 2022 SARIMAX review](https://www.mdpi.com/2411-5134/7/4/94)).
- **Library**: `statsmodels.tsa.statespace.SARIMAX`, `statsforecast.AutoARIMA(exog=...)`.

#### ETS (Error/Trend/Seasonal, Holt-Winters family)
- **Intuition**: Exponential smoothing decomposed into Error × Trend × Seasonality components, additive or multiplicative.
- **Shines**: Stable seasonal patterns, no exog needed, fast.
- **Fails**: No native exog support; outliers contaminate smoothed states.
- **Suitability @ N ~ 30**: **Good baseline**. ETS(A,N,A) or ETS(A,A,A) with 12-month seasonality fits 14–17 parameters with N=30 — viable.
- **Exog**: Not natively; some implementations bolt it on (poorly).
- **Seasonality**: Native, additive or multiplicative.
- **Accuracy**: M4 monthly sMAPE ≈ 13.5% — slightly worse than ARIMA on monthly, better on hourly ([M4 paper](https://www.sciencedirect.com/science/article/pii/S0169207019301128)).
- **Library**: `statsforecast.AutoETS`, `statsmodels.tsa.holtwinters`.

#### Theta method
- **Intuition**: Decompose series into two "theta lines" (one capturing long-run trend, one capturing short-run curvature) and recombine. Effectively SES on a detrended series.
- **Shines**: Short, noisy, weakly-trending monthly series — the M3 winner and a top performer in M4. Extremely cheap.
- **Fails**: No exog. Limited expressivity for complex multiplicative seasonality.
- **Suitability @ N ~ 30**: **Excellent baseline** — was the strongest pure statistical method on M4 monthly.
- **Exog**: None.
- **Seasonality**: Via classical decomposition pre-processing.
- **Accuracy**: M4 monthly: Theta beat ARIMA, ETS, and the Comb benchmark on average ([M4 results, Makridakis 2020](https://www.sciencedirect.com/science/article/pii/S0169207019301128)). DynOptimizedTheta is a strong variant ([Fiorucci et al. 2024](https://www.sciencedirect.com/science/article/pii/S0169207024000906)).
- **Library**: `statsforecast.AutoTheta`, `statsforecast.DynamicOptimizedTheta`.

#### Croston / SBA / TSB (intermittent demand)
- **Intuition**: For series with many zero periods. Separately forecast inter-arrival interval and non-zero demand size; SBA adds Syntetos-Boylan bias correction; TSB replaces interval with probability-of-demand for obsolescence-aware decay.
- **Shines**: SKU-level intermittent demand. Probably **not relevant for top-line monthly revenue** (no zeros), but **highly relevant if we forecast at the customer-or-part level** for Scherzinger.
- **Fails**: Smooth series with continuous demand.
- **Suitability @ N ~ 30**: Fine — methods are robust to small N.
- **Exog**: No.
- **Seasonality**: No.
- **Accuracy**: SBA dominates Croston on biased series; TSB dominates SBA when product life cycles end ([Syntetos & Boylan 2005, Teunter et al. 2011](https://nixtlaverse.nixtla.io/statsforecast/docs/models/crostonsba.html)).
- **Library**: `statsforecast.CrostonClassic / CrostonSBA / CrostonOptimized / TSB / ADIDA / IMAPA`.

### 1.2 ML-on-features (gradient-boosted trees)

#### LightGBM / XGBoost with engineered features
- **Intuition**: Build a tabular dataset where each row is one (date, target) with columns for lag-1/3/6/12 of target, calendar dummies (month, quarter, Werksferien flag), and exogenous values at appropriate lags. Train a gradient-boosted regressor.
- **Shines**: Many series, rich tabular features, non-linear interactions, easy quantile regression via `objective='quantile'`.
- **Fails**: **Single short series, N ~ 30 — disastrous.** GBDTs cannot extrapolate trend beyond the train support; with N=30 they overfit calendar dummies.
- **Suitability @ N ~ 30**: **Risky for a single series.** Works only if (a) you pool across many SKU/customer series for a global model, or (b) you constrain to very few features and very shallow trees (`num_leaves=7`, `min_data_in_leaf=3`, monotone constraints).
- **Exog**: First-class — just add columns.
- **Seasonality**: Through month/quarter dummies, Fourier features.
- **Accuracy**: **Won M5 Accuracy and Uncertainty** — Yeonjun Im's solution was an equal-weighted arithmetic mean of LightGBM models trained at multiple pooling levels (store, store-category, store-department) ([M5 Accuracy paper, Makridakis et al. 2022](https://www.sciencedirect.com/science/article/pii/S0169207021001874)). M5 had ~30k series × 1900 days though — vastly more data than us.
- **Library**: `mlforecast` (Nixtla), `lightgbm`, `sklearn`, `darts.RegressionModel`.

### 1.3 Probabilistic / structural

#### Prophet
- **Intuition**: Additive GAM with piecewise-linear trend, Fourier seasonality, holiday dummies, and external regressors.
- **Shines**: Many series, weekly/daily seasonality, holiday-heavy retail.
- **Fails**: Monthly data with strong autocorrelation; unrealistic trend extrapolation; **prediction intervals are notoriously miscalibrated** — Manokhin found 30–40% of points fell outside Prophet's intervals on benchmark data ([Manokhin 2022 critique](https://valeman.medium.com/the-facebook-prophet-fiasco-a-cautionary-tale-of-data-science-hype-041384d6f119)). Prophet was beaten by ARIMA, linear regression, KNN on multiple monthly benchmarks.
- **Suitability @ N ~ 30**: Workable for a quick baseline / decomposition view; **do not trust the intervals**.
- **Exog**: `add_regressor()` — but coefficients are essentially OLS, no shrinkage.
- **Seasonality**: Native (yearly Fourier).
- **Accuracy**: Generally poor vs. competition winners; Hyndman-style ARIMA with explicit yearly hints beats it ([Taylor & Letham 2017](https://peerj.com/preprints/3190.pdf)).
- **Library**: `prophet`.

#### Bayesian structural time series (BSTS / Orbit / TFP-STS / pybuc)
- **Intuition**: State-space model: latent level + trend + seasonal + regression components, fit via MCMC or variational inference. Produces credible intervals natively.
- **Shines**: Small N where Bayesian priors regularize; explicit decomposition; principled uncertainty; spike-and-slab variable selection over exog regressors (BSTS in R is famous for this).
- **Fails**: Compute cost; tuning priors requires care; HMC convergence on N=30 is fragile.
- **Suitability @ N ~ 30**: **Strong fit.** Priors do the heavy lifting that data cannot. Local-linear-trend + 12-month seasonal + LASSO/horseshoe regression over the 6 FRED features.
- **Exog**: First-class, with built-in variable selection.
- **Seasonality**: Native, can be dummy or trigonometric.
- **Accuracy**: Competitive with ARIMA on small series; produces better calibrated intervals ([Scott & Varian 2014 on BSTS](https://www.tensorflow.org/probability/api_docs/python/tfp/sts)).
- **Library**: `orbit-ml` (Uber), `tfp.sts` (TensorFlow Probability), `pybuc`, `PyMC` custom.

### 1.4 Deep learning for short series

#### N-BEATS
- **Intuition**: Pure MLP stacks with backward+forward residual basis expansions (trend/seasonality blocks). No recurrence, no attention.
- **Shines**: Univariate forecasting on global datasets (M4 winner-tier — beat all classical methods).
- **Fails**: **Single short series** — designed for cross-series learning.
- **Suitability @ N ~ 30**: **Bad in isolation**, viable if you pre-train on a related corpus then fine-tune.
- **Exog**: Original N-BEATS is univariate; N-BEATSx variant adds exog.
- **Seasonality**: Through learned basis blocks.
- **Accuracy**: [Oreshkin et al. 2019, arXiv:1905.10437](https://arxiv.org/abs/1905.10437) — beat M4 winner ensemble by ~3% sMAPE.
- **Library**: `neuralforecast.NBEATS / NBEATSx`, `darts.NBEATSModel`.

#### N-HiTS
- **Intuition**: N-BEATS + multi-rate input pooling + hierarchical interpolation. Designed to be faster and better at long horizons.
- **Shines**: Long-horizon forecasting; 20% improvement over Transformers at 1/50th the cost ([Challu et al. 2022, arXiv:2201.12886](https://arxiv.org/abs/2201.12886)).
- **Fails**: Same short-series limitation as N-BEATS.
- **Suitability @ N ~ 30**: Same as N-BEATS — needs global / multi-series training.
- **Exog**: Yes, via `futr_exog_list` / `hist_exog_list` in `neuralforecast`.
- **Seasonality**: Implicit.
- **Accuracy**: Beats N-BEATS and TFT on several long-horizon benchmarks ([arXiv:2201.12886](https://arxiv.org/abs/2201.12886)).
- **Library**: `neuralforecast.NHITS`, `darts.NHiTSModel`.

#### Temporal Fusion Transformer (TFT)
- **Intuition**: Transformer with variable-selection networks for static, historical, and known-future covariates; gated residual blocks; quantile output heads.
- **Shines**: Multi-horizon, multivariate, interpretable attention weights over covariates.
- **Fails**: **Data-hungry.** Tutorials show TFT needs roughly 20k samples to be competitive; with N=30 monthly points you get 0% of the way there ([Lim et al. 2021](https://www.sciencedirect.com/science/article/pii/S0169207021000637), [pytorch-forecasting docs](https://pytorch-forecasting.readthedocs.io/en/v1.4.0/tutorials/stallion.html)).
- **Suitability @ N ~ 30**: **Skip** unless we daily-aggregate (~900 obs) and treat seasonality at daily resolution.
- **Exog**: First-class, including known-future.
- **Seasonality**: Implicit.
- **Accuracy**: Beaten by N-HiTS / N-BEATS on small data ([arXiv:2408.12408](https://arxiv.org/html/2408.12408v1)).
- **Library**: `pytorch-forecasting.TemporalFusionTransformer`, `neuralforecast.TFT`, `darts.TFTModel`.

#### DeepAR
- **Intuition**: Autoregressive LSTM that parametrizes a probability distribution (Gaussian/NegBin/Student-t) at each step; cross-learns across many series.
- **Shines**: Many related series (e.g., SKU-level Walmart-style).
- **Fails**: Single short series.
- **Suitability @ N ~ 30**: Only viable if we pool customer/part-level series.
- **Exog**: Yes (static and dynamic).
- **Seasonality**: Implicit + via covariates.
- **Accuracy**: [Salinas et al. 2020 (DeepAR)](https://www.jmlr.org/papers/volume21/19-820/19-820.pdf) — 15% MASE improvement on cross-series problems vs. state-of-the-art at the time.
- **Library**: `gluonts.torch.model.deepar`, `neuralforecast.AutoDeepAR`, `pytorch-forecasting.DeepAR`.

#### NeuralProphet
- **Intuition**: Prophet's GAM rewritten in PyTorch + AR-Net for autoregression + neural lagged regressors ([Triebe et al. 2021, arXiv:2111.15397](https://arxiv.org/abs/2111.15397)).
- **Shines**: Better autocorrelation handling than Prophet; same interpretability.
- **Fails**: Inherits Prophet's trend-extrapolation issues; still under-regularized for N=30.
- **Suitability @ N ~ 30**: Decent baseline with explicit additive decomposition.
- **Exog**: Native (`add_future_regressor`, `add_lagged_regressor`).
- **Seasonality**: Fourier.
- **Accuracy**: Slightly better than Prophet, often comparable to SARIMAX on monthly data.
- **Library**: `neuralprophet`.

### 1.5 Global / foundation models

#### Chronos / Chronos-Bolt / Chronos-2
- **Intuition**: T5 encoder-decoder tokenizes time series values into a fixed vocabulary; pre-trained on ~100B observations. Chronos-2 (Oct 2025) adds native covariate support and multivariate forecasting.
- **Shines**: Zero-shot on unseen series. Tiny (9M) and Mini (21M) variants for low-resource deployment. ([AWS blog](https://aws.amazon.com/blogs/machine-learning/fast-and-accurate-zero-shot-forecasting-with-chronos-bolt-and-autogluon/))
- **Fails**: Zero-shot Chronos-1 had no covariate support. Latency is non-trivial for the Base model.
- **Suitability @ N ~ 30**: **Excellent** — zero-shot bypasses our small-N problem entirely. Chronos-2 with exog covariates is arguably the single best modern bet.
- **Exog**: Chronos-2 supports past and future covariates; ChronosX adapters retrofit covariate support onto Chronos-1.
- **Seasonality**: Implicit (learned from pre-training).
- **Accuracy**: Chronos-2 #1 on fev-bench, GIFT-Eval, and Chronos Benchmark II ([Ansari et al. 2024 / 2025](https://github.com/amazon-science/chronos-forecasting)).
- **Library**: `chronos-forecasting`, `autogluon.timeseries` (with `Chronos` preset).

#### TimesFM (Google)
- **Intuition**: Decoder-only transformer pre-trained on 100B+ real-world time points. Patch-based input.
- **Shines**: Zero-shot performance. TimesFM-2 / 2.5 are the current Decathlon-benchmark leaders ([Decathlon 2025 TSFM showdown](https://medium.com/decathlondigital/the-tsfm-showdown-whos-winning-the-forecasting-battle-at-decathlon-e3ef17f3f247)).
- **Fails**: Covariate support is younger than Chronos-2's; benchmark contamination concerns ([arXiv:2510.13654](https://arxiv.org/html/2510.13654v1)).
- **Suitability @ N ~ 30**: Excellent for univariate; combine with separate exog regression layer.
- **Exog**: Limited native support; planned in TimesFM-2.5.
- **Seasonality**: Implicit.
- **Accuracy**: Decathlon benchmark — TimesFM-2 was the best zero-shot TSFM by WAPE.
- **Library**: `timesfm` (PyPI), HuggingFace.

#### TimeGPT (Nixtla)
- **Intuition**: Closed-source pre-trained transformer offered via API.
- **Shines**: Convenience, fine-tuning endpoint, covariate support.
- **Fails**: Closed weights, API cost, vendor lock-in.
- **Suitability @ N ~ 30**: Fine as a comparison-of-record but we want open weights.
- **Exog**: Yes, via API.
- **Library**: `nixtla` SDK.

#### Moirai / Moirai-MoE (Salesforce)
- **Intuition**: Encoder-only transformer with patch-based input; **natively supports past and future exogenous covariates** — the only foundation model with that property at launch.
- **Shines**: Multivariate + covariate-informed zero-shot.
- **Fails**: Slightly heavier than Chronos-Bolt.
- **Suitability @ N ~ 30**: **Top candidate** because of native covariate handling — directly consumes our 6 FRED series.
- **Library**: `uni2ts` (Salesforce).

**Zero-shot viability verdict for N ~ 30**: Yes. Multiple 2025 benchmarks ([MDPI Benchmarking Foundation Models 2025](https://www.mdpi.com/2813-0324/11/1/32), [Decathlon](https://medium.com/decathlondigital/the-tsfm-showdown-whos-winning-the-forecasting-battle-at-decathlon-e3ef17f3f247)) show TSFMs match or beat classical methods even with **zero training data on the target series**, precisely because pre-training supplies the structural priors that small samples cannot.

### 1.6 Hybrid stacking / ensembling

- **Intuition**: Combine forecasts from heterogeneous models — classical (SARIMAX), ML (LightGBM), neural (N-HiTS or Chronos) — via simple mean, weighted mean, or stacked meta-learner.
- **M-competition evidence**: 12 of the top 17 M4 methods were combinations ([Makridakis 2020](https://www.sciencedirect.com/science/article/pii/S0169207019301128)). The M5 Accuracy winner used an equal-weighted mean of 6 LightGBMs ([Im / Makridakis 2022](https://www.sciencedirect.com/science/article/pii/S0169207021001874)). Slawek Smyl's M4 winner was a statistical-ML hybrid.
- **For us**: Equal-weighted mean across diverse models is the cheapest, most reliable win — it consistently beats any single model on out-of-sample MASE.

---

## 2. Recommendation — thin-data, seasonal, exog-rich monthly forecaster

### 2.1 Top 3 ranked picks

1. **SARIMAX with LASSO-selected exogenous regressors** (`statsforecast.AutoARIMA(exog=...)` or `statsmodels.SARIMAX`).
   - *Why*: Best fit for our N. Native seasonality, native exog, calibrated intervals, transparent coefficients we can show Frank ("steel PPI Δ +1σ → revenue −2.3%"). Survived 30+ years of econometric stress-testing. Pre-select ≤3 exogs from {steel PPI t-1, EUR/USD t-1, US INDPRO t-2} via LASSO.

2. **Chronos-2 (zero-shot) or Moirai with FRED covariates** (`autogluon.timeseries` with `Chronos` preset, or `uni2ts`).
   - *Why*: Sidesteps the small-N problem entirely via pre-training. Chronos-2 / Moirai both support exog covariates. Provides probabilistic forecasts out of the box. Decathlon, GIFT-Eval, and fev-bench all show TSFMs match or beat classical methods on small series.

3. **Bayesian structural time series via `orbit-ml` (DLT or KTR-Lite) or `tfp.sts`**.
   - *Why*: Priors regularize where data is thin. Native decomposition (trend + seasonal + regression) maps directly onto Frank's mental model. Native probabilistic intervals that are actually calibrated (unlike Prophet's).

**Honorable mentions**: AutoTheta as the always-on cheap baseline; NeuralProphet for interpretable plots; a tiny global LightGBM pooled across customers/parts if we want SKU-level forecasts.

### 2.2 Stacking recipe

Use an equal-weighted (or pinball-loss-weighted) mean over three diverse base models:

```python
# Pseudocode using Nixtla + AutoGluon
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, AutoTheta
from autogluon.timeseries import TimeSeriesPredictor

# Base 1: SARIMAX with selected exog (calibrated, interpretable)
sf = StatsForecast(models=[AutoARIMA(season_length=12),
                           AutoTheta(season_length=12)],
                   freq='MS')
sf.fit(df_with_exog)
fc_arima = sf.predict(h=6, level=[80])

# Base 2: Chronos-2 zero-shot with future covariates
ag = TimeSeriesPredictor(prediction_length=6, freq='MS',
                          known_covariates_names=['steel_ppi','eur_usd','indpro'])
ag.fit(train_data, presets='chronos_large', time_limit=120)
fc_chronos = ag.predict(train_data, known_covariates=future_exog)

# Base 3: BSTS via orbit-ml (DLT with regression)
from orbit.models import DLT
dlt = DLT(response_col='y', date_col='ds', seasonality=12,
          regressor_col=['steel_ppi','eur_usd','indpro'],
          regression_penalty='lasso')
dlt.fit(train)
fc_dlt = dlt.predict(future)

# Combine: equal-weighted mean of medians + interval averaging
ensemble_p50 = (fc_arima.p50 + fc_chronos.p50 + fc_dlt.p50) / 3
ensemble_p10 = (fc_arima.p10 + fc_chronos.p10 + fc_dlt.p10) / 3
ensemble_p90 = (fc_arima.p90 + fc_chronos.p90 + fc_dlt.p90) / 3
```

If we later have >50 monthly points or pool across customers, swap Base 3 for a global N-HiTS via `neuralforecast`.

A **stacked** (not equal-weighted) meta-learner over base forecasts is *not* recommended at N=30 — the meta-learner itself overfits. Empirically, equal-weighted means dominate stacking when N is small (M-competition consensus).

### 2.3 Cross-validation strategy

**Rolling-origin (expanding window) with growing training set**, NOT k-fold. This is the canonical Hyndman approach ([Hyndman, "Cross-validation for time series"](https://robjhyndman.com/hyndsight/tscv/)).

Concrete plan for N=30:

- Initial train window: 18 months
- Forecast horizon: 6 months (matches our operational target — Frank wants 1–6 month rolling outlook)
- Step size: 1 month
- Folds: 7 (origins at months 18, 19, ..., 24)
- For each fold: train on `[0:origin]`, score on `[origin+1:origin+6]`

Use `statsforecast.cross_validation()` or `mlforecast.cross_validation()` — both implement this directly. Report mean ± std MASE across folds, not just the mean.

**Do NOT use scikit-learn `KFold`** — it leaks future into training. Do NOT use `TimeSeriesSplit` with `shuffle=True` either.

**Nested CV**: With N=30 we cannot afford a true outer/inner nested CV (would need ~50+ obs). Instead: use the 7 rolling folds for model selection (inner), then reserve the final 3–6 months as a **hold-out test window** that no model has touched (outer). Decide on the production model based on test-window performance.

### 2.4 Accuracy KPIs

| Metric | Why |
|---|---|
| **MASE** (Mean Absolute Scaled Error) | Scale-free; benchmark against seasonal naive ([Hyndman & Koehler 2006](https://otexts.com/fpp3/accuracy.html)). MASE < 1 ⇒ beats seasonal naive. **Primary metric.** |
| **sMAPE** | Comparability with M4/M5 literature. Bounded but asymmetric — secondary. |
| **MAPE** | Stakeholder-facing ("we're off by X%"). Beware zero / near-zero months. |
| **Pinball loss @ P10, P50, P90** | Proper scoring rule for quantile forecasts. Primary probabilistic metric. |
| **Coverage@P80** (= empirical P10–P90 interval coverage) | Should be ≈ 80%. Prophet famously fails this at 50–60% on real data. |
| **Winkler score** | Combines interval width and coverage — single number for interval quality. |
| **MAE on €** | Operational — sales/finance care about absolute euros, not percentages. |

For each model and the ensemble, report all of these on the 7 rolling folds plus the hold-out window.

### 2.5 Red-team failure modes

A forecaster used in production at an SME *will* hit these. Each must have an automated test:

1. **Structural break / regime change** — e.g., a new major customer onboarded in March 2025 shifts the level permanently. Test: inject a step-up of +30% at month 24 in synthetic data; verify the model adapts within 3 months.

2. **Partial last month** — the current month is half-reported when the forecast runs. Test: truncate the last month's invoice sum to 50%; verify the model doesn't anchor to the partial value (use ragged-edge handling: report `T-1` close, forecast from `T`).

3. **Level shift in a covariate** — e.g., steel PPI doubles in one month (2022 Ukraine shock). Test: synthetic +50% spike in steel PPI; verify revenue forecast doesn't blindly follow.

4. **Anomaly month (492 invoices in April)** — backlog clearance creating an outlier. Test: replace one month with 3σ outlier; verify model uses robust loss (Huber) or explicit outlier flag rather than re-anchoring trend.

5. **August / December seasonality drift** — what if Werksferien shifts a week or December has 5 working days vs 8? Test: shift seasonal trough by ±1 month in synthetic data; verify the model picks it up within 1 cycle.

6. **Exogenous regressor not yet known for forecast horizon** — we need future commodity prices. Test: simulate exog imputation via (a) AR(1) extrapolation, (b) commodity futures curve, (c) hold-constant; compare downstream forecast error.

7. **Missing month / data outage** — one month of FRED missing. Test: drop a covariate value at month 18; verify graceful imputation, not crash.

8. **N drops to 12** — onboarding a new SME with 1 year of history. Test: re-fit pipeline at N=12; degrade gracefully to AutoTheta + Chronos zero-shot + seasonal naive ensemble, drop SARIMAX and BSTS.

9. **Mis-specified seasonal period** — Chronos / TFT receive monthly data but the actual cycle is quarterly. Test: feed a known-quarterly synthetic series; verify residual diagnostics catch it.

10. **Bias toward over-forecasting in good periods** — common with multiplicative trend ETS and Prophet logistic trend. Test: bias check = mean(forecast − actual) across folds; should be ≈ 0.

11. **Foundation-model data leakage** — Chronos / Moirai may have seen public German manufacturing data in pre-training, inflating zero-shot accuracy. Test: compare zero-shot vs. fine-tuned vs. classical on synthetic non-public series and on our private hold-out.

12. **EUR/USD-revenue spurious correlation** — six exogs × N=30 makes spurious significance trivial. Test: shuffle exog dates and re-fit; if R² stays > 0.4, exog selection is overfit.

---

## 3. Library cheat sheet

| Need | Library | Class |
|---|---|---|
| Classical (ARIMA, ETS, Theta, Croston) | `statsforecast` | `AutoARIMA`, `AutoETS`, `AutoTheta`, `CrostonSBA`, `TSB` |
| ML on engineered features | `mlforecast` | `MLForecast(LGBMRegressor)` |
| Deep learning (N-BEATS, N-HiTS, TFT, DeepAR) | `neuralforecast` | `NHITS`, `NBEATSx`, `TFT`, `DeepAR` |
| Foundation models (zero-shot) | `autogluon.timeseries`, `chronos-forecasting`, `uni2ts`, `timesfm` | `TimeSeriesPredictor(presets='chronos_large')` |
| BSTS | `orbit-ml`, `tfp.sts`, `pybuc` | `DLT`, `KTRLite` |
| Unified API + backtest utilities | `darts` | `ARIMA`, `NHiTSModel`, `RegressionModel` |
| Probabilistic DL (DeepAR family) | `gluonts` | `DeepAREstimator` |

---

## 4. References (selected)

- Makridakis, Spiliotis, Assimakopoulos (2020). *The M4 Competition: 100,000 time series and 61 forecasting methods.* IJF. [link](https://www.sciencedirect.com/science/article/pii/S0169207019301128)
- Makridakis, Spiliotis, Assimakopoulos (2022). *M5 accuracy competition: Results, findings, and conclusions.* IJF. [link](https://www.sciencedirect.com/science/article/pii/S0169207021001874)
- Oreshkin et al. (2019). *N-BEATS: Neural basis expansion analysis for interpretable time series forecasting.* [arXiv:1905.10437](https://arxiv.org/abs/1905.10437)
- Challu et al. (2022). *N-HiTS: Neural Hierarchical Interpolation for Time Series Forecasting.* [arXiv:2201.12886](https://arxiv.org/abs/2201.12886)
- Lim, Arık, Loeff, Pfister (2021). *Temporal Fusion Transformers for interpretable multi-horizon time series forecasting.* IJF. [link](https://www.sciencedirect.com/science/article/pii/S0169207021000637)
- Salinas et al. (2020). *DeepAR.* JMLR 21. [link](https://www.jmlr.org/papers/volume21/19-820/19-820.pdf)
- Triebe et al. (2021). *NeuralProphet: Explainable Forecasting at Scale.* [arXiv:2111.15397](https://arxiv.org/abs/2111.15397)
- Taylor & Letham (2017). *Forecasting at Scale (Prophet).* [PeerJ preprint](https://peerj.com/preprints/3190.pdf)
- Ansari et al. (2024-2025). *Chronos / Chronos-2.* [GitHub](https://github.com/amazon-science/chronos-forecasting), [AWS blog](https://aws.amazon.com/blogs/machine-learning/fast-and-accurate-zero-shot-forecasting-with-chronos-bolt-and-autogluon/)
- Manokhin (2022). *The Facebook Prophet Fiasco.* [link](https://valeman.medium.com/the-facebook-prophet-fiasco-a-cautionary-tale-of-data-science-hype-041384d6f119)
- Hyndman & Athanasopoulos. *Forecasting: Principles and Practice (3rd ed)* — chapters on TS cross-validation, accuracy metrics, distributional accuracy. [otexts.com/fpp3](https://otexts.com/fpp3/)
- Fiorucci & Louzada (2024). *Structural Theta method in M4.* IJF. [link](https://www.sciencedirect.com/science/article/pii/S0169207024000906)
- MDPI (2025). *Benchmarking Foundation Models for Time-Series Forecasting.* [link](https://www.mdpi.com/2813-0324/11/1/32)
- Decathlon Digital (2025). *The TSFM Showdown.* [link](https://medium.com/decathlondigital/the-tsfm-showdown-whos-winning-the-forecasting-battle-at-decathlon-e3ef17f3f247)
