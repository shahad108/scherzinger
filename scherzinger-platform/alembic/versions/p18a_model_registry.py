"""Phase 18 — model_registry: per-(model, cluster) accuracy + features + last-trained.

Revision ID: p18a_model_registry
Revises: p17a_ab_lifecycle
Create Date: 2026-05-12
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "p18a_model_registry"
down_revision = "p17a_ab_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_registry",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("model_name", sa.String(120), nullable=False),
        sa.Column("version", sa.String(40), nullable=False),
        sa.Column("trained_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("holdout_months", sa.Integer, nullable=True),
        sa.Column("entity_type", sa.String(40), nullable=False),
        sa.Column("entity_id", sa.String(120), nullable=True),
        sa.Column("metric_name", sa.String(40), nullable=False),
        sa.Column("metric_value", sa.Float, nullable=True),
        sa.Column("n_observations", sa.Integer, nullable=True),
        sa.Column("feature_list", JSONB, nullable=True),
        sa.Column("feature_importance", JSONB, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_model_registry_lookup",
        "model_registry",
        ["model_name", "entity_type", "entity_id", "metric_name", "trained_at"],
    )
    op.create_index("ix_model_registry_trained_at", "model_registry", ["trained_at"])


def downgrade() -> None:
    op.drop_index("ix_model_registry_trained_at", table_name="model_registry")
    op.drop_index("ix_model_registry_lookup", table_name="model_registry")
    op.drop_table("model_registry")
