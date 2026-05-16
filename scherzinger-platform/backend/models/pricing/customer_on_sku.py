"""Pricing Studio v3 — per (customer, sku) reality row.

Powers the Customer-fanout panel: who paid what last, when, how much they
buy (LTM), churn probability, wallet share, account tier.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict
from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base
from backend.models.pricing.lineage import LineageRef


class CustomerTier(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class CustomerOnSkuRow(Base):
    """One row per (aid, customer_id) pair."""

    __tablename__ = "customer_on_sku"
    __table_args__ = (
        UniqueConstraint("aid", "customer_id", name="uq_customer_on_sku_aid_customer"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    aid: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    customer_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    last_paid: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    last_paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ltm_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    churn_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    wallet_share_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    tier: Mapped[str] = mapped_column(String(2), nullable=False, default="C")
    lineage_ref_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("lineage_refs.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CustomerOnSku(BaseModel):
    """Wire-shape per-customer reality row."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    customer_id: str
    last_paid: Optional[Decimal] = None
    last_paid_at: Optional[datetime] = None
    ltm_units: int = 0
    churn_p: Optional[Decimal] = None
    wallet_share_pct: Optional[Decimal] = None
    tier: CustomerTier = CustomerTier.C
    lineage_ref: Optional[LineageRef] = None
