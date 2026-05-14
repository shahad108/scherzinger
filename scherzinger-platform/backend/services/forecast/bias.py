"""Forecast bias composer — per-cluster tracking signal."""
from __future__ import annotations
from statistics import mean
from typing import Any


def _direction(values: list[float], threshold: float = 0.5) -> str:
    if not values:
        return "flat"
    avg = mean(values)
    if avg > threshold:
        return "over"
    if avg < -threshold:
        return "under"
    return "flat"


def build_bias(
    *,
    cluster_errors: dict[str, list[float]] | None = None,  # signed forecast errors (forecast - actual)
    window_months: int = 6,
) -> dict[str, Any]:
    cluster_errors = cluster_errors or {}
    rows = []
    for cluster, errs in cluster_errors.items():
        if not errs:
            continue
        cme = sum(errs)
        mad = mean(abs(e) for e in errs) or 1.0
        tracking_signal = cme / mad
        hits = [1 for e in errs if abs(e) <= 5.0]
        hit_rate = (sum(hits) / len(errs)) * 100.0
        rows.append({
            "cluster": cluster,
            "cmeOverMad": tracking_signal,
            "hitRatePct": hit_rate,
            "trailing6moDirection": _direction(errs[-window_months:]),
        })
    return {
        "rows": rows,
        "windowMonths": window_months,
        "footnote": "Tracking signal = cumulative ME / MAD. |value| > 4 conventionally flags bias.",
    }
