"""Pricing Studio v3 — canonical per-SKU current price state."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base
from backend.models.pricing.lineage import LineageRef


class PriceStateRow(Base):
    """One row per article (aid) describing the currently published price.

    All money is stored as ``Numeric(14, 4)`` and surfaced as ``Decimal`` —
    we never use ``float`` for pricing. Currency is pinned to ``EUR`` for v3.
    """

    __tablename__ = "price_state"

    aid: Mapped[str] = mapped_column(String(60), primary_key=True)
    current_price: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    floor: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    ceiling: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    list_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    last_set_by: Mapped[str] = mapped_column(String(120), nullable=False)
    last_set_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    lineage_ref_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lineage_refs.id", ondelete="SET NULL"), nullable=True
    )


class PriceState(BaseModel):
    """Wire-shape price state for the Studio shell / workbench hero."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    current_price: Decimal
    currency: str = "EUR"
    floor: Optional[Decimal] = None
    ceiling: Optional[Decimal] = None
    list_price: Optional[Decimal] = None
    last_set_by: str
    last_set_at: datetime
    lineage_ref: Optional[LineageRef] = None
