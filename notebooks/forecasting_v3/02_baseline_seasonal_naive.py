"""
Phase 1 — SeasonalNaive(12) baseline across revenue / units / cost.

Establishes the floor every candidate must beat by >=15% MASE per the plan's
gate criteria. Writes per-fold rows to output/kpi_log.tsv and a JSON summary
to output/baseline_kpis.json.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

# Import the CV harness module by file path (its filename starts with a digit,
# which Python can't `import` directly).
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("cv_harness", HERE / "01_cv_harness.py")
cv_harness = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(cv_harness)  # type: ignore[union-attr]

from statsforecast import StatsForecast  # noqa: E402
from statsforecast.models import SeasonalNaive  # noqa: E402


# ---------------------------------------------------------------------------
DATA_PATH = HERE / "data" / "clean_monthly.parquet"
OUTPUT_DIR = HERE / "output"
KPI_LOG = OUTPUT_DIR / "kpi_log.tsv"
SUMMARY_JSON = OUTPUT_DIR / "baseline_kpis.json"

METRICS = ["revenue", "units", "cost"]
MODEL_NAME = "SeasonalNaive(12)"
HORIZON = 6
START_TRAIN = 24
STEP = 3
MAX_FOLDS = 7
SEASON_LENGTH = 12


def load_series() -> pd.DataFrame:
    df = pd.read_parquet(DATA_PATH)
    df["month"] = pd.to_datetime(df["month"])
    df = df.sort_values("month").set_index("month")
    return df


def fit_predict_seasonal_naive(train: pd.Series, horizon: int) -> np.ndarray:
    """Fit statsforecast's SeasonalNaive on the train series and forecast h steps."""
    sf_df = pd.DataFrame(
        {
            "unique_id": "series",
            "ds": train.index,
            "y": train.to_numpy(dtype=float),
        }
    )
    sf = StatsForecast(
        models=[SeasonalNaive(season_length=SEASON_LENGTH)],
        freq="MS",
        n_jobs=1,
    )
    sf.fit(sf_df)
    fcst = sf.predict(h=horizon)
    return fcst["SeasonalNaive"].to_numpy(dtype=float)


def run() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    # Wipe the log for a clean Phase-1 leaderboard. Later phases append.
    if KPI_LOG.exists():
        KPI_LOG.unlink()

    df = load_series()
    summary: dict = {
        "model": MODEL_NAME,
        "config": {
            "start_train": START_TRAIN,
            "horizon": HORIZON,
            "step": STEP,
            "max_folds": MAX_FOLDS,
            "season_length": SEASON_LENGTH,
        },
        "metrics": {},
    }

    rows: list[dict] = []
    t0 = time.time()
    for metric in METRICS:
        series = df[metric].astype(float)
        folds = cv_harness.rolling_origin_folds(
            series,
            start_train=START_TRAIN,
            horizon=HORIZON,
            step=STEP,
            max_folds=MAX_FOLDS,
        )
        per_fold = []
        for fi, (train_idx, test_idx) in enumerate(folds):
            train = series.loc[train_idx]
            test = series.loc[test_idx]
            yhat = fit_predict_seasonal_naive(train, horizon=HORIZON)
            row = cv_harness.kpi_row(
                model_name=MODEL_NAME,
                fold_idx=fi,
                metric=metric,
                actuals=test,
                point_forecast=yhat,
                train_series=train,
            )
            rows.append(row)
            per_fold.append(row)

        # Aggregate
        mase_mean = float(np.mean([r["MASE"] for r in per_fold]))
        smape_mean = float(np.mean([r["sMAPE"] for r in per_fold]))
        rmse_mean = float(np.mean([r["RMSE"] for r in per_fold]))
        summary["metrics"][metric] = {
            "folds": len(per_fold),
            "MASE_mean": mase_mean,
            "sMAPE_mean": smape_mean,
            "RMSE_mean": rmse_mean,
            "MASE_per_fold": [r["MASE"] for r in per_fold],
            "sMAPE_per_fold": [r["sMAPE"] for r in per_fold],
            "RMSE_per_fold": [r["RMSE"] for r in per_fold],
        }

    cv_harness.append_kpi_log(rows, path=str(KPI_LOG))
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2))

    elapsed = time.time() - t0

    # Leaderboard
    print("\n=== Phase 1 baseline leaderboard ===")
    print(f"{'model':<22} {'metric':<8} {'MASE':>8} {'sMAPE':>8} {'RMSE':>14}")
    print("-" * 64)
    for metric in METRICS:
        m = summary["metrics"][metric]
        print(
            f"{MODEL_NAME:<22} {metric:<8} "
            f"{m['MASE_mean']:>8.3f} {m['sMAPE_mean']:>8.2f} {m['RMSE_mean']:>14.2f}"
        )
    print("-" * 64)
    print(f"folds per metric: {MAX_FOLDS} | total rows in log: {len(rows)}")
    print(f"elapsed: {elapsed:.2f}s")
    print(f"kpi_log: {KPI_LOG}")
    print(f"summary: {SUMMARY_JSON}")


if __name__ == "__main__":
    run()
