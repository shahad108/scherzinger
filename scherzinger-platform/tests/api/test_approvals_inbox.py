"""Phase 5 — GET /api/v1/approvals/inbox contract."""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("psycopg2")

URL = "/api/v1/approvals/inbox"


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _create_pending_approval(client: TestClient) -> tuple[str, str]:
    res = client.post(
        "/api/v1/pricing/proposals",
        json={
            "article_id": f"INBOX-A-{uuid4().hex[:6]}",
            "current_price": "100.00",
            "proposed_price": "108.00",
            "delta_pp": "4.0",
            "payload": {"tier": "B", "effective_in_hours": 72},
        },
        headers=_csrf(client),
    )
    assert res.status_code in (200, 201)
    proposal_id = res.json()["id"]
    res = client.post(
        f"/api/v1/pricing/proposals/{proposal_id}/submit",
        headers=_csrf(client),
    )
    assert res.status_code == 200
    return proposal_id, res.json()["approval_instance"]["id"]


def test_inbox_returns_empty_for_user_without_matching_role(client: TestClient) -> None:
    """Frank has role=analyst and approval routes target ``md`` (post-MF1) —
    therefore his own inbox should not surface his own pending proposals."""
    proposal_id, _ = _create_pending_approval(client)
    res = client.get(URL)
    assert res.status_code == 200
    body = res.json()
    assert "items" in body and "total" in body
    matching = [i for i in body["items"] if i["proposal_id"] == proposal_id]
    assert matching == []


def test_inbox_returns_pending_items_for_md_role(client: TestClient) -> None:
    from backend.auth.security import AuthContext, require_auth
    from backend.main import app

    proposal_id, instance_id = _create_pending_approval(client)

    fake_user_id = UUID("00000000-0000-0000-0000-000000000001")

    def _fake_auth_md():
        return AuthContext(
            user_id=fake_user_id,
            email="m@example.com",
            name="m",
            persona="frank",
            roles=["md"],
            permissions=[],
        )

    app.dependency_overrides[require_auth] = _fake_auth_md
    try:
        # Cache may be warm with frank's empty inbox; the fake auth uses
        # frank's user_id but roles=["md"], so the cache key differs.
        res = client.get(URL)
    finally:
        app.dependency_overrides.pop(require_auth, None)
    assert res.status_code == 200
    body = res.json()
    items = [i for i in body["items"] if i["approval_instance_id"] == instance_id]
    assert len(items) == 1
    item = items[0]
    assert item["step_role"] == "md"
    assert item["proposal_id"] == proposal_id
    assert item["aid"]


def test_inbox_requires_auth(anon_client: TestClient) -> None:
    from fastapi.testclient import TestClient as _TC

    from backend.main import app

    c = _TC(app)
    res = c.get(URL)
    assert res.status_code == 401
