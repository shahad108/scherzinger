"""Pricing Studio v3 — recommendation contract.

Recommendations are *computed* (no dedicated table — they're derived from
inputs + model outputs + audit history). The Pydantic models pin the wire
shape every consumer (Studio hero card, Action Center, alerts) must follow.
"""
from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.models.pricing.lineage import LineageRef


class DriverKind(str, Enum):
    COMPETITOR = "competitor"
    COST = "cost"
    ELASTICITY = "elasticity"
    SEASONALITY = "seasonality"
    INVENTORY = "inventory"
    CUSTOMER_MIX = "customer_mix"
    WON_DEAL = "won_deal"
    CHURN_RISK = "churn_risk"
    POLICY = "policy"


class Driver(BaseModel):
    """One pill on the Why-this-price strip.

    ``contribution_pct`` is the share of the move attributed to this driver
    (0.0–1.0, summed contributions ≈ 1.0 across all drivers for the move).
    """

    model_config = ConfigDict(from_attributes=True)

    kind: DriverKind
    label: str
    contribution_pct: Decimal = Field(ge=Decimal("0"), le=Decimal("1"))
    lineage_ref: Optional[LineageRef] = None


class RecommendationBand(BaseModel):
    """Confidence band for the recommended price (EUR)."""

    min: Decimal
    target: Decimal
    max: Decimal


class Recommendation(BaseModel):
    """The hero contract: one recommended price + confidence + drivers + memo."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    recommended_price: Decimal
    confidence: Decimal = Field(
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Model confidence 0.0–1.0.",
    )
    band: RecommendationBand
    drivers: list[Driver] = Field(default_factory=list)
    rationale_md: str
    lineage_ref: Optional[LineageRef] = None
