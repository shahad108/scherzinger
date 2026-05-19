"""Metrics for the pricing engine — kept separate from backtest harness so
they can be reused by ad-hoc analyses (e.g. 2026-vs-actuals when the year
closes, or per-cohort drilldowns).

Each metric takes a row-DataFrame produced by `lib.backtest.run_one` and
returns a scalar / dict.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def per_sku_lift_pct(rows: pd.DataFrame) -> pd.Series:
    """Engine-claimed lift: (s_engine_p_star - s_engine_p_actual) / |s_engine_p_actual| × 100."""
    denom = rows["s_engine_p_actual"].abs().replace(0, np.nan)
    return (rows["s_engine_p_star"] - rows["s_engine_p_actual"]) / denom * 100.0


def ci_coverage(rows: pd.DataFrame) -> float:
    """Empirical fraction of SKUs whose realised score lies inside the 90% MC band."""
    inside = (rows["s_realised_eval"] >= rows["mc_low"]) & (
        rows["s_realised_eval"] <= rows["mc_high"]
    )
    return float(inside.mean())


def share_p_positive(rows: pd.DataFrame, threshold: float = 0.80) -> float:
    """Share of SKUs where P(score > 0) crosses the threshold."""
    return float((rows["mc_p_positive"] >= threshold).mean())


def realised_total(rows: pd.DataFrame) -> float:
    return float(rows["s_realised_eval"].sum())


def engine_p_star_total(rows: pd.DataFrame) -> float:
    return float(rows["s_engine_p_star"].sum())


def direction_breakdown(rows: pd.DataFrame, eps: float = 0.005) -> dict[str, int]:
    """How many SKUs the engine recommended to hold / lower / raise."""
    delta = (rows["p_star"] - rows["current_price"]) / rows["current_price"].replace(0, np.nan)
    return {
        "hold": int((delta.abs() < eps).sum()),
        "lower": int((delta < -eps).sum()),
        "raise": int((delta > eps).sum()),
    }


def constraint_breakdown(rows: pd.DataFrame) -> dict[str, int]:
    """Frequency of each binding constraint at p*."""
    s = rows["constraint_active"].dropna()
    return s.value_counts().to_dict()
