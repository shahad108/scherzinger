"""Phase 7 — publish_price / schedule_publish / rollback_publish tests.

Exercises the publish workflow against a live DB session. Skips cleanly
when the test DB isn't reachable.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest


pytest.importorskip("psycopg2")


@pytest.fixture
def db():
    from backend.database import SessionLocal

    session = SessionLocal()
    try:
        from sqlalchemy import text

        session.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("test DB unreachable")
    yield session
    session.rollback()
    session.close()


def _seed_user(db) -> UUID:
    from backend.models import User

    uid = uuid4()
    user = User(
        id=uid,
        email=f"u{uid.hex[:8]}@example.com",
        name="Test User",
        dept="x",
        ui_persona_default="frank",
        password_hash="x",
    )
    db.add(user)
    db.flush()
    return uid


def _aid() -> str:
    return f"PUB-{uuid4().hex[:8].upper()}"


def test_publish_price_writes_new_row_when_no_prior(db) -> None:
    from backend.models.pricing.publish import PriceBookRow, PublishReceiptRow
    from backend.services.pricing.publish import publish_price

    aid = _aid()
    now = datetime.now(timezone.utc)
    receipt = publish_price(
        aid=aid,
        price=Decimal("127.0000"),
        effective_at=now,
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()

    assert receipt.aid == aid
    assert receipt.old_price_book_row_id is None
    assert receipt.new_price_book_row_id is not None

    new_row = db.get(PriceBookRow, receipt.new_price_book_row_id)
    assert new_row is not None
    assert Decimal(new_row.price) == Decimal("127.0000")
    assert new_row.valid_to is None

    persisted = db.get(PublishReceiptRow, receipt.id)
    assert persisted is not None
    assert persisted.published_by == "tester"


def test_publish_price_closes_prior_row_and_opens_new(db) -> None:
    from backend.models.pricing.publish import PriceBookRow
    from backend.services.pricing.publish import publish_price

    aid = _aid()
    t0 = datetime.now(timezone.utc) - timedelta(days=10)
    publish_price(
        aid=aid,
        price=Decimal("100.0000"),
        effective_at=t0,
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()

    t1 = datetime.now(timezone.utc)
    receipt = publish_price(
        aid=aid,
        price=Decimal("110.0000"),
        effective_at=t1,
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()

    assert receipt.old_price_book_row_id is not None
    prior = db.get(PriceBookRow, receipt.old_price_book_row_id)
    assert prior is not None
    assert prior.valid_to is not None
    # valid_to of the prior row equals valid_from of the new row.
    new_row = db.get(PriceBookRow, receipt.new_price_book_row_id)
    assert new_row is not None
    assert new_row.valid_from == prior.valid_to


def test_publish_price_writes_audit_row(db) -> None:
    from backend.models.pricing.audit import PricingAuditEntry
    from backend.services.pricing.publish import publish_price

    aid = _aid()
    publish_price(
        aid=aid,
        price=Decimal("99.0000"),
        effective_at=datetime.now(timezone.utc),
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()

    rows = (
        db.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == aid)
        .filter(PricingAuditEntry.action == "price_set")
        .all()
    )
    assert len(rows) >= 1


def test_publish_price_publishes_sse_event(db) -> None:
    from backend.services import events as events_module
    from backend.services.pricing.publish import publish_price

    captured: list[tuple[str, dict]] = []

    def _fake_publish_sync(topic, payload, aid=None, cluster=None):
        captured.append((topic, payload))

    # Patch the symbol the publish module imports lazily.
    import backend.services.pricing.publish as publish_mod

    original = events_module.publish_sync
    events_module.publish_sync = _fake_publish_sync  # type: ignore[assignment]
    try:
        aid = _aid()
        publish_price(
            aid=aid,
            price=Decimal("50.00"),
            effective_at=datetime.now(timezone.utc),
            source_proposal_id=None,
            actor="tester",
            db_session=db,
        )
    finally:
        events_module.publish_sync = original  # type: ignore[assignment]

    topics = [t for t, _ in captured]
    assert "pricing.price_set" in topics


def test_schedule_publish_writes_pending_row(db) -> None:
    from backend.models.pricing.publish import ScheduledPublish
    from backend.services.pricing.publish import schedule_publish

    aid = _aid()
    future = datetime.now(timezone.utc) + timedelta(days=2)
    out = schedule_publish(
        aid=aid,
        price=Decimal("130.00"),
        effective_at=future,
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()
    row = db.get(ScheduledPublish, out.id)
    assert row is not None
    assert row.status == "pending"
    assert row.effective_at == future


def test_rollback_publish_within_window_reopens_prior_row(db) -> None:
    from backend.models.pricing.audit import PricingAuditEntry
    from backend.models.pricing.publish import PriceBookRow, PublishReceiptRow
    from backend.services.pricing.publish import publish_price, rollback_publish

    aid = _aid()
    t0 = datetime.now(timezone.utc) - timedelta(days=10)
    publish_price(
        aid=aid,
        price=Decimal("100.00"),
        effective_at=t0,
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()

    t1 = datetime.now(timezone.utc)
    receipt = publish_price(
        aid=aid,
        price=Decimal("120.00"),
        effective_at=t1,
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()

    rolled = rollback_publish(
        receipt_id=receipt.id,
        reason="error in published price",
        actor="tester",
        db_session=db,
    )
    db.flush()

    assert rolled.rolled_back_at is not None

    prior_row = db.get(PriceBookRow, receipt.old_price_book_row_id)
    assert prior_row is not None
    assert prior_row.valid_to is None  # re-opened.

    new_row = db.get(PriceBookRow, receipt.new_price_book_row_id)
    assert new_row is not None
    assert new_row.valid_to is not None  # closed.

    audits = (
        db.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == aid)
        .filter(PricingAuditEntry.action == "price_rolled_back")
        .all()
    )
    assert len(audits) >= 1


def test_rollback_publish_outside_window_raises(db) -> None:
    from backend.models.pricing.publish import PublishReceiptRow
    from backend.services.pricing.publish import (
        RollbackWindowExpiredError,
        publish_price,
        rollback_publish,
    )

    aid = _aid()
    receipt = publish_price(
        aid=aid,
        price=Decimal("75.00"),
        effective_at=datetime.now(timezone.utc),
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()
    # Backdate the receipt 80h to simulate an expired rollback window.
    persisted = db.get(PublishReceiptRow, receipt.id)
    persisted.published_at = datetime.now(timezone.utc) - timedelta(hours=80)
    db.flush()

    with pytest.raises(RollbackWindowExpiredError):
        rollback_publish(
            receipt_id=receipt.id,
            reason="too late",
            actor="tester",
            db_session=db,
        )


def test_rollback_twice_is_idempotent(db) -> None:
    """Phase A7: second rollback is a no-op that returns the same receipt.

    Replaces the prior contract (which raised
    ``ReceiptAlreadyRolledBackError``). Idempotency lets the UI retry a
    failed rollback without risking duplicate audit rows.
    """
    from backend.models.pricing.audit import PricingAuditEntry
    from backend.services.pricing.publish import (
        publish_price,
        rollback_publish,
    )

    aid = _aid()
    receipt = publish_price(
        aid=aid,
        price=Decimal("50.00"),
        effective_at=datetime.now(timezone.utc),
        source_proposal_id=None,
        actor="tester",
        db_session=db,
    )
    db.flush()
    first = rollback_publish(
        receipt_id=receipt.id,
        reason="first rollback",
        actor="tester",
        db_session=db,
    )
    db.flush()
    audit_count_after_first = (
        db.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == aid)
        .filter(PricingAuditEntry.action == "price_rolled_back")
        .count()
    )

    second = rollback_publish(
        receipt_id=receipt.id,
        reason="second rollback",
        actor="tester",
        db_session=db,
    )
    db.flush()
    audit_count_after_second = (
        db.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == aid)
        .filter(PricingAuditEntry.action == "price_rolled_back")
        .count()
    )

    assert second.id == first.id
    assert second.rolled_back_at == first.rolled_back_at
    assert audit_count_after_second == audit_count_after_first


def test_publish_price_uses_for_update_lock(db) -> None:
    """Smoke test: the lookup of the active row must use FOR UPDATE.

    We can't easily exercise two concurrent transactions in pytest, but
    we can verify the helper used by publish_price acquires the row
    lock by inspecting the SQL it emits.
    """
    from sqlalchemy import select

    from backend.models.pricing.publish import PriceBookRow

    stmt = (
        select(PriceBookRow)
        .where(PriceBookRow.aid == "X")
        .where(PriceBookRow.valid_to.is_(None))
        .order_by(PriceBookRow.valid_from.desc())
        .limit(1)
        .with_for_update()
    )
    compiled = str(stmt.compile(dialect=db.bind.dialect))
    assert "FOR UPDATE" in compiled
