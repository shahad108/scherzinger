"""v3.2 — Chronos-bolt-base WITH known FRED covariates, via AutoGluon.

Reuses the v3 CV harness on clean_monthly.parquet, but augments Chronos with
8 FRED exogenous features (steel WPU101, copper PCOPPUSDM, aluminum PALUMUSDM,
Brent DCOILBRENTEU, EUR/USD DEXUSEU, energy PNRGINDEXM, Bund 10Y
IRLTLT01DEM156N, US INDPRO) supplied to AutoGluon as known_covariates so
Chronos-bolt-base can condition on them.

Targets: revenue, units, cost. 7-fold rolling-origin CV (start_train=24,
horizon=6, step=3), identical to v3.0 / v3.1 so MASE is directly comparable.

After CV: refit on all 48 months + 12-month forecast (Jan-Dec 2026). For the
production forecast we hold each FRED at its last-known Dec-2025 value
(persistence) since true future FRED values are unknown.
"""
from __future__ import annotations

import importlib.util
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from autogluon.timeseries import TimeSeriesDataFrame, TimeSeriesPredictor


HERE = Path(__file__).resolve().parent
CLEAN_PATH = HERE / "data" / "clean_monthly.parquet"
EXOG_PATH = HERE / "data" / "exog_aligned.parquet"
OUTPUT_DIR = HERE / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Import the CV harness module by file path (filename starts with a digit).
SPEC = importlib.util.spec_from_file_location("cv_harness", HERE / "01_cv_harness.py")
cv_harness = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(cv_harness)  # type: ignore[union-attr]

rolling_origin_folds = cv_harness.rolling_origin_folds
mase = cv_harness.mase
smape = cv_harness.smape
rmse = cv_harness.rmse

EXOG_COLS = [
    "WPU101",
    "PCOPPUSDM",
    "PALUMUSDM",
    "DCOILBRENTEU",
    "DEXUSEU",
    "PNRGINDEXM",
    "IRLTLT01DEM156N",
    "INDPRO",
]
TARGETS = ("revenue", "units", "cost")
SEASON = 12
HORIZON_CV = 6
HORIZON_FCAST = 12
START_TRAIN = 24
STEP = 3
MAX_FOLDS = 7
TIME_LIMIT_S = 60

CLEAN = pd.read_parquet(CLEAN_PATH)
EXOG = pd.read_parquet(EXOG_PATH)


def build_long(target: str) -> pd.DataFrame:
    """Long-format frame: item_id, timestamp, target, <8 exog cols>."""
    df = CLEAN[["month", target]].rename(columns={"month": "timestamp", target: "target"})
    df = df.merge(
        EXOG[["month"] + EXOG_COLS].rename(columns={"month": "timestamp"}),
        on="timestamp",
    )
    df["item_id"] = "main"
    return df[["item_id", "timestamp", "target"] + EXOG_COLS]


def fit_predict(target: str, tr_idx: pd.DatetimeIndex, te_idx: pd.DatetimeIndex) -> np.ndarray:
    df_all = build_long(target)
    train_long = df_all[df_all["timestamp"].isin(tr_idx)]
    known_future = df_all[df_all["timestamp"].isin(te_idx)][["item_id", "timestamp"] + EXOG_COLS]

    train_ts = TimeSeriesDataFrame.from_data_frame(
        train_long, id_column="item_id", timestamp_column="timestamp"
    )
    known_ts = TimeSeriesDataFrame.from_data_frame(
        known_future, id_column="item_id", timestamp_column="timestamp"
    )

    predictor = TimeSeriesPredictor(
        prediction_length=len(te_idx),
        target="target",
        known_covariates_names=EXOG_COLS,
        eval_metric="MASE",
        verbosity=0,
    ).fit(
        train_ts,
        presets="bolt_base",
        time_limit=TIME_LIMIT_S,
    )
    preds = predictor.predict(train_ts, known_covariates=known_ts)
    # AutoGluon returns a DataFrame indexed by (item_id, timestamp). Median is the point forecast.
    if "0.5" in preds.columns:
        return preds["0.5"].values
    if "mean" in preds.columns:
        return preds["mean"].values
    # Fallback: first numeric column.
    return preds.iloc[:, 0].values


def run_target(target: str) -> dict:
    series = CLEAN.set_index("month")[target].astype(float)
    folds = rolling_origin_folds(
        series, start_train=START_TRAIN, horizon=HORIZON_CV, step=STEP, max_folds=MAX_FOLDS,
    )
    per_fold = []
    t0 = time.time()
    for i, (tr_idx, te_idx) in enumerate(folds):
        tr = series.loc[tr_idx]
        te = series.loc[te_idx]
        fc = fit_predict(target, tr_idx, te_idx)
        per_fold.append({
            "fold": i,
            "MASE": float(mase(te.values, fc, tr.values, seasonality=SEASON)),
            "sMAPE": float(smape(te.values, fc)),
            "RMSE": float(rmse(te.values, fc)),
        })
        print(f"  {target} fold {i}: MASE={per_fold[-1]['MASE']:.3f}  (cum {time.time()-t0:.0f}s)")
    return {
        "target": target,
        "model": "Chronos-bolt-base + FRED covariates (AutoGluon)",
        "model_id": "amazon/chronos-bolt-base via autogluon.timeseries",
        "covariates": EXOG_COLS,
        "config": {
            "start_train": START_TRAIN,
            "horizon": HORIZON_CV,
            "step": STEP,
            "max_folds": MAX_FOLDS,
            "season_length": SEASON,
            "time_limit_s": TIME_LIMIT_S,
        },
        "folds": per_fold,
        "fold_mean_MASE": float(np.mean([f["MASE"] for f in per_fold])),
        "fold_mean_sMAPE": float(np.mean([f["sMAPE"] for f in per_fold])),
        "fold_mean_RMSE": float(np.mean([f["RMSE"] for f in per_fold])),
        "runtime_s": round(time.time() - t0, 1),
    }


def refit_and_forecast(target: str) -> pd.DataFrame:
    df_all = build_long(target)
    train_ts = TimeSeriesDataFrame.from_data_frame(
        df_all, id_column="item_id", timestamp_column="timestamp"
    )
    future_months = pd.date_range("2026-01-01", periods=HORIZON_FCAST, freq="MS")
    last_exog = EXOG.iloc[-1][EXOG_COLS]
    future_df = pd.DataFrame({"item_id": "main", "timestamp": future_months})
    for c in EXOG_COLS:
        future_df[c] = float(last_exog[c])
    known_ts = TimeSeriesDataFrame.from_data_frame(
        future_df, id_column="item_id", timestamp_column="timestamp"
    )
    predictor = TimeSeriesPredictor(
        prediction_length=HORIZON_FCAST,
        target="target",
        known_covariates_names=EXOG_COLS,
        eval_metric="MASE",
        verbosity=0,
    ).fit(train_ts, presets="bolt_base", time_limit=TIME_LIMIT_S)
    preds = predictor.predict(train_ts, known_covariates=known_ts)
    if "0.5" in preds.columns:
        vals = preds["0.5"].values
    elif "mean" in preds.columns:
        vals = preds["mean"].values
    else:
        vals = preds.iloc[:, 0].values
    return pd.DataFrame({"month": future_months, "p50": vals})


def main() -> None:
    print(f"Loaded {len(CLEAN)} months: {CLEAN['month'].min().date()} .. {CLEAN['month'].max().date()}")
    print(f"Exog: {len(EXOG)} months, {len(EXOG_COLS)} features")

    results: dict[str, dict] = {}
    for t in TARGETS:
        print(f"\n--- CV: {t} ---")
        results[t] = run_target(t)

    with open(OUTPUT_DIR / "chronos_covariates_bakeoff_details.json", "w") as f:
        json.dump(results, f, indent=2)

    print("\n--- 12-month refit forecasts ---")
    forecasts: dict[str, pd.DataFrame] = {}
    for t in TARGETS:
        df = refit_and_forecast(t)
        forecasts[t] = df
        df.to_parquet(OUTPUT_DIR / f"chronos_v32_{t}_point.parquet")
        print(f"  {t}: sum={df['p50'].sum():,.0f}")

    print("\n=== v3.2 results (Chronos + FRED covariates) ===")
    for t in TARGETS:
        r = results[t]
        print(
            f"  {t:8s}: MASE={r['fold_mean_MASE']:.3f}  "
            f"sMAPE={r['fold_mean_sMAPE']:5.2f}  "
            f"RMSE={r['fold_mean_RMSE']:>10.0f}  ({r['runtime_s']}s)"
        )

    print("\n=== Monthly revenue p50 (v3.2) ===")
    for _, row in forecasts["revenue"].iterrows():
        print(f"  {row['month'].strftime('%Y-%m')}  {row['p50']:>14,.1f}")


if __name__ == "__main__":
    main()
