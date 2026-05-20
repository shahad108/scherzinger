"""Phase 1 — win-probability curve (logistic elasticity) tests."""
from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from backend.services.pricing import elasticity as el


@pytest.fixture(autouse=True)
def _stub_lineage(monkeypatch):
    def _fake_create_lineage(**kwargs):
        row = MagicMock()
        row.id = uuid4()
        row.source_kind = (
            kwargs["source_kind"].value
            if hasattr(kwargs["source_kind"], "value")
            else str(kwargs["source_kind"])
        )
        row.source_id = kwargs["source_id"]
        row.sql = kwargs.get("sql")
        row.model = kwargs.get("model")
        row.computed_at = datetime.now(timezone.utc)
        row.computed_by = kwargs["computed_by"]
        return row

    monkeypatch.setattr(el, "create_lineage", _fake_create_lineage)
    yield


def _stub_session(deals: list[tuple[float, float, int]]) -> MagicMock:
    """Stub session returning (price, cost, won) tuples for the curve fit."""
    session = MagicMock()
    rows = [(Decimal(str(p)), Decimal(str(c)), bool(w)) for p, c, w in deals]
    session.execute.return_value.fetchall.return_value = rows
    return session


def _floor_ceiling(low: float = 80.0, high: float = 130.0) -> tuple[Decimal, Decimal]:
    return Decimal(str(low)), Decimal(str(high))


def test_returns_20_points_for_healthy_sample() -> None:
    # Build a clean dataset where lower price → higher win rate.
    deals: list[tuple[float, float, int]] = []
    for _ in range(40):
        deals.append((90.0, 70.0, 1))     # cheap, won
        deals.append((120.0, 70.0, 0))    # expensive, lost
    deals.extend([(100.0, 70.0, 1)] * 10)
    deals.extend([(110.0, 70.0, 0)] * 10)
    session = _stub_session(deals)
    floor, ceiling = _floor_ceiling()
    curve = el.build_win_prob_curve(
        aid="X-1",
        tier="A",
        points=20,
        floor=floor,
        ceiling=ceiling,
        db_session=session,
    )
    assert curve is not None
    assert len(curve.points) == 20
    # CI columns must always be present even on the logistic path.
    for pt in curve.points:
        assert pt.lower_ci <= pt.win_prob <= pt.upper_ci


def test_win_prob_non_increasing_with_price() -> None:
    """Sanity: as price rises, win_prob should NOT increase."""
    deals: list[tuple[float, float, int]] = []
    for _ in range(40):
        deals.append((90.0, 70.0, 1))
        deals.append((120.0, 70.0, 0))
    session = _stub_session(deals)
    floor, ceiling = _floor_ceiling()
    curve = el.build_win_prob_curve(
        aid="X-1",
        tier="A",
        points=20,
        floor=floor,
        ceiling=ceiling,
        db_session=session,
    )
    # Walk the curve — every successive point's win_prob ≤ predecessor.
    for prev, cur in zip(curve.points, curve.points[1:]):
        assert cur.win_prob <= prev.win_prob + Decimal("0.0001")


def test_fallback_flat_50_when_sample_small() -> None:
    deals = [(100.0, 70.0, 1), (110.0, 70.0, 0)]  # n=2
    session = _stub_session(deals)
    floor, ceiling = _floor_ceiling()
    curve = el.build_win_prob_curve(
        aid="X-1",
        tier="A",
        points=20,
        floor=floor,
        ceiling=ceiling,
        db_session=session,
    )
    assert curve is not None
    assert len(curve.points) == 20
    # Flat 0.5 everywhere; CI band is None per spec.
    for pt in curve.points:
        assert pt.win_prob == Decimal("0.5")
    assert curve.confidence_band is None


def test_fallback_flat_50_when_all_won() -> None:
    """SF6: 10 quotes, all won → logistic likelihood is unbounded.
    Caller must fall back to the flat-50% curve with confidence_band=None.
    """
    deals = [(95.0 + i, 70.0, 1) for i in range(10)]
    session = _stub_session(deals)
    floor, ceiling = _floor_ceiling()
    curve = el.build_win_prob_curve(
        aid="X-1",
        tier="A",
        points=20,
        floor=floor,
        ceiling=ceiling,
        db_session=session,
    )
    assert curve is not None
    assert curve.confidence_band is None
    for pt in curve.points:
        assert pt.win_prob == Decimal("0.5")


def test_fallback_flat_50_when_all_lost() -> None:
    """SF6: 10 quotes, all lost → no MLE. Fall back to flat-50%."""
    deals = [(95.0 + i, 70.0, 0) for i in range(10)]
    session = _stub_session(deals)
    floor, ceiling = _floor_ceiling()
    curve = el.build_win_prob_curve(
        aid="X-1",
        tier="A",
        points=20,
        floor=floor,
        ceiling=ceiling,
        db_session=session,
    )
    assert curve is not None
    assert curve.confidence_band is None
    for pt in curve.points:
        assert pt.win_prob == Decimal("0.5")


def test_curve_points_span_floor_to_ceiling() -> None:
    deals: list[tuple[float, float, int]] = []
    for _ in range(20):
        deals.append((90.0, 70.0, 1))
        deals.append((120.0, 70.0, 0))
    session = _stub_session(deals)
    floor, ceiling = _floor_ceiling(80.0, 130.0)
    curve = el.build_win_prob_curve(
        aid="X-1",
        tier="A",
        points=20,
        floor=floor,
        ceiling=ceiling,
        db_session=session,
    )
    prices = [pt.price for pt in curve.points]
    assert prices[0] == floor
    assert prices[-1] == ceiling
