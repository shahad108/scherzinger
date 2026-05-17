"""Commodity-group margin trajectory block.

Per-commodity-group weighted DB2 margin by quarter from ``commodity_benchmarks``.
Filtered to the 4 cluster codes present in DB (BKAES, BKAGG, BKAIZ, MBDIV).
NOT SOPU — SOPU exists in the table but is excluded per audit (the Frank
view standardises on the cluster lens which uses MBDIV as the 4th).

Slope = YoY pp/year, computed as linear-regression slope of margin over
sequential quarters × 4 (≈ pp per year).
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


_INCLUDE_GROUPS = ("BKAES", "BKAGG", "BKAIZ", "MBDIV")
_NAMES = {
    "BKAES": "BKAES · Frame & shafts",
    "BKAGG": "BKAGG · Bearings",
    "BKAIZ": "BKAIZ · Couplings",
    "MBDIV": "MBDIV · Misc / specials",
}


def _quarter_label(year: int, quarter: int) -> str:
    return f"Q{quarter} {str(year)[-2:]}"


def _seed() -> dict[str, Any]:
    quarters = ["Q2 23", "Q3 23", "Q4 23", "Q1 24", "Q2 24", "Q3 24",
                "Q4 24", "Q1 25", "Q2 25", "Q3 25", "Q4 25", "Q1 26"]
    groups = [
        {"id": "BKAES", "name": _NAMES["BKAES"],
         "series": [70.2, 69.8, 69.1, 68.4, 67.9, 67.3, 66.8, 66.2, 65.7, 65.2, 64.7, 64.4],
         "slopePerYear": -2.2},
        {"id": "BKAGG", "name": _NAMES["BKAGG"],
         "series": [64.5, 63.9, 63.1, 62.4, 61.8, 61.0, 60.3, 59.6, 59.0, 58.3, 57.7, 57.4],
         "slopePerYear": -2.7},
        {"id": "BKAIZ", "name": _NAMES["BKAIZ"],
         "series": [58.2, 57.5, 56.6, 55.7, 54.9, 54.0, 53.1, 52.3, 51.5, 50.7, 50.2, 50.1],
         "slopePerYear": -2.9},
        {"id": "MBDIV", "name": _NAMES["MBDIV"],
         "series": [54.0, 51.8, 49.5, 48.0, 47.2, 46.6, 45.9, 44.7, 43.8, 43.0, 42.4, 41.5],
         "slopePerYear": -4.3},
    ]
    return {"source": "synthetic", "quarters": quarters, "groups": groups}


def _linreg_slope(y: list[float]) -> float:
    n = len(y)
    if n < 2:
        return 0.0
    x = list(range(n))
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    num = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    den = sum((x[i] - mean_x) ** 2 for i in range(n))
    if den == 0:
        return 0.0
    return num / den


def _cluster_for_aid(db: Session, aid: str) -> str | None:
    """Lookup the SKU's commodity group via the invoice ledger."""
    try:
        row = db.execute(
            text(
                "SELECT commodity_group FROM invoices "
                "WHERE article_id = :aid "
                "ORDER BY date DESC LIMIT 1"
            ),
            {"aid": aid},
        ).fetchone()
    except Exception:
        return None
    if row is None or row[0] is None:
        return None
    return str(row[0]).split(" ")[0]


def get_commodity_trajectories(
    db: Session | None,
    *,
    aid: str | None = None,
) -> dict[str, Any]:
    """Cluster-level (default) or per-SKU when ``aid`` is given.

    Pricing Studio v3 / Phase 3.2.1: when ``aid`` is provided we narrow the
    groups to the SKU's cluster — the workbench's commodity card then shows
    only the relevant trajectory rather than all four clusters.
    """
    if db is None:
        return _seed()
    groups = list(_INCLUDE_GROUPS)
    if aid:
        own_cluster = _cluster_for_aid(db, aid)
        if own_cluster is not None and own_cluster in _INCLUDE_GROUPS:
            groups = [own_cluster]
    try:
        rows = db.execute(text("""
            SELECT commodity_group, year, quarter,
                   AVG(weighted_db2_margin) AS margin,
                   SUM(total_revenue) AS revenue
            FROM commodity_benchmarks
            WHERE commodity_group = ANY(:groups)
              AND quarter IS NOT NULL
              AND year IS NOT NULL
            GROUP BY commodity_group, year, quarter
            ORDER BY commodity_group, year, quarter
        """), {"groups": groups}).fetchall()
    except Exception:
        return _seed()
    if not rows:
        return _seed()

    by_group: dict[str, list[tuple[str, float]]] = {}
    quarters_set: set[tuple[int, int]] = set()
    for r in rows:
        if r[3] is None:
            continue
        margin_pct = float(r[3]) * 100  # weighted_db2_margin is 0..1
        gid = r[0]
        y, q = int(r[1]), int(r[2])
        quarters_set.add((y, q))
        by_group.setdefault(gid, []).append((_quarter_label(y, q), margin_pct))

    if not by_group:
        return _seed()

    quarters_sorted_pairs = sorted(quarters_set)
    quarters_sorted = [_quarter_label(y, q) for y, q in quarters_sorted_pairs]
    # Use last 12 quarters
    quarters_sorted = quarters_sorted[-12:]

    # When narrowed to a single SKU's cluster, only emit that cluster's
    # group; otherwise iterate over the canonical _INCLUDE_GROUPS ordering.
    iter_groups: list[str] = (
        [g for g in _INCLUDE_GROUPS if g in groups] if aid else list(_INCLUDE_GROUPS)
    )
    out_groups: list[dict[str, Any]] = []
    for gid in iter_groups:
        series_map = dict(by_group.get(gid, []))
        values: list[float | None] = [series_map.get(q) for q in quarters_sorted]
        actuals = [v for v in values if v is not None]
        if len(actuals) >= 2:
            slope_per_q = _linreg_slope(actuals)
            slope_per_year = slope_per_q * 4
        else:
            slope_per_year = 0.0
        out_groups.append({
            "id": gid,
            "name": _NAMES[gid],
            "series": [round(v, 2) if v is not None else None for v in values],
            "slopePerYear": round(slope_per_year, 2),
        })
    return {"source": "live", "quarters": quarters_sorted, "groups": out_groups}
