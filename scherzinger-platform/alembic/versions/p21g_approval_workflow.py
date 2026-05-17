"""Phase 21 (Pricing Studio v3 / Phase 5) — approval workflow tables.

Adds three persisted tables backing the proposal approval surface:

  - ``approval_routes``    rules library, seeded from
                           ``backend/data/pricing_approval_rules.json``.
  - ``approval_instances`` one per proposal that needs approval; carries
                           the routed steps + current_step pointer.
  - ``approval_actions``   one per approver decision; mirrored into
                           ``pricing_audit`` for the audit drawer.

Also widens the ``pricing_audit.action`` CHECK constraint to accept the
new approval-flow actions: ``proposal_submitted``, ``proposal_recalled``,
``proposal_changes_requested``, ``proposal_commented``.

Reversible. Chained after p21f.

Revision ID: p21g_approval_workflow
Revises: p21f_user_view_state
Create Date: 2026-05-17
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

revision = "p21g_approval_workflow"
down_revision = "p21f_user_view_state"
branch_labels = None
depends_on = None


# Decision values stored on ``approval_actions.decision`` and on each
# ``approval_instances.steps[*].decision``. We use a CHECK constraint
# instead of a Postgres ENUM so future values can be added with a single
# ALTER TABLE ... DROP CONSTRAINT + ADD CONSTRAINT.
_DECISION_VALUES = ("approve", "reject", "request_changes")
_STEP_DECISIONS = ("pending", "approved", "rejected", "changes_requested")

# Pre-Phase 5 set, captured here so the downgrade can put the audit
# CHECK constraint back exactly the way p21a wrote it.
_AUDIT_ACTIONS_PRE_P21G = (
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
)
_AUDIT_ACTIONS_POST_P21G = _AUDIT_ACTIONS_PRE_P21G + (
    "proposal_submitted",
    "proposal_changes_requested",
    "proposal_recalled",
    "proposal_commented",
)


def _in_list_sql(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


def upgrade() -> None:
    # --- approval_routes -----------------------------------------------------
    op.create_table(
        "approval_routes",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("condition", JSONB, nullable=False),
        # ``route_to`` is stored as JSONB rather than ``text[]`` so the
        # Python list[str] roundtrips through SQLAlchemy without an array
        # adapter. The seed only writes scalar strings, so JSONB array
        # equivalence is identical for our queries.
        sa.Column("route_to", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # --- approval_instances --------------------------------------------------
    op.create_table(
        "approval_instances",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "proposal_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("pricing_proposals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "current_step",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("steps", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
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
    )
    op.create_index(
        "ix_approval_instances_proposal_id",
        "approval_instances",
        ["proposal_id"],
    )
    op.create_index(
        "ix_approval_instances_current_step",
        "approval_instances",
        ["current_step"],
    )

    # --- approval_actions ----------------------------------------------------
    op.create_table(
        "approval_actions",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "approval_instance_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("approval_instances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("actor", sa.String(120), nullable=False),
        sa.Column("decision", sa.String(20), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            _in_list_sql("decision", _DECISION_VALUES),
            name="ck_approval_actions_decision",
        ),
    )
    op.create_index(
        "ix_approval_actions_instance_at",
        "approval_actions",
        ["approval_instance_id", "at"],
    )

    # --- widen pricing_audit.action CHECK constraint -------------------------
    # p21a wrote the constraint with the pre-Phase-5 action set. Drop and
    # recreate with the widened set so the new approval-flow actions can
    # be inserted by ``record_audit``.
    op.drop_constraint("ck_pricing_audit_action", "pricing_audit", type_="check")
    op.create_check_constraint(
        "ck_pricing_audit_action",
        "pricing_audit",
        _in_list_sql("action", _AUDIT_ACTIONS_POST_P21G),
    )

    # --- seed approval_routes from the JSON rules file ----------------------
    # Idempotent: ``seed_approval_routes`` upserts on (name). We run the
    # seed against the same connection the migration is using so it sees
    # the table that was just created in this transaction.
    from sqlalchemy.orm import Session as OrmSession

    from backend.services.pricing.approval_seed import seed_approval_routes

    bind = op.get_bind()
    session = OrmSession(bind=bind)
    try:
        seed_approval_routes(session)
        session.flush()
    finally:
        session.close()


def downgrade() -> None:
    op.drop_constraint("ck_pricing_audit_action", "pricing_audit", type_="check")
    op.create_check_constraint(
        "ck_pricing_audit_action",
        "pricing_audit",
        _in_list_sql("action", _AUDIT_ACTIONS_PRE_P21G),
    )
    op.drop_index("ix_approval_actions_instance_at", table_name="approval_actions")
    op.drop_table("approval_actions")
    op.drop_index("ix_approval_instances_current_step", table_name="approval_instances")
    op.drop_index("ix_approval_instances_proposal_id", table_name="approval_instances")
    op.drop_table("approval_instances")
    op.drop_table("approval_routes")
