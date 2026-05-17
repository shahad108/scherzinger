"""Phase 21 (Pricing Studio v3 / Phase 2) — proposal payload customer index.

The fanout panel calls ``_load_active_proposals_for_aid``:

    SELECT payload->>'customer_id'
    FROM pricing_proposals
    WHERE article_id = :aid
      AND status IN ('draft', 'submitted', 'pending');

Without an index Postgres falls back to a sequential scan of
``pricing_proposals``. The partial functional index below covers both the
``article_id`` equality predicate AND the ``payload->>'customer_id'``
projection used by the BFF, while being narrow (only active proposals).

Reversible. Chained after p21d.

Revision ID: p21e_prop_pay_cust_idx
Revises: p21d_customer_on_sku_snapshot
Create Date: 2026-05-17
"""
from __future__ import annotations

from alembic import op

revision = "p21e_prop_pay_cust_idx"
down_revision = "p21d_customer_on_sku_snapshot"
branch_labels = None
depends_on = None


_INDEX_NAME = "ix_pricing_proposals_aid_payload_cid"


def upgrade() -> None:
    op.execute(
        f"""
        CREATE INDEX IF NOT EXISTS {_INDEX_NAME}
        ON pricing_proposals (article_id, (payload->>'customer_id'))
        WHERE status IN ('draft', 'submitted', 'pending')
        """
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
