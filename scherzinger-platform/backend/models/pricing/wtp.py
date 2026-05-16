"""Pricing Studio v3 — willingness-to-pay (WTP) band.

Computed from won-deal samples on a SKU × tier slice over a rolling
``window_days`` window. p10/p50/p90 anchor the WTP distribution and feed
the recommender as one of its inputs. See
``services/pricing/wtp.py::build_wtp``.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pricing.lineage import LineageRef
from backend.models.pricing.recommendation import ConfidenceLevel


class WtpBand(BaseModel):
    """Willingness-to-pay percentiles for a SKU × tier slice."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    tier: Optional[str] = None
    p10: Decimal
    p50: Decimal
    p90: Decimal
    n_deals: int = Field(ge=0)
    window_days: int = Field(ge=1)
    confidence: ConfidenceLevel
    lineage_ref: Optional[LineageRef] = None
