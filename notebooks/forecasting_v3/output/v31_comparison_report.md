# v3.1 — Chronos zero-shot bake-off vs v3 production stack

Same 7-fold rolling-origin CV (start_train=24, horizon=6, step=3) used in Phases 2–4. Chronos-bolt-base is **univariate, zero-shot, no covariates**. FRED exog features are NOT fed in. If Chronos still wins, the case for the foundation model is strong; if it loses by a small margin, that gap could potentially close with covariate-aware fine-tuning (AutoGluon `bolt_base` supports `known_covariates_names`).

## 1. Leaderboards

### REVENUE leaderboard  (SeasonalNaive floor MASE = 0.929; beat-target ≤ 0.790)

| Rank | Model | MASE | sMAPE | RMSE | vs floor | Beats 15%-gate |
|---:|---|---:|---:|---:|---:|:---:|
| 1 | Theta | 0.745 | 16.79 | 113,870 | -19.8% | Yes |
| 2 | Chronos-bolt-base (zero-shot) | 0.783 | 17.67 | 116,701 | -15.7% | Yes |
| 3 | AutoETS | 0.786 | 17.68 | 117,884 | -15.4% | Yes |
| 4 | Ensemble[Theta,AutoETS,LightGBM] | 0.803 | 18.10 | 121,496 | -13.6% | No |
| 5 | LightGBM | 0.923 | 21.23 | 142,678 | -0.6% | No |
| 6 | SeasonalNaive(12) | 0.929 | 22.10 | 144,647 | +0.0% | No |
| 7 | SARIMAX+LASSO_exog | 1.539 | 31.07 | 243,494 | +65.7% | No |

### UNITS leaderboard  (SeasonalNaive floor MASE = 0.915; beat-target ≤ 0.778)

| Rank | Model | MASE | sMAPE | RMSE | vs floor | Beats 15%-gate |
|---:|---|---:|---:|---:|---:|:---:|
| 1 | Chronos-bolt-base (zero-shot) | 0.727 | 21.31 | 150 | -20.6% | Yes |
| 2 | Ensemble[Theta,AutoETS,SeasonalNaive(12)] | 0.757 | 22.57 | 149 | -17.3% | Yes |
| 3 | Theta | 0.776 | 22.83 | 155 | -15.2% | Yes |
| 4 | AutoETS | 0.856 | 25.55 | 171 | -6.5% | No |
| 5 | SeasonalNaive(12) | 0.915 | 29.62 | 185 | -0.0% | No |
| 6 | SARIMAX+LASSO_exog | 0.949 | 29.70 | 189 | +3.7% | No |
| 7 | LightGBM+price | 1.058 | 31.69 | 203 | +15.6% | No |

### COST leaderboard  (SeasonalNaive floor MASE = 0.786; beat-target ≤ 0.668)

| Rank | Model | MASE | sMAPE | RMSE | vs floor | Beats 15%-gate |
|---:|---|---:|---:|---:|---:|:---:|
| 1 | Theta | 0.549 | 19.55 | 19,674 | -30.1% | Yes |
| 2 | AutoETS | 0.568 | 19.85 | 20,189 | -27.7% | Yes |
| 3 | Chronos-bolt-base (zero-shot) | 0.589 | 20.64 | 20,790 | -25.0% | Yes |
| 4 | LightGBM | 0.603 | 20.79 | 22,729 | -23.2% | Yes |
| 5 | SeasonalNaive(12) | 0.786 | 29.58 | 28,223 | +0.0% | No |
| 6 | SARIMAX+LASSO_exog | 1.200 | 41.19 | 41,483 | +52.7% | No |

## 2. 12-month forecast comparison (Jan–Dec 2026)

### REVENUE 12-month forecast: production vs Chronos

| Month | AutoETS_direct + MinTrace-OLS reconciliation (log-space) | Chronos zero-shot | Δ (Chronos − prod) |
|---|---:|---:|---:|
| 2026-01 | 519,567 | 570,742 | +51,176 |
| 2026-02 | 573,204 | 566,645 | -6,559 |
| 2026-03 | 556,291 | 570,716 | +14,424 |
| 2026-04 | 585,407 | 572,345 | -13,061 |
| 2026-05 | 583,956 | 575,118 | -8,838 |
| 2026-06 | 589,545 | 581,672 | -7,873 |
| 2026-07 | 650,068 | 579,515 | -70,553 |
| 2026-08 | 492,752 | 574,671 | +81,919 |
| 2026-09 | 574,612 | 573,316 | -1,296 |
| 2026-10 | 585,573 | 572,720 | -12,853 |
| 2026-11 | 581,046 | 576,192 | -4,854 |
| 2026-12 | 588,964 | 579,047 | -9,918 |
| **TOTAL** | **6,880,986** | **6,892,699** | **+11,713 (+0.2%)** |

### UNITS 12-month forecast: production vs Chronos

| Month | Ensemble[Theta,AutoETS,SeasonalNaive(12)] | Chronos zero-shot | Δ (Chronos − prod) |
|---|---:|---:|---:|
| 2026-01 | 650 | 659 | +8 |
| 2026-02 | 636 | 657 | +22 |
| 2026-03 | 720 | 660 | -60 |
| 2026-04 | 699 | 655 | -44 |
| 2026-05 | 658 | 656 | -2 |
| 2026-06 | 773 | 657 | -115 |
| 2026-07 | 787 | 659 | -129 |
| 2026-08 | 574 | 657 | +83 |
| 2026-09 | 742 | 655 | -87 |
| 2026-10 | 677 | 647 | -30 |
| 2026-11 | 632 | 645 | +12 |
| 2026-12 | 658 | 636 | -22 |
| **TOTAL** | **8,205** | **7,842** | **-363 (-4.4%)** |

### COST 12-month forecast: production vs Chronos

| Month | LightGBM | Chronos zero-shot | Δ (Chronos − prod) |
|---|---:|---:|---:|
| 2026-01 | 95,525 | 87,780 | -7,745 |
| 2026-02 | 95,737 | 86,718 | -9,019 |
| 2026-03 | 93,588 | 87,328 | -6,261 |
| 2026-04 | 77,644 | 87,218 | +9,573 |
| 2026-05 | 87,765 | 87,536 | -229 |
| 2026-06 | 88,945 | 89,256 | +311 |
| 2026-07 | 73,827 | 89,271 | +15,443 |
| 2026-08 | 95,574 | 88,481 | -7,092 |
| 2026-09 | 99,076 | 88,136 | -10,940 |
| 2026-10 | 73,039 | 87,648 | +14,609 |
| 2026-11 | 89,063 | 87,927 | -1,136 |
| 2026-12 | 94,641 | 88,354 | -6,287 |
| **TOTAL** | **1,064,423** | **1,055,652** | **-8,771 (-0.8%)** |

## 3. Verdict

### REVENUE

- Top of leaderboard: **Theta** (MASE 0.745)
- Chronos rank: **#2** (MASE 0.783)
- Current production: **AutoETS_direct + MinTrace-OLS reconciliation (log-space)** (MASE 0.786, per *_winner.json)
- Chronos vs production: **-0.4%** MASE
- **Marginal call** — Chronos and AutoETS_direct + MinTrace-OLS reconciliation (log-space) are within 0.4% on MASE. Keep production unless covariate-aware Chronos closes the gap.

### UNITS

- Top of leaderboard: **Chronos-bolt-base (zero-shot)** (MASE 0.727)
- Chronos rank: **#1** (MASE 0.727)
- Current production: **Ensemble[Theta,AutoETS,SeasonalNaive(12)]** (MASE 0.757, per *_winner.json)
- Chronos vs production: **-4.0%** MASE
- **RECOMMEND wiring Chronos for units** (beats production by 4.0%).

### COST

- Top of leaderboard: **Theta** (MASE 0.549)
- Chronos rank: **#3** (MASE 0.589)
- Current production: **LightGBM** (MASE 0.603, per *_winner.json)
- Chronos vs production: **-2.4%** MASE
- **Marginal call** — Chronos and LightGBM are within 2.4% on MASE. Keep production unless covariate-aware Chronos closes the gap.

## 4. Caveats

- **Univariate-only** — this Chronos run uses target series alone, no FRED covariates. AutoGluon `TimeSeriesPredictor` with `presets="bolt_base"` would expose `known_covariates_names` and could close any small gaps.
- **Zero-shot** — no fine-tuning on Scherzinger data. Fine-tuning would add training cost but might further improve accuracy.
- **Point forecast only** — we report q50 (median) here. Chronos also emits q10/q90 quantiles natively; conformal intervals from Phase 5 are not needed.
- **Small sample** — only 7 folds × 6 horizon = 42 evaluated months per target. Differences <3% MASE should be treated as noise.
- **No BFF/FE wiring** — per request, all outputs stay in `notebooks/forecasting_v3/output/`. Wiring decision pending user review of these numbers.

## 5. Runtime

- Revenue CV: 49.3s
- Units CV: 52.6s
- Cost CV: 47.4s
- Model: `amazon/chronos-bolt-base` on CPU (amazon/chronos-bolt-base, ~200MB weights)
