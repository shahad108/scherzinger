---
name: forecasting-churn-sku-design
created: 2026-05-13T12:05:38Z
updated: 2026-05-13T12:05:38Z
status: approved
---

# Scherzinger forecasting + churn + SKU expansion — design

## Context

`notebooks/forecasting_market_scenarios.ipynb` currently produces:

- A single metric: `db2_margin`
- A single grain: `commodity_group` (9 groups)
- Monthly horizon only (12m), P50/P80/P95
- Market series fetched (FRED/EIA/ECB) + correlation map computed, but **not used as regressors**
- Validation: 2 of 3 eligible commodity groups beat the 8% MAPE gate (BKAIZ misses)

Underlying data has much more depth than the baseline uses:

- 4 years of monthly invoices: 5,565 rows × 967 customers × 1,221 articles × 9 commodity groups
- Top-10 customers = 33% of revenue (concentration risk)
- Quotes (4,539 rows) with `is_won` flag, completely unused
- Per-line cost decomposition (`hkvoll`, `material`, `fek`, `fv`) → revenue, quantity, margin all available

## Goals

Close five gaps in priority order:

1. **Multi-metric, multi-grain forecasts** — `revenue`, `quantity`, `db2_margin` × `commodity_group`, `business_unit`, top-50 customers, top-100 SKUs
2. **Quarterly view** — alongside monthly, on the same probabilistic basis
3. **Customer churn model** — per-customer probability of inactivity over 1Q / 2Q / 4Q, with at-risk revenue
4. **Quote-to-order conversion model + pipeline forecast** — expected booked revenue 1–2Q ahead from open quotes
5. **Macro regressors** — feed top-correlated market series into the forecaster as exogenous inputs

## Non-goals

- New external data sources (we use what is already cached)
- New heavy ML deps (lightgbm/prophet not installed; sklearn HistGradientBoosting + statsmodels are sufficient)
- Frontend integration (this lands in `notebooks/output/`; UI consumes outputs separately)
- Real-time scoring (batch only, regenerated when the notebook runs)

## Architecture

Single notebook (`forecasting_market_scenarios.ipynb`) refactored into composable functions, plus a thin module `notebooks/lib_forecast.py` for reusable code (so the notebook stays readable and functions are unit-testable).

### Module: `lib_forecast.py`

Pure functions, no global state:

- `aggregate_series(df, grain, metric, freq) -> pd.DataFrame` — collapse line-level invoices to `(key, ts, value)`
- `select_macro_regressors(corr_map, key, threshold=0.4, max_n=3) -> list[str]` — pick top exogenous series per internal series
- `fit_forecast(series, exog=None, horizon=12, freq='M') -> ForecastResult` — try ETS / SARIMAX-with-exog / seasonal-naive, return P50/P80/P95 + backtest MAPE
- `reconcile_hierarchy(forecasts, hierarchy) -> dict` — OLS bottom-up reconciliation so SKU forecasts sum to group forecasts
- `monthly_to_quarterly(forecast) -> ForecastResult` — sum the underlying sampled paths, recompute quantiles
- `build_churn_labels(invoices, quotes, as_of, horizon_q) -> pd.DataFrame` — per-customer churn label at each as-of date
- `build_churn_features(invoices, quotes, as_of) -> pd.DataFrame` — RFM + trend + quote signals + macro exposure
- `train_churn_model(X, y) -> sklearn estimator` — HistGradientBoostingClassifier with time-aware CV
- `train_quote_conversion_model(quotes) -> sklearn estimator` — predict `is_won` from quote attributes + macro context
- `pipeline_forecast(open_quotes, model) -> pd.DataFrame` — expected booked revenue by month/quarter

### Notebook flow (sections)

1. Load cleaned data + market series (unchanged)
2. Build internal time series (already exists — refactored to call `aggregate_series` over the new metric × grain matrix)
3. Compute correlation map (existing) + persist
4. Forecast loop: for each (metric, grain) → fit_forecast → reconcile → write artifacts
5. Customer churn model: labels + features + train + score current customers
6. Quote conversion: train + score open pipeline
7. Outputs: write parquet/JSON/CSV + extended validation report + summary HTML

## Data flow

```
invoices_clean.parquet ─┐
quotes_clean.parquet   ─┤
customers.parquet      ─┼─► aggregate_series ─► fit_forecast ─► reconcile ─► forecast_*.json/parquet
products.parquet       ─┘                            ▲
                                                     │
market_series.parquet ───► correlation_map ─► select_macro_regressors

invoices + quotes ──► build_churn_labels + build_churn_features ──► train_churn_model ──► churn_predictions.csv

quotes (historical) ──► train_quote_conversion_model ──► score open quotes ──► pipeline_forecast.csv
```

## Key design decisions

### Churn definition

A customer is **churned at month T** if both:

- No invoice in the trailing 6 months (industrial B2B has long re-order cycles; 3m would over-fire)
- No won quote in the trailing 3 months (rules out customers who are mid-deal)

Predict `P(churn within next 1Q / 2Q / 4Q)` separately so the user can see fast vs slow attrition.

### SKU strategy

1,221 SKUs is too many to forecast individually with confidence. We:

- Forecast **top-100 SKUs by revenue** directly (covers majority of volume)
- For the long tail: forecast at `commodity_group × business_unit` level, then **roll down proportionally** to recent SKU mix
- Reconcile so SKU forecasts always sum to commodity_group forecasts (MinT / OLS bottom-up)

### Quarterly forecasts

Built from the **monthly probabilistic samples**, not a separate model. We draw N=1000 sample paths from the monthly forecast quantiles (using a normal approximation around P50/P80), sum into quarters, and recompute quantiles. This preserves coherence: monthly and quarterly tell the same story.

### Macro regressors

For each internal series, pick up to 3 market series from the correlation map with `|r| ≥ 0.4`. Use SARIMAX with exogenous inputs when statsmodels can fit; fall back to ETS when it cannot. For the forecast horizon, market series are themselves forecast forward via random-walk-with-drift (current value held + small drift).

### Top-50 customers

Forecast top-50 by trailing-12-month revenue directly. Everyone else is bucketed into "other" by commodity_group. Hierarchical reconciliation ensures customer + other sums to commodity_group total.

## Outputs

Written to `notebooks/output/`:

| File | Content |
|---|---|
| `forecast_baseline.json` | (existing) commodity_group × db2_margin monthly |
| `forecast_revenue.json` | revenue forecasts × all grains, monthly |
| `forecast_quantity.json` | quantity forecasts × all grains, monthly |
| `forecast_margin.json` | db2_margin × all grains, monthly |
| `forecast_quarterly.json` | all metrics × all grains, quarterly (8q horizon) |
| `sku_forecasts.parquet` | per-SKU monthly + quarterly, top-100 + reconciled tail |
| `customer_forecasts.parquet` | per-customer top-50 + reconciled other |
| `churn_predictions.csv` | customer_id, name, p_churn_1q/2q/4q, at_risk_revenue, top_skus, signals |
| `quote_conversion_model.joblib` | fitted model for ad-hoc scoring |
| `pipeline_forecast.csv` | open quote → expected booked revenue × month/quarter |
| `validation_report.md` | extended: per-metric/per-grain MAPE table + churn AUC/PR + reconciliation residuals |
| `summary.html` | client-facing summary with charts |

## Validation gates

Pass conditions:

- **Forecast MAPE** ≤ 12% (relaxed from 8% because we span more grains; group-level still gated at 8%) on ≥ 60% of eligible series per metric
- **Churn model** AUC ≥ 0.70 on the latest holdout window
- **Reconciliation residuals** < 1% (SKU sums within 1% of group totals)
- **Quote conversion** Brier score ≤ that of base-rate predictor

A failed gate prints a warning but does not abort — partial outputs are still useful and the validation_report.md will surface what missed.

## Build sequence (commit per step)

1. Spec doc (this file)
2. Refactor: extract `lib_forecast.py`, parameterise forecaster, keep existing baseline outputs identical (regression-safe)
3. Add macro regressors
4. Add multi-metric × multi-grain forecasts (monthly)
5. Add quarterly via sample-path aggregation
6. Add hierarchical reconciliation + SKU forecasts
7. Add customer churn model
8. Add quote conversion + pipeline forecast
9. Outputs + extended validation report + summary HTML
10. Execute notebook end-to-end via nbconvert; verify outputs + gates

## Risks

- **Sparse SKUs**: most of the 1,121 long-tail SKUs have <6 invoice rows → no useful forecast. Mitigation: hierarchical roll-down only; do not over-promise per-SKU CIs for sparse series. The `sku_forecasts.parquet` includes a `forecast_method` column (`direct` vs `proportional`) so downstream UI can dim sparse ones.
- **Churn labels are right-censored**: customers active "now" might churn tomorrow. Mitigation: train on labels with full 6m of forward-looking visibility (i.e., cut training data 6m before now), score at present. Loses recency but produces honest labels.
- **Macro regressors leak future info if mishandled**: SARIMAX needs forecast values of exog. Mitigation: forecast exog separately first using random-walk-with-drift before passing into SARIMAX (no oracle).
- **Top-50 customer churn** swamps small-customer churn. Mitigation: report churn predictions in two segments (top vs tail) in the summary.

## Out of scope (explicit non-goals to defer)

- Survival analysis (would be cleaner than fixed-horizon classification, but is heavier and requires lifelines)
- Optuna/grid-search hyperparameter tuning (defaults are fine for a v1)
- LLM-generated narrative for the summary (the existing AI briefing system can consume these JSONs)
- Frontend wiring (separate task)
