"""Seasonal overlay block — monthly indices + current-month deviation.

Uses ``seasonal_patterns`` (entity_type='overall') for the 12 indices and
``invoices`` for the latest-month actual revenue. Deviation = actual / expected
where expected = (12-month avg revenue) × seasonal_index.

# Partial-month handling (DATA-AUDIT-2026-05-17 defect #15)
# --------------------------------------------------------
# The current month is almost always partial (e.g. mid-May has 17/31
# days of data). Comparing a 17-day numerator against a 31-day historical
# denominator made the deviation collapse to -99.9% / -100% even when the
# month was tracking perfectly. We now pro-rate the actual revenue to
# month-end equivalent and disclose `dataComplete=False` with day counts
# so the FE can render "May 2026 partial — 17/31 days" alongside the
# (now meaningful) deviation.
"""
from __future__ import annotations

import calendar
from datetime import date
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
            SELECT MAX(date)::date AS d
            FROM invoices
        """)).fetchone()
        if not latest or latest[0] is None:
            return _seed()
        latest_date: date = latest[0]
        current_month = int(latest_date.month)
        current_year = int(latest_date.year)
        actual_row = db.execute(text("""
            SELECT SUM(revenue) AS rev
            FROM invoices
            WHERE EXTRACT(MONTH FROM date)::int = :m
              AND EXTRACT(YEAR FROM date)::int = :y
        """), {"m": current_month, "y": current_year}).fetchone()
        actual_revenue = float(actual_row[0]) if actual_row and actual_row[0] is not None else 0.0
    except Exception:
        return _seed()

    # Partial-month handling: pro-rate the YTD-month actual to a month-end
    # equivalent so we compare like-for-like against the historical
    # baseline. Without this the deviation would always collapse to
    # ~-100% during the early part of a month.
    days_total = calendar.monthrange(current_year, current_month)[1]
    days_so_far = latest_date.day
    data_complete = days_so_far >= days_total

    # When the current month is too thin (e.g. only the first day or two
    # of data) pro-rating produces an unreliable extrapolation. Fall back
    # to the last fully-closed month so the deviation headline is
    # meaningful. We treat "<25% of month elapsed" as too thin.
    if not data_complete and days_so_far / days_total < 0.25:
        # Walk one month back, find the previous month's actuals.
        prev_month = current_month - 1 if current_month > 1 else 12
        prev_year = current_year if current_month > 1 else current_year - 1
        try:
            prev_row = db.execute(text("""
                SELECT SUM(revenue) AS rev
                FROM invoices
                WHERE EXTRACT(MONTH FROM date)::int = :m
                  AND EXTRACT(YEAR FROM date)::int = :y
            """), {"m": prev_month, "y": prev_year}).fetchone()
            prev_actual = float(prev_row[0]) if prev_row and prev_row[0] is not None else 0.0
        except Exception:
            prev_actual = 0.0
        if prev_actual > 0:
            current_month = prev_month
            current_year = prev_year
            actual_revenue = prev_actual
            days_total = calendar.monthrange(current_year, current_month)[1]
            days_so_far = days_total
            data_complete = True

    if not data_complete and days_so_far > 0:
        prorated_actual = actual_revenue * (days_total / days_so_far)
    else:
        prorated_actual = actual_revenue

    expected_revenue = avg_rev_by_month.get(current_month, 0.0)
    if expected_revenue and prorated_actual:
        deviation_pct = ((prorated_actual / expected_revenue) - 1) * 100
    else:
        deviation_pct = 0.0

    if abs(deviation_pct) < 5:
        tone = "green"
    elif abs(deviation_pct) < 10:
        tone = "amber"
    else:
        tone = "red"

    partial_suffix = (
        f" Partial month — {days_so_far}/{days_total} days; actual pro-rated to month-end."
        if not data_complete else ""
    )

    return {
        "source": "live",
        "months": _MONTH_LABELS,
        "indices": indices,
        "currentMonthLabel": _MONTH_LABELS[current_month - 1],
        # Display as seasonal-index-scaled values (anchor 100). The
        # "actual" we expose is the pro-rated month-end equivalent so the
        # bar lines up with the expected bar on the same axis.
        "currentMonthExpected": round(indices[current_month - 1], 1),
        "currentMonthActual": (
            round(indices[current_month - 1] * (prorated_actual / expected_revenue), 1)
            if expected_revenue else round(indices[current_month - 1], 1)
        ),
        "deviationPct": round(deviation_pct, 1),
        "deviationTone": tone,
        # Partial-month metadata (DATA-AUDIT-2026-05-17 defect #15) so the
        # FE can render an honest "May partial — 17/31 days" caption.
        "dataComplete": bool(data_complete),
        "partialMonthDays": int(days_so_far),
        "totalMonthDays": int(days_total),
        "note": (
            f"Indices from seasonal_patterns (entity_type='overall'). "
            f"{_MONTH_LABELS[current_month - 1]} {current_year} pro-rated "
            f"actual vs 3-year expected: {deviation_pct:+.1f}%."
            + partial_suffix
        ),
    }
