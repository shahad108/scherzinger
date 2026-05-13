"""Cost decomposition block — material% / direct mfg% / full mfg% as % of revenue."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _seed() -> dict[str, Any]:
    quarters = ["Q2 23", "Q3 23", "Q4 23", "Q1 24", "Q2 24", "Q3 24",
                "Q4 24", "Q1 25", "Q2 25", "Q3 25", "Q4 25", "Q1 26"]
    material = [33.1, 33.4, 33.0, 32.6, 32.2, 32.0, 31.6, 31.3, 31.0, 30.7, 30.4, 30.1]
    direct = [21.0, 21.3, 21.6, 22.0, 22.4, 22.6, 23.0, 23.4, 23.8, 24.1, 24.5, 24.9]
    full = [42.9, 43.3, 43.7, 44.1, 44.6, 45.0, 45.5, 46.0, 46.5, 47.0, 47.6, 48.2]
    return {
        "quarters": quarters,
        "layers": [
            {
                "name": "Material % of revenue",
                "values": material,
                "trendDirection": "down",
                "insight": "Material costs declining 3pp over 3y — successful procurement program.",
            },
            {
                "name": "Direct manufacturing % of revenue",
                "values": direct,
                "trendDirection": "up",
                "insight": "Direct labor + setup costs rising 4pp — investigate capacity utilization.",
            },
            {
                "name": "Full manufacturing % of revenue",
                "values": full,
                "trendDirection": "up",
                "insight": (
                    "Full cost rising 5pp despite material savings → fixed overhead growing. "
                    "Material savings absorbed by capacity drag; revisit allocation model."
                ),
            },
        ],
    }


def get_cost_decomposition(db: Session | None) -> dict[str, Any]:
    if db is None:
        return _seed()
    try:
        rows = db.execute(text("""
            SELECT to_char(date_trunc('quarter', invoice_date), 'YYYY-Q') AS q,
                   SUM(material_per_unit * quantity) / NULLIF(SUM(revenue), 0) * 100 AS material_pct,
                   SUM(hkvar_per_unit * quantity) / NULLIF(SUM(revenue), 0) * 100 AS direct_pct,
                   SUM(hkvoll_per_unit * quantity) / NULLIF(SUM(revenue), 0) * 100 AS full_pct
            FROM invoices
            WHERE invoice_date >= NOW() - INTERVAL '3 years'
            GROUP BY q
            ORDER BY q
        """)).fetchall()
    except Exception:
        return _seed()

    if not rows or len(rows) < 4:
        return _seed()

    quarters = [r[0] for r in rows]
    layers: list[dict[str, Any]] = []
    for idx, name in [
        (1, "Material % of revenue"),
        (2, "Direct manufacturing % of revenue"),
        (3, "Full manufacturing % of revenue"),
    ]:
        values = [float(r[idx]) if r[idx] is not None else 0.0 for r in rows]
        trend = _trend_direction(values)
        layers.append({
            "name": name,
            "values": values,
            "trendDirection": trend,
            "insight": _insight_for(name, values, trend),
        })
    return {"quarters": quarters, "layers": layers}


def _trend_direction(values: list[float]) -> str:
    if len(values) < 2:
        return "flat"
    diff = values[-1] - values[0]
    if diff > 0.5:
        return "up"
    if diff < -0.5:
        return "down"
    return "flat"


def _insight_for(name: str, values: list[float], trend: str) -> str:
    if not values:
        return ""
    delta = values[-1] - values[0]
    arrow = "↑" if trend == "up" else "↓" if trend == "down" else "→"
    return f"{name}: {arrow} {abs(delta):.1f}pp over window — {trend} trend."
