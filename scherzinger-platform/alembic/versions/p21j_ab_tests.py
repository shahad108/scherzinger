"""Pricing Studio v3 / Phase 8 — A/B test eligibility + criterion + target_sample.

Extends the existing ``ab_tests`` table with three Pricing-Studio-v3
columns that the Phase 8 ``create_ab_test`` flow needs:

  - ``eligibility_json``  JSON-logic blob: customer filter (tier/family/...).
  - ``criterion_json``    Decision criterion (metric / threshold / alpha).
  - ``target_sample``     Desired per-arm sample size.

The Phase 17 lifecycle (``decision_state`` etc.) and the
``ab_test_assignments`` table from ``p17a_ab_lifecycle`` are already in
place, so this migration is additive only.

Reversible. Chained after p21i.

Revision ID: p21j_ab_tests
Revises: p21i_publish_price_book
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "p21j_ab_tests"
down_revision = "p21i_publish_price_book"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("ab_tests") as batch:
        batch.add_column(sa.Column("eligibility_json", JSONB, nullable=True))
        batch.add_column(sa.Column("criterion_json", JSONB, nullable=True))
        batch.add_column(sa.Column("target_sample", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ab_tests") as batch:
        batch.drop_column("target_sample")
        batch.drop_column("criterion_json")
        batch.drop_column("eligibility_json")
