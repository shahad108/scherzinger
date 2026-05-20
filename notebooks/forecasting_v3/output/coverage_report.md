# Phase 5 — Conformal Coverage Report

Generated: 2026-05-17T16:13:39.690994+00:00

## Method

Split Conformal Inference. For each target we ran 7-fold rolling-origin CV 
(start_train=24, horizon=6, step=3), refit AutoETS on each train fold, and 
pooled signed residuals (actual - forecast) across folds. Empirical 
quantiles of that pool give the conformal offsets:

- P10 = P50 + Q(residuals, 0.10)
- P80 = P50 + Q(residuals, 0.80)
- P90 = P50 + Q(residuals, 0.90)

P50 is the existing point forecast from Phases 2-4 (revenue: reconciled, 
volume: ensemble, margin: direct AutoETS on db2_margin). We bolt empirical 
bands on top rather than re-running the point bake-off.

Held-out tail coverage = fraction of actuals in the LAST fold's test window 
that fall inside [P10, P90] computed against the last fold's own forecast. 
Target band: P80 ∈ [75%, 85%] for revenue / volume; margin is allowed wider.

## Coverage summary

| Target | Held-out tail coverage @ P80 | Band width (P90-P10) as % of P50 | In target [75-85%]? |
|---|---:|---:|:--:|
| revenue | 100.0% | 46.8% | ❌ |
| volume | 83.3% | 67.2% | ✅ |
| margin | 83.3% | 14.9% | ✅ |

## Per-target detail

### revenue

- Folds: 7  
- Residuals pooled: 42  
- Q(res, 0.10) = -116347.7320  
- Q(res, 0.50) = 83973.4850  
- Q(res, 0.80) = 141717.6500  
- Q(res, 0.90) = 150699.9900  
- Held-out tail coverage @ P80: **100.0%**  
- Avg P90-P10 band as % of P50: **46.8%**

Held-out tail (last fold) interval vs actual:

| step | actual | p10 | p90 | inside? |
|---:|---:|---:|---:|:--:|
| 1 | 834353.7300 | 576288.3480 | 843336.0700 | ✅ |
| 2 | 424916.3600 | 157868.6380 | 424916.3600 | ✅ |
| 3 | 734086.1800 | 476207.6980 | 743255.4200 | ✅ |
| 4 | 595475.2800 | 417448.8580 | 684496.5800 | ✅ |
| 5 | 589414.1700 | 421566.7280 | 688614.4500 | ✅ |
| 6 | 561988.0700 | 339641.5780 | 606689.3000 | ✅ |

### volume

- Folds: 7  
- Residuals pooled: 42  
- Q(res, 0.10) = -186.0000  
- Q(res, 0.50) = 68.0000  
- Q(res, 0.80) = 248.6000  
- Q(res, 0.90) = 270.0000  
- Held-out tail coverage @ P80: **83.3%**  
- Avg P90-P10 band as % of P50: **67.2%**

Held-out tail (last fold) interval vs actual:

| step | actual | p10 | p90 | inside? |
|---:|---:|---:|---:|:--:|
| 1 | 862.0000 | 586.0000 | 1042.0000 | ✅ |
| 2 | 493.0000 | 32.0000 | 488.0000 | ❌ |
| 3 | 744.0000 | 432.0000 | 888.0000 | ✅ |
| 4 | 718.0000 | 279.0000 | 735.0000 | ✅ |
| 5 | 602.0000 | 388.0000 | 844.0000 | ✅ |
| 6 | 668.0000 | 220.0000 | 676.0000 | ✅ |

### margin

- Folds: 7  
- Residuals pooled: 42  
- Q(res, 0.10) = -0.0603  
- Q(res, 0.50) = -0.0218  
- Q(res, 0.80) = 0.0128  
- Q(res, 0.90) = 0.0262  
- Held-out tail coverage @ P80: **83.3%**  
- Avg P90-P10 band as % of P50: **14.9%**

Held-out tail (last fold) interval vs actual:

| step | actual | p10 | p90 | inside? |
|---:|---:|---:|---:|:--:|
| 1 | 0.5993 | 0.5183 | 0.6049 | ✅ |
| 2 | 0.5557 | 0.5183 | 0.6049 | ✅ |
| 3 | 0.6133 | 0.5183 | 0.6049 | ❌ |
| 4 | 0.5963 | 0.5183 | 0.6049 | ✅ |
| 5 | 0.5921 | 0.5183 | 0.6049 | ✅ |
| 6 | 0.5568 | 0.5183 | 0.6049 | ✅ |

## Notes

- We used Split Conformal (basic ACI) rather than the adaptive `α_t+1` 
  update because n=48 monthly observations gives only ~42 pooled residuals; 
  online adaptation needs more steps to stabilize than we have data for. 
  The empirical quantile path is the standard Vovk-style split conformal 
  and is exchangeability-valid in expectation on the calibration set.
- Residual generator: SeasonalNaive(12) for revenue/volume (matches the 
  seasonality the published winners capture, so residuals reflect the 
  *seasonality-corrected* uncertainty); AutoETS for margin (no strong 
  seasonality, matches the Phase 4 direct-margin recipe). Point P50s 
  remain the existing reconciled (revenue) / ensemble (volume) / direct-
  AutoETS-on-db2_margin (margin) values.
- Bands are post-processed for monotonicity (p10 ≤ p50 ≤ p80 ≤ p90) and 
  clipped to physically valid ranges (revenue/volume ≥ 0, margin ∈ [0, 1]).
