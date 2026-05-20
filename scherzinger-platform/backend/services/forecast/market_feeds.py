"""Live market feeds — FRED / EIA / ECB observations from the notebook parquet.

The forecasting notebook (`forecasting_notebook.py`) already fetches and
normalises real series from FRED, EIA, and ECB into
``notebooks/output/market_series.parquet`` with columns
``series_id, ts, value, source, unit, freq, name``.

This module reads that parquet for the BFF (with in-process TTL cache) and
exposes ``latest_for(series_id)`` returning the most recent observation plus
the previous one — enough to drive the market direction tiles with real data
instead of the prior "synthetic for demo" placeholders.

If the parquet is missing or a series has no observations, the loader returns
``None`` so the caller can fall back gracefully.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd


# Cache TTL — re-read the parquet at most once per 6h. The file is regenerated
# by the notebook fetcher; restart-on-reload picks up the latest.
_CACHE_TTL_S = 6 * 3600

_cache: dict[str, object] = {"frame": None, "loaded_at": 0.0}


def _candidate_paths() -> list[Path]:
    """Plausible locations for the notebook output, in priority order."""
    here = Path(__file__).resolve()
    candidates: list[Path] = []
    # Walk up looking for "notebooks/output/market_series.parquet". The BFF
    # runs from `scherzinger-platform/`, but the notebook output lives in the
    # parent repo root.
    for parent in [here.parents[3], here.parents[4]] if len(here.parents) >= 5 else [here.parents[3]]:
        candidates.append(parent / "notebooks" / "output" / "market_series.parquet")
    # Also honour an explicit override from the environment.
    env_path = os.environ.get("MARKET_SERIES_PARQUET")
    if env_path:
        candidates.insert(0, Path(env_path))
    return candidates


def _load_frame() -> pd.DataFrame | None:
    now = time.time()
    cached = _cache.get("frame")
    if cached is not None and now - float(_cache.get("loaded_at", 0)) < _CACHE_TTL_S:
        return cached  # type: ignore[return-value]
    for path in _candidate_paths():
        if path.exists():
            try:
                df = pd.read_parquet(path)
                df["ts"] = pd.to_datetime(df["ts"])
                _cache["frame"] = df
                _cache["loaded_at"] = now
                return df
            except Exception:
                continue
    # Mark as attempted so we don't hammer the disk every call.
    _cache["loaded_at"] = now
    _cache["frame"] = None
    return None


@dataclass(frozen=True)
class MarketObs:
    series_id: str
    name: str
    unit: str | None
    source: str
    latest_value: float
    latest_date: str  # ISO date
    prior_value: float | None
    prior_date: str | None
    pct_change: float | None  # latest vs prior, in percent

    def period_label(self, freq: str | None) -> str:
        f = (freq or "").upper()
        if f.startswith("D"):
            return "DoD"
        if f.startswith("W"):
            return "WoW"
        if f.startswith("Q"):
            return "QoQ"
        if f.startswith("A") or f.startswith("Y"):
            return "YoY"
        # Default: monthly series → MoM
        return "MoM"


def latest_for(series_id: str) -> Optional[MarketObs]:
    """Return latest + prior observation for `series_id`, or None if unavailable."""
    df = _load_frame()
    if df is None:
        return None
    sub = df[df["series_id"] == series_id].sort_values("ts")
    if sub.empty:
        return None
    rows = sub.tail(2)
    latest = rows.iloc[-1]
    prior = rows.iloc[-2] if len(rows) > 1 else None
    pct = None
    prior_value = None
    prior_date = None
    if prior is not None and prior["value"] not in (None, 0) and pd.notna(prior["value"]):
        try:
            pct = (float(latest["value"]) / float(prior["value"]) - 1.0) * 100.0
            prior_value = float(prior["value"])
            prior_date = str(prior["ts"].date())
        except (TypeError, ValueError, ZeroDivisionError):
            pct = None
    return MarketObs(
        series_id=series_id,
        name=str(latest.get("name") or series_id),
        unit=(str(latest["unit"]) if pd.notna(latest.get("unit")) else None),
        source=str(latest.get("source") or "fred"),
        latest_value=float(latest["value"]),
        latest_date=str(latest["ts"].date()),
        prior_value=prior_value,
        prior_date=prior_date,
        pct_change=pct,
    )


def freq_for(series_id: str) -> str | None:
    df = _load_frame()
    if df is None:
        return None
    sub = df[df["series_id"] == series_id]
    if sub.empty:
        return None
    return str(sub.iloc[0].get("freq") or "")
