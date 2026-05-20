"""Pricing Studio v3 — competitor reference signal.

Aggregated from lost-quote ``rejection_code in ('PA','PR')`` events in
``quotes`` over the last ``n_days``. Used by the recommender and rendered
as a single line on the workbench hero: "Competitors lost at €X — n samples".
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pricing.lineage import LineageRef


class CompetitorRef(BaseModel):
    """One competitor-signal aggregate for a SKU."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    median_price: Decimal
    sample_count: int = Field(ge=1)
    last_seen: datetime
    window_days: int = Field(ge=1)
    lineage_ref: Optional[LineageRef] = None
