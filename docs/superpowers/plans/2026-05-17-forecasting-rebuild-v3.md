---
name: forecasting-rebuild-v3
created: 2026-05-17T15:30:59Z
updated: 2026-05-17T15:30:59Z
owner: supervisor-agent
status: in-progress
---

# Forecasting Rebuild v3 — Phase-by-Phase Plan

## 0. Problem statement

The current revenue / margin / volume forecaster (a 4-step WMA over the last
months of invoice revenue) is producing **~€5.65M** for the next 12-month
window. The four most recent full years actually billed:

| Year | Revenue | Units | Material cost |
|------|---------|-------|---------------|
| 2022 | €6.37M  | 8,162 | €1.02M (15.9%) |
| 2023 | €6.23M  | 6,503 | €0.94M (15.0%) |
| 2024 | €6.26M  | 6,334 | €0.95M (15.2%) |
| 2025 | €7.37M  | 8,250 | €1.12M (15.2%) |

The model under-shoots by ~€1.3–1.7M because it inherits the **2026 billing
anomaly**: Jan/Feb/Mar 2026 each have 28–50 invoices (vs the ~120 historical
norm), April 2026 has **492 invoices in a single month** (3-month backlog dump
posted on one date), and May has 1 invoice. The WMA reads this artifact as
"new normal" and projects it forward.

This plan rebuilds the forecaster as a **supervised, multi-model, cross-
validated ensemble** that respects seasonality, leverages real exogenous
drivers (FRED commodities), produces calibrated prediction intervals, and is
**only** wired to the FE after a strict accuracy gate is passed.

## 1. Research dossier (DONE — inputs to this plan)

Two parallel deep-research agents produced:

- `docs/superpowers/specs/2026-05-17-forecasting-research-dossier.md` —
  broad survey (SARIMAX, ETS, Theta, LightGBM, Prophet, Orbit, N-BEATS,
  N-HiTS, TFT, DeepAR, NeuralProphet, Chronos-2, TimesFM, TimeGPT, Moirai).
  **Top pick:** ensemble of SARIMAX-with-FRED, Chronos-2 zero-shot, Orbit DLT.
- `docs/superpowers/specs/2026-05-17-forecasting-research-foundation-models.md`
  — foundation-model focus. **Top pick for local CPU + exog:** TTM (IBM,
  arXiv 2401.03955) + Chronos-2 + ARIMAX, MinT-shrink for revenue=price×vol,
  ACI for P80 bands.

**Synthesis adopted by this plan:**

- Single base learners are unreliable at N≈48. **Ensemble is mandatory.**
- Diversity beats sophistication: pair an econometric backbone (SARIMAX)
  with a global pre-trained model (Chronos-bolt-base) and a robust
  statistical model (Theta / ETS). LightGBM is included as a sanity check.
- Forecast revenue **components** (price × volume) and total cost
  **separately**; derive margin = (rev − cost) / rev. Don't forecast the
  margin ratio directly.
- Calibrate intervals with **ACI** (Zaffran 2022), not Gaussian residuals.
- Use **rolling-origin CV** over the clean 2022-01 → 2025-12 window
  (48 months). Held-out tail = last 6 months.

## 2. Architecture

```
notebooks/forecasting_v3/
├── data/
│   ├── clean_monthly.parquet          # rev, units, cost, avg_price by month
│   ├── exog_aligned.parquet           # FRED features at monthly cadence
│   └── anomaly_report.md              # which months excluded + why
├── 00_data_audit.ipynb                # detect/repair anomalies
├── 01_cv_harness.py                   # importable: rolling_origin_cv, kpis
├── 02_baseline_seasonal_naive.ipynb   # baseline numbers
├── 03_revenue_bakeoff.ipynb           # 6 models + ensemble + leaderboard
├── 04_volume_and_reconciliation.ipynb # MinT vs direct
├── 05_margin_components.ipynb         # rev + cost → margin
├── 06_conformal_intervals.ipynb       # ACI on winning models
├── 07_supervisor_report.md            # gate decision
└── output/
    ├── forecast_v3_revenue.parquet    # P10/P50/P80/P90 × 12 months
    ├── forecast_v3_volume.parquet
    ├── forecast_v3_margin.parquet
    └── model_card.md                  # winners + metadata
```

Production wiring lives in `backend/services/forecast/v3_loader.py` (new),
called from `real_hero.py` instead of the WMA block.

## 3. Models in the bake-off

For each metric (revenue / volume / cost), CV every candidate over 7
rolling-origin folds:

| # | Model | Library | Role |
|---|-------|---------|------|
| 1 | SeasonalNaive (y_{t} = y_{t-12}) | statsforecast | Floor — anything worse is fired |
| 2 | ETS auto | statsforecast | Robust Holt-Winters baseline |
| 3 | Theta | statsforecast | M4 winner on monthly data |
| 4 | SARIMAX + LASSO-selected FRED | statsmodels + sklearn | Econometric backbone with exog |
| 5 | LightGBM (lag + calendar + exog) | mlforecast | Tree-based feature model |
| 6 | Chronos-bolt-base zero-shot + future_covariates | autogluon-timeseries | Foundation-model prior |
| 7 | Equal-weighted ensemble of top-3 by MASE | — | Final candidate |

FRED features (lagged 0/1/3/6 months, plus 12m delta): WPU101, PCOPPUSDM,
PALUMUSDM, DCOILBRENTEU, DEXUSEU, PNRGINDEXM, IRLTLT01DEM156N, INDPRO.

## 4. KPI suite

Primary: **MASE** (Mean Absolute Scaled Error) — scale-free, comparable
across metrics. Reported per fold + mean across folds.

Secondary: sMAPE, RMSE, MAE.

Probabilistic: pinball loss at P10/P50/P90, **Coverage@P80** (% actuals
inside [P10, P90]), Winkler score.

## 5. Strict supervisor gate

A dedicated **"professor" supervisor agent** (separate Agent subagent) runs
after each phase. It refuses to advance the plan unless:

| Phase | Gate condition |
|-------|----------------|
| 0 | Anomaly report names every excluded month with a reason backed by invoice-count or unit-count z-score > 2.5 |
| 2 | Revenue winner MASE ≤ 0.85 × SeasonalNaive MASE on the held-out tail |
| 3 | Volume winner MASE ≤ 0.85 × SeasonalNaive MASE, AND reconciled rev forecast within 5% of direct rev forecast |
| 4 | Margin point forecast within ±2pp of actual margin on held-out tail |
| 5 | Coverage@P80 ∈ [75%, 85%] on held-out tail |
| 7 | `real_hero.py` returns numbers within 1% of notebook output for the same inputs |
| 8 | Playwright screenshots show: revenue 12mo ∈ [€6.5M, €7.7M], margin ∈ [22%, 32%], volume ∈ [6.0K, 8.5K units] |

If any gate fails, the supervisor writes the reason to
`07_supervisor_report.md` and the plan does NOT proceed to FE wiring. The
WMA fallback stays live until the gate is cleared.

## 6. Phase list

The implementation is the 9 Phase-0 → Phase-8 tasks already created in the
session task list (IDs 42–50). Each phase corresponds to one task. The
supervisor gate after each phase is built into the gating table above —
phases are not "complete" until their gate passes.

### Phase 0 — Data sanitization
Build `00_data_audit.ipynb`. Mask 2026-01..2026-05 from training (April
backlog dump invalidates Q1+Apr; May has 1 day). Persist clean window
2022-01 → 2025-12 (48 months) to `data/clean_monthly.parquet`. Write
`anomaly_report.md`.

### Phase 1 — CV harness
`01_cv_harness.py` (importable). Functions: `rolling_origin_folds(series,
n_folds=7, horizon=6, start_train=24)`, `kpi_table(actuals, forecasts)`.
Run `02_baseline_seasonal_naive.ipynb` to establish floor MASE for each
metric.

### Phase 2 — Revenue bake-off
`03_revenue_bakeoff.ipynb`. All 7 candidates. Leaderboard. Supervisor
picks winner (or ensemble) based on gate. Save winner config to
`output/model_card.md`.

### Phase 3 — Volume + reconciliation
`04_volume_and_reconciliation.ipynb`. Same 7 candidates for monthly units.
Then forecast avg_price separately and compute reconciled revenue = price
× volume. Use MinT-shrink via hierarchicalforecast to coherently combine
with direct revenue forecast. Pick the lower-MASE coherent path.

### Phase 4 — Margin (component method)
`05_margin_components.ipynb`. Forecast revenue (from Phase 2) and
total_cost (Σ material_per_unit × quantity) separately. Margin =
(revenue_forecast − cost_forecast) / revenue_forecast. Compare vs naive
direct-margin forecast on held-out tail.

### Phase 5 — Conformal intervals
`06_conformal_intervals.ipynb`. Wrap winning point forecasters with ACI.
Verify Coverage@P80 on held-out tail. Output P10/P50/P80/P90 series.

### Phase 6 — Supervisor gate
Run the full gating table. Write `07_supervisor_report.md`. Pass or fail.

### Phase 7 — Productionize
Persist forecast cache (12-month horizon) to
`notebooks/output/forecast_v3_{revenue,volume,margin}.parquet`. Build
`backend/services/forecast/v3_loader.py` — thin loader that reads the
parquet and returns the v2.2 hero contract. Wire into `real_hero.py`
behind a feature flag (`FORECAST_V3=1` env). Tests assert numbers within
1% of notebook.

### Phase 8 — FE wire + visual verification
Update FE methodology chip to read "ensemble (SARIMAX + Chronos +
ETS/Theta) · ACI bands · trained on N=48mo · last refresh {ts}". Playwright
all 3 hero tabs. Commit per `feedback_phase_commits` rule. Do not push.

## 7. Stretch / out of scope

Out of scope for this plan (parked):
- Hierarchical SKU-level forecasting (already a separate file
  `sku_forecasts.parquet`).
- Online learning / model retraining schedule (handled by notebook
  refresh cron).
- TFT / N-HiTS deep learning — disqualified by N=48.

## 8. Execution rules

- **One implementation subagent per phase.** Fresh context. Cheap model
  for mechanical tasks, capable model for design/review.
- **Supervisor subagent reviews after each phase** with the gate table.
- **Notebook execution by jupytext-paired .py scripts** so subagents can
  run + edit deterministically. Each notebook saves outputs to
  `output/` and a one-line KPI summary appended to `output/kpi_log.tsv`.
- **No FE wire-up before Phase 6 passes.** WMA stays live behind the
  flag until then.
- **Commit per phase** (feedback_phase_commits rule). No push.
