"""Tests for the v2.2 Phase D win/loss composer.

The composer reads the ``quotes`` table directly via SQL. To keep these
tests fast and deterministic we drive a stub Session that returns
canned rows for each of the two queries (anchor, window aggregate,
sparkline aggregate).
"""
from __future__ import annotations

import datetime as _dt

import pytest

from backend.services.forecast.win_loss import build_win_loss


class _StubResult:
    def __init__(self, rows):
        self._rows = list(rows)
        self._scalar = self._rows[0][0] if (self._rows and len(self._rows[0]) == 1) else None

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None


class _StubDb:
    """Routes each SQL execute() to a canned result set by inspecting the
    statement text. We only need three distinct query shapes for the
    win_loss composer: anchor, window aggregate, sparkline aggregate.
    """

    def __init__(self, *, anchor, window_rows, sparkline_rows):
        self._anchor = anchor
        self._window_rows = window_rows
        self._sparkline_rows = sparkline_rows

    def execute(self, stmt, params=None):
        text = str(stmt)
        if "MAX(date)" in text:
            return _StubResult([(self._anchor,)])
        if "year, month" in text or "year,\n                   month" in text:
            return _StubResult(self._sparkline_rows)
        return _StubResult(self._window_rows)


def _make_db(anchor, window_rows, sparkline_rows=None):
    return _StubDb(
        anchor=anchor,
        window_rows=window_rows,
        sparkline_rows=sparkline_rows or [],
    )


def test_returns_empty_when_db_is_none():
    out = build_win_loss(None)
    assert out["rows"] == []
    assert out["window"]["days"] == 90


def test_returns_empty_when_no_anchor():
    db = _make_db(anchor=None, window_rows=[])
    out = build_win_loss(db)
    assert out["rows"] == []


def test_percentage_math():
    """3 PA out of 10 closed quotes → 30%."""
    anchor = _dt.date(2026, 5, 1)
    # 10 total closed quotes; 3 PA, 2 PR, 5 other rejection codes/won.
    window_rows = [
        ("BKAES Stahl", "PA", 3),
        ("BKAES Stahl", "PR", 2),
        ("BKAES Stahl", None, 5),  # represents won + other-code quotes
    ]
    db = _make_db(anchor=anchor, window_rows=window_rows)
    out = build_win_loss(db)
    assert out["window"]["anchor"] == "2026-05-01"
    assert len(out["rows"]) == 1
    row = out["rows"][0]
    assert row["cluster"] == "BKAES"
    assert row["sample"] == 10
    assert row["paPct"] == 30.0
    assert row["prPct"] == 20.0


def test_sparkline_has_twelve_entries():
    anchor = _dt.date(2026, 5, 15)
    window_rows = [("BKAES", "PA", 1)]
    # Only one month populated; expected output still pads to 12.
    sparkline_rows = [
        ("BKAES", "PA", 2026, 5, 4),
        ("BKAES", None, 2026, 5, 6),
    ]
    db = _make_db(anchor=anchor, window_rows=window_rows, sparkline_rows=sparkline_rows)
    out = build_win_loss(db)
    row = out["rows"][0]
    spark = row["monthlySparkline"]
    assert len(spark) == 12
    # Oldest first, newest (anchor) last.
    assert spark[0]["month"] == "2025-06"
    assert spark[-1]["month"] == "2026-05"
    # The populated month carries the right percentage (4/10 = 40%).
    last = spark[-1]
    assert last["paPct"] == 40.0
    # Unpopulated months default to zero.
    assert spark[0]["paPct"] == 0.0
    assert spark[0]["prPct"] == 0.0


def test_cluster_filter_returns_only_one_row():
    anchor = _dt.date(2026, 5, 1)
    window_rows = [
        ("BKAES Stahl", "PA", 2),
        ("BKAES Stahl", None, 8),
        ("MBDIV Misch", "PR", 1),
        ("MBDIV Misch", None, 4),
    ]
    db = _make_db(anchor=anchor, window_rows=window_rows)

    all_rows = build_win_loss(db)
    assert {r["cluster"] for r in all_rows["rows"]} == {"BKAES", "MBDIV"}

    only_bkaes = build_win_loss(db, cluster="BKAES")
    assert [r["cluster"] for r in only_bkaes["rows"]] == ["BKAES"]


def test_window_days_carried_through():
    anchor = _dt.date(2026, 5, 1)
    db = _make_db(anchor=anchor, window_rows=[("X", None, 1)])
    out = build_win_loss(db, window_days=30)
    assert out["window"]["days"] == 30


def test_zero_total_does_not_divide_by_zero():
    """If a cluster has zero closed quotes in the window the row is just
    skipped (the cluster won't be in ``agg``)."""
    anchor = _dt.date(2026, 5, 1)
    db = _make_db(anchor=anchor, window_rows=[])
    out = build_win_loss(db)
    assert out["rows"] == []


@pytest.mark.parametrize("pa_count,total,expected", [
    (3, 10, 30.0),
    (1, 4, 25.0),
    (0, 5, 0.0),
])
def test_percentage_math_parametrized(pa_count, total, expected):
    other = total - pa_count
    anchor = _dt.date(2026, 5, 1)
    window_rows = [("X", "PA", pa_count), ("X", None, other)]
    db = _make_db(anchor=anchor, window_rows=window_rows)
    out = build_win_loss(db)
    assert out["rows"][0]["paPct"] == expected
