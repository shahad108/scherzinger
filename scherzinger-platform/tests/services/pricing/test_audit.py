"""Phase 21 — pricing_audit helper round-trip."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditEntry,
    PricingAuditTargetKind,
)
from backend.services.pricing.audit import record_audit


@pytest.fixture
def session() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


def test_record_audit_writes_row_with_action_enum(session: Session) -> None:
    entry = record_audit(
        actor="frank@scherzinger.de",
        action=PricingAuditAction.PRICE_SET,
        target_kind=PricingAuditTargetKind.SKU,
        target_id="TST-AID-001",
        before={"price": "10.00"},
        after={"price": "11.50"},
        reason="cost shock",
        session=session,
    )
    assert entry.id is not None
    assert entry.action == "price_set"
    assert entry.target_kind == "sku"

    fetched = session.get(PricingAuditEntry, entry.id)
    assert fetched is not None
    assert fetched.actor == "frank@scherzinger.de"
    assert fetched.before == {"price": "10.00"}
    assert fetched.after == {"price": "11.50"}
    assert fetched.reason == "cost shock"


def test_record_audit_accepts_string_action(session: Session) -> None:
    entry = record_audit(
        actor="md@scherzinger.de",
        action="proposal_approved",
        target_kind="sku",
        target_id="TST-AID-002",
        session=session,
    )
    assert entry.action == "proposal_approved"
    assert entry.before is None
    assert entry.after is None


def test_record_audit_query_back(session: Session) -> None:
    record_audit(
        actor="alerts@system",
        action=PricingAuditAction.ALERT_TRIGGERED,
        target_kind=PricingAuditTargetKind.CLUSTER,
        target_id="TST-CLUSTER-Z",
        session=session,
    )
    rows = (
        session.query(PricingAuditEntry)
        .filter_by(target_id="TST-CLUSTER-Z")
        .all()
    )
    assert len(rows) >= 1
    assert any(r.action == "alert_triggered" for r in rows)
