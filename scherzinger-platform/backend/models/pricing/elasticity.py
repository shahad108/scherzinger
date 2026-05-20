"""Pricing Studio v3 — win-probability curve.

A 20-point discretisation of P(win | price) across [floor, ceiling]. Fit
with a logistic regression of ``won`` on ``(price-cost)/cost`` (margin)
when ``n_deals`` is sufficient; flat 50% fallback otherwise.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pricing.lineage import LineageRef


class CurvePoint(BaseModel):
    """One (price, win_prob, ci) sample on the curve."""

    model_config = ConfigDict(from_attributes=True)

    price: Decimal
    win_prob: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    lower_ci: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    upper_ci: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))


class WinProbCurve(BaseModel):
    """20-point P(win | price) curve plus model lineage."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    tier: Optional[str] = None
    points: list[CurvePoint] = Field(default_factory=list)
    n_deals: int = Field(ge=0)
    confidence_band: Optional[str] = Field(
        default=None,
        description="Tag for the CI methodology used ('asymptotic', 'bootstrap', None for fallback).",
    )
    lineage_ref: Optional[LineageRef] = None
