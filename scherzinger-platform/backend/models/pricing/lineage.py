"""Pricing Studio v3 — lineage references.

Every numeric value the Studio surfaces must be traceable. ``LineageRefRow``
is the append-only table that records (source_kind, source_id, sql_template,
model, computed_at, computed_by) for any value the UI shows.

The matching Pydantic ``LineageRef`` is the wire shape returned to the
frontend (Lineage drawer + every recommendation/audit row carries one).
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class LineageSourceKind(str, Enum):
    INVOICE_LEDGER = "invoice_ledger"
    COMPETITOR_FEED = "competitor_feed"
    WON_DEAL_SAMPLE = "won_deal_sample"
    ELASTICITY_MODEL = "elasticity_model"
    COST_INGEST = "cost_ingest"
    MANUAL_OVERRIDE = "manual_override"
    SCHEDULED_PUBLISH = "scheduled_publish"
    AB_TEST_ASSIGNMENT = "ab_test_assignment"


class LineageRefRow(Base):
    """Persisted lineage row. Immutable once written."""

    __tablename__ = "lineage_refs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    source_kind: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    computed_by: Mapped[str] = mapped_column(String(120), nullable=False)


class LineageRef(BaseModel):
    """Wire-shape lineage reference. Returned in every Studio numeric block."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_kind: LineageSourceKind
    source_id: str
    sql: Optional[str] = None
    model: Optional[str] = None
    computed_at: datetime
    computed_by: str = Field(
        ...,
        description="System name or actor id that produced this value.",
    )
