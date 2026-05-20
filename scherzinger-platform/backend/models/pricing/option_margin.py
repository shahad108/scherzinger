"""Pricing Studio v3 / Phase 3 — per-option pocket waterfall.

For each PriceOption the workbench surfaces (Hold / Floor / Market / Custom /
Recommendation) we compute the full pocket waterfall at THAT option's price:
list → quoted → booked → invoiced → db2. The frontend renders a mini-
waterfall inside each option card from this typed payload — no client math.

Computed (not persisted). Born with a lineage ref so the audit trail can
replay where the leakage percentages came from.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pricing.lineage import LineageRef


class OptionMargin(BaseModel):
    """Pocket waterfall for one (aid, option, price) triple.

    All money values are EUR Decimals — same unit-cost basis the rest of
    the pricing pipeline uses (one unit). ``leakage_per_step_pct`` is a
    list of 4 percentage-of-list values describing the leakage at each
    step transition (list→quoted, quoted→booked, booked→invoiced,
    invoiced→db2); the sum equals (list - db2) / list × 100 to within
    rounding.
    """

    model_config = ConfigDict(from_attributes=True)

    option_id: str = Field(
        description="Stable option identifier — one of hold/floor/market/custom/recommendation."
    )
    price: Decimal = Field(description="The option's price (EUR per unit).")
    list: Decimal
    quoted: Decimal
    booked: Decimal
    invoiced: Decimal
    db2: Decimal
    leakage_per_step_pct: list[Decimal] = Field(
        default_factory=list,
        description=(
            "Four values for the four transitions: list→quoted, quoted→booked, "
            "booked→invoiced, invoiced→db2 — each expressed as a percentage of "
            "the option's list price."
        ),
    )
    lineage_ref: Optional[LineageRef] = None
