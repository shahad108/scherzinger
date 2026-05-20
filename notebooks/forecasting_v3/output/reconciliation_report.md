# Reconciliation Report — Phase 3

## Volume bake-off (target = `units`)
- Winner: **Ensemble[Theta,AutoETS,SeasonalNaive(12)]** (fold-mean MASE = 0.757; floor = 0.915, target ≤ 0.778)
- Beats target: **YES**
- 12-month volume sum: **8,205 units** (historical 2022-2025 range: [6,300; 8,500])

### Volume leaderboard

| model | fold-mean MASE | sMAPE | RMSE |
|---|---:|---:|---:|
| vol::Ensemble[Theta,AutoETS,SeasonalNaive(12)] | 0.757 | 22.57 | 149 |
| vol::Theta | 0.776 | 22.83 | 155 |
| vol::AutoETS | 0.856 | 25.55 | 171 |
| vol::SeasonalNaive(12) | 0.915 | 29.62 | 185 |
| vol::SARIMAX+LASSO_exog | 0.949 | 29.70 | 189 |
| vol::LightGBM+price | 1.058 | 31.69 | 203 |

## Avg-price forecast
- Model: AutoETS (model=ZZA, season_length=12) — same class as revenue per supervisor.
- 12-month avg-price mean: **884.89**
- Historical range: [599.64, 1398.71]

## Direct vs reconciled revenue

Reconciliation: hierarchicalforecast `MinTrace(method='ols')` applied in **log space** so that `log_revenue = log_volume + log_avg_price` is an additive identity. S = [[1,1],[1,0],[0,1]]. OLS chosen over `mint_shrink` because shrinkage requires insample base-forecasts for every series at every fold (computationally heavy on this 48-month panel) and OLS is well-conditioned with only 2 bottom-level series.

| path | fold-mean MASE on revenue |
|---|---:|
| Direct (Phase-2 AutoETS ZZA) | 0.8741 |
| Reconciled (price × volume + MinT) | 0.8535 |

**Winner: Reconciled (price * volume + MinTrace-OLS in log space)**.

- Final 12-month revenue sum: **EUR 6,880,986**.

- `forecast_v3_revenue_point.parquet` has been overwritten with the reconciled revenue path.