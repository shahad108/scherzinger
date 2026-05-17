"""Phase 21 (Pricing Studio v3 / Phase 7) — publish-to-quoting tables.

Adds three persisted tables backing the Push-to-quoting surface:

  - ``price_book``           append-only row history of every published
                             price (one row per (aid, valid_from)).
  - ``scheduled_publishes``  pending future publishes that the scheduler
                             kicks at ``effective_at``.
  - ``publish_receipts``     immutable record of each publish event —
                             links new ↔ old price_book rows and stores
                             the per-channel notification fanout result.

Reversible. Chained after p21h.

Revision ID: p21i_publish_price_book
Revises: p21h_batch_repricing
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

revision = "p21i_publish_price_book"
down_revision = "p21h_batch_repricing"
branch_labels = None
depends_on = None


_SCHEDULE_STATUS = ("pending", "fired", "cancelled", "failed")


def _in_list_sql(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


def upgrade() -> None:
    # --- price_book ---------------------------------------------------------
    op.create_table(
        "price_book",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("aid", sa.String(60), nullable=False),
        sa.Column("price", sa.Numeric(14, 4), nullable=False),
        sa.Column(
            "currency",
            sa.String(3),
            nullable=False,
            server_default=sa.text("'EUR'"),
        ),
        sa.Column(
            "valid_from",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "valid_to",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "source_proposal_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("pricing_proposals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "lineage_ref_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("lineage_refs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    # "Current active price" lookup: rows with valid_to IS NULL come first.
    op.create_index(
        "ix_price_book_aid_valid_to",
        "price_book",
        ["aid", "valid_to"],
        postgresql_ops={"valid_to": "ASC NULLS FIRST"},
    )
    # History view: walk back from newest valid_from.
    op.create_index(
        "ix_price_book_aid_valid_from_desc",
        "price_book",
        ["aid", sa.text("valid_from DESC")],
    )

    # --- scheduled_publishes -----------------------------------------------
    op.create_table(
        "scheduled_publishes",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("aid", sa.String(60), nullable=False, index=True),
        sa.Column("price", sa.Numeric(14, 4), nullable=False),
        sa.Column(
            "effective_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "source_proposal_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("pricing_proposals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "fired_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            sa.String(120),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            _in_list_sql("status", _SCHEDULE_STATUS),
            name="ck_scheduled_publishes_status",
        ),
    )
    op.create_index(
        "ix_scheduled_publishes_status_effective",
        "scheduled_publishes",
        ["status", "effective_at"],
    )

    # --- publish_receipts --------------------------------------------------
    op.create_table(
        "publish_receipts",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("aid", sa.String(60), nullable=False),
        sa.Column(
            "source_proposal_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("pricing_proposals.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "old_price_book_row_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("price_book.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "new_price_book_row_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("price_book.id", ondelete="SET NULL"),
            nullable=False,
        ),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "rolled_back_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "notifications_dispatched",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "published_by",
            sa.String(120),
            nullable=False,
        ),
        sa.Column(
            "rollback_reason",
            sa.Text,
            nullable=True,
        ),
    )
    op.create_index(
        "ix_publish_receipts_aid_published",
        "publish_receipts",
        ["aid", sa.text("published_at DESC")],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_publish_receipts_aid_published", table_name="publish_receipts"
    )
    op.drop_table("publish_receipts")
    op.drop_index(
        "ix_scheduled_publishes_status_effective",
        table_name="scheduled_publishes",
    )
    op.drop_table("scheduled_publishes")
    op.drop_index(
        "ix_price_book_aid_valid_from_desc", table_name="price_book"
    )
    op.drop_index("ix_price_book_aid_valid_to", table_name="price_book")
    op.drop_table("price_book")
