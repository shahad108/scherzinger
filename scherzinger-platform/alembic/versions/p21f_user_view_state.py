"""Phase 21 (Pricing Studio v3 / Phase 4) — user_view_state table.

Tracks per-user "last seen" timestamps per (surface, target). Powers the
"what changed since you last looked" diff strip + inbox unread badges.

Composite primary key (user_id, surface, target_id) so a user has one row
per (surface, target). Index on (user_id, surface) for fast inbox-style
lookups across all targets a user has viewed on a surface.

Reversible. Chained after p21e.

Revision ID: p21f_user_view_state
Revises: p21e_proposal_payload_customer_index
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "p21f_user_view_state"
down_revision = "p21e_prop_pay_cust_idx"
branch_labels = None
depends_on = None


_TABLE = "user_view_state"
_IX_USER_SURFACE = "ix_user_view_state_user_id_surface"


def upgrade() -> None:
    op.create_table(
        _TABLE,
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("surface", sa.String(length=32), nullable=False),
        sa.Column("target_id", sa.String(length=120), nullable=False),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint(
            "user_id", "surface", "target_id", name="pk_user_view_state"
        ),
    )
    op.create_index(
        _IX_USER_SURFACE,
        _TABLE,
        ["user_id", "surface"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(_IX_USER_SURFACE, table_name=_TABLE)
    op.drop_table(_TABLE)
