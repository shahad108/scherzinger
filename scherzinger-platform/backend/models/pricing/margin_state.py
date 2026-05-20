"""Pricing Studio v3 — derived margin state.

Margin state is *computed*, not stored. The composer derives it on the fly
from ``PriceState`` + ``CostState`` + customer mix. Surfacing it as a
typed Pydantic model keeps the wire contract tight.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pricing.lineage import LineageRef


class MarginState(BaseModel):
    """DB1/DB2/DB3 cascade for a single article.

    - ``db1`` = price − material cost
    - ``db2`` = db1 − labor − outsourcing
    - ``db3`` = db2 − overhead (= pocket margin)
    - ``pocket_pct_of_list`` = db3 / list_price (None if list_price unknown)
    """

    model_config = ConfigDict(from_attributes=True)

    aid: str
    price: Decimal
    db1: Decimal
    db2: Decimal
    db3: Decimal
    pocket_pct_of_list: Optional[Decimal] = Field(
        default=None,
        description="db3 divided by list_price. None when list_price is missing.",
    )
    lineage_ref: Optional[LineageRef] = None
