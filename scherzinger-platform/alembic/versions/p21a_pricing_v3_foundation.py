"""Phase 21 (Pricing Studio v3) — canonical foundation tables.

Creates the five persisted Studio v3 tables in a single migration:

  - lineage_refs        (provenance for every numeric value)
  - price_state         (per-aid current price)
  - cost_state          (per-aid unit cost + breakdown + 30-day trajectory)
  - customer_on_sku     (per (aid, customer) reality row for the fanout panel)
  - pricing_audit       (append-only log of every state-changing pricing action)

Margin state and recommendation are computed — no tables.

Revision ID: p21a_pricing_v3_foundation
Revises: p20a_scenarios
Create Date: 2026-05-16
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID

revision = "p21a_pricing_v3_foundation"
down_revision = "p20a_scenarios"
branch_labels = None
depends_on = None


# Enum-as-string allowed values. We store as TEXT (not Postgres ENUM)
# because adding a value to a PG ENUM in a future migration is far more
# painful than ALTER-ing a CHECK constraint. The CHECK guards us from
# bad inserts in the meantime.
_AUDIT_ACTIONS = (
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
_AUDIT_TARGET_KINDS = ("sku", "customer", "cluster", "family")
_LINEAGE_SOURCE_KINDS = (
    "invoice_ledger",
    "competitor_feed",
    "won_deal_sample",
    "elasticity_model",
    "cost_ingest",
    "manual_override",
    "scheduled_publish",
    "ab_test_assignment",
)
_CUSTOMER_TIERS = ("A", "B", "C", "D")


def _in_list_sql(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


def upgrade() -> None:
    # --- lineage_refs (must come first; other tables FK into it) ----------
    op.create_table(
        "lineage_refs",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("source_kind", sa.String(40), nullable=False),
        sa.Column("source_id", sa.String(120), nullable=False),
        sa.Column("sql", sa.Text(), nullable=True),
        sa.Column("model", sa.String(120), nullable=True),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("computed_by", sa.String(120), nullable=False),
        sa.CheckConstraint(
            _in_list_sql("source_kind", _LINEAGE_SOURCE_KINDS),
            name="ck_lineage_refs_source_kind",
        ),
    )
    op.create_index("ix_lineage_refs_source_kind", "lineage_refs", ["source_kind"])
    op.create_index("ix_lineage_refs_source_id", "lineage_refs", ["source_id"])

    # --- price_state ------------------------------------------------------
    op.create_table(
        "price_state",
        sa.Column("aid", sa.String(60), primary_key=True),
        sa.Column("current_price", sa.Numeric(14, 4), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("floor", sa.Numeric(14, 4), nullable=True),
        sa.Column("ceiling", sa.Numeric(14, 4), nullable=True),
        sa.Column("list_price", sa.Numeric(14, 4), nullable=True),
        sa.Column("last_set_by", sa.String(120), nullable=False),
        sa.Column(
            "last_set_at",
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
    )
    # aid is the PK, but explicit ix accelerates JOIN against pricing_audit.
    op.create_index("ix_price_state_last_set_at", "price_state", ["last_set_at"])

    # --- cost_state -------------------------------------------------------
    op.create_table(
        "cost_state",
        sa.Column("aid", sa.String(60), primary_key=True),
        sa.Column("unit_cost", sa.Numeric(14, 4), nullable=False),
        sa.Column("breakdown", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "last_ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("trajectory_30d", JSONB, nullable=False, server_default="[]"),
        sa.Column(
            "lineage_ref_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("lineage_refs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_cost_state_last_ingested_at", "cost_state", ["last_ingested_at"])

    # --- customer_on_sku --------------------------------------------------
    op.create_table(
        "customer_on_sku",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("aid", sa.String(60), nullable=False),
        sa.Column("customer_id", sa.String(60), nullable=False),
        sa.Column("last_paid", sa.Numeric(14, 4), nullable=True),
        sa.Column("last_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ltm_units", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("churn_p", sa.Numeric(5, 4), nullable=True),
        sa.Column("wallet_share_pct", sa.Numeric(5, 4), nullable=True),
        sa.Column("tier", sa.String(2), nullable=False, server_default="C"),
        sa.Column(
            "lineage_ref_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("lineage_refs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("aid", "customer_id", name="uq_customer_on_sku_aid_customer"),
        sa.CheckConstraint(
            _in_list_sql("tier", _CUSTOMER_TIERS),
            name="ck_customer_on_sku_tier",
        ),
    )
    op.create_index("ix_customer_on_sku_aid", "customer_on_sku", ["aid"])
    op.create_index("ix_customer_on_sku_customer_id", "customer_on_sku", ["customer_id"])

    # --- pricing_audit ----------------------------------------------------
    op.create_table(
        "pricing_audit",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column(
            "at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("actor", sa.String(120), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("target_kind", sa.String(20), nullable=False),
        sa.Column("target_id", sa.String(120), nullable=False),
        sa.Column("before", JSONB, nullable=True),
        sa.Column("after", JSONB, nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "lineage_ref_id",
            PGUUID(as_uuid=True),
            sa.ForeignKey("lineage_refs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint(
            _in_list_sql("action", _AUDIT_ACTIONS),
            name="ck_pricing_audit_action",
        ),
        sa.CheckConstraint(
            _in_list_sql("target_kind", _AUDIT_TARGET_KINDS),
            name="ck_pricing_audit_target_kind",
        ),
    )
    op.create_index("ix_pricing_audit_at", "pricing_audit", ["at"])
    op.create_index("ix_pricing_audit_actor", "pricing_audit", ["actor"])
    op.create_index("ix_pricing_audit_action", "pricing_audit", ["action"])
    op.create_index("ix_pricing_audit_target_id", "pricing_audit", ["target_id"])
    # Compound index: the audit drawer's per-target timeline query.
    op.create_index(
        "ix_pricing_audit_target_at",
        "pricing_audit",
        ["target_id", sa.text("at DESC")],
    )


def downgrade() -> None:
    # Drop CHECK constraints first so a partial-rollback that fails inside
    # drop_table leaves the schema in a clean state. Use ``IF EXISTS`` so a
    # downgrade against a DB that pre-dates the CHECK additions doesn't
    # 500 — the migration itself doesn't track partial states.
    op.execute(
        "ALTER TABLE pricing_audit "
        "DROP CONSTRAINT IF EXISTS ck_pricing_audit_target_kind"
    )
    op.execute(
        "ALTER TABLE pricing_audit "
        "DROP CONSTRAINT IF EXISTS ck_pricing_audit_action"
    )
    op.drop_index("ix_pricing_audit_target_at", table_name="pricing_audit")
    op.drop_index("ix_pricing_audit_target_id", table_name="pricing_audit")
    op.drop_index("ix_pricing_audit_action", table_name="pricing_audit")
    op.drop_index("ix_pricing_audit_actor", table_name="pricing_audit")
    op.drop_index("ix_pricing_audit_at", table_name="pricing_audit")
    op.drop_table("pricing_audit")

    op.execute(
        "ALTER TABLE customer_on_sku "
        "DROP CONSTRAINT IF EXISTS ck_customer_on_sku_tier"
    )
    op.drop_index("ix_customer_on_sku_customer_id", table_name="customer_on_sku")
    op.drop_index("ix_customer_on_sku_aid", table_name="customer_on_sku")
    op.drop_table("customer_on_sku")

    op.drop_index("ix_cost_state_last_ingested_at", table_name="cost_state")
    op.drop_table("cost_state")

    op.drop_index("ix_price_state_last_set_at", table_name="price_state")
    op.drop_table("price_state")

    op.execute(
        "ALTER TABLE lineage_refs "
        "DROP CONSTRAINT IF EXISTS ck_lineage_refs_source_kind"
    )
    op.drop_index("ix_lineage_refs_source_id", table_name="lineage_refs")
    op.drop_index("ix_lineage_refs_source_kind", table_name="lineage_refs")
    op.drop_table("lineage_refs")
