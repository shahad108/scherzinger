"""Explicit 2025 walk-forward backtest.

Train every candidate model on 2022-01 → 2024-12 (36 months) and forecast
Jan–Dec 2025 (12-month horizon). Compare each model's predicted 2025
totals against the actual 2025 invoiced numbers.

This is the "trust me" table — one out-of-sample year, no leakage.
"""
from __future__ import annotations

import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

ROOT = Path("/Users/dharmendersingh/Documents/Scherzinger_new")
NB_DIR = ROOT / "notebooks" / "forecasting_v3"
sys.path.insert(0, str(NB_DIR))

import importlib.util
spec = importlib.util.spec_from_file_location("cv_harness", NB_DIR / "01_cv_harness.py")
cv = importlib.util.module_from_spec(spec); spec.loader.exec_module(cv)

CLEAN = pd.read_parquet(NB_DIR / "data" / "clean_monthly.parquet")
EXOG = pd.read_parquet(NB_DIR / "data" / "exog_aligned.parquet")

EXOG_COLS = ["WPU101","PCOPPUSDM","PALUMUSDM","DCOILBRENTEU",
             "DEXUSEU","PNRGINDEXM","IRLTLT01DEM156N","INDPRO"]

TRAIN_END = pd.Timestamp("2024-12-01")
TEST_START = pd.Timestamp("2025-01-01")
TEST_END = pd.Timestamp("2025-12-01")
H = 12  # one calendar year

train_mask = CLEAN["month"] <= TRAIN_END
test_mask = (CLEAN["month"] >= TEST_START) & (CLEAN["month"] <= TEST_END)
train_df = CLEAN[train_mask].copy()
test_df = CLEAN[test_mask].copy()
exog_train = EXOG[EXOG["month"] <= TRAIN_END].copy()
exog_test = EXOG[(EXOG["month"] >= TEST_START) & (EXOG["month"] <= TEST_END)].copy()
print(f"train: {len(train_df)} months ({train_df['month'].min().date()} → {train_df['month'].max().date()})")
print(f"test : {len(test_df)} months ({test_df['month'].min().date()} → {test_df['month'].max().date()})")

results = {}  # {target: {model: {p50: [...], sum: float, pct_error: float, monthly_err: [...]}}}


def add_result(target: str, model: str, p50: np.ndarray):
    actual = test_df[target].values
    pred_sum = float(p50.sum())
    actual_sum = float(actual.sum())
    pct_err = (pred_sum - actual_sum) / actual_sum * 100
    mape = float(np.mean(np.abs((p50 - actual) / actual)) * 100)
    results.setdefault(target, {})[model] = {
        "p50": p50.tolist(),
        "pred_sum": pred_sum,
        "actual_sum": actual_sum,
        "pct_error": pct_err,
        "mape_pct": mape,
        "rmse": float(np.sqrt(np.mean((p50 - actual) ** 2))),
    }


# -------------------------------------------------------------------------
# 1. SeasonalNaive
# -------------------------------------------------------------------------
from statsforecast import StatsForecast
from statsforecast.models import SeasonalNaive, AutoETS, Theta

def fit_sf_model(model_cls, target: str, **kwargs) -> np.ndarray:
    df = train_df[["month", target]].rename(columns={"month": "ds", target: "y"})
    df["unique_id"] = "main"
    sf = StatsForecast(models=[model_cls(**kwargs)], freq="MS", n_jobs=1)
    sf.fit(df)
    fc = sf.predict(h=H)
    col = [c for c in fc.columns if c not in ("unique_id", "ds")][0]
    return fc[col].values

for target in ("revenue", "units", "cost"):
    print(f"\n=== {target} ===")
    actual = test_df[target].values
    print(f"  Actual 2025: total={actual.sum():,.0f}")

    print("  SeasonalNaive...")
    add_result(target, "SeasonalNaive(12)", fit_sf_model(SeasonalNaive, target, season_length=12))

    print("  AutoETS...")
    add_result(target, "AutoETS", fit_sf_model(AutoETS, target, season_length=12, model="ZZA"))

    print("  Theta...")
    add_result(target, "Theta", fit_sf_model(Theta, target, season_length=12))

# -------------------------------------------------------------------------
# 2. LightGBM via mlforecast
# -------------------------------------------------------------------------
from mlforecast import MLForecast
from lightgbm import LGBMRegressor

for target in ("revenue", "units", "cost"):
    print(f"  LightGBM {target}...")
    df = train_df[["month", target]].copy()
    df["unique_id"] = "main"
    df = df.rename(columns={"month": "ds", target: "y"})
    df = df.merge(exog_train.rename(columns={"month": "ds"}), on="ds")
    fc_exog = exog_test.rename(columns={"month": "ds"}).copy()
    fc_exog["unique_id"] = "main"

    mlf = MLForecast(
        models={"lgbm": LGBMRegressor(num_leaves=15, n_estimators=200, learning_rate=0.05,
                                       max_depth=4, min_data_in_leaf=3, verbose=-1)},
        freq="MS",
        lags=[1, 2, 3, 6, 12],
        date_features=["month", "year"],
    )
    mlf.fit(df, static_features=[])
    fc = mlf.predict(h=H, X_df=fc_exog)
    add_result(target, "LightGBM", fc["lgbm"].clip(lower=0).values)

# -------------------------------------------------------------------------
# 3. AutoETS + MinT reconciled (production revenue path)
# -------------------------------------------------------------------------
print("\n  AutoETS + MinT-OLS reconciled (revenue path)...")
# Forecast volume and avg_price separately, multiply, reconcile with direct revenue
def fit_ets(target: str) -> np.ndarray:
    return fit_sf_model(AutoETS, target, season_length=12, model="ZZA")

vol = fit_ets("units")
# avg_price isn't in clean_monthly directly — compute on the fly
train_df["avg_price"] = train_df["revenue"] / train_df["units"]
ap_series = train_df["avg_price"].values
ap_df = pd.DataFrame({"ds": train_df["month"], "y": ap_series, "unique_id": "main"})
sf = StatsForecast(models=[AutoETS(season_length=12, model="ZZA")], freq="MS", n_jobs=1)
sf.fit(ap_df)
fc_ap = sf.predict(h=H)
ap_fc = fc_ap[[c for c in fc_ap.columns if c not in ("unique_id", "ds")][0]].values
rev_direct = fit_ets("revenue")
# MinT-OLS in log space — same recipe as Phase 3
log_rev = np.log(rev_direct.clip(min=1))
log_vol = np.log(vol.clip(min=1))
log_ap = np.log(ap_fc.clip(min=1))
# S matrix: [[1,1],[1,0],[0,1]] (top = vol + ap, then bottom rows)
S = np.array([[1, 1], [1, 0], [0, 1]])
y_hat = np.stack([log_rev, log_vol, log_ap], axis=0)  # [3, H]
# OLS reconciliation: P = (S' S)^-1 S'
W = np.eye(3)
G = np.linalg.inv(S.T @ np.linalg.inv(W) @ S) @ S.T @ np.linalg.inv(W)
b_recon = G @ y_hat  # [2, H]
log_recon_rev = (S[0] @ b_recon)  # = b[0] + b[1]
recon_rev = np.exp(log_recon_rev)
add_result("revenue", "AutoETS+MinT-OLS (v3 prod)", recon_rev)

# -------------------------------------------------------------------------
# 4. Ensemble[Theta, AutoETS, SeasonalNaive] — production volume path
# -------------------------------------------------------------------------
print("  Ensemble (volume prod)...")
for target in ("revenue", "units", "cost"):
    fc_theta = fit_sf_model(Theta, target, season_length=12)
    fc_ets = fit_sf_model(AutoETS, target, season_length=12, model="ZZA")
    fc_sn = fit_sf_model(SeasonalNaive, target, season_length=12)
    ens = (fc_theta + fc_ets + fc_sn) / 3
    add_result(target, "Ensemble[Theta,ETS,SN]", ens)

# -------------------------------------------------------------------------
# 5. Chronos-bolt-base zero-shot (univariate)
# -------------------------------------------------------------------------
import torch
from chronos import BaseChronosPipeline

print("\n  Chronos-bolt-base (univariate)...", flush=True)
try:
    pipe = BaseChronosPipeline.from_pretrained(
        "amazon/chronos-bolt-base", device_map="cpu", dtype=torch.float32
    )
    print("    Chronos loaded; calling predict_quantiles...", flush=True)
    for target in ("revenue", "units", "cost"):
        s = train_df[target].values.astype(np.float32)
        ctx = torch.tensor(s).unsqueeze(0)
        print(f"    Chronos predicting {target}...", flush=True)
        t0 = time.time()
        quantiles, mean = pipe.predict_quantiles(
            inputs=ctx, prediction_length=H, quantile_levels=[0.1, 0.5, 0.9]
        )
        p50 = quantiles[0, :, 1].cpu().numpy()
        print(f"    Chronos {target} done in {time.time()-t0:.1f}s, sum={p50.sum():.0f}", flush=True)
        add_result(target, "Chronos-bolt (univariate)", p50)
except Exception as e:
    print(f"    Chronos FAILED: {type(e).__name__}: {e}", flush=True)

# -------------------------------------------------------------------------
# 6. TTM-r2 zero-shot (multivariate w/ FRED)
# -------------------------------------------------------------------------
print("\n  TTM-r2 (multivariate)...", flush=True)
try:
    from tsfm_public import TinyTimeMixerForPrediction
    ttm = TinyTimeMixerForPrediction.from_pretrained(
        "ibm-granite/granite-timeseries-ttm-r2",
        num_input_channels=1 + len(EXOG_COLS),
        prediction_channel_indices=[0],
        exogenous_channel_indices=list(range(1, 1 + len(EXOG_COLS))),
    ).to("cpu").eval()
    C = ttm.config.context_length
    F = ttm.config.prediction_length
    print(f"    TTM loaded; context={C}, horizon={F}", flush=True)

    def ttm_forecast(target_col: str) -> np.ndarray:
        s = train_df[target_col].values.astype(np.float32)
        x = exog_train[EXOG_COLS].values.astype(np.float32)
        if s.shape[0] < C:
            pad = C - s.shape[0]
            s = np.concatenate([np.full(pad, s[0], dtype=np.float32), s])
            x = np.concatenate([np.tile(x[0], (pad, 1)), x])
        else:
            s = s[-C:]; x = x[-C:]
        p50_chunks = []
        s_cur, x_cur = s.copy(), x.copy()
        fut_x_full = exog_test[EXOG_COLS].values.astype(np.float32)
        remaining = H; offset = 0
        while remaining > 0:
            step_h = min(F, remaining)
            with torch.no_grad():
                out = ttm(past_values=torch.from_numpy(np.concatenate([s_cur[:, None], x_cur], axis=1)).unsqueeze(0).float())
            pred = out.prediction_outputs[0, :, 0].cpu().numpy()[:step_h]
            p50_chunks.append(pred)
            new_x_block = fut_x_full[offset:offset+step_h]
            s_cur = np.concatenate([s_cur, pred])[-C:]
            x_cur = np.concatenate([x_cur, new_x_block], axis=0)[-C:]
            offset += step_h
            remaining -= step_h
        return np.concatenate(p50_chunks)

    for target in ("revenue", "units", "cost"):
        t0 = time.time()
        pred = ttm_forecast(target)
        print(f"    TTM {target} done in {time.time()-t0:.1f}s, sum={pred.sum():.0f}", flush=True)
        add_result(target, "TTM-r2 (multivariate)", pred)
except Exception as e:
    print(f"    TTM FAILED: {type(e).__name__}: {e}", flush=True)

# -------------------------------------------------------------------------
# Output
# -------------------------------------------------------------------------
out_path = NB_DIR / "output" / "backtest_2025_results.json"
json.dump(results, open(out_path, "w"), indent=2)
print(f"\nResults → {out_path}")

print("\n" + "=" * 100)
print(" 2025 WALK-FORWARD BACKTEST  (train 2022-2024, predict Jan-Dec 2025)")
print("=" * 100)

for target in ("revenue", "units", "cost"):
    actual_sum = test_df[target].sum()
    label_unit = "€" if target in ("revenue", "cost") else " u"
    print(f"\n── {target.upper()} ──  Actual 2025 = {actual_sum:>13,.0f}{label_unit}")
    rows = []
    for model, res in results[target].items():
        rows.append((model, res["pred_sum"], res["pct_error"], res["mape_pct"]))
    rows.sort(key=lambda r: abs(r[2]))  # sort by abs % error on annual total
    print(f"  {'Model':<35} {'Predicted':>15} {'% off total':>13} {'monthly MAPE':>14}")
    print(f"  {'-'*35} {'-'*15} {'-'*13} {'-'*14}")
    for m, ps, pct, mape in rows:
        sign = "+" if pct >= 0 else ""
        print(f"  {m:<35} {ps:>15,.0f} {sign}{pct:>11.1f}% {mape:>13.1f}%")
