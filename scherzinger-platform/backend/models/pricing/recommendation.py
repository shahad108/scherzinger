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
    # Phase 1 driver kinds — SHAP-style attribution on the recommender
    # (sum to 1.0 ±0.01 across all drivers).
    COST_TRAJECTORY = "cost_trajectory"
    COMPETITOR_SIGNAL = "competitor_signal"
    WIN_PROB_OPTIMUM = "win_prob_optimum"
    FLOOR_PROTECTION = "floor_protection"


class ConfidenceLevel(str, Enum):
    """Coarse confidence bucket exposed alongside the numeric ``confidence``.

    Computed from ``n_deals`` + WTP-band width so the UI can render a
    single low/med/high pill without re-deriving the rule.
    """

    LOW = "low"
    MED = "med"
    HIGH = "high"


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
    """Confidence band for the recommended price (EUR).

    ``min`` = lowest price where win-prob ≥ 80%
    ``target`` = recommended price (DB2-maximising)
    ``max`` = highest price where win-prob ≥ 50%
    """

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
    confidence_level: ConfidenceLevel = Field(
        description=(
            "Coarse low/med/high bucket. Derived from ``n_deals`` and the "
            "WTP-band width: low if n<5 or (p90-p10)/p50>0.5; high if n≥15 "
            "and band tight; med otherwise."
        ),
    )
    band: RecommendationBand
    drivers: list[Driver] = Field(default_factory=list)
    drivers_heuristic: bool = Field(
        default=False,
        description=(
            "True when ``drivers[]`` was generated via the degenerate-"
            "attribution heuristic (one signal swallowed the L1 pie; we "
            "fell back to a defensible per-driver split). The frontend "
            "renders a small badge in this case so the analyst knows "
            "the weights are heuristic rather than measured."
        ),
    )
    rationale_md: str
    lineage_ref: Optional[LineageRef] = None
