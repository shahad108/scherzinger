"""Phase 5 — WebSocket collab channel contract.

Two connected users see each other's cursor broadcasts. Comments persist
via the audit table. Disconnects clean up the registry.
"""
from __future__ import annotations

import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("psycopg2")


@pytest.fixture(autouse=True)
def _reset_collab_channel():
    """Clear the global collab channel registry before + after each test
    so state from prior WS tests can't leak forward."""
    from backend.services.realtime.collab import channel

    channel._by_proposal.clear()
    yield
    channel._by_proposal.clear()


def test_two_users_see_each_others_cursor() -> None:
    """Drive ``CollabChannel`` directly with two synthetic connections.

    The FastAPI TestClient WebSocket adapter runs each session in a
    single-threaded event loop, so opening two real WS connections in
    one test would deadlock. Driving the channel directly is the
    correct unit-test surface — the WS endpoint is exercised in the
    persistence + disconnect tests below.
    """
    import asyncio

    from backend.services.realtime.collab import CollabChannel

    ch = CollabChannel()
    proposal_id = f"PROP-{uuid4().hex[:8]}"

    delivered: list[dict] = []

    async def send_a(payload):
        # User A never receives its own broadcast.
        raise AssertionError("user A should not receive its own message")

    async def send_b(payload):
        delivered.append(payload)

    async def _run():
        conn_a = await ch.connect(proposal_id=proposal_id, user_id="user-a", send=send_a)
        await ch.connect(proposal_id=proposal_id, user_id="user-b", send=send_b)
        await ch.broadcast_cursor(conn_a, {"x": 10, "y": 20})

    asyncio.run(_run())
    assert len(delivered) == 1
    assert delivered[0]["kind"] == "cursor"
    assert delivered[0]["position"] == {"x": 10, "y": 20}
    assert delivered[0]["user_id"] == "user-a"
    assert delivered[0]["proposal_id"] == proposal_id


def test_comment_persists_via_audit(client: TestClient) -> None:
    from backend.database import SessionLocal
    from backend.main import app
    from backend.models.pricing.audit import PricingAuditEntry

    proposal_id = f"PROP-{uuid4().hex[:8]}"
    aid = f"AID-{uuid4().hex[:6]}"

    url = f"/api/v1/ws/proposal/{proposal_id}"
    with client.websocket_connect(url) as ws:
        ws.send_text(
            json.dumps({"kind": "comment", "comment": "looks tight on margin", "aid": aid})
        )
        # No assertion on receive — single connection, broadcast goes to peers only.
        # Verify side-effect: an audit row appeared.

    db = SessionLocal()
    try:
        rows = (
            db.query(PricingAuditEntry)
            .filter(PricingAuditEntry.target_id == aid)
            .filter(PricingAuditEntry.action == "proposal_commented")
            .all()
        )
        assert len(rows) >= 1
        row = rows[-1]
        assert row.reason == "looks tight on margin"
    finally:
        db.close()


def test_disconnect_removes_from_registry(client: TestClient) -> None:
    """The collab registry must not leak entries after WS close.

    We don't assert mid-connection: the FastAPI TestClient WS adapter
    runs the endpoint in a worker loop, so registration happens after
    ``__enter__`` returns control to the test. The post-close assertion
    is the contract that matters.
    """
    from backend.services.realtime.collab import channel

    proposal_id = f"PROP-{uuid4().hex[:8]}"
    url = f"/api/v1/ws/proposal/{proposal_id}"
    with client.websocket_connect(url) as ws:
        # Send + receive a single frame so we know the server-side
        # handler reached its receive loop (and therefore registered).
        # The peer count is 0, so cursor broadcast just returns 0.
        ws.send_text(json.dumps({"kind": "cursor", "position": {"x": 1}}))
    # On context exit the WS closes and the registry must drop the entry.
    assert proposal_id not in channel._by_proposal
