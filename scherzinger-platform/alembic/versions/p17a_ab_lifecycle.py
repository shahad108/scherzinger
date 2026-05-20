"""Phase 17 — A/B test lifecycle: extend ab_tests + ab_test_results, add ab_test_assignments.

Revision ID: p17a_ab_lifecycle
Revises: p16a_action_workflow
Create Date: 2026-05-11
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

revision = "p17a_ab_lifecycle"
down_revision = "p16a_action_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- ab_tests: lifecycle + planning + simulation linkage ---
    with op.batch_alter_table("ab_tests") as batch:
        batch.add_column(sa.Column("success_metric", sa.String(60), nullable=True))
        batch.add_column(sa.Column("duration_days", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("hypothesis", sa.Text(), nullable=True))
        batch.add_column(sa.Column("status_reason", sa.Text(), nullable=True))
        batch.add_column(
            sa.Column(
                "decision_state",
                sa.String(30),
                nullable=False,
                server_default="running",
            )
        )
        batch.add_column(
            sa.Column(
                "simulation_status",
                sa.String(20),
                nullable=False,
                server_default="pending",
            )
        )
        batch.add_column(sa.Column("latest_simulation_id", sa.String(120), nullable=True))
        batch.add_column(
            sa.Column(
                "promotion_eligible",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch.add_column(sa.Column("promotion_blockers", JSONB, nullable=True))
        batch.add_column(
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False)
        )

    op.create_index("ix_ab_tests_decision_state", "ab_tests", ["decision_state"])
    op.create_index(
        "ix_ab_tests_simulation_status", "ab_tests", ["simulation_status"]
    )

    # --- ab_test_results: turn into measurement snapshots ---
    with op.batch_alter_table("ab_test_results") as batch:
        batch.add_column(sa.Column("sample_size_control", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("sample_size_treatment", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("metric_name", sa.String(60), nullable=True))
        batch.add_column(sa.Column("metric_delta", sa.Numeric(12, 6), nullable=True))
        batch.add_column(sa.Column("lift_pp", sa.Numeric(8, 4), nullable=True))
        batch.add_column(
            sa.Column("confidence_interval_low", sa.Numeric(12, 6), nullable=True)
        )
        batch.add_column(
            sa.Column("confidence_interval_high", sa.Numeric(12, 6), nullable=True)
        )
        batch.add_column(sa.Column("observed_revenue_control", sa.Numeric(14, 2), nullable=True))
        batch.add_column(
            sa.Column("observed_revenue_treatment", sa.Numeric(14, 2), nullable=True)
        )
        batch.add_column(
            sa.Column("observed_margin_control", sa.Numeric(12, 6), nullable=True)
        )
        batch.add_column(
            sa.Column("observed_margin_treatment", sa.Numeric(12, 6), nullable=True)
        )
        batch.add_column(
            sa.Column(
                "computed_at",
                sa.DateTime(),
                server_default=sa.func.now(),
                nullable=False,
            )
        )

    op.create_index(
        "ix_ab_test_results_computed_at", "ab_test_results", ["computed_at"]
    )

    # --- ab_test_assignments: cohort / event lineage ---
    op.create_table(
        "ab_test_assignments",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "test_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("ab_tests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("article_id", sa.String(60), nullable=False),
        sa.Column("customer_key", sa.String(120), nullable=True),
        sa.Column("quote_key", sa.String(120), nullable=True),
        sa.Column("arm", sa.String(16), nullable=False),  # 'control' | 'treatment'
        sa.Column("assigned_price", sa.Numeric(12, 4), nullable=True),
        sa.Column(
            "assigned_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("outcome_ref_type", sa.String(40), nullable=True),
        sa.Column("outcome_ref_id", sa.String(120), nullable=True),
        sa.Column("outcome_revenue", sa.Numeric(14, 2), nullable=True),
        sa.Column("outcome_margin", sa.Numeric(12, 6), nullable=True),
        sa.Column("outcome_recorded_at", sa.DateTime(), nullable=True),
        sa.Column("payload", JSONB, nullable=True),
    )
    op.create_index(
        "ix_ab_test_assignments_test_id", "ab_test_assignments", ["test_id"]
    )
    op.create_index(
        "ix_ab_test_assignments_article_id", "ab_test_assignments", ["article_id"]
    )
    op.create_index("ix_ab_test_assignments_arm", "ab_test_assignments", ["arm"])
    op.create_index(
        "ix_ab_test_assignments_customer_key",
        "ab_test_assignments",
        ["customer_key"],
    )
    op.create_index(
        "ix_ab_test_assignments_quote_key", "ab_test_assignments", ["quote_key"]
    )

    # Backfill: existing rows had status='running' under the old column; mirror
    # into decision_state so lifecycle reads work without rewriting clients.
    op.execute(
        "UPDATE ab_tests SET decision_state = CASE "
        "WHEN status = 'running' THEN 'running' "
        "WHEN status = 'held' THEN 'held' "
        "WHEN status = 'stopped' THEN 'stopped' "
        "WHEN status = 'promoted' THEN 'promoted' "
        "WHEN status = 'completed' THEN 'completed' "
        "ELSE 'draft' END"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ab_test_assignments_quote_key", table_name="ab_test_assignments"
    )
    op.drop_index(
        "ix_ab_test_assignments_customer_key", table_name="ab_test_assignments"
    )
    op.drop_index("ix_ab_test_assignments_arm", table_name="ab_test_assignments")
    op.drop_index(
        "ix_ab_test_assignments_article_id", table_name="ab_test_assignments"
    )
    op.drop_index("ix_ab_test_assignments_test_id", table_name="ab_test_assignments")
    op.drop_table("ab_test_assignments")

    op.drop_index("ix_ab_test_results_computed_at", table_name="ab_test_results")
    with op.batch_alter_table("ab_test_results") as batch:
        for col in (
            "computed_at",
            "observed_margin_treatment",
            "observed_margin_control",
            "observed_revenue_treatment",
            "observed_revenue_control",
            "confidence_interval_high",
            "confidence_interval_low",
            "lift_pp",
            "metric_delta",
            "metric_name",
            "sample_size_treatment",
            "sample_size_control",
        ):
            batch.drop_column(col)

    op.drop_index("ix_ab_tests_simulation_status", table_name="ab_tests")
    op.drop_index("ix_ab_tests_decision_state", table_name="ab_tests")
    with op.batch_alter_table("ab_tests") as batch:
        for col in (
            "updated_at",
            "promotion_blockers",
            "promotion_eligible",
            "latest_simulation_id",
            "simulation_status",
            "decision_state",
            "status_reason",
            "hypothesis",
            "duration_days",
            "success_metric",
        ):
            batch.drop_column(col)
