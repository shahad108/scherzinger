"""Phase 20 (Forecasting Phase 5) — scenarios table for saveable, named, shareable scenarios.

Revision ID: p20a_scenarios
Revises: p19a_simulator_v2
Create Date: 2026-05-13
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

revision = "p20a_scenarios"
down_revision = "p19a_simulator_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scenarios",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("inputs_json", JSONB, nullable=False, server_default="{}"),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="private"),
        sa.Column("derived_from_scenario_id", PGUUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_scenarios_owner_user_id", "scenarios", ["owner_user_id"])
    op.create_index("ix_scenarios_owner_recent", "scenarios", ["owner_user_id", "last_used_at"])
    op.create_index("ix_scenarios_visibility", "scenarios", ["visibility", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_scenarios_visibility", table_name="scenarios")
    op.drop_index("ix_scenarios_owner_recent", table_name="scenarios")
    op.drop_index("ix_scenarios_owner_user_id", table_name="scenarios")
    op.drop_table("scenarios")
