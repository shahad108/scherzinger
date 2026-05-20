"""Pricing Studio v3 / Phase 6 — batch repricing tables.

Two persisted tables back the batch surface:

  - ``PricingBatch``       one row per batch envelope (the rule + scope
                           filter + status).
  - ``PricingBatchItem``   one row per (batch, aid) — preview values,
                           link to the created proposal after commit.

The Python-side rule + scope filter live in
``backend/services/pricing/batch.py`` (Pydantic discriminated union).
The DB columns store the rule and filter as JSONB so future rule kinds
ship as a single composer change with no schema migration.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class PricingBatchStatus(str, Enum):
    PREVIEW = "preview"
    COMMITTED = "committed"
    CANCELLED = "cancelled"


class PricingBatchItemStatus(str, Enum):
    QUEUED = "queued"
    LOCKED = "locked"
    COMMITTED = "committed"
    FAILED = "failed"


class PricingBatch(Base):
    """A batch repricing envelope (rule + scope + status)."""

    __tablename__ = "pricing_batches"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    created_by: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    rule_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    scope_filter_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="preview"
    )
    committed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PricingBatchItem(Base):
    """One row per (batch, aid)."""

    __tablename__ = "pricing_batch_items"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    batch_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pricing_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    aid: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    before_price: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 4), nullable=True
    )
    after_price: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(14, 4), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="queued"
    )
    proposal_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pricing_proposals.id", ondelete="SET NULL"),
        nullable=True,
    )
    per_sku_lineage_ref: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lineage_refs.id", ondelete="SET NULL"),
        nullable=True,
    )
    preview_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
