"""Phase A — wire Ship combo into v3 backend cache.

Regenerates:
  forecast_v3_volume.parquet   ← Chronos-bolt-base (univariate, p10/p50/p80/p90)
  forecast_v3_revenue.parquet  ← volume × seasonal avg_price
  forecast_v3_cost_point.parquet ← volume × seasonal cpu
  forecast_v3_revenue_point.parquet (mirror of p50)
  forecast_v3_volume_point.parquet  (mirror of p50)
Keeps:
  forecast_v3_margin.parquet (db2 AutoETS) unchanged

Updates volume_winner.json label so v3_loader metadata reflects Chronos.

Schema (per parquet):  month | p10 | p50 | p80 | p90  (point variants drop bands).
"""
from __future__ import annotations
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import json, shutil, time
from pathlib import Path
import numpy as np
import pandas as pd

NB = Path("/Users/dharmendersingh/Documents/Scherzinger_new/notebooks/forecasting_v3")
OUT = NB / "output"
CLEAN = pd.read_parquet(NB / "data" / "clean_monthly.parquet")

H = 12
FUTURE = pd.date_range("2026-01-01", periods=H, freq="MS")
train = CLEAN.copy()
print(f"Train: {len(train)} months, {train['month'].min().date()} → {train['month'].max().date()}")

# Last-12 seasonal references (Jan→Jan, Feb→Feb, etc.)
ref12 = train.tail(12).reset_index(drop=True)
price_seasonal = ref12["avg_price"].values  # €/unit per future month
cpu_seasonal   = (ref12["cost"] / ref12["units"]).values  # €/unit cost per future month

# Backup old parquets
BACKUP = OUT / "_backup_pre_ship_combo"
BACKUP.mkdir(exist_ok=True)
for fn in ("forecast_v3_volume.parquet", "forecast_v3_revenue.parquet",
           "forecast_v3_cost_point.parquet", "forecast_v3_revenue_point.parquet",
           "forecast_v3_volume_point.parquet", "volume_winner.json", "revenue_winner.json"):
    src = OUT / fn
    if src.exists():
        shutil.copy(src, BACKUP / fn)
print(f"Backed up old parquets → {BACKUP}")

# -----------------------------------------------------------------------------
# 1. Chronos volume forecast with quantile bands
# -----------------------------------------------------------------------------
print("Loading Chronos-bolt-base...", flush=True)
import torch
from chronos import BaseChronosPipeline
pipe = BaseChronosPipeline.from_pretrained("amazon/chronos-bolt-base", device_map="cpu", dtype=torch.float32)
print("Predicting units quantiles...", flush=True)
s = train["units"].values.astype(np.float32)
ctx = torch.tensor(s).unsqueeze(0)
t0 = time.time()
quantiles, _mean = pipe.predict_quantiles(
    inputs=ctx, prediction_length=H,
    quantile_levels=[0.1, 0.2, 0.5, 0.8, 0.9]
)
elapsed = time.time() - t0
# quantiles shape: (1, H, 5) for [0.1, 0.2, 0.5, 0.8, 0.9]
q = quantiles[0].cpu().numpy()
p10 = np.clip(q[:, 0], 0, None)
p20 = np.clip(q[:, 1], 0, None)  # not used downstream but available
p50 = np.clip(q[:, 2], 0, None)
p80 = np.clip(q[:, 3], 0, None)
p90 = np.clip(q[:, 4], 0, None)
print(f"  Chronos units done in {elapsed:.1f}s, p50 sum={p50.sum():.0f}")

vol_df = pd.DataFrame({"month": FUTURE, "p10": p10, "p50": p50, "p80": p80, "p90": p90})
vol_df.to_parquet(OUT / "forecast_v3_volume.parquet", index=False)
pd.DataFrame({"month": FUTURE, "p50": p50}).to_parquet(OUT / "forecast_v3_volume_point.parquet", index=False)
print(f"  → forecast_v3_volume.parquet  (sum p50 = {p50.sum():.0f} u)")

# -----------------------------------------------------------------------------
# 2. Revenue = volume × seasonal price
# -----------------------------------------------------------------------------
rev_p10 = p10 * price_seasonal
rev_p50 = p50 * price_seasonal
rev_p80 = p80 * price_seasonal
rev_p90 = p90 * price_seasonal
rev_df = pd.DataFrame({"month": FUTURE, "p10": rev_p10, "p50": rev_p50,
                       "p80": rev_p80, "p90": rev_p90})
rev_df.to_parquet(OUT / "forecast_v3_revenue.parquet", index=False)
pd.DataFrame({"month": FUTURE, "p50": rev_p50}).to_parquet(OUT / "forecast_v3_revenue_point.parquet", index=False)
print(f"  → forecast_v3_revenue.parquet (sum p50 = {rev_p50.sum():,.0f} €)")

# -----------------------------------------------------------------------------
# 3. Cost = volume × seasonal cpu
# -----------------------------------------------------------------------------
cost_p50 = p50 * cpu_seasonal
pd.DataFrame({"month": FUTURE, "p50": cost_p50}).to_parquet(OUT / "forecast_v3_cost_point.parquet", index=False)
print(f"  → forecast_v3_cost_point.parquet (sum p50 = {cost_p50.sum():,.0f} €)")

# -----------------------------------------------------------------------------
# 4. Update winner labels
# -----------------------------------------------------------------------------
volume_winner = {
    "name": "Chronos-bolt-base (univariate)",
    "model_id": "amazon/chronos-bolt-base",
    "trained_on": "2022-01..2025-12 (48 months)",
    "decision": "Best units forecaster — confirmed by 2025 walk-forward + 7-fold CV.",
}
(OUT / "volume_winner.json").write_text(json.dumps(volume_winner, indent=2))

revenue_winner = {
    "name": "Volume × seasonal price (Ship combo)",
    "components": {"volume": "Chronos-bolt-base", "price": "seasonal-naive(12)"},
    "trained_on": "2022-01..2025-12 (48 months)",
    "decision": "Hierarchically consistent with Chronos volume path.",
}
(OUT / "revenue_winner.json").write_text(json.dumps(revenue_winner, indent=2))

print("\nWinner labels updated.")
print("="*70)
print("Ship combo wired. v3 loader will pick up new parquets within 6h cache TTL.")
print("If you need an immediate refresh, restart the backend.")
print("="*70)
