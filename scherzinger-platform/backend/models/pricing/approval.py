"""Pricing Studio v3 — approval workflow tables.

Phase 5 adds three persisted tables:

  - ``approval_routes``    rules library, seeded from
                           ``backend/data/pricing_approval_rules.json``.
  - ``approval_instances`` one per proposal that needs approval; carries
                           the routed steps + current_step pointer.
  - ``approval_actions``   each approver decision; mirrored into
                           ``pricing_audit`` for the cross-cutting timeline.

The approval rules engine (``services.pricing.approval_rules``) still
loads rules from the JSON file at request time — the ``approval_routes``
table exists so a future admin UI can edit rules without redeploying.
The seeder copies the JSON → table on migration upgrade (idempotent).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class ApprovalDecisionKind(str, Enum):
    """Kinds of approver decisions accepted by /approvals/{id}/decision."""

    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class ApprovalStepState(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CHANGES_REQUESTED = "changes_requested"


class ApprovalRoute(Base):
    """A single seeded routing rule (jsonlogic condition + route_to roles).

    Editable by admins in a follow-up phase. v3 ships seed-only.
    """

    __tablename__ = "approval_routes"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    condition: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # text[] in Postgres — list of approver roles or user ids.
    route_to: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ApprovalInstance(Base):
    """One per proposal that needs approval.

    ``steps`` is a JSONB list of objects of the form::

        {"role": str, "decision": "pending"|"approved"|...,
         "actor": str | None, "at": iso | None, "comment": str | None}

    ``current_step`` points at the next step that requires action (and is
    bumped on each ``approve``). When ``current_step >= len(steps)`` the
    instance is fully resolved.
    """

    __tablename__ = "approval_instances"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    proposal_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pricing_proposals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    current_step: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", index=True
    )
    steps: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ApprovalAction(Base):
    """One row per approver decision. Mirrored into pricing_audit."""

    __tablename__ = "approval_actions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    approval_instance_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("approval_instances.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )
