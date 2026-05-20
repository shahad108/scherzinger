"""Pricing Studio v3 / Phase 9 — alerts engine tables.

Two persisted tables back the alerts surface:

  - ``pricing_alerts``        one row per alert spec (kind, scope, channels,
                              enabled flag).
  - ``pricing_alert_events``  one row per triggered event (alert_id fk,
                              payload of current values + threshold, channels
                              dispatched, optional audit_id).

The Pydantic-side spec (a discriminated union over ``kind``) lives in
``backend/services/pricing/alerts.py``. The DB stores the spec as JSONB so
future alert kinds ship as a single composer change with no schema
migration.

Reversible. Chained after p21j.

Revision ID: p21k_alerts
Revises: p21j_ab_tests
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID

revision = "p21k_alerts"
down_revision = "p21j_ab_tests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pricing_alerts",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(40), nullable=False, index=True),
        sa.Column("spec_json", JSONB, nullable=False, server_default="{}"),
        sa.Column("scope_aid", sa.String(60), nullable=True, index=True),
        sa.Column("scope_cluster", sa.String(60), nullable=True, index=True),
        sa.Column("scope_family", sa.String(60), nullable=True, index=True),
        sa.Column(
            "channels",
            ARRAY(sa.String(20)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("created_by", sa.String(120), nullable=False, index=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )

    op.create_table(
        "pricing_alert_events",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "alert_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("pricing_alerts.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "triggered_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            index=True,
        ),
        sa.Column("payload", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "channels_dispatched",
            JSONB,
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "audit_id",
            PGUUID(as_uuid=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("pricing_alert_events")
    op.drop_table("pricing_alerts")
