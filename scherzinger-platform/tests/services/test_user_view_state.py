"""Phase 4 (Pricing Studio v3) — user_view_state helpers.

Round-trips through the real DB session because the helper uses Postgres
``ON CONFLICT`` for the upsert path and we want to verify that the unique
PK collision is treated as an upsert (no IntegrityError).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from backend.database import SessionLocal
from backend.models.user_view_state import UserViewState, UserViewSurface
from backend.services.user_view_state import get_last_seen, stamp_view


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


@pytest.fixture
def _isolation_keys():
    """Return a unique user_id + target_id triple per test so concurrent
    runs (or stale rows from a previous run) never alias."""
    return {
        "user_id": f"u_{uuid.uuid4().hex[:12]}",
        "target_id": f"A_{uuid.uuid4().hex[:8]}",
    }


def test_stamp_view_creates_row(db, _isolation_keys):
    stamp_view(
        user_id=_isolation_keys["user_id"],
        surface=UserViewSurface.STUDIO,
        target_id=_isolation_keys["target_id"],
        session=db,
    )
    seen = get_last_seen(
        user_id=_isolation_keys["user_id"],
        surface=UserViewSurface.STUDIO,
        target_id=_isolation_keys["target_id"],
        session=db,
    )
    assert seen is not None
    # Within a few seconds of now.
    assert (datetime.now(timezone.utc) - seen) < timedelta(minutes=1)


def test_get_last_seen_returns_none_when_missing(db, _isolation_keys):
    seen = get_last_seen(
        user_id=_isolation_keys["user_id"],
        surface=UserViewSurface.STUDIO,
        target_id=_isolation_keys["target_id"],
        session=db,
    )
    assert seen is None


def test_stamp_view_is_upsert_not_error(db, _isolation_keys):
    """Re-stamping the same triple must not raise — it upserts the row."""
    initial_at = datetime.now(timezone.utc) - timedelta(days=2)
    first = stamp_view(
        user_id=_isolation_keys["user_id"],
        surface=UserViewSurface.STUDIO,
        target_id=_isolation_keys["target_id"],
        session=db,
        at=initial_at,
    )
    # Snapshot the value before the second call — SQLAlchemy expires the
    # ORM attributes on flush so ``first.last_seen_at`` reflects the
    # post-upsert value otherwise.
    first_seen = first.last_seen_at
    pk = (first.user_id, first.surface, first.target_id)

    second = stamp_view(
        user_id=_isolation_keys["user_id"],
        surface=UserViewSurface.STUDIO,
        target_id=_isolation_keys["target_id"],
        session=db,
    )
    # Same PK row (composite key collision = upsert, not insert).
    assert pk == (second.user_id, second.surface, second.target_id)
    # Timestamp advanced.
    assert second.last_seen_at > first_seen


def test_stamp_view_distinct_surfaces_keep_independent_rows(db, _isolation_keys):
    studio_at = datetime.now(timezone.utc) - timedelta(days=3)
    studio = stamp_view(
        user_id=_isolation_keys["user_id"],
        surface=UserViewSurface.STUDIO,
        target_id=_isolation_keys["target_id"],
        session=db,
        at=studio_at,
    )
    action_center = stamp_view(
        user_id=_isolation_keys["user_id"],
        surface=UserViewSurface.ACTION_CENTER,
        target_id=_isolation_keys["target_id"],
        session=db,
    )
    assert studio.surface != action_center.surface
    studio_seen = get_last_seen(
        user_id=_isolation_keys["user_id"],
        surface=UserViewSurface.STUDIO,
        target_id=_isolation_keys["target_id"],
        session=db,
    )
    # Studio row was stamped at ``studio_at``; the action_center stamp
    # mustn't touch it.
    assert studio_seen is not None
    assert abs((studio_seen - studio_at).total_seconds()) < 1.0


def test_stamp_view_accepts_string_surface(db, _isolation_keys):
    stamp_view(
        user_id=_isolation_keys["user_id"],
        surface="studio",
        target_id=_isolation_keys["target_id"],
        session=db,
    )
    row = (
        db.query(UserViewState)
        .filter_by(
            user_id=_isolation_keys["user_id"],
            surface="studio",
            target_id=_isolation_keys["target_id"],
        )
        .one()
    )
    assert row.last_seen_at is not None
