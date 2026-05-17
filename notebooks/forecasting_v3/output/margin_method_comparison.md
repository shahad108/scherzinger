# Margin Method Comparison — Phase 4

## Background

Chen-Lewis-Yan (2020) recommend forecasting revenue and cost **separately**, 
then deriving the margin ratio:

> margin_t = (revenue_p50_t − cost_p50_t) / revenue_p50_t

vs. forecasting the margin ratio directly as a single time-series target. 
This is the bake-off: we ran both methods on the same 7-fold rolling-origin 
split (start_train=24, horizon=6, step=3) and compared MAE in margin 
percentage points (pp).

## Cost bake-off (Section 1)

Floor (SeasonalNaive MASE): 0.786. 
Target: MASE ≤ 0.668.

| Model | fold-mean MASE | fold-mean sMAPE | fold-mean RMSE |
|---|---:|---:|---:|
| Theta | 0.549 | 19.55 | 19674 |
| AutoETS | 0.568 | 19.85 | 20189 |
| LightGBM | 0.603 | 20.79 | 22729 |
| SeasonalNaive(12) | 0.786 | 29.58 | 28223 |
| SARIMAX+LASSO_exog | 1.200 | 41.19 | 41483 |

**Cost winner: LightGBM** (MASE = 0.603, 12-month sum = €1,064,423)

## Margin method bake-off (Section 2)

**Components method** (rev/cost separately, then derived):
- Revenue model (per-fold proxy): `Theta`
- Cost model: `LightGBM`
- OOS MAE = **2.861 pp**
- Per-fold MAE-pp = [3.789, 2.171, 2.006, 3.092, 2.853, 3.611, 2.505]

**Direct method** (bake-off on `margin_ratio`):
- Best model: `AutoETS` (MASE_cv = 0.563)
- OOS MAE = **1.287 pp**
- Per-fold MAE-pp = [1.326, 2.295, 1.555, 0.841, 0.989, 0.843, 1.16]

### Winner: **direct** (MAE = 1.287 pp)

### Final 12-month margin forecast

Built from the **reconciled** Phase 3 revenue forecast + cost winner forecast 
(if components) or the direct winner refit on the full margin_ratio history.

| Month | margin_p50 | as % |
|---|---:|---:|
| 2026-01-01 | 0.8472 | 84.72% |
| 2026-02-01 | 0.8472 | 84.72% |
| 2026-03-01 | 0.8472 | 84.72% |
| 2026-04-01 | 0.8472 | 84.72% |
| 2026-05-01 | 0.8472 | 84.72% |
| 2026-06-01 | 0.8472 | 84.72% |
| 2026-07-01 | 0.8472 | 84.72% |
| 2026-08-01 | 0.8472 | 84.72% |
| 2026-09-01 | 0.8472 | 84.72% |
| 2026-10-01 | 0.8472 | 84.72% |
| 2026-11-01 | 0.8472 | 84.72% |
| 2026-12-01 | 0.8472 | 84.72% |

Average: **0.8472** (84.72%)

## ⚠️ Margin definition discrepancy

Historical `margin_ratio` in `clean_monthly.parquet` ranges from 
**81.94% to 88.29%** 
(mean 84.72%). This is the **material-only** 
margin: `(revenue − material_cost) / revenue`, where material_cost is 
`Σ material_per_unit × quantity`.

The FE displays a **gross/DB2 margin of ~27%**, computed as 
`SUM(invoices.db2_total) / SUM(invoices.revenue)` in 
`backend/services/forecast/real_hero.py`. DB2 subtracts labor + overhead 
from gross revenue and is a different definition.

This forecast is for the material-margin column **as it exists in the 
data**. Phase 8 (FE wiring) must decide:

- **(a)** Adapt the FE to display the material-margin (~85%) transparently, OR
- **(b)** Define an overhead-adjusted (DB2) margin column in clean_monthly 
  and rerun this bake-off against that target, OR
- **(c)** Apply a fixed labor+overhead haircut (~55 pp) to convert 
  material-margin → DB2-margin at serve time.

As-is, our 2026 forecast (avg = 84.72%) is in line with the 
historical material-margin band, NOT the FE's gross-margin band.
