"""Phase 1 — canonical envelope cascade tests.

Pins the five-level cascade documented in
``backend/services/pricing/envelope.py``. Both the workbench attach AND
the recommendation composer go through this resolver, so the grid the
recommender optimises on is *always* the grid the workbench renders.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from backend.services.pricing.envelope import resolve_envelope


@dataclass
class _Price:
    floor: Optional[Decimal] = None
    ceiling: Optional[Decimal] = None
    list_price: Optional[Decimal] = None
    current_price: Optional[Decimal] = None


@dataclass
class _Cost:
    unit_cost: Optional[Decimal] = None


def test_cascade_level_1_explicit_floor_ceiling() -> None:
    """Level 1: PriceState.floor + PriceState.ceiling both set → verbatim."""
    price = _Price(floor=Decimal("90.00"), ceiling=Decimal("115.00"))
    floor, ceiling = resolve_envelope(price, None)
    assert floor == Decimal("90.00")
    assert ceiling == Decimal("115.00")


def test_cascade_level_2_list_price() -> None:
    """Level 2: list_price → 0.85x / 1.20x."""
    price = _Price(list_price=Decimal("100.00"))
    floor, ceiling = resolve_envelope(price, None)
    assert floor == Decimal("85.00")
    assert ceiling == Decimal("120.00")


def test_cascade_level_3_current_price() -> None:
    """Level 3: only current_price → 0.85x / 1.20x."""
    price = _Price(current_price=Decimal("100.00"))
    floor, ceiling = resolve_envelope(price, None)
    assert floor == Decimal("85.00")
    assert ceiling == Decimal("120.00")


def test_cascade_level_4_unit_cost() -> None:
    """Level 4: no price info, only unit_cost → 1.05x / 1.80x."""
    cost = _Cost(unit_cost=Decimal("70.00"))
    floor, ceiling = resolve_envelope(None, cost)
    assert floor == Decimal("73.50")
    assert ceiling == Decimal("126.00")


def test_cascade_level_5_demo_defaults() -> None:
    """Level 5: nothing → demo (85, 120)."""
    floor, ceiling = resolve_envelope(None, None)
    assert floor == Decimal("85.00")
    assert ceiling == Decimal("120.00")


def test_explicit_envelope_wins_over_list_price() -> None:
    """Cascade ordering: explicit floor/ceiling beats list_price."""
    price = _Price(
        floor=Decimal("90.00"),
        ceiling=Decimal("110.00"),
        list_price=Decimal("200.00"),  # would otherwise scale to 170/240
    )
    floor, ceiling = resolve_envelope(price, None)
    assert floor == Decimal("90.00")
    assert ceiling == Decimal("110.00")


def test_list_price_wins_over_current_price() -> None:
    """Cascade ordering: list_price beats current_price."""
    price = _Price(
        list_price=Decimal("100.00"),
        current_price=Decimal("200.00"),  # would otherwise scale to 170/240
    )
    floor, ceiling = resolve_envelope(price, None)
    assert floor == Decimal("85.00")
    assert ceiling == Decimal("120.00")


def test_price_state_wins_over_cost_state() -> None:
    """Any price-derived envelope beats the cost-derived fallback."""
    price = _Price(current_price=Decimal("100.00"))
    cost = _Cost(unit_cost=Decimal("70.00"))
    floor, ceiling = resolve_envelope(price, cost)
    assert floor == Decimal("85.00")
    assert ceiling == Decimal("120.00")
