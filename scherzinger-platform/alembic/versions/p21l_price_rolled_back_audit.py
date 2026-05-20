"""Pricing Studio v3 / Phase A7 — widen pricing_audit action allow-list.

Adds the ``price_rolled_back`` action so ``rollback_publish`` can write a
dedicated audit row (distinct from the proposal-level ``rollback``
action). Downstream consumers (Studio queue margin column, Quotes
screen, Decision History drawer) key on this action to display the
"active price reverted" event.

Reversible. Chained after p21k.

Revision ID: p21l_price_rolled_back_audit
Revises: p21k_alerts
Create Date: 2026-05-19
"""
from __future__ import annotations

from alembic import op


revision = "p21l_price_rolled_back_audit"
down_revision = "p21k_alerts"
branch_labels = None
depends_on = None


# Kept in sync with backend.models.pricing.audit.PricingAuditAction.
# Each entry mirrors a prior migration's allow-list so this migration is
# self-contained.
_AUDIT_ACTIONS_PRE_P21L = (
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
    "ab_test_held",
)
_AUDIT_ACTIONS_POST_P21L = _AUDIT_ACTIONS_PRE_P21L + ("price_rolled_back",)


def _in_list_sql(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


def upgrade() -> None:
    op.drop_constraint("ck_pricing_audit_action", "pricing_audit", type_="check")
    op.create_check_constraint(
        "ck_pricing_audit_action",
        "pricing_audit",
        _in_list_sql("action", _AUDIT_ACTIONS_POST_P21L),
    )


def downgrade() -> None:
    op.drop_constraint("ck_pricing_audit_action", "pricing_audit", type_="check")
    op.create_check_constraint(
        "ck_pricing_audit_action",
        "pricing_audit",
        _in_list_sql("action", _AUDIT_ACTIONS_PRE_P21L),
    )
