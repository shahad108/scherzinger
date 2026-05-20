"""Phase J3 — lineage_refs GC tests.

Covers ``lineage.gc_lineage_refs``:

  - Preserves rows referenced by any FK column.
  - Deletes orphaned rows older than ``older_than_days``.
  - Respects the ``older_than_days`` threshold (recent orphans stay).

Skips cleanly when psycopg2 / the test DB are unreachable.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

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


def _insert_lineage(db, *, computed_at: datetime, source_id: str = None) -> str:
    """Insert a lineage_refs row with an explicit computed_at. Returns the id."""
    from sqlalchemy import text

    lid = str(uuid4())
    sid = source_id or f"gc_test:{uuid4().hex[:8]}"
    db.execute(
        text(
            """
            INSERT INTO lineage_refs
              (id, source_kind, source_id, sql, model, computed_at, computed_by)
            VALUES
              (:id, 'manual_override', :sid, NULL, 'gc_test', :ts, 'gc_test')
            """
        ),
        {"id": lid, "sid": sid, "ts": computed_at},
    )
    db.commit()
    return lid


def _delete_lineage(db, lid: str) -> None:
    """Best-effort cleanup of a seeded lineage row."""
    from sqlalchemy import text

    try:
        db.execute(
            text("DELETE FROM lineage_refs WHERE id = :id"), {"id": lid}
        )
        db.commit()
    except Exception:
        db.rollback()


# ---------------------------------------------------------------------------
# 1. Referenced rows preserved
# ---------------------------------------------------------------------------


def test_gc_preserves_referenced_rows(db) -> None:
    """A lineage row referenced by pricing_audit must survive GC."""
    from sqlalchemy import text

    from backend.services.pricing.lineage import gc_lineage_refs

    # Seed: lineage row 400 days old + a pricing_audit row pointing at it.
    old_ts = datetime.now(timezone.utc) - timedelta(days=400)
    lid = _insert_lineage(db, computed_at=old_ts)
    audit_id = str(uuid4())
    try:
        db.execute(
            text(
                """
                INSERT INTO pricing_audit
                  (id, at, actor, action, target_kind, target_id,
                   before, after, reason, lineage_ref_id)
                VALUES
                  (:id, NOW(), 'gc_test', 'proposal_created', 'sku', :tgt,
                   '{}'::jsonb, '{}'::jsonb, 'gc_test', :lid)
                """
            ),
            {"id": audit_id, "tgt": f"GCTEST-{uuid4().hex[:6]}", "lid": lid},
        )
        db.commit()

        deleted = gc_lineage_refs(db, older_than_days=365)
        assert deleted >= 0  # any value — what matters is preservation

        survives = db.execute(
            text("SELECT 1 FROM lineage_refs WHERE id = :id"), {"id": lid}
        ).scalar()
        assert survives == 1, "referenced lineage row was wrongly deleted"
    finally:
        # Cleanup
        try:
            db.execute(
                text("DELETE FROM pricing_audit WHERE id = :id"),
                {"id": audit_id},
            )
            db.commit()
        except Exception:
            db.rollback()
        _delete_lineage(db, lid)


# ---------------------------------------------------------------------------
# 2. Orphans get deleted (old) / preserved (recent)
# ---------------------------------------------------------------------------


def test_gc_deletes_orphaned_rows(db) -> None:
    """Old orphans go; recent orphans stay."""
    from sqlalchemy import text

    from backend.services.pricing.lineage import gc_lineage_refs

    old_ts = datetime.now(timezone.utc) - timedelta(days=400)
    recent_ts = datetime.now(timezone.utc) - timedelta(days=5)

    old_id = _insert_lineage(db, computed_at=old_ts)
    recent_id = _insert_lineage(db, computed_at=recent_ts)

    try:
        deleted = gc_lineage_refs(db, older_than_days=365)
        assert deleted >= 1

        # The old orphan must be gone.
        old_gone = db.execute(
            text("SELECT 1 FROM lineage_refs WHERE id = :id"),
            {"id": old_id},
        ).scalar()
        assert old_gone is None, "old orphan was not deleted"

        # The recent orphan must still be there.
        recent_alive = db.execute(
            text("SELECT 1 FROM lineage_refs WHERE id = :id"),
            {"id": recent_id},
        ).scalar()
        assert recent_alive == 1, "recent orphan was wrongly deleted"
    finally:
        _delete_lineage(db, old_id)
        _delete_lineage(db, recent_id)


# ---------------------------------------------------------------------------
# 3. older_than_days threshold respected
# ---------------------------------------------------------------------------


def test_gc_respects_older_than_days_param(db) -> None:
    """older_than_days=30 with a 29-day-old orphan → preserved."""
    from sqlalchemy import text

    from backend.services.pricing.lineage import gc_lineage_refs

    ts = datetime.now(timezone.utc) - timedelta(days=29)
    lid = _insert_lineage(db, computed_at=ts)

    try:
        gc_lineage_refs(db, older_than_days=30)
        alive = db.execute(
            text("SELECT 1 FROM lineage_refs WHERE id = :id"),
            {"id": lid},
        ).scalar()
        assert alive == 1, "row younger than threshold was wrongly deleted"

        # Now run with a 7-day threshold — the same row should be deleted.
        gc_lineage_refs(db, older_than_days=7)
        gone = db.execute(
            text("SELECT 1 FROM lineage_refs WHERE id = :id"),
            {"id": lid},
        ).scalar()
        assert gone is None, "row past tighter threshold was not deleted"
    finally:
        _delete_lineage(db, lid)
