"""Pricing Studio v3 canonical models.

Six concerns, one package. Each module owns its own Pydantic wire shape
plus the SQLAlchemy table (where persisted). MarginState and Recommendation
are computed only — no table.

Importing this package registers the SQLAlchemy tables onto ``Base.metadata``
so Alembic autogenerate / ``Base.metadata.create_all`` pick them up.
"""
from __future__ import annotations

from backend.models.pricing.approval import (
    ApprovalAction,
    ApprovalDecisionKind,
    ApprovalInstance,
    ApprovalRoute,
    ApprovalStepState,
)
from backend.models.pricing.audit import (
    PricingAudit,
    PricingAuditAction,
    PricingAuditEntry,
    PricingAuditTargetKind,
)
from backend.models.pricing.competitor import CompetitorRef
from backend.models.pricing.cost_state import (
    CostBreakdown,
    CostState,
    CostStateRow,
    CostTrajectoryPoint,
)
from backend.models.pricing.customer_on_sku import (
    CustomerOnSku,
    CustomerOnSkuRow,
    CustomerOnSkuSnapshotRow,
    CustomerTier,
    PaidBand,
)
from backend.models.pricing.lineage import (
    LineageRef,
    LineageRefRow,
    LineageSourceKind,
)
from backend.models.pricing.margin_state import MarginState
from backend.models.pricing.option_margin import OptionMargin
from backend.models.pricing.pricing_state import PriceState, PriceStateRow
from backend.models.pricing.elasticity import CurvePoint, WinProbCurve
from backend.models.pricing.recommendation import (
    ConfidenceLevel,
    Driver,
    DriverKind,
    Recommendation,
    RecommendationBand,
)
from backend.models.pricing.wtp import WtpBand

__all__ = [
    # Approval workflow (Phase 5)
    "ApprovalAction",
    "ApprovalDecisionKind",
    "ApprovalInstance",
    "ApprovalRoute",
    "ApprovalStepState",
    # Audit
    "PricingAudit",
    "PricingAuditAction",
    "PricingAuditEntry",
    "PricingAuditTargetKind",
    # Competitor (computed only)
    "CompetitorRef",
    # Cost
    "CostBreakdown",
    "CostState",
    "CostStateRow",
    "CostTrajectoryPoint",
    # Customer
    "CustomerOnSku",
    "CustomerOnSkuRow",
    "CustomerOnSkuSnapshotRow",
    "CustomerTier",
    "PaidBand",
    # Lineage
    "LineageRef",
    "LineageRefRow",
    "LineageSourceKind",
    # Margin (computed only)
    "MarginState",
    # OptionMargin (computed only)
    "OptionMargin",
    # Price
    "PriceState",
    "PriceStateRow",
    # Recommendation (computed only)
    "ConfidenceLevel",
    "Driver",
    "DriverKind",
    "Recommendation",
    "RecommendationBand",
    # Elasticity (computed only)
    "CurvePoint",
    "WinProbCurve",
    # WTP (computed only)
    "WtpBand",
]
