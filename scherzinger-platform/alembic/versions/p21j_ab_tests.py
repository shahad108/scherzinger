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


# Post-p21g audit-action allow-list plus the Phase-8 ``ab_test_held``
# token. Kept in sync with backend.models.pricing.audit.PricingAuditAction.
_AUDIT_ACTIONS_PRE_P21J = (
    "price_set",
    "proposal_created",
    "proposal_approved",
    "proposal_rejected",
    "override_added",
    "alert_triggered",
    "push_to_quoting",
    "rollback",
    "ab_test_created",
    "ab_test_promoted",
    "proposal_submitted",
    "proposal_changes_requested",
    "proposal_recalled",
    "proposal_commented",
)
_AUDIT_ACTIONS_POST_P21J = _AUDIT_ACTIONS_PRE_P21J + ("ab_test_held",)


def _in_list_sql(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


def upgrade() -> None:
    with op.batch_alter_table("ab_tests") as batch:
        batch.add_column(sa.Column("eligibility_json", JSONB, nullable=True))
        batch.add_column(sa.Column("criterion_json", JSONB, nullable=True))
        batch.add_column(sa.Column("target_sample", sa.Integer(), nullable=True))

    # Widen the pricing_audit action allow-list so the Phase 8
    # promote_or_hold service can write ``ab_test_held`` rows.
    op.drop_constraint("ck_pricing_audit_action", "pricing_audit", type_="check")
    op.create_check_constraint(
        "ck_pricing_audit_action",
        "pricing_audit",
        _in_list_sql("action", _AUDIT_ACTIONS_POST_P21J),
    )


def downgrade() -> None:
    op.drop_constraint("ck_pricing_audit_action", "pricing_audit", type_="check")
    op.create_check_constraint(
        "ck_pricing_audit_action",
        "pricing_audit",
        _in_list_sql("action", _AUDIT_ACTIONS_PRE_P21J),
    )
    with op.batch_alter_table("ab_tests") as batch:
        batch.drop_column("target_sample")
        batch.drop_column("criterion_json")
        batch.drop_column("eligibility_json")
