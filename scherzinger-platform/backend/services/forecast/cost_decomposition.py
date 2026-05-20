"""Cost decomposition block — material% / direct-mfg% / full-mfg% of revenue.

12 trailing quarters from ``invoices``:
  material_pct  = SUM(material_per_unit * quantity) / SUM(revenue)
  direct_mfg_pct = SUM((fek_per_unit + fv_per_unit) * quantity) / SUM(revenue)
  full_mfg_pct  = SUM(hkvoll_per_unit * quantity) / SUM(revenue)

Insights compare first-4-quarters avg vs last-4-quarters avg (Δpp).
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _quarter_label(year: int, quarter: int) -> str:
    return f"Q{quarter} {str(year)[-2:]}"


def _seed() -> dict[str, Any]:
    quarters = ["Q2 23", "Q3 23", "Q4 23", "Q1 24", "Q2 24", "Q3 24",
                "Q4 24", "Q1 25", "Q2 25", "Q3 25", "Q4 25", "Q1 26"]
    material = [33.1, 33.4, 33.0, 32.6, 32.2, 32.0, 31.6, 31.3, 31.0, 30.7, 30.4, 30.1]
    direct = [21.0, 21.3, 21.6, 22.0, 22.4, 22.6, 23.0, 23.4, 23.8, 24.1, 24.5, 24.9]
    full = [42.9, 43.3, 43.7, 44.1, 44.6, 45.0, 45.5, 46.0, 46.5, 47.0, 47.6, 48.2]
    return {
        "source": "synthetic",
        "quarters": quarters,
        "layers": [
            {"name": "Material % of revenue", "values": material, "trendDirection": "down",
             "insight": "Material costs declining 3pp over 3y — procurement gains."},
            {"name": "Direct manufacturing % of revenue", "values": direct, "trendDirection": "up",
             "insight": "Direct labor + setup rising 4pp — investigate capacity utilization."},
            {"name": "Full manufacturing % of revenue", "values": full, "trendDirection": "up",
             "insight": "Full cost rising 5pp despite material savings — fixed overhead drift."},
        ],
    }


def _insight(name: str, values: list[float]) -> tuple[str, str]:
    """Return (trendDirection, insight) by comparing first-4 vs last-4 avg."""
    if len(values) < 8:
        first_avg = values[0] if values else 0.0
        last_avg = values[-1] if values else 0.0
    else:
        first_avg = sum(values[:4]) / 4
        last_avg = sum(values[-4:]) / 4
    delta = last_avg - first_avg
    if delta > 0.3:
        trend = "up"
        verb = "rose"
    elif delta < -0.3:
        trend = "down"
        verb = "declined"
    else:
        trend = "flat"
        verb = "held flat"
    short = name.split(" % ")[0]
    insight = f"{short} {verb} {abs(delta):.1f}pp over the window."
    return trend, insight


def get_cost_decomposition(
    db: Session | None,
    *,
    aid: str | None = None,
) -> dict[str, Any]:
    """Cluster-level cost decomposition (default) or per-SKU when ``aid`` is set.

    Pricing Studio v3 / Phase 3.2.1: narrowing to a single SKU lets the
    workbench render the per-SKU material/labor/outsourcing/overhead
    split. When the SKU has no invoice rows we fall back to the cluster
    seed so the card never blanks.
    """
    if db is None:
        return _seed()
    aid_clause = "AND article_id = :aid" if aid else ""
    params: dict[str, Any] = {}
    if aid:
        params["aid"] = aid
    try:
        rows = db.execute(text(f"""
            WITH bounds AS (SELECT MAX(date) AS max_d FROM invoices)
            SELECT year, quarter,
                   SUM(material_per_unit * quantity) / NULLIF(SUM(revenue), 0) * 100 AS material_pct,
                   SUM((fek_per_unit + fv_per_unit) * quantity) / NULLIF(SUM(revenue), 0) * 100 AS direct_pct,
                   SUM(hkvoll_per_unit * quantity) / NULLIF(SUM(revenue), 0) * 100 AS full_pct
            FROM invoices, bounds
            WHERE date >= bounds.max_d - INTERVAL '36 months'
              AND quarter IS NOT NULL
              AND year IS NOT NULL
              {aid_clause}
            GROUP BY year, quarter
            ORDER BY year, quarter
        """), params).fetchall()
    except Exception:
        return _seed()

    rows = [r for r in rows if r[2] is not None]
    if len(rows) < 4:
        return _seed()
    rows = rows[-12:]

    quarters = [_quarter_label(int(r[0]), int(r[1])) for r in rows]
    material = [round(float(r[2]), 2) if r[2] is not None else 0.0 for r in rows]
    direct = [round(float(r[3]), 2) if r[3] is not None else 0.0 for r in rows]
    full = [round(float(r[4]), 2) if r[4] is not None else 0.0 for r in rows]

    layers = []
    for name, values in [
        ("Material % of revenue", material),
        ("Direct manufacturing % of revenue", direct),
        ("Full manufacturing % of revenue", full),
    ]:
        trend, insight = _insight(name, values)
        layers.append({
            "name": name,
            "values": values,
            "trendDirection": trend,
            "insight": insight,
        })

    return {"source": "live", "quarters": quarters, "layers": layers}
