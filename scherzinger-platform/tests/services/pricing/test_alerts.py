"""Pricing Studio v3 / Phase 9 — alerts engine service tests.

Coverage:
- ``parse_spec`` validates each of the seven kinds.
- ``create_alert`` persists rows with channel + scope columns.
- ``evaluate_alerts`` fires for at least three scenarios.
- Disabled alerts (enabled=False) do not fire.
- ``build_daily_digest`` groups events by kind.

Skips cleanly when psycopg2 / test DB are unreachable.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
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


def _user_id() -> str:
    # The alerts service stores ``created_by`` as a free-form string —
    # use a unique UUID string per test so list/inbox queries scope cleanly.
    return str(uuid4())


# ---------------------------------------------------------------------------
# Spec validation — 7 kinds
# ---------------------------------------------------------------------------


def test_parse_spec_validates_all_seven_kinds() -> None:
    from backend.services.pricing import alerts as alerts_svc

    user = "u1"
    specs = [
        {"kind": "cost_threshold", "aid": "A1", "pct": "5", "days": 30,
         "created_by": user},
        {"kind": "competitor_undercut", "aid": "A1", "pct": "3",
         "created_by": user},
        {"kind": "churn_spike", "aid": "A1", "pp": "10", "created_by": user},
        {"kind": "floor_cross", "aid": "A1", "created_by": user},
        {"kind": "proposal_stuck", "days": 7, "created_by": user},
        {"kind": "pa_pr_surge", "aid": "A1", "count": 5, "days": 30,
         "created_by": user},
        {"kind": "cluster_db2_drop", "cluster": "BKAGG", "pp": "2",
         "created_by": user},
    ]
    parsed = [alerts_svc.parse_spec(s) for s in specs]
    assert [p.kind for p in parsed] == [
        "cost_threshold", "competitor_undercut", "churn_spike",
        "floor_cross", "proposal_stuck", "pa_pr_surge", "cluster_db2_drop",
    ]


def test_parse_spec_rejects_invalid_pct() -> None:
    from pydantic import ValidationError

    from backend.services.pricing import alerts as alerts_svc

    with pytest.raises(ValidationError):
        alerts_svc.parse_spec(
            {"kind": "cost_threshold", "aid": "A1", "pct": "0", "days": 30,
             "created_by": "u"}
        )


# ---------------------------------------------------------------------------
# create_alert / list / disable
# ---------------------------------------------------------------------------


def test_create_alert_persists_row(db) -> None:
    from backend.services.pricing import alerts as alerts_svc

    user = _user_id()
    spec = alerts_svc.parse_spec(
        {"kind": "cost_threshold", "aid": "A1", "pct": "5", "days": 30,
         "channels": ["in_app", "email"], "created_by": user}
    )
    alert = alerts_svc.create_alert(spec, db)
    assert alert.id is not None
    assert alert.kind == "cost_threshold"
    assert alert.scope_aid == "A1"
    assert "in_app" in alert.channels and "email" in alert.channels
    assert alert.enabled is True

    rows = alerts_svc.list_alerts_for_user(user, db)
    assert any(r.id == alert.id for r in rows)


def test_create_alert_normalizes_channels(db) -> None:
    from backend.services.pricing import alerts as alerts_svc

    spec = alerts_svc.parse_spec(
        {"kind": "floor_cross", "aid": "A1", "channels": [],
         "created_by": _user_id()}
    )
    alert = alerts_svc.create_alert(spec, db)
    assert alert.channels == ["in_app"]


def test_create_alert_rejects_bad_channel(db) -> None:
    from backend.services.pricing import alerts as alerts_svc

    spec = alerts_svc.parse_spec(
        {"kind": "floor_cross", "aid": "A1", "channels": ["pager"],
         "created_by": _user_id()}
    )
    with pytest.raises(ValueError):
        alerts_svc.create_alert(spec, db)


def test_disable_alert_flips_enabled(db) -> None:
    from backend.services.pricing import alerts as alerts_svc

    spec = alerts_svc.parse_spec(
        {"kind": "floor_cross", "aid": "A1", "created_by": _user_id()}
    )
    alert = alerts_svc.create_alert(spec, db)
    assert alert.enabled is True
    alerts_svc.disable_alert(alert.id, db)
    refreshed = alerts_svc.get_alert(alert.id, db)
    assert refreshed.enabled is False


# ---------------------------------------------------------------------------
# evaluate_alerts — trigger scenarios
# ---------------------------------------------------------------------------


def _seed_price_state(db, aid: str, *, current: str, floor: str | None = None):
    from backend.models.pricing.pricing_state import PriceStateRow

    # Cleanup any stale row.
    existing = db.get(PriceStateRow, aid)
    if existing is not None:
        db.delete(existing)
        db.flush()
    row = PriceStateRow(
        aid=aid,
        current_price=Decimal(current),
        currency="EUR",
        floor=Decimal(floor) if floor is not None else None,
        last_set_by="test",
    )
    db.add(row)
    db.flush()
    return row


def test_evaluate_floor_cross_fires_when_price_at_floor(db) -> None:
    from backend.models.pricing.alerts import PricingAlertEvent
    from backend.services.pricing import alerts as alerts_svc

    aid = f"FLR-{uuid4().hex[:8]}"
    _seed_price_state(db, aid, current="80", floor="100")  # current ≤ floor

    spec = alerts_svc.parse_spec(
        {"kind": "floor_cross", "aid": aid, "created_by": _user_id()}
    )
    alert = alerts_svc.create_alert(spec, db)
    db.flush()

    fired = alerts_svc.evaluate_alerts(db)
    fired_for_us = [e for e in fired if e.alert_id == alert.id]
    assert len(fired_for_us) == 1
    ev = fired_for_us[0]
    assert ev.payload["aid"] == aid
    assert Decimal(ev.payload["current_price"]) == Decimal("80")
    assert Decimal(ev.payload["floor"]) == Decimal("100")
    # Event row landed
    assert db.get(PricingAlertEvent, ev.id) is not None


def test_evaluate_floor_cross_does_not_fire_when_above_floor(db) -> None:
    from backend.services.pricing import alerts as alerts_svc

    aid = f"FLR-{uuid4().hex[:8]}"
    _seed_price_state(db, aid, current="120", floor="100")

    spec = alerts_svc.parse_spec(
        {"kind": "floor_cross", "aid": aid, "created_by": _user_id()}
    )
    alert = alerts_svc.create_alert(spec, db)
    db.flush()

    fired = alerts_svc.evaluate_alerts(db)
    assert not any(e.alert_id == alert.id for e in fired)


def test_disabled_alert_does_not_fire(db) -> None:
    from backend.services.pricing import alerts as alerts_svc

    aid = f"FLR-{uuid4().hex[:8]}"
    _seed_price_state(db, aid, current="80", floor="100")

    spec = alerts_svc.parse_spec(
        {"kind": "floor_cross", "aid": aid, "created_by": _user_id()}
    )
    alert = alerts_svc.create_alert(spec, db)
    alerts_svc.disable_alert(alert.id, db)
    db.flush()

    fired = alerts_svc.evaluate_alerts(db)
    assert not any(e.alert_id == alert.id for e in fired)


def test_evaluate_churn_spike_fires_when_customer_above_threshold(db) -> None:
    from backend.models.pricing.customer_on_sku import CustomerOnSkuRow
    from backend.services.pricing import alerts as alerts_svc

    aid = f"CHRN-{uuid4().hex[:8]}"
    # Two customers — one above 25% (pp), one below.
    db.add(
        CustomerOnSkuRow(
            id=uuid4(),
            aid=aid,
            customer_id=f"C-{uuid4().hex[:8]}",
            churn_p=Decimal("0.30"),
            tier="B",
        )
    )
    db.add(
        CustomerOnSkuRow(
            id=uuid4(),
            aid=aid,
            customer_id=f"C-{uuid4().hex[:8]}",
            churn_p=Decimal("0.10"),
            tier="B",
        )
    )
    db.flush()

    spec = alerts_svc.parse_spec(
        {"kind": "churn_spike", "aid": aid, "pp": "25",
         "created_by": _user_id()}
    )
    alert = alerts_svc.create_alert(spec, db)
    db.flush()

    fired = alerts_svc.evaluate_alerts(db)
    fired_for_us = [e for e in fired if e.alert_id == alert.id]
    assert len(fired_for_us) == 1
    customers = fired_for_us[0].payload["customers"]
    # Only the 0.30 customer is over the 25pp threshold.
    assert len(customers) == 1
    assert Decimal(customers[0]["churn_p"]) >= Decimal("0.25")


def test_evaluate_proposal_stuck_fires_after_threshold_days(db) -> None:
    from backend.models import PricingProposal, User
    from backend.services.pricing import alerts as alerts_svc

    # Seed a stuck proposal: status=pending_approval, updated_at older
    # than threshold.
    user_uuid = uuid4()
    db.add(
        User(
            id=user_uuid,
            email=f"stuck-{uuid4().hex[:6]}@example.com",
            name="Stuck",
            dept="pricing",
            ui_persona_default="frank",
            password_hash="x",
        )
    )
    db.flush()
    aid = f"PROP-{uuid4().hex[:8]}"
    old = datetime.utcnow() - timedelta(days=14)
    prop = PricingProposal(
        id=uuid4(),
        article_id=aid,
        status="pending_approval",
        approval_required=True,
        created_by=user_uuid,
        payload={},
    )
    db.add(prop)
    db.flush()
    # Force updated_at into the past.
    prop.updated_at = old
    db.flush()

    spec = alerts_svc.parse_spec(
        {"kind": "proposal_stuck", "aid": aid, "days": 7,
         "created_by": _user_id()}
    )
    alert = alerts_svc.create_alert(spec, db)
    db.flush()

    fired = alerts_svc.evaluate_alerts(db)
    fired_for_us = [e for e in fired if e.alert_id == alert.id]
    assert len(fired_for_us) == 1
    stuck = fired_for_us[0].payload["stuck_proposals"]
    assert any(p["aid"] == aid for p in stuck)


# ---------------------------------------------------------------------------
# Inbox + digest
# ---------------------------------------------------------------------------


def test_inbox_returns_only_users_own_events(db) -> None:
    from backend.services.pricing import alerts as alerts_svc

    user_a = _user_id()
    user_b = _user_id()

    aid_a = f"INBX-{uuid4().hex[:8]}"
    aid_b = f"INBX-{uuid4().hex[:8]}"
    _seed_price_state(db, aid_a, current="80", floor="100")
    _seed_price_state(db, aid_b, current="80", floor="100")

    alert_a = alerts_svc.create_alert(
        alerts_svc.parse_spec(
            {"kind": "floor_cross", "aid": aid_a, "created_by": user_a}
        ),
        db,
    )
    alert_b = alerts_svc.create_alert(
        alerts_svc.parse_spec(
            {"kind": "floor_cross", "aid": aid_b, "created_by": user_b}
        ),
        db,
    )
    db.flush()
    alerts_svc.evaluate_alerts(db)

    inbox_a = alerts_svc.get_alert_inbox(user_a, db)
    inbox_b = alerts_svc.get_alert_inbox(user_b, db)
    assert any(e.alert_id == alert_a.id for e in inbox_a)
    assert not any(e.alert_id == alert_b.id for e in inbox_a)
    assert any(e.alert_id == alert_b.id for e in inbox_b)


def test_daily_digest_groups_by_kind(db) -> None:
    from backend.models.pricing.alerts import PricingAlert, PricingAlertEvent
    from backend.services.pricing import digest as digest_svc

    user = _user_id()
    today = date.today()
    triggered = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc) \
        + timedelta(hours=10)

    # Two alerts (different kinds) for the same user, each with one event today.
    alert1 = PricingAlert(
        id=uuid4(),
        kind="floor_cross",
        spec_json={},
        scope_aid="A1",
        channels=["in_app"],
        created_by=user,
        enabled=True,
    )
    alert2 = PricingAlert(
        id=uuid4(),
        kind="cost_threshold",
        spec_json={"pct": "5", "days": 30},
        scope_aid="A2",
        channels=["in_app"],
        created_by=user,
        enabled=True,
    )
    db.add(alert1)
    db.add(alert2)
    db.flush()
    db.add(
        PricingAlertEvent(
            id=uuid4(),
            alert_id=alert1.id,
            triggered_at=triggered,
            payload={"aid": "A1"},
            channels_dispatched=[],
        )
    )
    db.add(
        PricingAlertEvent(
            id=uuid4(),
            alert_id=alert2.id,
            triggered_at=triggered,
            payload={"aid": "A2"},
            channels_dispatched=[],
        )
    )
    db.flush()

    d = digest_svc.build_daily_digest(user, today, db)
    assert d.total_events == 2
    assert set(d.by_kind.keys()) == {"floor_cross", "cost_threshold"}
    assert len(d.by_kind["floor_cross"]) == 1
    assert len(d.by_kind["cost_threshold"]) == 1
    out = d.to_dict()
    assert out["digest_date"] == today.isoformat()
    assert out["total_events"] == 2
