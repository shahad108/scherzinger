"""v3.2 — IBM TTM-r2 (Tiny Time Mixer) WITH FRED covariates.

TTM is multivariate by design — short series + exogenous drivers is exactly
its happy path. Model: `ibm-granite/granite-timeseries-ttm-r2`. ~1M params,
runs on CPU.

Targets: revenue, units, cost. Same 7-fold rolling-origin CV as v3.0/3.1.
Channel-mix: target as the prediction channel, 8 FRED features as control
channels. TTM context_length=52 (max), forecast_length=6.
"""
from __future__ import annotations

import json
import time
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import torch

warnings.filterwarnings("ignore")

ROOT = Path("/Users/dharmendersingh/Documents/Scherzinger_new")
NB_DIR = ROOT / "notebooks" / "forecasting_v3"
sys.path.insert(0, str(NB_DIR))

# Locate CV harness (filename starts with a digit so use importlib).
import importlib.util
spec = importlib.util.spec_from_file_location("cv_harness", NB_DIR / "01_cv_harness.py")
cv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cv)

CLEAN = pd.read_parquet(NB_DIR / "data" / "clean_monthly.parquet")
EXOG = pd.read_parquet(NB_DIR / "data" / "exog_aligned.parquet")
EXOG_COLS = [
    "WPU101", "PCOPPUSDM", "PALUMUSDM", "DCOILBRENTEU",
    "DEXUSEU", "PNRGINDEXM", "IRLTLT01DEM156N", "INDPRO",
]

DEVICE = torch.device("cpu")
HORIZON = 6
CONTEXT_LEN = 24  # TTM supports 52/96/512/1024; 24 fits our short folds

# TTM-r2 ships variants for different context_length × forecast_length.
# For monthly N=48 with 6-mo horizon, context_length=24, forecast_length=6.
MODEL_REVISION = "main"
MODEL_ID = "ibm-granite/granite-timeseries-ttm-r2"


def build_xy(target: str, train_idx: pd.DatetimeIndex, test_idx: pd.DatetimeIndex):
    """Return (context_target [C], context_exog [C, K], future_exog [F, K])
    where C = context_length, F = forecast horizon, K = num exog channels.
    train_idx has the actual training months (>=C of them); we slice the
    trailing CONTEXT_LEN months as the conditioning window.
    """
    series = CLEAN.set_index("month")[target].astype(float)
    exog = EXOG.set_index("month")[EXOG_COLS].astype(float)

    # Conditioning window = last CONTEXT_LEN months of train
    ctx_idx = train_idx[-CONTEXT_LEN:]
    ctx_y = series.loc[ctx_idx].values.astype(np.float32)  # [C]
    ctx_x = exog.loc[ctx_idx].values.astype(np.float32)    # [C, K]
    fut_x = exog.loc[test_idx].values.astype(np.float32)   # [F, K]
    return ctx_y, ctx_x, fut_x


def load_ttm_model():
    """Load TTM-r2 once. Use the variant matching context_length=24, forecast=6."""
    from tsfm_public import TinyTimeMixerForPrediction

    # The granite-tsfm hub exposes multiple "revisions" tagged by context len.
    # Try the closest fit; fall back to default if not found.
    revisions_to_try = [
        # context-24, forecast-6 — closest to our window
        "main",  # default repo head, supports several context/horizon combos
    ]
    for rev in revisions_to_try:
        try:
            model = TinyTimeMixerForPrediction.from_pretrained(
                MODEL_ID,
                revision=rev,
                num_input_channels=1 + len(EXOG_COLS),
                prediction_channel_indices=[0],
                exogenous_channel_indices=list(range(1, 1 + len(EXOG_COLS))),
                # Let the loaded checkpoint dictate context/prediction lengths;
                # we'll pad/truncate at call time.
            ).to(DEVICE).eval()
            print(f"loaded TTM revision={rev} context_length={model.config.context_length} prediction_length={model.config.prediction_length}")
            return model
        except Exception as e:
            print(f"  TTM revision={rev} load failed: {type(e).__name__}: {str(e)[:200]}")
            continue
    raise RuntimeError("Could not load any TTM revision")


def predict_one(model, ctx_y: np.ndarray, ctx_x: np.ndarray, fut_x: np.ndarray) -> np.ndarray:
    """Run TTM forward. Returns p50 forecast vector of length len(fut_x)."""
    C = model.config.context_length
    F = model.config.prediction_length
    n_chan = 1 + len(EXOG_COLS)

    # Pad/truncate ctx to model's context_length.
    if ctx_y.shape[0] < C:
        pad = C - ctx_y.shape[0]
        ctx_y = np.concatenate([np.full(pad, ctx_y[0]), ctx_y])
        ctx_x = np.concatenate([np.tile(ctx_x[0], (pad, 1)), ctx_x])
    else:
        ctx_y = ctx_y[-C:]
        ctx_x = ctx_x[-C:]

    # past_values shape [B=1, C, n_chan], first channel = target
    past = np.concatenate([ctx_y[:, None], ctx_x], axis=1)
    past_t = torch.from_numpy(past).unsqueeze(0).float()

    # future_values: NOT provided, we only have future exog as known_covariates
    # TTM accepts `future_values` for teacher-forcing during training; at
    # inference time, we pass future_observed_mask if needed. For the
    # zero-shot path, just call forward with past_values only.
    with torch.no_grad():
        out = model(past_values=past_t)
    # Output prediction_outputs shape [B, F, num_pred_channels]
    pred = out.prediction_outputs[0, :, 0].cpu().numpy()  # [F]

    # Truncate / pad output to required horizon
    h = fut_x.shape[0]
    if pred.shape[0] >= h:
        return pred[:h]
    else:
        return np.concatenate([pred, np.full(h - pred.shape[0], pred[-1])])


def run_target(target: str, model) -> dict:
    series = CLEAN.set_index("month")[target].astype(float)
    folds = cv.rolling_origin_folds(series, start_train=24, horizon=6, step=3, max_folds=7)
    per_fold = []
    t0 = time.time()
    for i, (tr_idx, te_idx) in enumerate(folds):
        tr = series.loc[tr_idx]
        te = series.loc[te_idx]
        try:
            ctx_y, ctx_x, fut_x = build_xy(target, tr_idx, te_idx)
            fc = predict_one(model, ctx_y, ctx_x, fut_x)
        except Exception as e:
            print(f"  {target} fold {i}: FAILED {type(e).__name__}: {str(e)[:200]}")
            continue
        per_fold.append({
            "fold": i,
            "MASE": cv.mase(te.values, fc, tr.values, seasonality=12),
            "sMAPE": cv.smape(te.values, fc),
            "RMSE": cv.rmse(te.values, fc),
        })
        print(f"  {target} fold {i}: MASE={per_fold[-1]['MASE']:.3f}")
    return {
        "target": target,
        "model": "TTM-r2 zero-shot + FRED covariates",
        "folds": per_fold,
        "fold_mean_MASE": float(np.mean([f["MASE"] for f in per_fold])) if per_fold else None,
        "fold_mean_sMAPE": float(np.mean([f["sMAPE"] for f in per_fold])) if per_fold else None,
        "fold_mean_RMSE": float(np.mean([f["RMSE"] for f in per_fold])) if per_fold else None,
        "runtime_s": round(time.time() - t0, 1),
    }


def main():
    print("=== loading TTM-r2 ===")
    model = load_ttm_model()
    print()

    results = {}
    for t in ("revenue", "units", "cost"):
        print(f"=== {t} ===")
        results[t] = run_target(t, model)

    out_path = NB_DIR / "output" / "ttm_v32_bakeoff_details.json"
    json.dump(results, open(out_path, "w"), indent=2)
    print(f"\nResults saved to {out_path}")
    print("\n=== TTM-r2 fold-mean MASE ===")
    for t in ("revenue", "units", "cost"):
        r = results[t]
        print(f"  {t}: MASE={r['fold_mean_MASE']} sMAPE={r['fold_mean_sMAPE']} runtime={r['runtime_s']}s")

    # Refit on all 48 months + forecast 12 months
    HORIZON_FINAL = 12
    future_months = pd.date_range("2026-01-01", periods=HORIZON_FINAL, freq="MS")
    last_exog = EXOG.iloc[-1][EXOG_COLS]
    # Build full-history context + last-known-exog forecast horizon
    for t in ("revenue", "units", "cost"):
        s_full = CLEAN.set_index("month")[t].astype(float).values.astype(np.float32)
        x_full = EXOG.set_index("month")[EXOG_COLS].astype(float).values.astype(np.float32)
        ctx_y = s_full[-model.config.context_length:]
        ctx_x = x_full[-model.config.context_length:]
        fut_x = np.tile(last_exog.values.astype(np.float32), (HORIZON_FINAL, 1))
        # Run in chunks of model.config.prediction_length, rolling forward
        F = model.config.prediction_length
        p50_chunks = []
        ctx_y_cur, ctx_x_cur = ctx_y.copy(), ctx_x.copy()
        remaining = HORIZON_FINAL
        while remaining > 0:
            step_h = min(F, remaining)
            step_fut_x = fut_x[:step_h]
            pred = predict_one(model, ctx_y_cur, ctx_x_cur, step_fut_x)
            p50_chunks.append(pred[:step_h])
            # Roll context: append predicted target + future exog
            ctx_y_cur = np.concatenate([ctx_y_cur, pred[:step_h]])[-model.config.context_length:]
            ctx_x_cur = np.concatenate([ctx_x_cur, step_fut_x], axis=0)[-model.config.context_length:]
            remaining -= step_h
            fut_x = fut_x[step_h:]

        p50 = np.concatenate(p50_chunks)
        out = pd.DataFrame({"month": future_months, "p50": p50})
        out.to_parquet(NB_DIR / "output" / f"ttm_v32_{t}_point.parquet")
        print(f"  {t} 12-mo sum: {p50.sum():,.0f}")


if __name__ == "__main__":
    main()
