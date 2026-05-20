"""Margin trajectory block — historical quarterly DB2 margin + 4Q WMA projection.

12 trailing quarters of actuals from ``invoices`` grouped by ``(year, quarter)``
+ 4-quarter weighted moving average projected forward 4 quarters with a
residual-stdev × ~1.28 σ band (≈ normal_quantile(0.8)). Floor = 60%.
If the DB is unavailable or insufficient rows, returns a curated seed.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


_WEIGHTS = [0.4, 0.3, 0.2, 0.1]
_NORMAL_Q80 = 1.28  # normal quantile at 80% (≈ 1.2816)
_FLOOR = 60.0


def _seed() -> dict[str, Any]:
    historical = [
        {"quarter": "Q2 23", "margin": 67.4},
        {"quarter": "Q3 23", "margin": 66.8},
        {"quarter": "Q4 23", "margin": 65.1},
        {"quarter": "Q1 24", "margin": 64.9},
        {"quarter": "Q2 24", "margin": 64.2},
        {"quarter": "Q3 24", "margin": 63.5},
        {"quarter": "Q4 24", "margin": 63.1},
        {"quarter": "Q1 25", "margin": 62.4},
        {"quarter": "Q2 25", "margin": 61.7},
        {"quarter": "Q3 25", "margin": 61.0},
        {"quarter": "Q4 25", "margin": 60.4},
        {"quarter": "Q1 26", "margin": 59.8},
    ]
    projected = [
        {"quarter": "Q2 26", "margin": 59.1, "low": 56.5, "high": 61.7},
        {"quarter": "Q3 26", "margin": 58.4, "low": 55.5, "high": 61.3},
        {"quarter": "Q4 26", "margin": 57.7, "low": 54.4, "high": 61.0},
        {"quarter": "Q1 27", "margin": 57.0, "low": 53.3, "high": 60.7},
    ]
    return {
        "source": "synthetic",
        "historical": historical,
        "projected": projected,
        "floor": _FLOOR,
        "crossesFloorAt": "Q3 26",
        "methodologyNote": (
            "4-quarter weighted MA (0.4/0.3/0.2/0.1) over the trailing actuals "
            "+ residual stdev × 1.28 (normal quantile 80%) for the band. Floor 60%."
        ),
    }


def _quarter_label(year: int, quarter: int) -> str:
    return f"Q{quarter} {str(year)[-2:]}"


def _next_quarter(year: int, quarter: int) -> tuple[int, int]:
    if quarter >= 4:
        return year + 1, 1
    return year, quarter + 1


def get_margin_trajectory(db: Session | None) -> dict[str, Any]:
    if db is None:
        return _seed()
    try:
        rows = db.execute(text("""
            WITH bounds AS (SELECT MAX(date) AS max_d FROM invoices)
            SELECT year, quarter,
                   SUM(db2_total) / NULLIF(SUM(revenue), 0) AS margin
            FROM invoices, bounds
            WHERE date >= bounds.max_d - INTERVAL '36 months'
              AND quarter IS NOT NULL
              AND year IS NOT NULL
            GROUP BY year, quarter
            ORDER BY year, quarter
        """)).fetchall()
    except Exception:
        return _seed()

    rows = [r for r in rows if r[2] is not None]
    if len(rows) < 4:
        return _seed()

    # Use last 12 quarters
    rows = rows[-12:]
    historical = [
        {"quarter": _quarter_label(int(r[0]), int(r[1])), "margin": round(float(r[2]) * 100, 2)}
        for r in rows
    ]
    actuals = [h["margin"] for h in historical]

    # Compute residuals: actual[i] vs WMA of previous 4
    residuals: list[float] = []
    for i in range(4, len(actuals)):
        wma = sum(actuals[i - 4 + j] * _WEIGHTS[3 - j] for j in range(4))
        residuals.append(actuals[i] - wma)
    if residuals:
        mean_r = sum(residuals) / len(residuals)
        var = sum((r - mean_r) ** 2 for r in residuals) / max(1, len(residuals) - 1)
        stdev = var ** 0.5
    else:
        stdev = 0.5
    band = _NORMAL_Q80 * stdev

    # Project 4 quarters using WMA. weights[0]=0.4 is for most-recent.
    projected: list[dict[str, Any]] = []
    cursor = list(actuals)
    last_y, last_q = int(rows[-1][0]), int(rows[-1][1])
    crosses = None
    for step in range(1, 5):
        last4 = cursor[-4:]  # last4[0] = oldest, last4[3] = most recent
        # most recent → 0.4 weight
        wma = sum(last4[3 - j] * _WEIGHTS[j] for j in range(4))
        last_y, last_q = _next_quarter(last_y, last_q)
        q_label = _quarter_label(last_y, last_q)
        projected.append({
            "quarter": q_label,
            "margin": round(wma, 2),
            "low": round(wma - band, 2),
            "high": round(wma + band, 2),
        })
        if crosses is None and wma < _FLOOR:
            crosses = q_label
        cursor.append(wma)

    return {
        "source": "live",
        "historical": historical,
        "projected": projected,
        "floor": _FLOOR,
        "crossesFloorAt": crosses,
        "methodologyNote": (
            "12 trailing quarters of DB2/Revenue from invoices + 4Q weighted MA "
            "(0.4/0.3/0.2/0.1). Band = ±residual stdev × 1.28 (≈ P80). Floor = 60%."
        ),
    }
