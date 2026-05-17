"""v3.1 — Chronos-bolt-base zero-shot bake-off.

Reuses the existing CV harness (01_cv_harness.py) + clean_monthly +
exog_aligned. Adds Chronos-bolt-base zero-shot (univariate) on the target
series alone — no covariates, no fine-tuning. The pre-trained foundation
model carries the load.

Targets: revenue, units (volume), cost. For each, run 7-fold rolling-origin
CV (start_train=24, horizon=6, step=3) identical to Phase 2/3/4 — so the
fold-mean MASE numbers are directly comparable to the v3 leaderboard.

After CV: refit on all 48 months and produce a 12-month forecast (Jan-Dec
2026) for each target. No BFF/FE wiring — outputs are JSON/parquet/PNG only.
"""
from __future__ import annotations

import importlib.util
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from chronos import BaseChronosPipeline


# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
DATA_PATH = HERE / "data" / "clean_monthly.parquet"
OUTPUT_DIR = HERE / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Import the CV harness module by file path.
SPEC = importlib.util.spec_from_file_location("cv_harness", HERE / "01_cv_harness.py")
cv_harness = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(cv_harness)  # type: ignore[union-attr]

rolling_origin_folds = cv_harness.rolling_origin_folds
mase = cv_harness.mase
smape = cv_harness.smape
rmse = cv_harness.rmse

TARGETS = ("revenue", "units", "cost")
SEASON = 12
HORIZON_CV = 6
HORIZON_FCAST = 12
START_TRAIN = 24
STEP = 3
MAX_FOLDS = 7
MODEL_NAME = "Chronos-bolt-base (zero-shot)"
MODEL_ID = "amazon/chronos-bolt-base"

# Make Chronos deterministic across runs.
torch.manual_seed(0)
np.random.seed(0)


# ---------------------------------------------------------------------------
def load_pipeline():
    print(f"Loading {MODEL_ID} on CPU ...")
    t0 = time.time()
    pipe = BaseChronosPipeline.from_pretrained(
        MODEL_ID,
        device_map="cpu",
        torch_dtype=torch.float32,
    )
    print(f"  loaded in {time.time() - t0:.1f}s")
    return pipe


def chronos_forecast(pipe, train: pd.Series, horizon: int) -> np.ndarray:
    """Return Chronos median (q=0.5) point forecast for `horizon` steps."""
    ctx = torch.tensor(train.values, dtype=torch.float32)
    quantiles, _mean = pipe.predict_quantiles(
        inputs=ctx,
        prediction_length=horizon,
        quantile_levels=[0.1, 0.5, 0.9],
    )
    # quantiles shape: (batch=1, horizon, n_quantiles=3) -> take q50
    return quantiles[0, :, 1].cpu().numpy()


def run_cv_for_target(pipe, clean: pd.DataFrame, target: str) -> dict:
    series = clean.set_index("month")[target].astype(float)
    folds = rolling_origin_folds(
        series,
        start_train=START_TRAIN,
        horizon=HORIZON_CV,
        step=STEP,
        max_folds=MAX_FOLDS,
    )
    per_fold = []
    t0 = time.time()
    for i, (tr_idx, te_idx) in enumerate(folds):
        tr = series.loc[tr_idx]
        te = series.loc[te_idx]
        fc = chronos_forecast(pipe, tr, horizon=len(te))
        per_fold.append({
            "fold": i,
            "MASE": float(mase(te.values, fc, tr.values, seasonality=SEASON)),
            "sMAPE": float(smape(te.values, fc)),
            "RMSE": float(rmse(te.values, fc)),
        })
        print(f"  {target} fold {i}: MASE={per_fold[-1]['MASE']:.3f}")
    return {
        "target": target,
        "model": MODEL_NAME,
        "model_id": MODEL_ID,
        "config": {
            "start_train": START_TRAIN,
            "horizon": HORIZON_CV,
            "step": STEP,
            "max_folds": MAX_FOLDS,
            "season_length": SEASON,
        },
        "folds": per_fold,
        "fold_mean_MASE": float(np.mean([f["MASE"] for f in per_fold])),
        "fold_mean_sMAPE": float(np.mean([f["sMAPE"] for f in per_fold])),
        "fold_mean_RMSE": float(np.mean([f["RMSE"] for f in per_fold])),
        "runtime_s": round(time.time() - t0, 1),
    }


def fit_and_forecast(pipe, clean: pd.DataFrame, target: str) -> pd.DataFrame:
    series = clean.set_index("month")[target].astype(float)
    fc = chronos_forecast(pipe, series, horizon=HORIZON_FCAST)
    months = pd.date_range("2026-01-01", periods=HORIZON_FCAST, freq="MS")
    df = pd.DataFrame({"month": months, "p50": fc})
    return df


# ---------------------------------------------------------------------------
def main() -> None:
    clean = pd.read_parquet(DATA_PATH)
    print(f"Loaded {len(clean)} months: {clean['month'].min().date()} .. {clean['month'].max().date()}")

    pipe = load_pipeline()

    # CV across all targets
    results: dict[str, dict] = {}
    for t in TARGETS:
        print(f"\n--- CV: {t} ---")
        results[t] = run_cv_for_target(pipe, clean, t)

    with open(OUTPUT_DIR / "chronos_bakeoff_details.json", "w") as f:
        json.dump(results, f, indent=2)

    # 12-month refit forecasts
    print("\n--- 12-month forecasts (refit on all 48 months) ---")
    forecasts: dict[str, pd.DataFrame] = {}
    for t in TARGETS:
        df = fit_and_forecast(pipe, clean, t)
        forecasts[t] = df
        df.to_parquet(OUTPUT_DIR / f"chronos_v31_{t}_point.parquet")

    # Print summary.
    print("\n=== Chronos-bolt-base zero-shot bake-off ===")
    for t in TARGETS:
        r = results[t]
        print(
            f"  {t:8s}: MASE={r['fold_mean_MASE']:.3f}  "
            f"sMAPE={r['fold_mean_sMAPE']:5.2f}  "
            f"RMSE={r['fold_mean_RMSE']:>10.0f}  ({r['runtime_s']}s)"
        )
    print("\n=== 12-month forecast totals ===")
    for t in TARGETS:
        unit = "EUR" if t in ("revenue", "cost") else "units"
        print(f"  {t:8s}: sum={forecasts[t]['p50'].sum():,.0f} {unit}")

    print("\n=== Monthly revenue p50 ===")
    for _, row in forecasts["revenue"].iterrows():
        print(f"  {row['month'].strftime('%Y-%m')}  {row['p50']:>12,.1f}")


if __name__ == "__main__":
    main()
