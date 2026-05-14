"""Tests for the v2.2 Phase E erosion projection composer.

We drive a stub Session that routes each SQL execute() to a canned
result set based on the SQL text — same trick the win_loss tests use.
The composer issues three queries:

* ``SELECT MAX(date) FROM invoices`` — anchor
* monthly per-cluster series (year, month, list_price, cost)
* cadence query (commodity_group, levels, months_covered)
"""
from __future__ import annotations

import datetime as _dt

from backend.services.forecast.erosion_projection import build_erosion_projection


class _StubResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None


class _StubDb:
    def __init__(self, *, anchor, monthly_rows, cadence_rows):
        self._anchor = anchor
        self._monthly_rows = monthly_rows
        self._cadence_rows = cadence_rows

    def execute(self, stmt, params=None):
        text = str(stmt)
        if "MAX(date)" in text and "FROM invoices" in text and "SELECT MAX(date) FROM invoices" in text.replace("\n", " ").replace("  ", " "):
            return _StubResult([(self._anchor,)])
        # Anchor is a single SELECT MAX(date) FROM invoices — match it loosely.
        if "MAX(date) FROM invoices" in text and "GROUP BY" not in text and "WHERE" not in text:
            return _StubResult([(self._anchor,)])
        if "COUNT(DISTINCT lp)" in text or "months_covered" in text:
            return _StubResult(self._cadence_rows)
        # Default: monthly per-cluster series.
        return _StubResult(self._monthly_rows)


def _monthly(cluster, points):
    """Helper: build per-month tuples (commodity_group, year, month, lp, cost)."""
    return [(cluster, y, m, lp, cost) for (y, m, lp, cost) in points]


def test_returns_empty_when_db_is_none():
    out = build_erosion_projection(None)
    assert out == {"horizonMonths": 12, "rows": []}


def test_returns_empty_when_no_anchor():
    db = _StubDb(anchor=None, monthly_rows=[], cadence_rows=[])
    out = build_erosion_projection(db)
    assert out["rows"] == []


def test_crossover_within_horizon():
    """List price falling 1/mo, cost flat — cross at month 5 (when list ≤ cost).

    Series: list 10..7 (4 months, slope ≈ -1), cost 5 (flat slope = 0).
    Starting current_list=7, current_cost=5; cross when 7 + slope*i ≤ 5.
    With slope = -1 → i = 2 → crossover month = anchor+2.
    """
    anchor = _dt.date(2026, 5, 31)
    rows = _monthly("BKAES", [
        (2026, 2, 10.0, 5.0),
        (2026, 3, 9.0, 5.0),
        (2026, 4, 8.0, 5.0),
        (2026, 5, 7.0, 5.0),
    ])
    db = _StubDb(anchor=anchor, monthly_rows=rows, cadence_rows=[])
    out = build_erosion_projection(db, horizon_months=6)
    assert len(out["rows"]) == 1
    row = out["rows"][0]
    assert row["cluster"] == "BKAES"
    assert row["currentListPrice"] == 7.0
    assert row["currentFloor"] == 5.0
    assert row["monthlyListSlope"] == -1.0
    assert row["monthlyCostSlope"] == 0.0
    # Projection starts the month after the anchor month → June 2026 is i=1.
    # First crossover happens when 7 - i ≤ 5 → i = 2 → projection[1].month
    proj = row["projection"]
    assert len(proj) == 6
    assert proj[0]["month"] == "2026-06"
    assert row["crossoverMonth"] == proj[1]["month"]  # i = 2 → July 2026
    assert row["crossoverMonth"] == "2026-07"


def test_no_crossover_within_horizon():
    """Healthy cluster: list rising, cost rising slower — no crossover in horizon."""
    anchor = _dt.date(2026, 5, 31)
    rows = _monthly("BKAGG", [
        (2026, 1, 10.0, 5.0),
        (2026, 2, 10.5, 5.1),
        (2026, 3, 11.0, 5.2),
        (2026, 4, 11.5, 5.3),
        (2026, 5, 12.0, 5.4),
    ])
    db = _StubDb(anchor=anchor, monthly_rows=rows, cadence_rows=[])
    out = build_erosion_projection(db, horizon_months=12)
    assert len(out["rows"]) == 1
    assert out["rows"][0]["crossoverMonth"] is None


def test_cadence_calculation():
    """3 distinct levels over 12 months → updates every 6 months."""
    anchor = _dt.date(2026, 5, 31)
    series = _monthly("BKAIZ", [
        (2026, 1, 8.0, 5.0),
        (2026, 2, 8.0, 5.0),
        (2026, 3, 8.0, 5.0),
        (2026, 4, 8.0, 5.0),
    ])
    cadence = [("BKAIZ", 3, 12)]  # 3 levels over 12 months → every 6 months
    db = _StubDb(anchor=anchor, monthly_rows=series, cadence_rows=cadence)
    out = build_erosion_projection(db)
    row = out["rows"][0]
    assert row["cadence"]["updatesEveryMonths"] == 6
    assert row["cadence"]["benchmarkMonths"] == 1


def test_cadence_unknown_when_only_one_level():
    anchor = _dt.date(2026, 5, 31)
    series = _monthly("MBDIV", [
        (2026, 1, 8.0, 5.0),
        (2026, 2, 8.0, 5.0),
    ])
    cadence = [("MBDIV", 1, 12)]  # only one level → cadence unknown
    db = _StubDb(anchor=anchor, monthly_rows=series, cadence_rows=cadence)
    out = build_erosion_projection(db)
    row = out["rows"][0]
    assert row["cadence"]["updatesEveryMonths"] is None
    assert row["cadence"]["benchmarkMonths"] == 1


def test_cluster_filter_narrows_to_one_row():
    anchor = _dt.date(2026, 5, 31)
    rows = (
        _monthly("BKAES", [(2026, 4, 10.0, 5.0), (2026, 5, 9.5, 5.1)])
        + _monthly("MBDIV", [(2026, 4, 7.0, 4.0), (2026, 5, 6.8, 4.1)])
    )
    db = _StubDb(anchor=anchor, monthly_rows=rows, cadence_rows=[])

    full = build_erosion_projection(db)
    assert {r["cluster"] for r in full["rows"]} == {"BKAES", "MBDIV"}

    only_bkaes = build_erosion_projection(db, cluster="BKAES")
    assert [r["cluster"] for r in only_bkaes["rows"]] == ["BKAES"]


def test_horizon_months_carried_through():
    anchor = _dt.date(2026, 5, 31)
    rows = _monthly("BKAES", [(2026, 4, 10.0, 5.0), (2026, 5, 10.0, 5.0)])
    db = _StubDb(anchor=anchor, monthly_rows=rows, cadence_rows=[])
    out = build_erosion_projection(db, horizon_months=3)
    assert out["horizonMonths"] == 3
    assert len(out["rows"][0]["projection"]) == 3
