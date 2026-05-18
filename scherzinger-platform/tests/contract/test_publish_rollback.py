"""Phase A7 contract — rollback reverts ``price_state.current_price``.

The Studio queue's margin column and the Quotes screen both read
``price_state.current_price``. Until Phase A7, ``rollback_publish``
flipped the ``price_book`` rows but didn't write back to
``price_state`` for the receipt-level audit story, so consumers saw the
rolled-back price as if it were still active.

This contract test pins the fix: after rollback, ``price_state`` is
flush with the restored price, a dedicated ``price_rolled_back`` audit
row exists, and a second rollback of the same receipt is a no-op (no
duplicate audit row, same response shape).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest


pytest.importorskip("psycopg2")


@pytest.fixture
def db():
    """Live session against the test DB; skip if not reachable.

    Mirrors the fixture in ``tests/services/pricing/test_publish.py`` —
    we keep them independent so this contract spec can run on its own.
    """
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


def _aid() -> str:
    return f"A7-{uuid4().hex[:8].upper()}"


def _seed_price_state(db, *, aid: str, price: Decimal) -> None:
    """Seed a ``price_state`` row so ``_sync_price_state`` updates it.

    ``_sync_price_state`` only updates existing rows (Phase 7 design —
    PriceState is seeded elsewhere), so the contract test seeds one
    upfront and then verifies the rollback flips it back.
    """
    from backend.models.pricing.pricing_state import PriceStateRow

    row = PriceStateRow(
        aid=aid,
        current_price=price,
        currency="EUR",
        last_set_by="seed",
        last_set_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()


def test_rollback_reverts_price_state_and_writes_audit(db) -> None:
    """Publish 10 → 15 → rollback. price_state must read 10 again."""
    from backend.models.pricing.audit import PricingAuditEntry
    from backend.models.pricing.pricing_state import PriceStateRow
    from backend.models.pricing.publish import PublishReceiptRow
    from backend.services.pricing.publish import publish_price, rollback_publish

    aid = _aid()
    _seed_price_state(db, aid=aid, price=Decimal("10.00"))

    # Seed a price_book row mirroring the seeded state — the rollback's
    # "prior row" lookup needs something to re-open.
    t0 = datetime.now(timezone.utc) - timedelta(days=2)
    publish_price(
        aid=aid,
        price=Decimal("10.00"),
        effective_at=t0,
        source_proposal_id=None,
        actor="seed",
        db_session=db,
    )
    db.flush()

    # The seeded publish flips price_state to 10.00 (already 10.00 —
    # confirmed below).
    state = db.get(PriceStateRow, aid)
    assert state is not None
    assert Decimal(state.current_price) == Decimal("10.0000")

    # Publish 15.00.
    t1 = datetime.now(timezone.utc)
    receipt = publish_price(
        aid=aid,
        price=Decimal("15.00"),
        effective_at=t1,
        source_proposal_id=None,
        actor="frank",
        db_session=db,
    )
    db.flush()

    state = db.get(PriceStateRow, aid)
    assert state is not None
    assert Decimal(state.current_price) == Decimal("15.0000"), (
        "publish_price should mirror price_state.current_price"
    )

    # Roll back. Expect price_state to revert to 10.00.
    rolled = rollback_publish(
        receipt_id=receipt.id,
        reason="user clicked rollback",
        actor="frank",
        db_session=db,
    )
    db.flush()

    assert rolled.rolled_back_at is not None

    state = db.get(PriceStateRow, aid)
    assert state is not None
    assert Decimal(state.current_price) == Decimal("10.0000"), (
        "rollback must flip price_state.current_price back to the prior price"
    )
    assert state.last_set_by == f"rollback:{receipt.id}"

    # publish_receipts.rolled_back_at is stamped.
    persisted = db.get(PublishReceiptRow, receipt.id)
    assert persisted is not None
    assert persisted.rolled_back_at is not None

    # A ``price_rolled_back`` audit row exists with the documented shape.
    audits = (
        db.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == aid)
        .filter(PricingAuditEntry.action == "price_rolled_back")
        .all()
    )
    assert len(audits) == 1
    audit = audits[0]
    assert audit.target_kind == "sku"
    assert audit.reason == "rollback_within_72h_window"
    assert audit.before == {"price": "15.0000"} or audit.before == {"price": "15.00"} or (
        audit.before is not None and audit.before.get("price") in {"15.0000", "15.00"}
    )
    assert audit.after is not None
    assert audit.after.get("price") in {"10.0000", "10.00"}


def test_rollback_is_idempotent(db) -> None:
    """Second rollback returns the same receipt and writes no audit row."""
    from backend.models.pricing.audit import PricingAuditEntry
    from backend.services.pricing.publish import publish_price, rollback_publish

    aid = _aid()
    _seed_price_state(db, aid=aid, price=Decimal("10.00"))

    publish_price(
        aid=aid,
        price=Decimal("10.00"),
        effective_at=datetime.now(timezone.utc) - timedelta(days=1),
        source_proposal_id=None,
        actor="seed",
        db_session=db,
    )
    db.flush()

    receipt = publish_price(
        aid=aid,
        price=Decimal("15.00"),
        effective_at=datetime.now(timezone.utc),
        source_proposal_id=None,
        actor="frank",
        db_session=db,
    )
    db.flush()

    first = rollback_publish(
        receipt_id=receipt.id,
        reason="user clicked rollback",
        actor="frank",
        db_session=db,
    )
    db.flush()
    first_audit_count = (
        db.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == aid)
        .filter(PricingAuditEntry.action == "price_rolled_back")
        .count()
    )
    assert first_audit_count == 1

    second = rollback_publish(
        receipt_id=receipt.id,
        reason="user clicked rollback again",
        actor="frank",
        db_session=db,
    )
    db.flush()

    second_audit_count = (
        db.query(PricingAuditEntry)
        .filter(PricingAuditEntry.target_id == aid)
        .filter(PricingAuditEntry.action == "price_rolled_back")
        .count()
    )

    assert second.id == first.id
    assert second.rolled_back_at == first.rolled_back_at
    assert second_audit_count == 1, "second rollback must not write a duplicate audit row"
