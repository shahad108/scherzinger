"""Commodity multi-line block — per-commodity-group DB2 margin trends."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _seed() -> dict[str, Any]:
    quarters = ["Q2 23", "Q3 23", "Q4 23", "Q1 24", "Q2 24", "Q3 24",
                "Q4 24", "Q1 25", "Q2 25", "Q3 25", "Q4 25", "Q1 26"]
    groups = [
        {
            "id": "BKAES",
            "name": "BKAES · Frame & shafts",
            "series": [70.2, 69.8, 69.1, 68.4, 67.9, 67.3, 66.8, 66.2, 65.7, 65.2, 64.7, 64.4],
            "slopePerYear": -2.2,
        },
        {
            "id": "BKAGG",
            "name": "BKAGG · Bearings",
            "series": [64.5, 63.9, 63.1, 62.4, 61.8, 61.0, 60.3, 59.6, 59.0, 58.3, 57.7, 57.4],
            "slopePerYear": -2.7,
        },
        {
            "id": "BKAIZ",
            "name": "BKAIZ · Couplings",
            "series": [58.2, 57.5, 56.6, 55.7, 54.9, 54.0, 53.1, 52.3, 51.5, 50.7, 50.2, 50.1],
            "slopePerYear": -2.9,
        },
        {
            "id": "SOPU",
            "name": "SOPU · Specials (low-n)",
            "series": [54.0, 51.8, 49.5, 48.0, 47.2, 46.6, 45.9, 44.7, 43.8, 43.0, 42.4, 41.5],
            "slopePerYear": -4.3,
        },
    ]
    return {"quarters": quarters, "groups": groups}


def get_commodity_trajectories(db: Session | None) -> dict[str, Any]:
    if db is None:
        return _seed()
    try:
        rows = db.execute(text("""
            SELECT commodity_group,
                   to_char(date_trunc('quarter', invoice_date), 'YYYY-Q') AS q,
                   SUM(db2_margin) / NULLIF(SUM(revenue), 0) * 100 AS margin_pct
            FROM invoices
            WHERE invoice_date >= NOW() - INTERVAL '3 years'
            GROUP BY commodity_group, q
            ORDER BY commodity_group, q
        """)).fetchall()
    except Exception:
        return _seed()
    if not rows:
        return _seed()

    by_group: dict[str, list[tuple[str, float]]] = {}
    for r in rows:
        if r[2] is None:
            continue
        by_group.setdefault(r[0], []).append((r[1], float(r[2])))
    if not by_group:
        return _seed()
    quarters_set: set[str] = set()
    for series in by_group.values():
        for q, _ in series:
            quarters_set.add(q)
    quarters_sorted = sorted(quarters_set)
    groups: list[dict[str, Any]] = []
    for gid, series in by_group.items():
        m = dict(series)
        values = [m.get(q) for q in quarters_sorted]
        actuals = [v for v in values if v is not None]
        if len(actuals) >= 2:
            slope_per_q = (actuals[-1] - actuals[0]) / max(1, len(actuals) - 1)
            slope_per_year = slope_per_q * 4
        else:
            slope_per_year = 0.0
        groups.append({
            "id": gid,
            "name": gid,
            "series": values,
            "slopePerYear": round(slope_per_year, 2),
        })
    return {"quarters": quarters_sorted, "groups": groups}
