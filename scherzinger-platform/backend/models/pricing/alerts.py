"""Pricing Studio v3 / Phase 9 — alerts engine tables.

Two persisted tables back the alerts surface:

  - ``PricingAlert``       one row per alert spec (kind + scope + channels).
  - ``PricingAlertEvent``  one row per triggered event.

The Python-side spec (a discriminated union over ``kind``) lives in
``backend/services/pricing/alerts.py``. The DB stores the spec as JSONB so
future alert kinds ship as a composer-only change with no migration.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class PricingAlert(Base):
    """A persistent alert spec (kind + scope + channels)."""

    __tablename__ = "pricing_alerts"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    spec_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    scope_aid: Mapped[Optional[str]] = mapped_column(
        String(60), nullable=True, index=True
    )
    scope_cluster: Mapped[Optional[str]] = mapped_column(
        String(60), nullable=True, index=True
    )
    scope_family: Mapped[Optional[str]] = mapped_column(
        String(60), nullable=True, index=True
    )
    channels: Mapped[list[str]] = mapped_column(
        ARRAY(String(20)), nullable=False, default=list
    )
    created_by: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )


class PricingAlertEvent(Base):
    """One row per triggered alert event."""

    __tablename__ = "pricing_alert_events"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    alert_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pricing_alerts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    channels_dispatched: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list
    )
    audit_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
