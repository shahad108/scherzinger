"""Pricing Studio v3 — per (customer, sku) reality row.

Powers the Customer-fanout panel: who paid what last, when, how much they
buy (LTM), churn probability, wallet share, account tier.

Phase 2 extensions (Customer reality):

- ``ltm_eur`` — LTM revenue on this SKU (already had ``ltm_units``).
- ``decline_p`` — probability of major revenue decline in 4Q (from
  forecasting customer service ``pDecline4Q``).
- ``risk_if_moved`` — model output: probability of losing the account
  in 4Q given a proposed Δprice (see
  ``backend.services.pricing.customer_risk``).
- ``paid_band`` — p10/p50/p90 over the customer's history on this SKU,
  ``None`` when the sample has fewer than 3 transactions.

Persistence-side, ``CustomerOnSkuSnapshotRow`` (Phase 2.2.1) caches the
fully computed CustomerOnSku payload for cheap fanout reloads.
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


class PaidBand(BaseModel):
    """p10/p50/p90 of the customer's historical paid prices on this SKU.

    ``None`` (returned as the parent's ``paid_band=None``) when the
    customer has fewer than 3 transactions on the SKU — below that
    threshold the bands are not statistically defensible and the
    frontend renders a "thin sample" badge.
    """

    model_config = ConfigDict(from_attributes=True)

    p10: Decimal
    p50: Decimal
    p90: Decimal


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


class CustomerOnSkuSnapshotRow(Base):
    """Phase 2.2.1 — cached (aid, customer_id) → fully-computed CustomerOnSku.

    Refreshed by the fanout composer; persisted so a subsequent fanout
    rebuild for the same aid can skip the heavy paid-band + risk
    derivation. ``computed_at`` lets the composer expire rows that
    pre-date the most recent ``customer_state.update`` event.
    """

    __tablename__ = "customer_on_sku_snapshot"
    __table_args__ = (
        UniqueConstraint(
            "aid", "customer_id", name="uq_customer_on_sku_snapshot_aid_customer"
        ),
    )

    aid: Mapped[str] = mapped_column(String(60), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(60), primary_key=True)
    last_paid: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    last_paid_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ltm_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ltm_eur: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    churn_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    decline_p: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    risk_if_moved: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    wallet_share_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    paid_p10: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    paid_p50: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    paid_p90: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 4), nullable=True)
    tier: Mapped[str] = mapped_column(String(2), nullable=False, default="C")
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    lineage_ref_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("lineage_refs.id", ondelete="SET NULL"),
        nullable=True,
    )


class CustomerOnSku(BaseModel):
    """Wire-shape per-customer reality row."""

    model_config = ConfigDict(from_attributes=True)

    aid: str
    customer_id: str
    last_paid: Optional[Decimal] = None
    last_paid_at: Optional[datetime] = None
    ltm_units: int = 0
    ltm_eur: Optional[Decimal] = None
    churn_p: Optional[Decimal] = None
    decline_p: Optional[Decimal] = None
    risk_if_moved: Optional[Decimal] = None
    wallet_share_pct: Optional[Decimal] = None
    paid_band: Optional[PaidBand] = None
    tier: CustomerTier = CustomerTier.C
    lineage_ref: Optional[LineageRef] = None
