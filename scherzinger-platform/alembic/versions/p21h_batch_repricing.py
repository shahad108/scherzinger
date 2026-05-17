"""Phase 21 (Pricing Studio v3 / Phase 6) — batch repricing tables.

Adds two persisted tables backing the batch-repricing surface:

  - ``pricing_batches``        one row per batch preview/commit envelope
                               (rule + scope filter + status).
  - ``pricing_batch_items``    one row per (batch, aid) — the per-SKU
                               before/after preview and (after commit)
                               the linked proposal.

Reversible. Chained after p21g.

Revision ID: p21h_batch_repricing
Revises: p21g_approval_workflow
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

revision = "p21h_batch_repricing"
down_revision = "p21g_approval_workflow"
branch_labels = None
depends_on = None


# CHECK constraint values stored on the status columns. We use TEXT +
# CHECK rather than Postgres ENUM so adding a value later is a single
# DROP/ADD CONSTRAINT.
_BATCH_STATUS = ("preview", "committed", "cancelled")
_ITEM_STATUS = ("queued", "locked", "committed", "failed")


def _in_list_sql(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


def upgrade() -> None:
    # --- pricing_batches ----------------------------------------------------
    op.create_table(
        "pricing_batches",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("created_by", sa.String(120), nullable=False, index=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("rule_json", JSONB, nullable=False),
        sa.Column(
            "scope_filter_json",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'preview'"),
        ),
        sa.Column("committed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            _in_list_sql("status", _BATCH_STATUS),
            name="ck_pricing_batches_status",
        ),
    )
    op.create_index(
        "ix_pricing_batches_status_created",
        "pricing_batches",
        ["status", "created_at"],
    )

    # --- pricing_batch_items -------------------------------------------------
    op.create_table(
        "pricing_batch_items",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "batch_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("pricing_batches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("aid", sa.String(60), nullable=False),
        sa.Column("before_price", sa.Numeric(14, 4), nullable=True),
        sa.Column("after_price", sa.Numeric(14, 4), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'queued'"),
        ),
        sa.Column(
            "proposal_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("pricing_proposals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "per_sku_lineage_ref",
            PGUUID(as_uuid=True),
            sa.ForeignKey("lineage_refs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # ``preview_json`` stashes the typed per-SKU preview row (delta,
        # projected_db2, win_prob_at_new, risk_score, …) so the GET batch
        # endpoint can return the full preview without re-running the
        # composer.
        sa.Column(
            "preview_json",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            _in_list_sql("status", _ITEM_STATUS),
            name="ck_pricing_batch_items_status",
        ),
    )
    op.create_index(
        "ix_pricing_batch_items_batch_status",
        "pricing_batch_items",
        ["batch_id", "status"],
    )
    op.create_index("ix_pricing_batch_items_aid", "pricing_batch_items", ["aid"])


def downgrade() -> None:
    op.drop_index("ix_pricing_batch_items_aid", table_name="pricing_batch_items")
    op.drop_index(
        "ix_pricing_batch_items_batch_status", table_name="pricing_batch_items"
    )
    op.drop_table("pricing_batch_items")
    op.drop_index(
        "ix_pricing_batches_status_created", table_name="pricing_batches"
    )
    op.drop_table("pricing_batches")
