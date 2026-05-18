"""Phase A6 — contract test for the scheduled-publish runner.

Seeds a ``scheduled_publishes`` row with ``effective_at`` in the past
and calls ``run_due_publishes`` directly (the APScheduler cron is NOT
running under pytest). Asserts the row flipped to ``fired``, a fresh
``price_book`` row exists for the aid with the scheduled price, and
``price_state.current_price`` was mirrored to the new price.
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
    try:
        session.rollback()
    except Exception:
        pass
    session.close()


def _aid() -> str:
    return f"SCHED-{uuid4().hex[:8].upper()}"


def test_run_due_publishes_fires_pending_row(db) -> None:
    from backend.models.pricing.publish import (
        PriceBookRow,
        ScheduledPublish,
        ScheduledPublishStatus,
    )
    from backend.models.pricing.pricing_state import PriceStateRow
    from backend.services.pricing.scheduled_publish_runner import (
        run_due_publishes,
    )
    from sqlalchemy import select

    aid = _aid()
    scheduled_price = Decimal("142.5000")

    # Seed an existing price_state row so publish_price has something to
    # mirror onto (price_state is normally seeded out-of-band).
    db.add(
        PriceStateRow(
            aid=aid,
            current_price=Decimal("100.0000"),
            currency="EUR",
            last_set_by="seed",
        )
    )
    db.flush()

    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    row = ScheduledPublish(
        aid=aid,
        price=scheduled_price,
        effective_at=past,
        source_proposal_id=None,
        status=ScheduledPublishStatus.PENDING.value,
        created_by="contract-test",
    )
    db.add(row)
    db.commit()
    row_id = row.id

    # Call the runner. It opens its own savepoint per-row and commits.
    fired = run_due_publishes(db)
    assert fired >= 1, "runner should report at least the seeded row fired"

    # Row flipped to fired.
    db.expire_all()
    refreshed = db.get(ScheduledPublish, row_id)
    assert refreshed is not None
    assert refreshed.status == ScheduledPublishStatus.FIRED.value
    assert refreshed.fired_at is not None

    # A price_book row exists for the aid with the scheduled price.
    pb_stmt = (
        select(PriceBookRow)
        .where(PriceBookRow.aid == aid)
        .where(PriceBookRow.valid_to.is_(None))
        .order_by(PriceBookRow.valid_from.desc())
        .limit(1)
    )
    active_pb = db.execute(pb_stmt).scalars().first()
    assert active_pb is not None, "scheduled fire must produce a price_book row"
    assert Decimal(active_pb.price) == scheduled_price

    # price_state.current_price mirrors the published price.
    state = db.get(PriceStateRow, aid)
    assert state is not None
    assert Decimal(state.current_price) == scheduled_price


def test_run_due_publishes_skips_future_rows(db) -> None:
    from backend.models.pricing.publish import (
        ScheduledPublish,
        ScheduledPublishStatus,
    )
    from backend.services.pricing.scheduled_publish_runner import (
        run_due_publishes,
    )

    aid = _aid()
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    row = ScheduledPublish(
        aid=aid,
        price=Decimal("88.00"),
        effective_at=future,
        source_proposal_id=None,
        status=ScheduledPublishStatus.PENDING.value,
        created_by="contract-test",
    )
    db.add(row)
    db.commit()
    row_id = row.id

    # Sanity: the runner should not touch this row.
    run_due_publishes(db)

    db.expire_all()
    refreshed = db.get(ScheduledPublish, row_id)
    assert refreshed is not None
    assert refreshed.status == ScheduledPublishStatus.PENDING.value
    assert refreshed.fired_at is None


def test_run_due_publishes_marks_failed_on_publish_error(db, monkeypatch) -> None:
    """If publish_price raises, the row flips to ``failed``, not stuck
    on ``pending``."""
    from backend.models.pricing.publish import (
        ScheduledPublish,
        ScheduledPublishStatus,
    )
    from backend.services.pricing import scheduled_publish_runner as runner_mod

    aid = _aid()
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    row = ScheduledPublish(
        aid=aid,
        price=Decimal("70.00"),
        effective_at=past,
        source_proposal_id=None,
        status=ScheduledPublishStatus.PENDING.value,
        created_by="contract-test",
    )
    db.add(row)
    db.commit()
    row_id = row.id

    def _boom(**_kwargs):
        raise RuntimeError("simulated publish failure")

    monkeypatch.setattr(runner_mod, "publish_price", _boom)

    fired = runner_mod.run_due_publishes(db)
    assert fired == 0

    db.expire_all()
    refreshed = db.get(ScheduledPublish, row_id)
    assert refreshed is not None
    assert refreshed.status == ScheduledPublishStatus.FAILED.value
