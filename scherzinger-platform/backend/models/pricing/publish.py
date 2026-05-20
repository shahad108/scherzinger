"""Pricing Studio v3 / Phase 7 — publish-to-quoting tables.

Three persisted tables back the Push-to-quoting surface:

  - ``PriceBookRow``       append-only row history of every published
                           price for each aid.
  - ``ScheduledPublish``   pending future publishes (effective_at > now()).
  - ``PublishReceipt``     immutable record of each publish event, with
                           the per-channel notification fanout result.

All money is ``Numeric(14, 4)`` → ``Decimal`` end-to-end. Currency is
pinned to ``EUR`` for v3 (matches PriceState).
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class ScheduledPublishStatus(str, Enum):
    PENDING = "pending"
    FIRED = "fired"
    CANCELLED = "cancelled"
    FAILED = "failed"


class PriceBookRow(Base):
    """One append-only row per published price for an aid.

    Lookups:
      - "current active price for aid X" →
            valid_to IS NULL ORDER BY valid_from DESC LIMIT 1
        (uses ``ix_price_book_aid_valid_to`` with NULLS FIRST).
      - "price history for aid X" →
            ORDER BY valid_from DESC.
    """

    __tablename__ = "price_book"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    aid: Mapped[str] = mapped_column(String(60), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="EUR"
    )
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    valid_to: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    source_proposal_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pricing_proposals.id", ondelete="SET NULL"),
        nullable=True,
    )
    lineage_ref_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lineage_refs.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ScheduledPublish(Base):
    """A pending future publish row.

    Scheduler walks (status='pending', effective_at <= now()) and fires
    each row → publish_price → row updates to 'fired'.
    """

    __tablename__ = "scheduled_publishes"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    aid: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    price: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    effective_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    source_proposal_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pricing_proposals.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="pending"
    )
    fired_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PublishReceiptRow(Base):
    """Immutable record of one publish event.

    ``notifications_dispatched`` is a JSONB list of per-channel result
    dicts: ``{channel, recipient, status: 'sent'|'failed', error?,
    dispatched_at}``.
    """

    __tablename__ = "publish_receipts"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    aid: Mapped[str] = mapped_column(String(60), nullable=False)
    source_proposal_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pricing_proposals.id", ondelete="SET NULL"),
        nullable=True,
    )
    old_price_book_row_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("price_book.id", ondelete="SET NULL"),
        nullable=True,
    )
    new_price_book_row_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("price_book.id", ondelete="SET NULL"),
        nullable=False,
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    rolled_back_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notifications_dispatched: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    published_by: Mapped[str] = mapped_column(String(120), nullable=False)
    rollback_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
