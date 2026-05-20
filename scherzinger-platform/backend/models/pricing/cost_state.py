"""Pricing Studio v3 — canonical per-SKU cost state with breakdown + trajectory."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base
from backend.models.pricing.lineage import LineageRef


class CostBreakdown(BaseModel):
    """Per-component decomposition of unit_cost. All EUR Decimals."""

    material: Decimal = Field(default=Decimal("0"))
    labor: Decimal = Field(default=Decimal("0"))
    outsourcing: Decimal = Field(default=Decimal("0"))
    overhead: Decimal = Field(default=Decimal("0"))


class CostTrajectoryPoint(BaseModel):
    at: datetime
    unit_cost: Decimal


class CostStateRow(Base):
    """One row per article describing the most-recent unit cost + breakdown.

    ``trajectory_30d`` is a JSONB list of (at, unit_cost) pairs covering the
    rolling 30-day window so the cost trajectory drawer (Phase 3) can render
    without a separate join.
    """

    __tablename__ = "cost_state"

    aid: Mapped[str] = mapped_column(String(60), primary_key=True)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    last_ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    trajectory_30d: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    lineage_ref_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lineage_refs.id", ondelete="SET NULL"), nullable=True
    )


class CostState(BaseModel):
    """Wire-shape cost state."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    unit_cost: Decimal
    breakdown: CostBreakdown
    last_ingested_at: datetime
    trajectory_30d: list[CostTrajectoryPoint] = Field(default_factory=list)
    lineage_ref: Optional[LineageRef] = None
