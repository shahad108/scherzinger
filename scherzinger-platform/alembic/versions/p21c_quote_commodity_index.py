"""Phase 21 (Pricing Studio v3) — index for WTP cluster-anchor fallback.

SF4: ``_load_cluster_anchor_wtp`` filters the ``quotes`` table on
``(commodity_group, is_won, date)``. Without a composite index the
fallback path is a sequential scan for every thin-sample SKU. This
migration adds ``ix_quote_commodity_won_date`` (reversible).

Revision ID: p21c_quote_commodity_index
Revises: p21a_pricing_v3_foundation
Create Date: 2026-05-17
"""
from __future__ import annotations

from alembic import op

revision = "p21c_quote_commodity_index"
down_revision = "p21a_pricing_v3_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_quote_commodity_won_date",
        "quotes",
        ["commodity_group", "is_won", "date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_quote_commodity_won_date", table_name="quotes")
