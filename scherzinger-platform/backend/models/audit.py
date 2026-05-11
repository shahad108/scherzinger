"""Phase 12 — audit log + idempotency replay + A/B tests."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class AuditLog(Base):
    """Append-only record of every state-changing call.

    Schema mirrors §4.6 of MIGRATION_PLAN.md. Idempotency is enforced via the
    optional ``idempotency_key`` column (unique per actor) — a replay lookup
    short-circuits to the existing row.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        UniqueConstraint("actor_user_id", "idempotency_key", name="uq_audit_actor_idemp"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    actor_persona: Mapped[str] = mapped_column(String(20), nullable=False)
    action_kind: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    before_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    delta_pp: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    audit_hash: Mapped[str] = mapped_column(String(16), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )


class AbTest(Base):
    """Running / completed A/B price tests."""

    __tablename__ = "ab_tests"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    aid: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    slice_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    control_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    treatment_price: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    created_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    audit_hash: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    # --- Phase 17 lifecycle / simulation linkage ---
    success_metric: Mapped[str | None] = mapped_column(String(60), nullable=True)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hypothesis: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_state: Mapped[str] = mapped_column(
        String(30), nullable=False, default="running", index=True
    )
    simulation_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )
    latest_simulation_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    promotion_eligible: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    promotion_blockers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class AbTestResult(Base):
    __tablename__ = "ab_test_results"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    test_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("ab_tests.id", ondelete="CASCADE"), index=True
    )
    period: Mapped[str] = mapped_column(String(20), nullable=False)
    control_margin: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    treatment_margin: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    control_volume: Mapped[int | None] = mapped_column(Integer, nullable=True)
    treatment_volume: Mapped[int | None] = mapped_column(Integer, nullable=True)
    p_value: Mapped[float | None] = mapped_column(Numeric(8, 6), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # --- Phase 17 measurement snapshot fields ---
    sample_size_control: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sample_size_treatment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metric_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    metric_delta: Mapped[float | None] = mapped_column(Numeric(12, 6), nullable=True)
    lift_pp: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    confidence_interval_low: Mapped[float | None] = mapped_column(
        Numeric(12, 6), nullable=True
    )
    confidence_interval_high: Mapped[float | None] = mapped_column(
        Numeric(12, 6), nullable=True
    )
    observed_revenue_control: Mapped[float | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    observed_revenue_treatment: Mapped[float | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    observed_margin_control: Mapped[float | None] = mapped_column(
        Numeric(12, 6), nullable=True
    )
    observed_margin_treatment: Mapped[float | None] = mapped_column(
        Numeric(12, 6), nullable=True
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class AbTestAssignment(Base):
    """Per-cohort assignment: which customer/quote got which arm + price."""

    __tablename__ = "ab_test_assignments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    test_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("ab_tests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    article_id: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    customer_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    quote_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    arm: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    assigned_price: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    outcome_ref_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    outcome_ref_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    outcome_revenue: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    outcome_margin: Mapped[float | None] = mapped_column(Numeric(12, 6), nullable=True)
    outcome_recorded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
