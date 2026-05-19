"""Phase 12 — POST /actions/{kind} dispatcher + audit log + ab_tests."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def _csrf_headers(client: TestClient, *, idempotency: str | None = None) -> dict[str, str]:
    csrf = client.cookies.get("pryzm_csrf")
    assert csrf
    headers = {"x-csrf": csrf}
    if idempotency:
        headers["x-pryzm-idempotency-key"] = idempotency
    return headers


@pytest.fixture(autouse=True)
def _reset_audit_tables() -> None:
    """Wipe Phase 12 mutation state between tests so idempotency-key replay
    isn't falsely triggered by rows from a previous run on the persistent dev
    database.
    """
    from backend.database import SessionLocal
    from backend.models import AbTest, AbTestResult, AuditLog
    from backend.services.action_center.composer import invalidate_cache

    with SessionLocal() as db:
        db.query(AbTestResult).delete()
        db.query(AbTest).delete()
        db.query(AuditLog).delete()
        db.commit()
    invalidate_cache()
    yield


def test_actions_unknown_kind_400(client: TestClient) -> None:
    res = client.post(
        "/api/v1/actions/wat",
        headers=_csrf_headers(client),
        json={"target_id": "x"},
    )
    assert res.status_code == 400
    assert "unknown action kind" in res.text


def test_actions_accept_writes_audit_row(client: TestClient) -> None:
    res = client.post(
        "/api/v1/actions/accept_recommendation",
        headers=_csrf_headers(client, idempotency="t1-once"),
        json={"target_id": "rec-1", "delta_pp": 1.5, "after": {"label": "rec-1"}},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["replay"] is False
    assert body["audit"]["kind"] == "accept_recommendation"
    assert body["audit"]["target_id"] == "rec-1"
    assert body["audit"]["audit_hash"]


def test_actions_idempotency_replay_returns_same_row(client: TestClient) -> None:
    key = "test-idemp-replay"
    a = client.post(
        "/api/v1/actions/accept_recommendation",
        headers=_csrf_headers(client, idempotency=key),
        json={"target_id": "rec-replay", "delta_pp": 2.0},
    )
    assert a.status_code == 200
    b = client.post(
        "/api/v1/actions/accept_recommendation",
        headers=_csrf_headers(client, idempotency=key),
        json={"target_id": "rec-replay", "delta_pp": 2.0},
    )
    assert b.status_code == 200
    assert b.json()["replay"] is True
    # The replay returns the original audit row id — no duplicate written.
    assert a.json()["audit"]["id"] == b.json()["audit"]["id"]


def test_start_ab_test_creates_ab_row(client: TestClient) -> None:
    res = client.post(
        "/api/v1/actions/start_ab_test",
        headers=_csrf_headers(client, idempotency="ab-start-1"),
        json={
            "aid": "200832-E",
            "slice_pct": 25,
            "control_price": 4.10,
            "treatment_price": 4.38,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["audit"]["kind"] == "start_ab_test"
    assert body["status"] == "running"
    test_id = body["ab_test_id"]

    # Listed by the read API.
    listing = client.get("/api/v1/ab-tests", params={"status_filter": "running"})
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert any(t["id"] == test_id and t["aid"] == "200832-E" for t in items)


def test_share_decision_writes_notification_note_and_audit(client: TestClient) -> None:
    """Phase 11: share_decision writes a notification + note + audit row.

    The recipient_resolved flag is honest about whether a user with the
    matching persona exists in this env. In the test DB no till/heiko
    users are seeded, so we only assert the structural contract.
    """
    res = client.post(
        "/api/v1/actions/share_decision",
        headers=_csrf_headers(client, idempotency="share-1"),
        json={
            "target_id": "rec-200832-E",
            "recommendation_id": "rec-200832-E",
            "recipient": "till",
            "headline": "Article 200832-E peer spread",
            "note": "Need MD sign-off before quote response Friday.",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["audit"]["kind"] == "share_decision"
    assert body["recipient"] == "till"
    assert body["note_id"]
    # audit_hash echoed back so the FE receipt can render it.
    assert body["audit_hash"] == body["audit"]["audit_hash"]
    assert "recipient_resolved" in body
    # Whichever way it resolved, the share_link points back to the source.
    assert body["share_link"].startswith("/action-center")


def test_share_decision_rejects_bad_recipient(client: TestClient) -> None:
    res = client.post(
        "/api/v1/actions/share_decision",
        headers=_csrf_headers(client, idempotency="share-bad-1"),
        json={"target_id": "rec-1", "recipient": "ceo"},
    )
    assert res.status_code == 400
    assert "recipient" in res.text.lower()


def test_share_decision_both_fans_out_atomically(client: TestClient) -> None:
    """Phase F: recipient='both' fans out into one notification per persona
    inside a single transaction. Single audit row, single sender note, but
    the response.fanout array carries one entry per recipient.
    """
    res = client.post(
        "/api/v1/actions/share_decision",
        headers=_csrf_headers(client, idempotency="share-both-1"),
        json={
            "target_id": "rec-200832-E",
            "recommendation_id": "rec-200832-E",
            "recipient": "both",
            "headline": "Article 200832-E peer spread",
            "note": "Need fast feedback from both CFO and Sales.",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["recipient"] == "both"
    # Backwards-compat top-level fields mirror the first fanout entry.
    assert "fanout" in body
    fanout = body["fanout"]
    assert isinstance(fanout, list) and len(fanout) == 2
    recipients = sorted(r["recipient"] for r in fanout)
    assert recipients == ["heiko", "till"]
    # Exactly one audit row + one sender note for the whole "both" call.
    assert body["audit"]["kind"] == "share_decision"
    assert body["note_id"]


def test_audit_recent_lists_actor_rows(client: TestClient) -> None:
    # Write one row so the actor has at least one entry.
    client.post(
        "/api/v1/actions/quote_approve",
        headers=_csrf_headers(client, idempotency="qa-1"),
        json={"target_type": "quote", "target_id": "Q-001"},
    )
    res = client.get("/api/v1/audit/recent", params={"since": "30d", "limit": 10})
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["items"], list)
    assert any(r["kind"] == "quote_approve" and r["target_id"] == "Q-001" for r in body["items"])


def test_action_center_audit_block_reflects_live_rows(client: TestClient) -> None:
    """After writing an audit row, the Action Center audit block carries it."""
    client.post(
        "/api/v1/actions/studio_accept",
        headers=_csrf_headers(client, idempotency="ac-audit-feed"),
        json={"target_type": "sku", "target_id": "200832-E", "delta_pp": 0.6},
    )
    res = client.get("/api/v1/screens/action-center")
    assert res.status_code == 200
    body = res.json()
    audit_changes = [row.get("change", "") for row in body["audit"]]
    assert any("Studio decision accepted: 200832-E" == c for c in audit_changes), audit_changes
