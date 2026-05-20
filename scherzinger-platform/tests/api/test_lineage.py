"""Phase 21 — lineage_refs helper round-trip + PII scrubbing."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.pricing.lineage import LineageSourceKind
from backend.services.pricing.lineage import create_lineage, get_lineage


@pytest.fixture
def session() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


def test_create_and_get_round_trip(session: Session) -> None:
    row = create_lineage(
        source_kind=LineageSourceKind.INVOICE_LEDGER,
        source_id="INV-2026-00042",
        sql="SELECT aid, price FROM invoice_lines WHERE aid = ?",
        model=None,
        computed_by="composer.studio",
        session=session,
    )
    assert row.id is not None
    assert row.source_kind == "invoice_ledger"

    fetched = get_lineage(row.id, session=session)
    assert fetched is not None
    assert fetched.source_id == "INV-2026-00042"
    assert fetched.computed_by == "composer.studio"


def test_create_lineage_with_model_ref(session: Session) -> None:
    row = create_lineage(
        source_kind=LineageSourceKind.ELASTICITY_MODEL,
        source_id="run-1234",
        sql=None,
        model="elasticity_v3@2026-05-10",
        computed_by="recommendation_service",
        session=session,
    )
    assert row.model == "elasticity_v3@2026-05-10"
    assert row.sql is None


def test_get_lineage_missing_returns_none(session: Session) -> None:
    from uuid import uuid4

    assert get_lineage(uuid4(), session=session) is None


def test_create_lineage_scrubs_literals_from_sql(session: Session) -> None:
    """No PII leakage: literal values in SQL are replaced with `?`."""
    row = create_lineage(
        source_kind=LineageSourceKind.INVOICE_LEDGER,
        source_id="INV-2026-00099",
        sql="SELECT * FROM invoices WHERE customer_id = 'CUST-SECRET-42' AND price > 1234.56",
        computed_by="composer.studio",
        session=session,
    )
    assert row.sql is not None
    assert "CUST-SECRET-42" not in row.sql
    assert "1234.56" not in row.sql
    assert "?" in row.sql


# ---------------------------------------------------------------------------
# PII scrubber — every PostgreSQL literal shape we know about MUST be
# replaced. A regression here is a P0 (PII leak into the audit trail).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name, secret",
    [
        ("single_quoted", "CUST-SECRET-42"),
        ("double_quoted", "CUST-SECRET-42"),
        ("e_escape", "CUST-SECRET-42"),
        ("dollar_named", "CUST-SECRET-42"),
        ("dollar_anon", "CUST-SECRET-42"),
        ("hex_literal", "deadbeef"),
        ("line_comment", "secret"),
        ("block_comment", "secret"),
    ],
)
def test_pii_scrubber_cases(name: str, secret: str) -> None:
    from backend.services.pricing.lineage import _sanitize_sql

    cases = {
        "single_quoted": f"SELECT * FROM t WHERE c = 'CUST-SECRET-42'",
        "double_quoted": 'SELECT * FROM t WHERE "CUST-SECRET-42" = 1',
        "e_escape": "SELECT * FROM t WHERE c = E'CUST-SECRET-42'",
        "dollar_named": "SELECT * FROM t WHERE c = $tag$CUST-SECRET-42$tag$",
        "dollar_anon": "SELECT * FROM t WHERE c = $$CUST-SECRET-42$$",
        "hex_literal": "SELECT * FROM t WHERE c = x'deadbeef'",
        "line_comment": "SELECT 1 -- secret should be stripped",
        "block_comment": "SELECT /* secret should be stripped */ 1",
    }
    cleaned = _sanitize_sql(cases[name])
    assert cleaned is not None
    assert secret not in cleaned, (
        f"{name}: secret leaked through scrubber: cleaned={cleaned!r}"
    )
    assert "?" in cleaned


# ---------------------------------------------------------------------------
# Postgres CHECK constraints — bad enum-as-string values MUST be rejected.
# ---------------------------------------------------------------------------


def test_check_constraint_rejects_invalid_customer_tier(session: Session) -> None:
    """Inserting tier='Z' must be rejected by the ck_customer_on_sku_tier
    CHECK constraint added in p21a.
    """
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        session.execute(
            text(
                """
                INSERT INTO customer_on_sku
                    (id, aid, customer_id, ltm_units, tier, updated_at)
                VALUES
                    (gen_random_uuid(), 'TST-AID', 'TST-CUST', 0, 'Z', NOW())
                """
            )
        )
        session.flush()
    session.rollback()


def test_check_constraint_rejects_invalid_audit_action(session: Session) -> None:
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        session.execute(
            text(
                """
                INSERT INTO pricing_audit
                    (id, actor, action, target_kind, target_id)
                VALUES
                    (gen_random_uuid(), 'tester', 'NOT_A_REAL_ACTION', 'sku', 'X')
                """
            )
        )
        session.flush()
    session.rollback()
