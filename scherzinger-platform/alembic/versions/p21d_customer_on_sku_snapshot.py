"""Phase 21 (Pricing Studio v3 / Phase 2) — customer_on_sku_snapshot.

Caches the fully computed Phase-2 per-(aid, customer_id) CustomerOnSku
payload (ltm_eur, decline_p, risk_if_moved, paid_band p10/p50/p90)
so a fanout rebuild can skip the heavy paid-band + risk derivation.

Reversible. Compound PK on (aid, customer_id) covers both lookup
patterns; supplemental single-column indexes accelerate the "all snapshots
for one aid" + "all SKUs for one customer" queries the BFF runs.

Revision ID: p21d_customer_on_sku_snapshot
Revises: p21c_quote_commodity_index
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision = "p21d_customer_on_sku_snapshot"
down_revision = "p21c_quote_commodity_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_on_sku_snapshot",
        sa.Column("aid", sa.String(60), nullable=False),
        sa.Column("customer_id", sa.String(60), nullable=False),
        sa.Column("last_paid", sa.Numeric(14, 4), nullable=True),
        sa.Column("last_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ltm_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ltm_eur", sa.Numeric(14, 2), nullable=True),
        sa.Column("churn_p", sa.Numeric(5, 4), nullable=True),
        sa.Column("decline_p", sa.Numeric(5, 4), nullable=True),
        sa.Column("risk_if_moved", sa.Numeric(5, 4), nullable=True),
        sa.Column("wallet_share_pct", sa.Numeric(5, 4), nullable=True),
        sa.Column("paid_p10", sa.Numeric(14, 4), nullable=True),
        sa.Column("paid_p50", sa.Numeric(14, 4), nullable=True),
        sa.Column("paid_p90", sa.Numeric(14, 4), nullable=True),
        sa.Column("tier", sa.String(2), nullable=False, server_default="C"),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "lineage_ref_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("lineage_refs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint(
            "aid", "customer_id", name="pk_customer_on_sku_snapshot"
        ),
        sa.UniqueConstraint(
            "aid", "customer_id", name="uq_customer_on_sku_snapshot_aid_customer"
        ),
    )
    # Compound PK already covers `(aid, customer_id)` exact-match. We add
    # single-column indexes for the two scan shapes used by the BFF:
    #  - "all snapshots for one aid"   (Studio fanout rebuild)
    #  - "all SKUs for one customer"   (customer state notification fanout)
    op.create_index(
        "ix_customer_on_sku_snapshot_aid",
        "customer_on_sku_snapshot",
        ["aid"],
    )
    op.create_index(
        "ix_customer_on_sku_snapshot_customer_id",
        "customer_on_sku_snapshot",
        ["customer_id"],
    )
    op.create_index(
        "ix_customer_on_sku_snapshot_aid_customer",
        "customer_on_sku_snapshot",
        ["aid", "customer_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_customer_on_sku_snapshot_aid_customer",
        table_name="customer_on_sku_snapshot",
    )
    op.drop_index(
        "ix_customer_on_sku_snapshot_customer_id",
        table_name="customer_on_sku_snapshot",
    )
    op.drop_index(
        "ix_customer_on_sku_snapshot_aid",
        table_name="customer_on_sku_snapshot",
    )
    op.drop_table("customer_on_sku_snapshot")
