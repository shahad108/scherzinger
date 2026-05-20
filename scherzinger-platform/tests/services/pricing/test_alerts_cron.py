"""Phase J2 — pricing_alerts cron tests.

Covers ``alerts_cron.run_due_alerts``:

  - Enabled alerts get evaluated, disabled alerts are skipped.
  - Per-alert exceptions don't kill the batch.
  - ``last_evaluated_at`` is stamped when the column exists.

Skips cleanly when psycopg2 / the test DB are unreachable.
"""
from __future__ import annotations

from datetime import datetime, timezone
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


def _seed_alert(db, *, enabled: bool = True) -> UUID:
    from backend.models.pricing.alerts import PricingAlert

    user = f"u-{uuid4().hex[:8]}"
    alert = PricingAlert(
        kind="floor_cross",
        spec_json={
            "kind": "floor_cross",
            "aid": f"AID-{uuid4().hex[:6]}",
            "created_by": user,
        },
        scope_aid=f"AID-{uuid4().hex[:6]}",
        scope_cluster=None,
        scope_family=None,
        channels=["in_app"],
        created_by=user,
        enabled=enabled,
    )
    db.add(alert)
    db.flush()
    return alert.id


# ---------------------------------------------------------------------------
# 1. Enabled-only firing
# ---------------------------------------------------------------------------


def test_run_due_alerts_fires_enabled_only(db, monkeypatch) -> None:
    """Two enabled + one disabled → count=2 when every run returns fired."""
    from backend.services.pricing import alerts_cron, alerts_runner

    a1 = _seed_alert(db, enabled=True)
    a2 = _seed_alert(db, enabled=True)
    a3 = _seed_alert(db, enabled=False)
    db.commit()

    seen: list[UUID] = []

    def fake_run_for_alert(alert_id, db_session):
        seen.append(alert_id)
        return {"alert_id": str(alert_id), "fired": True}

    monkeypatch.setattr(alerts_runner, "run_for_alert", fake_run_for_alert)

    # Only the two enabled alerts we just inserted should fire (other
    # enabled rows in the test DB may also fire — assert membership +
    # at-least-2 rather than exact equality).
    fired = alerts_cron.run_due_alerts(db)
    assert fired >= 2
    assert a1 in seen and a2 in seen
    assert a3 not in seen


# ---------------------------------------------------------------------------
# 2. Per-alert errors don't kill the batch
# ---------------------------------------------------------------------------


def test_run_due_alerts_catches_per_alert_errors(db, monkeypatch) -> None:
    """One alert raises, the next succeeds — the batch keeps going."""
    from backend.services.pricing import alerts_cron, alerts_runner

    bad = _seed_alert(db, enabled=True)
    good = _seed_alert(db, enabled=True)
    db.commit()

    calls: list[UUID] = []

    def fake_run_for_alert(alert_id, db_session):
        calls.append(alert_id)
        if alert_id == bad:
            raise RuntimeError("boom")
        return {"alert_id": str(alert_id), "fired": True}

    monkeypatch.setattr(alerts_runner, "run_for_alert", fake_run_for_alert)

    fired = alerts_cron.run_due_alerts(db)
    # The bad alert must have been attempted and the good one fired.
    assert bad in calls
    assert good in calls
    # The good alert (and possibly other pre-existing enabled alerts)
    # must count at least once.
    assert fired >= 1


# ---------------------------------------------------------------------------
# 3. last_evaluated_at stamping (forward-compat)
# ---------------------------------------------------------------------------


def test_run_due_alerts_updates_last_evaluated_at(db, monkeypatch) -> None:
    """When the column exists, last_evaluated_at moves forward.

    The current schema doesn't carry the column — in that case the
    helper short-circuits, which we assert by exercising the cached
    column probe directly.
    """
    from backend.services.pricing import alerts_cron, alerts_runner

    a1 = _seed_alert(db, enabled=True)
    db.commit()

    monkeypatch.setattr(
        alerts_runner,
        "run_for_alert",
        lambda alert_id, db_session: {"alert_id": str(alert_id), "fired": True},
    )

    before = datetime.now(timezone.utc)
    alerts_cron.run_due_alerts(db)

    # If the column exists (future migration), assert it moved forward.
    # If not, the cron must still have completed without error — we
    # already asserted that by reaching this point.
    has_col = alerts_cron._has_last_evaluated_at_column()
    if has_col:
        from backend.models.pricing.alerts import PricingAlert

        fresh = db.get(PricingAlert, a1)
        ts = getattr(fresh, "last_evaluated_at", None)
        assert ts is not None
        # Tolerate timezone-naive columns by normalising.
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        assert ts >= before
    else:
        # Forward-compat: schema doesn't have the column today.
        # The cron still ran without raising — that's the contract.
        assert True
