"""Pricing Studio v3 / Phase 9 — /api/v1/pricing/alerts endpoint contract.

Exercises POST/GET/DELETE/GET-inbox/POST-test against a live test DB.
Skips when psycopg2 isn't installed or the DB is unreachable.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


pytest.importorskip("psycopg2")


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _seed_floor_cross_price(aid: str) -> None:
    """Seed price_state so a floor_cross alert will fire."""
    from backend.database import SessionLocal
    from backend.models.pricing.pricing_state import PriceStateRow

    session = SessionLocal()
    try:
        existing = session.get(PriceStateRow, aid)
        if existing is not None:
            session.delete(existing)
            session.flush()
        session.add(
            PriceStateRow(
                aid=aid,
                current_price=Decimal("80"),
                currency="EUR",
                floor=Decimal("100"),
                last_set_by="test",
            )
        )
        session.commit()
    finally:
        session.close()


# ---------------------------------------------------------------------------
# POST /pricing/alerts
# ---------------------------------------------------------------------------


def test_post_creates_floor_cross_alert(client: TestClient) -> None:
    aid = f"EPA-{uuid4().hex[:6]}"
    res = client.post(
        "/api/v1/pricing/alerts",
        json={"kind": "floor_cross", "aid": aid, "channels": ["in_app"]},
        headers=_csrf(client),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert "alert" in body
    alert = body["alert"]
    assert alert["kind"] == "floor_cross"
    assert alert["scope"]["aid"] == aid
    assert alert["enabled"] is True
    assert "in_app" in alert["channels"]


def test_post_rejects_invalid_spec(client: TestClient) -> None:
    res = client.post(
        "/api/v1/pricing/alerts",
        json={"kind": "cost_threshold", "aid": "A1", "pct": "0", "days": 30},
        headers=_csrf(client),
    )
    assert res.status_code == 400, res.text


def test_post_rejects_unknown_kind(client: TestClient) -> None:
    res = client.post(
        "/api/v1/pricing/alerts",
        json={"kind": "totally_made_up", "aid": "A1"},
        headers=_csrf(client),
    )
    assert res.status_code == 400, res.text


# ---------------------------------------------------------------------------
# GET /pricing/alerts
# ---------------------------------------------------------------------------


def test_get_lists_my_alerts(client: TestClient) -> None:
    aid = f"EPA-{uuid4().hex[:6]}"
    created = client.post(
        "/api/v1/pricing/alerts",
        json={"kind": "floor_cross", "aid": aid},
        headers=_csrf(client),
    ).json()["alert"]

    res = client.get("/api/v1/pricing/alerts")
    assert res.status_code == 200, res.text
    body = res.json()
    ids = [a["id"] for a in body["alerts"]]
    assert created["id"] in ids


# ---------------------------------------------------------------------------
# DELETE /pricing/alerts/{id}
# ---------------------------------------------------------------------------


def test_delete_soft_disables_alert(client: TestClient) -> None:
    aid = f"EPA-{uuid4().hex[:6]}"
    created = client.post(
        "/api/v1/pricing/alerts",
        json={"kind": "floor_cross", "aid": aid},
        headers=_csrf(client),
    ).json()["alert"]
    alert_id = created["id"]

    res = client.delete(f"/api/v1/pricing/alerts/{alert_id}", headers=_csrf(client))
    assert res.status_code == 200, res.text
    assert res.json()["alert"]["enabled"] is False

    # GET without include_disabled hides it
    listing = client.get("/api/v1/pricing/alerts").json()
    assert alert_id not in [a["id"] for a in listing["alerts"]]

    # GET with include_disabled surfaces it, enabled=False
    listing = client.get(
        "/api/v1/pricing/alerts", params={"include_disabled": "true"}
    ).json()
    match = [a for a in listing["alerts"] if a["id"] == alert_id]
    assert len(match) == 1
    assert match[0]["enabled"] is False


def test_delete_404_for_missing_alert(client: TestClient) -> None:
    res = client.delete(
        f"/api/v1/pricing/alerts/{uuid4()}", headers=_csrf(client)
    )
    assert res.status_code == 404, res.text


# ---------------------------------------------------------------------------
# POST /pricing/alerts/{id}/test
# ---------------------------------------------------------------------------


def test_post_test_fires_floor_cross_alert(client: TestClient) -> None:
    aid = f"EPA-{uuid4().hex[:6]}"
    _seed_floor_cross_price(aid)

    created = client.post(
        "/api/v1/pricing/alerts",
        json={"kind": "floor_cross", "aid": aid},
        headers=_csrf(client),
    ).json()["alert"]
    alert_id = created["id"]

    res = client.post(
        f"/api/v1/pricing/alerts/{alert_id}/test", headers=_csrf(client)
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["fired"] is True
    assert body["alert_id"] == alert_id
    assert "event_id" in body
    assert body["payload"]["aid"] == aid


def test_post_test_does_not_fire_when_condition_unmet(client: TestClient) -> None:
    # Use an aid that has no price_state row → cannot evaluate → no fire.
    aid = f"EPA-NOPE-{uuid4().hex[:6]}"

    created = client.post(
        "/api/v1/pricing/alerts",
        json={"kind": "floor_cross", "aid": aid},
        headers=_csrf(client),
    ).json()["alert"]
    alert_id = created["id"]

    res = client.post(
        f"/api/v1/pricing/alerts/{alert_id}/test", headers=_csrf(client)
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["fired"] is False


# ---------------------------------------------------------------------------
# GET /pricing/alerts/inbox
# ---------------------------------------------------------------------------


def test_inbox_returns_triggered_events(client: TestClient) -> None:
    aid = f"EPA-{uuid4().hex[:6]}"
    _seed_floor_cross_price(aid)

    created = client.post(
        "/api/v1/pricing/alerts",
        json={"kind": "floor_cross", "aid": aid},
        headers=_csrf(client),
    ).json()["alert"]
    alert_id = created["id"]

    fired = client.post(
        f"/api/v1/pricing/alerts/{alert_id}/test", headers=_csrf(client)
    ).json()
    assert fired["fired"] is True

    res = client.get("/api/v1/pricing/alerts/inbox")
    assert res.status_code == 200, res.text
    body = res.json()
    events = body["events"]
    assert any(e["alert_id"] == alert_id for e in events)
    match = next(e for e in events if e["alert_id"] == alert_id)
    assert match["kind"] == "floor_cross"
    assert match["payload"]["aid"] == aid
