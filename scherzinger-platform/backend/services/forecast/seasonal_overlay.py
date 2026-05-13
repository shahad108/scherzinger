"""Seasonal overlay block — monthly indices + current-month deviation.

Uses ``seasonal_patterns`` (entity_type='overall') for the 12 indices and
``invoices`` for the latest-month actual revenue. Deviation = actual / expected
where expected = (12-month avg revenue) × seasonal_index.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _seed() -> dict[str, Any]:
    indices = [94.2, 96.0, 105.3, 100.8, 102.1, 98.5,
               92.6, 118.4, 103.6, 99.5, 96.2, 81.8]
    expected = indices[4]
    actual = expected + 3.2
    deviation_pct = ((actual / expected) - 1) * 100 if expected else 0
    return {
        "source": "synthetic",
        "months": _MONTH_LABELS,
        "indices": indices,
        "currentMonthLabel": _MONTH_LABELS[4],
        "currentMonthExpected": round(expected, 1),
        "currentMonthActual": round(actual, 1),
        "deviationPct": round(deviation_pct, 1),
        "deviationTone": "amber",
        "note": (
            "Synthetic fallback. Indices derived from 3 years of monthly "
            "revenue (seasonal_patterns table)."
        ),
    }


def get_seasonal_overlay(db: Session | None) -> dict[str, Any]:
    if db is None:
        return _seed()
    try:
        rows = db.execute(text("""
            SELECT month, AVG(seasonal_index) AS idx, AVG(avg_revenue) AS avg_rev
            FROM seasonal_patterns
            WHERE entity_type = 'overall'
            GROUP BY month
            ORDER BY month
        """)).fetchall()
    except Exception:
        return _seed()
    if not rows or len(rows) < 12:
        return _seed()

    # Index in 0–100 space: seasonal_index is around 1.0 → multiply by 100
    indices = [round(float(r[1]) * 100, 2) for r in rows]
    avg_rev_by_month = {int(r[0]): float(r[2]) if r[2] is not None else 0.0 for r in rows}

    # Find latest invoice month
    try:
        latest = db.execute(text("""
            SELECT EXTRACT(MONTH FROM MAX(date))::int AS m,
                   EXTRACT(YEAR FROM MAX(date))::int AS y
            FROM invoices
        """)).fetchone()
        if not latest or latest[0] is None:
            return _seed()
        current_month = int(latest[0])
        current_year = int(latest[1])
        actual_row = db.execute(text("""
            SELECT SUM(revenue) AS rev
            FROM invoices
            WHERE EXTRACT(MONTH FROM date)::int = :m
              AND EXTRACT(YEAR FROM date)::int = :y
        """), {"m": current_month, "y": current_year}).fetchone()
        actual_revenue = float(actual_row[0]) if actual_row and actual_row[0] is not None else 0.0
    except Exception:
        return _seed()

    expected_revenue = avg_rev_by_month.get(current_month, 0.0)
    if expected_revenue and actual_revenue:
        deviation_pct = ((actual_revenue / expected_revenue) - 1) * 100
    else:
        deviation_pct = 0.0

    if abs(deviation_pct) < 5:
        tone = "green"
    elif abs(deviation_pct) < 10:
        tone = "amber"
    else:
        tone = "red"

    return {
        "source": "live",
        "months": _MONTH_LABELS,
        "indices": indices,
        "currentMonthLabel": _MONTH_LABELS[current_month - 1],
        # Display as seasonal-index-scaled values (anchor 100)
        "currentMonthExpected": round(indices[current_month - 1], 1),
        "currentMonthActual": (
            round(indices[current_month - 1] * (actual_revenue / expected_revenue), 1)
            if expected_revenue else round(indices[current_month - 1], 1)
        ),
        "deviationPct": round(deviation_pct, 1),
        "deviationTone": tone,
        "note": (
            f"Indices from seasonal_patterns (entity_type='overall'). "
            f"{_MONTH_LABELS[current_month - 1]} {current_year} actual vs "
            f"3-year expected: {deviation_pct:+.1f}%."
        ),
    }
