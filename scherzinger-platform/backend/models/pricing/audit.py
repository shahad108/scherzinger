"""Pricing Studio v3 — append-only audit log.

Distinct from the generic ``AuditLog`` (backend/models/audit.py) which
predates this module and is consumed by other surfaces. This table is
narrowly scoped to pricing actions and is the source of truth for the
"What changed since" diff strip + audit drawer.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base
from backend.models.pricing.lineage import LineageRef


class PricingAuditAction(str, Enum):
    PRICE_SET = "price_set"
    PROPOSAL_CREATED = "proposal_created"
    PROPOSAL_APPROVED = "proposal_approved"
    PROPOSAL_REJECTED = "proposal_rejected"
    OVERRIDE_ADDED = "override_added"
    ALERT_TRIGGERED = "alert_triggered"
    PUSH_TO_QUOTING = "push_to_quoting"
    ROLLBACK = "rollback"
    AB_TEST_CREATED = "ab_test_created"
    AB_TEST_PROMOTED = "ab_test_promoted"


class PricingAuditTargetKind(str, Enum):
    SKU = "sku"
    CUSTOMER = "customer"
    CLUSTER = "cluster"
    FAMILY = "family"


class PricingAuditEntry(Base):
    """One row per state-changing pricing action.

    Indexed on (target_id, at desc) for the audit drawer's per-SKU query and
    on (action, at desc) for cross-cutting timeline views.
    """

    __tablename__ = "pricing_audit"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
    actor: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    target_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    before: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    after: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lineage_ref_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lineage_refs.id", ondelete="SET NULL"), nullable=True
    )


class PricingAudit(BaseModel):
    """Wire-shape audit row."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    at: datetime
    actor: str
    action: PricingAuditAction
    target_kind: PricingAuditTargetKind
    target_id: str
    before: Optional[dict] = None
    after: Optional[dict] = None
    reason: Optional[str] = None
    lineage_ref: Optional[LineageRef] = None
