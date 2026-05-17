"""Phase 7 — notification dispatcher tests.

The dispatcher is best-effort and writes per-channel result dicts. We
exercise the four channel paths (slack/email/escalate/ab_test) and
verify that an empty notify payload yields zero channel calls.
"""
from __future__ import annotations

from uuid import uuid4

import pytest


pytest.importorskip("psycopg2")


@pytest.fixture
def db():
    from sqlalchemy import text

    from backend.database import SessionLocal

    session = SessionLocal()
    try:
        session.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("test DB unreachable")
    yield session
    session.rollback()
    session.close()


def _aid() -> str:
    return f"NOTIF-{uuid4().hex[:8].upper()}"


def test_dispatch_no_flags_calls_no_channels(db) -> None:
    from backend.services.pricing.notifications import dispatch_notifications

    results = dispatch_notifications(
        aid=_aid(),
        proposal_id=None,
        notify_flags={},
        actor="tester",
        db_session=db,
    )
    assert results == []


def test_dispatch_all_flags_returns_four_results(db) -> None:
    from backend.services.pricing.notifications import dispatch_notifications

    results = dispatch_notifications(
        aid=_aid(),
        proposal_id=None,
        notify_flags={
            "sales": True,
            "customers": ["cust-1", "cust-2"],
            "escalate": True,
            "ab_test": True,
        },
        actor="tester",
        db_session=db,
    )
    db.flush()
    channels = sorted(r["channel"] for r in results)
    # slack + 2 email + escalation + ab_test
    assert channels == ["ab_test", "email", "email", "internal_escalation", "slack"]
    for r in results:
        assert r["status"] in {"sent", "failed"}
        assert "dispatched_at" in r


def test_dispatch_sales_only_returns_one_slack(db) -> None:
    from backend.services.pricing.notifications import dispatch_notifications

    results = dispatch_notifications(
        aid=_aid(),
        proposal_id=None,
        notify_flags={"sales": True},
        actor="tester",
        db_session=db,
    )
    assert len(results) == 1
    assert results[0]["channel"] == "slack"


def test_dispatch_customers_iterates_each_recipient(db) -> None:
    from backend.services.pricing.notifications import dispatch_notifications

    customers = ["a@example.com", "b@example.com", "c@example.com"]
    results = dispatch_notifications(
        aid=_aid(),
        proposal_id=None,
        notify_flags={"customers": customers},
        actor="tester",
        db_session=db,
    )
    assert [r["recipient"] for r in results] == customers


def test_escalation_writes_pricing_audit_row(db) -> None:
    from backend.models.pricing.audit import PricingAuditEntry
    from backend.services.pricing.notifications import dispatch_notifications

    aid = _aid()
    dispatch_notifications(
        aid=aid,
        proposal_id=None,
        notify_flags={"escalate": True},
        actor="tester",
        db_session=db,
    )
    db.flush()
    rows = (
        db.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == aid)
        .filter(PricingAuditEntry.action == "alert_triggered")
        .all()
    )
    assert len(rows) >= 1
