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
