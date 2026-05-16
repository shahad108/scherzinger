"""Pricing Studio v3 canonical models.

Six concerns, one package. Each module owns its own Pydantic wire shape
plus the SQLAlchemy table (where persisted). MarginState and Recommendation
are computed only — no table.

Importing this package registers the SQLAlchemy tables onto ``Base.metadata``
so Alembic autogenerate / ``Base.metadata.create_all`` pick them up.
"""
from __future__ import annotations

from backend.models.pricing.audit import (
    PricingAudit,
    PricingAuditAction,
    PricingAuditEntry,
    PricingAuditTargetKind,
)
from backend.models.pricing.cost_state import (
    CostBreakdown,
    CostState,
    CostStateRow,
    CostTrajectoryPoint,
)
from backend.models.pricing.customer_on_sku import (
    CustomerOnSku,
    CustomerOnSkuRow,
    CustomerTier,
)
from backend.models.pricing.lineage import (
    LineageRef,
    LineageRefRow,
    LineageSourceKind,
)
from backend.models.pricing.margin_state import MarginState
from backend.models.pricing.pricing_state import PriceState, PriceStateRow
from backend.models.pricing.recommendation import (
    Driver,
    DriverKind,
    Recommendation,
    RecommendationBand,
)

__all__ = [
    # Audit
    "PricingAudit",
    "PricingAuditAction",
    "PricingAuditEntry",
    "PricingAuditTargetKind",
    # Cost
    "CostBreakdown",
    "CostState",
    "CostStateRow",
    "CostTrajectoryPoint",
    # Customer
    "CustomerOnSku",
    "CustomerOnSkuRow",
    "CustomerTier",
    # Lineage
    "LineageRef",
    "LineageRefRow",
    "LineageSourceKind",
    # Margin (computed only)
    "MarginState",
    # Price
    "PriceState",
    "PriceStateRow",
    # Recommendation (computed only)
    "Driver",
    "DriverKind",
    "Recommendation",
    "RecommendationBand",
]
