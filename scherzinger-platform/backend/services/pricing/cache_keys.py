"""Pricing Studio v3 / Phase 2 — shared cache-key helpers.

Centralizes the canonicalization rules for Decimal-valued components of
cache keys. ``Decimal("127.00")`` and ``Decimal("127.0")`` are numerically
equal but ``str()`` produces different text — without quantizing first,
equivalent prices would thrash the per-(aid, price) caches in
``customer_fanout`` and ``customer_drill_in``.

The fanout/drill-in builders MUST use ``canonical_price_key`` for any
``Decimal | None`` that participates in their cache keys.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional


# 4 decimals matches the precision used everywhere else in the pricing
# domain (paid_band, risk_if_moved, delta_pct, etc.).
_PRICE_QUANT = Decimal("0.0001")


def canonical_price_key(price: Optional[Decimal]) -> str:
    """Return a canonical string for a Decimal price suitable for caching.

    None → "" (distinct from "0.0000"). All numerically-equal Decimals
    map to the same string by quantizing to 4 decimal places.
    """
    if price is None:
        return ""
    if not isinstance(price, Decimal):
        price = Decimal(str(price))
    return str(price.quantize(_PRICE_QUANT))
