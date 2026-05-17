"""V3 forecaster loader.

Reads the supervised forecast cache produced by `notebooks/forecasting_v3/`
and serves it through the v2.2 hero contract. Activated by env
`FORECAST_V3=1`. Falls back to WMA path if any parquet is missing.

Parquet schema (per target: revenue, volume, margin):
    month  : Timestamp (1st of month, 2026-01..2026-12)
    p10    : 10th percentile
    p50    : median (point forecast)
    p80    : 80th percentile
    p90    : 90th percentile

The hero schema requires p80Low/p80High and p95Low/p95High. Mapping:
    p80Low  = p10  (lower bound of 80% PI)
    p80High = p90  (upper bound of 80% PI)
    p95Low/p95High are widened asymmetrically around p50 by the Gaussian
    ratio 1.96/1.28 applied independently to the lower/upper half-widths.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import pandas as pd

# v3_loader.py lives at:
#   scherzinger-platform/backend/services/forecast/v3_loader.py
# parents[0]=forecast, [1]=services, [2]=backend, [3]=scherzinger-platform,
# [4]=Scherzinger_new. The parquet cache lives at
#   Scherzinger_new/notebooks/forecasting_v3/output
_PARQUET_DIR = (
    Path(__file__).resolve().parents[4] / "notebooks" / "forecasting_v3" / "output"
)

_TTL_SECONDS = 6 * 3600
_cache: dict[str, tuple[float, pd.DataFrame]] = {}

# Gaussian z-score ratio used to widen the 80% interval to 95%.
_WIDEN_95_FROM_80 = 1.96 / 1.28

# Coarse-grained model-card data per target.
_MODEL_CARD = {
    "revenue": {
        "winner_file": "revenue_winner.json",
        "default_label": "AutoETS + MinT-OLS reconciliation",
    },
    "volume": {
        "winner_file": "volume_winner.json",
        "default_label": "Ensemble[Theta, AutoETS, SeasonalNaive(12)]",
    },
    "margin": {
        "winner_file": "margin_winner.json",
        "default_label": "AutoETS direct on db2_margin",
    },
}


def is_enabled() -> bool:
    """V3 loader is active when ``FORECAST_V3`` is truthy in the environment."""
    return os.getenv("FORECAST_V3", "0").lower() in ("1", "true", "yes", "on")


def _parquet_path(target: str) -> Path:
    return _PARQUET_DIR / f"forecast_v3_{target}.parquet"


def _load(target: str) -> pd.DataFrame | None:
    """Read the parquet for ``target`` with a 6h in-memory TTL cache.

    Returns ``None`` if the file is missing or unreadable so callers can fall
    back to the WMA path.
    """
    if target not in ("revenue", "volume", "margin"):
        return None
    now = time.time()
    cached = _cache.get(target)
    if cached is not None and (now - cached[0]) < _TTL_SECONDS:
        return cached[1]
    path = _parquet_path(target)
    if not path.exists():
        return None
    try:
        df = pd.read_parquet(path)
    except Exception:
        return None
    required = {"month", "p10", "p50", "p80", "p90"}
    if not required.issubset(df.columns):
        return None
    df = df.copy()
    df["month"] = pd.to_datetime(df["month"])
    df = df.sort_values("month").reset_index(drop=True)
    _cache[target] = (now, df)
    return df


def project_v3(
    target: str, n_periods: int = 12
) -> list[dict[str, float]] | None:
    """Return forecast points for ``target`` shaped for the hero contract.

    Each dict carries:
        month   : ``datetime.date`` for the first-of-month
        p50     : median forecast
        p80Low  : lower bound of 80% PI (= parquet p10)
        p80High : upper bound of 80% PI (= parquet p90)
        p95Low  : p50 minus widened lower half-width (1.96/1.28 ratio)
        p95High : p50 plus widened upper half-width (1.96/1.28 ratio)

    Revenue/volume bounds are clamped at zero (non-negative). Margin keeps
    the unclamped band (negative margins are physically real).
    """
    df = _load(target)
    if df is None or df.empty:
        return None
    non_negative = target in ("revenue", "volume")
    out: list[dict[str, Any]] = []
    rows = df.head(n_periods) if n_periods else df
    for r in rows.itertuples(index=False):
        p10 = float(r.p10)
        p50 = float(r.p50)
        p90 = float(r.p90)
        # 80% half-widths around the median (asymmetric).
        low_half = max(0.0, p50 - p10)
        high_half = max(0.0, p90 - p50)
        # Widen to 95% using the Gaussian z-ratio.
        p95_low = p50 - low_half * _WIDEN_95_FROM_80
        p95_high = p50 + high_half * _WIDEN_95_FROM_80
        p80_low = p10
        p80_high = p90
        if non_negative:
            p80_low = max(0.0, p80_low)
            p95_low = max(0.0, p95_low)
        out.append(
            {
                "month": r.month.date() if hasattr(r.month, "date") else r.month,
                "p50": p50,
                "p80Low": p80_low,
                "p80High": p80_high,
                "p95Low": p95_low,
                "p95High": p95_high,
            }
        )
    return out


def _winner_label(target: str) -> str:
    info = _MODEL_CARD.get(target)
    if not info:
        return "v3 model"
    winner_file = _PARQUET_DIR / info["winner_file"]
    if not winner_file.exists():
        return info["default_label"]
    try:
        with winner_file.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except Exception:
        return info["default_label"]
    # margin uses "model"; revenue/volume use "name".
    return str(payload.get("name") or payload.get("model") or info["default_label"])


def metadata() -> dict[str, Any]:
    """Return model-card data for the FE methodology chip."""
    refresh_mtimes: list[float] = []
    for target in ("revenue", "volume", "margin"):
        path = _parquet_path(target)
        if path.exists():
            refresh_mtimes.append(path.stat().st_mtime)
    last_refresh = max(refresh_mtimes) if refresh_mtimes else None
    return {
        "model_revenue": _winner_label("revenue"),
        "model_volume": _winner_label("volume"),
        "model_margin": _winner_label("margin"),
        "trained_on": "2022-01..2025-12 (48 months)",
        "last_refresh": (
            time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(last_refresh))
            if last_refresh is not None
            else None
        ),
    }
