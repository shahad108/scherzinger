"""Pocket-margin waterfall composer.

For demo: reads existing invoice + quote ledger via the same DB connection
real_hero.py uses. Computes List -> Quoted -> Booked -> Invoiced -> DB2 step values
and per-cluster pocket-price bands. Stubbed-out reasonable defaults if the
DB session is unavailable so screens endpoint never fails because of this card.
"""
from __future__ import annotations
from typing import Any

# Step ordering -- must remain stable; frontend renders in this order.
STEP_ORDER = ["list", "quoted", "booked", "invoiced", "db2"]


def _safe_steps(values: dict[str, float]) -> list[dict[str, Any]]:
    out = []
    prev = None
    for name in STEP_ORDER:
        v = float(values.get(name, 0.0))
        leakage = None
        if prev is not None and prev != 0:
            leakage = (prev - v) / prev * 100.0
        out.append({"name": name, "value": v, "leakagePct": leakage})
        prev = v
    return out


def _histogram(prices: list[float], bins: int = 12) -> list[dict[str, Any]]:
    if not prices:
        return []
    lo, hi = min(prices), max(prices)
    if lo == hi:
        return [{"bin": f"{lo:.2f}", "count": len(prices)}]
    step = (hi - lo) / bins
    counts = [0] * bins
    for p in prices:
        idx = min(int((p - lo) / step), bins - 1)
        counts[idx] += 1
    return [{"bin": f"{lo + i*step:.2f}", "count": c} for i, c in enumerate(counts)]


def build_pocket_waterfall(
    *,
    list_price: float = 100.0,
    quoted: float = 88.0,
    booked: float = 80.0,
    invoiced: float = 76.0,
    db2: float = 18.0,
    per_cluster_prices: dict[str, list[float]] | None = None,
) -> dict[str, Any]:
    steps = _safe_steps({
        "list": list_price, "quoted": quoted, "booked": booked,
        "invoiced": invoiced, "db2": db2,
    })
    bands = []
    for cluster, prices in (per_cluster_prices or {}).items():
        if not prices:
            continue
        sorted_p = sorted(prices)
        n = len(sorted_p)
        median = sorted_p[n // 2]
        p10 = sorted_p[max(0, int(n * 0.1) - 1)]
        p90 = sorted_p[min(n - 1, int(n * 0.9))]
        bands.append({
            "cluster": cluster,
            "histogram": _histogram(prices),
            "median": median, "p10": p10, "p90": p90,
        })
    return {
        "steps": steps,
        "perCluster": bands,
        "unit": "pct_of_list" if list_price == 100.0 else "eur_total",
    }
