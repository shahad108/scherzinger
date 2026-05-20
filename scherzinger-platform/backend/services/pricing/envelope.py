"""Canonical price-envelope resolver.

Single source of truth for the ``[floor, ceiling]`` envelope used by:

  - the workbench attach (``workbench_service._attach_phase1_signals``)
    when it asks elasticity for a 20-point win-prob curve;
  - the recommendation composer (``recommendation.build_recommendation``)
    when it optimises DB2 on that same curve grid.

Previously each call site had its own cascade with subtly different
fallback defaults, which meant the workbench's curve could sit on a
different price grid than the one the recommender optimised on — so the
recommended price could land "off-grid" relative to the UI's win-prob
curve.

The canonical cascade (decide once, document):

  1. If ``price_state.floor`` AND ``price_state.ceiling`` are set →
     use them verbatim.
  2. Else if ``price_state.list_price`` is set →
     ``0.85 × list / 1.20 × list``.
  3. Else if ``price_state.current_price`` is set →
     ``0.85 × current / 1.20 × current``.
  4. Else if ``cost_state.unit_cost`` is set →
     ``1.05 × cost / 1.80 × cost``.
  5. Else → demo defaults ``(85, 120)``.

The function accepts duck-typed row/model objects: anything exposing
``.floor / .ceiling / .list_price / .current_price`` (for the price
input) or ``.unit_cost`` (for the cost input). Both ``None``-safe.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional


_TWO_PLACES = Decimal("0.01")


def _scaled(anchor: Decimal, factor: Decimal) -> Decimal:
    return (anchor * factor).quantize(_TWO_PLACES)


def resolve_envelope(
    price_state: Optional[Any],
    cost_state: Optional[Any],
    *,
    demo_floor: Decimal = Decimal("85"),
    demo_ceiling: Decimal = Decimal("120"),
) -> tuple[Decimal, Decimal]:
    """Resolve the canonical ``(floor, ceiling)`` envelope.

    See module docstring for the cascade. Returns the demo defaults
    (already quantised to two decimal places) when both inputs are
    ``None`` / empty.
    """
    # 1. Explicit floor + ceiling on PriceState.
    if price_state is not None:
        floor = getattr(price_state, "floor", None)
        ceiling = getattr(price_state, "ceiling", None)
        if floor is not None and ceiling is not None:
            return Decimal(floor).quantize(_TWO_PLACES), Decimal(ceiling).quantize(
                _TWO_PLACES
            )

    # 2. list_price → 0.85x / 1.20x.
    if price_state is not None:
        list_price = getattr(price_state, "list_price", None)
        if list_price is not None and Decimal(list_price) > 0:
            return _scaled(Decimal(list_price), Decimal("0.85")), _scaled(
                Decimal(list_price), Decimal("1.20")
            )

    # 3. current_price → 0.85x / 1.20x.
    if price_state is not None:
        current = getattr(price_state, "current_price", None)
        if current is not None and Decimal(current) > 0:
            return _scaled(Decimal(current), Decimal("0.85")), _scaled(
                Decimal(current), Decimal("1.20")
            )

    # 4. unit_cost → 1.05x / 1.80x.
    if cost_state is not None:
        unit_cost = getattr(cost_state, "unit_cost", None)
        if unit_cost is not None and Decimal(unit_cost) > 0:
            return _scaled(Decimal(unit_cost), Decimal("1.05")), _scaled(
                Decimal(unit_cost), Decimal("1.80")
            )

    # 5. Demo defaults.
    return demo_floor.quantize(_TWO_PLACES), demo_ceiling.quantize(_TWO_PLACES)
