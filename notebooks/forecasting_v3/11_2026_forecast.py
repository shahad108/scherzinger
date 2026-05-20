"""2026 forecast — train on full 48 months (2022-01 → 2025-12), predict Jan-Dec 2026.

Shows revenue / units / cost / margin per model, monthly + totals.
"""
from __future__ import annotations
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import json, sys, time, warnings
from pathlib import Path
import numpy as np
import pandas as pd
warnings.filterwarnings("ignore")

ROOT = Path("/Users/dharmendersingh/Documents/Scherzinger_new")
NB = ROOT / "notebooks" / "forecasting_v3"
sys.path.insert(0, str(NB))

CLEAN = pd.read_parquet(NB / "data" / "clean_monthly.parquet")
EXOG  = pd.read_parquet(NB / "data" / "exog_aligned.parquet")

EXOG_COLS = ["WPU101","PCOPPUSDM","PALUMUSDM","DCOILBRENTEU",
             "DEXUSEU","PNRGINDEXM","IRLTLT01DEM156N","INDPRO"]
H = 12
TRAIN_END = pd.Timestamp("2025-12-01")
FUTURE = pd.date_range("2026-01-01", periods=H, freq="MS")

train = CLEAN[CLEAN["month"] <= TRAIN_END].copy()
exog_train = EXOG[EXOG["month"] <= TRAIN_END].copy()
# FRED placeholder for 2026: seasonal repeat of 2025
exog_2025 = EXOG[EXOG["month"].dt.year == 2025][EXOG_COLS].reset_index(drop=True)
exog_future = exog_2025.copy()
exog_future["month"] = FUTURE
print(f"train: {len(train)} months {train['month'].min().date()} → {train['month'].max().date()}")
print(f"FRED 2026: seasonal-naive replay of 2025 (real FRED data ends 2025-12)")

forecasts = {target: {} for target in ("revenue","units","cost")}

# Stable margin ratio from last 12 months
last12_margin = train.tail(12)["margin_ratio"].mean()
last12_db2 = train.tail(12)["db2_margin"].mean()
print(f"last-12 avg margin_ratio={last12_margin:.4f}, db2_margin={last12_db2:.4f}")

# -------------------------------------------------------------------------
# 1. SeasonalNaive(12)
# -------------------------------------------------------------------------
for target in ("revenue","units","cost"):
    forecasts[target]["SeasonalNaive(12)"] = train.tail(12)[target].values.astype(float)

# -------------------------------------------------------------------------
# 2. AutoETS, Theta (statsforecast)
# -------------------------------------------------------------------------
from statsforecast import StatsForecast
from statsforecast.models import AutoETS, Theta, SeasonalNaive

for target in ("revenue","units","cost"):
    df_sf = pd.DataFrame({"unique_id":"x","ds":train["month"],"y":train[target].values})
    sf = StatsForecast(models=[AutoETS(season_length=12), Theta(season_length=12)], freq="MS", n_jobs=1)
    sf.fit(df_sf)
    fc = sf.predict(h=H)
    forecasts[target]["AutoETS"] = fc["AutoETS"].values
    forecasts[target]["Theta"]   = fc["Theta"].values

# -------------------------------------------------------------------------
# 3. Ensemble[Theta, ETS, SN]
# -------------------------------------------------------------------------
for target in ("revenue","units","cost"):
    parts = [forecasts[target][m] for m in ("Theta","AutoETS","SeasonalNaive(12)")]
    forecasts[target]["Ensemble[Theta,ETS,SN]"] = np.mean(parts, axis=0)

# -------------------------------------------------------------------------
# 4. AutoETS + MinT-OLS reconciliation (revenue = volume × price)
# -------------------------------------------------------------------------
# Forecast volume separately, derive avg_price from last 12, multiply
vol_fc = forecasts["units"]["AutoETS"]
last12_price = train.tail(12)["avg_price"].values
# Seasonal price (Jan'26 = Jan'25 price, etc.) — matches MinT logic
price_fc = train.tail(12)["avg_price"].values
revenue_rec = vol_fc * price_fc
forecasts["revenue"]["AutoETS+MinT-OLS"] = revenue_rec
# Cost via avg cost-per-unit
last12_cpu = (train.tail(12)["cost"] / train.tail(12)["units"]).values
forecasts["cost"]["AutoETS+MinT-OLS"] = vol_fc * last12_cpu
forecasts["units"]["AutoETS+MinT-OLS"] = vol_fc

# -------------------------------------------------------------------------
# 5. LightGBM with FRED covariates
# -------------------------------------------------------------------------
print("  LightGBM with FRED...", flush=True)
from lightgbm import LGBMRegressor

def lgb_forecast(target_col: str) -> np.ndarray:
    df = train.merge(exog_train, on="month")
    X = df[EXOG_COLS + ["month"]].copy()
    X["m"] = X["month"].dt.month
    X = X.drop(columns=["month"])
    y = df[target_col].values
    m = LGBMRegressor(n_estimators=200, learning_rate=0.05, num_leaves=15,
                      min_child_samples=3, verbose=-1)
    m.fit(X, y)
    Xf = exog_future[EXOG_COLS].copy()
    Xf["m"] = exog_future["month"].dt.month.values
    return m.predict(Xf)

for target in ("revenue","units","cost"):
    forecasts[target]["LightGBM"] = lgb_forecast(target)

# -------------------------------------------------------------------------
# 6. Chronos-bolt univariate (best for units; also fit for revenue/cost)
# -------------------------------------------------------------------------
print("  Chronos-bolt-base...", flush=True)
import torch
from chronos import BaseChronosPipeline
pipe = BaseChronosPipeline.from_pretrained("amazon/chronos-bolt-base", device_map="cpu", dtype=torch.float32)
for target in ("revenue","units","cost"):
    s = train[target].values.astype(np.float32)
    ctx = torch.tensor(s).unsqueeze(0)
    t0 = time.time()
    quantiles, mean = pipe.predict_quantiles(inputs=ctx, prediction_length=H, quantile_levels=[0.1,0.5,0.9])
    p50 = quantiles[0, :, 1].cpu().numpy()
    print(f"    Chronos {target} {time.time()-t0:.1f}s sum={p50.sum():.0f}", flush=True)
    forecasts[target]["Chronos-bolt"] = p50

# -------------------------------------------------------------------------
# Recommended "ship" combo: ETS+MinT for revenue, Chronos for units, AutoETS for cost
# -------------------------------------------------------------------------
ship_units   = forecasts["units"]["Chronos-bolt"]
ship_price   = train.tail(12)["avg_price"].values
ship_revenue = ship_units * ship_price
ship_cpu     = (train.tail(12)["cost"] / train.tail(12)["units"]).values
ship_cost    = ship_units * ship_cpu
forecasts["revenue"]["★ Ship combo"] = ship_revenue
forecasts["units"]["★ Ship combo"]   = ship_units
forecasts["cost"]["★ Ship combo"]    = ship_cost

# -------------------------------------------------------------------------
# OUTPUT
# -------------------------------------------------------------------------
print("\n" + "="*100)
print(f"  2026 FORECAST — trained on 2022-01 → 2025-12 (48 months)")
print("="*100)

models_order = ["★ Ship combo","AutoETS+MinT-OLS","AutoETS","LightGBM","Chronos-bolt",
                "Theta","Ensemble[Theta,ETS,SN]","SeasonalNaive(12)"]

def fmt_eur(x): return f"{x:>13,.0f}€"
def fmt_u(x):   return f"{x:>10,.0f}u"
def fmt_pct(x): return f"{x*100:>6.1f}%"

# 1. TOTALS table
print("\n── 2026 TOTALS (Jan-Dec) ──")
print(f"  {'Model':<28} {'Revenue':>15} {'Units':>12} {'Cost':>15} {'Margin €':>15} {'Margin %':>10}")
print(f"  {'-'*28} {'-'*15} {'-'*12} {'-'*15} {'-'*15} {'-'*10}")
for m in models_order:
    if m not in forecasts["revenue"]: continue
    rev = forecasts["revenue"][m].sum()
    u   = forecasts["units"][m].sum() if m in forecasts["units"] else float("nan")
    c   = forecasts["cost"][m].sum() if m in forecasts["cost"] else float("nan")
    # Margin = revenue × last-12 margin_ratio (gross margin)
    margin_eur = rev * last12_margin
    margin_pct = margin_eur / rev if rev else 0
    print(f"  {m:<28} {rev:>14,.0f}€ {u:>11,.0f}u {c:>14,.0f}€ {margin_eur:>14,.0f}€ {margin_pct*100:>9.1f}%")

# 2. Monthly table — ship combo only
ship = "★ Ship combo"
print(f"\n── MONTHLY — {ship} ──")
print(f"  {'Month':<10} {'Revenue':>14} {'Units':>10} {'Cost':>14} {'Margin €':>14}")
print(f"  {'-'*10} {'-'*14} {'-'*10} {'-'*14} {'-'*14}")
for i, dt in enumerate(FUTURE):
    rev = forecasts["revenue"][ship][i]
    u   = forecasts["units"][ship][i]
    c   = forecasts["cost"][ship][i]
    m_eur = rev * last12_margin
    print(f"  {dt.strftime('%Y-%m'):<10} {rev:>13,.0f}€ {u:>9,.0f}u {c:>13,.0f}€ {m_eur:>13,.0f}€")

# 3. 2025 actual vs 2026 ship-combo forecast
act = train[train["month"].dt.year == 2025]
act_rev = act["revenue"].sum()
act_u   = act["units"].sum()
act_cost= act["cost"].sum()
act_margin = act_rev * act["margin_ratio"].mean()

f_rev = forecasts["revenue"][ship].sum()
f_u   = forecasts["units"][ship].sum()
f_c   = forecasts["cost"][ship].sum()
f_m   = f_rev * last12_margin

print("\n── 2025 ACTUAL vs 2026 SHIP FORECAST ──")
print(f"  {'Metric':<15} {'2025 actual':>18} {'2026 forecast':>18} {'Δ':>10}  {'%':>7}")
print(f"  {'-'*15} {'-'*18} {'-'*18} {'-'*10}  {'-'*7}")
print(f"  {'Revenue':<15} {act_rev:>17,.0f}€ {f_rev:>17,.0f}€ {f_rev-act_rev:>+10,.0f} {(f_rev/act_rev-1)*100:>+6.1f}%")
print(f"  {'Units':<15} {act_u:>17,.0f}u {f_u:>17,.0f}u {f_u-act_u:>+10,.0f} {(f_u/act_u-1)*100:>+6.1f}%")
print(f"  {'Cost':<15} {act_cost:>17,.0f}€ {f_c:>17,.0f}€ {f_c-act_cost:>+10,.0f} {(f_c/act_cost-1)*100:>+6.1f}%")
print(f"  {'Margin €':<15} {act_margin:>17,.0f}€ {f_m:>17,.0f}€ {f_m-act_margin:>+10,.0f} {(f_m/act_margin-1)*100:>+6.1f}%")

# Save
out_path = NB / "output" / "forecast_2026_results.json"
out = {target: {m: arr.tolist() for m, arr in mdl.items()} for target, mdl in forecasts.items()}
out["_meta"] = {"future_months":[d.strftime("%Y-%m") for d in FUTURE], "last12_margin": float(last12_margin)}
json.dump(out, open(out_path,"w"), indent=2)
print(f"\nSaved → {out_path}")
