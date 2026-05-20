"""Phase 5 — POST /api/v1/pricing/proposals/{id}/recall contract."""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("psycopg2")


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _create_draft_proposal(client: TestClient) -> str:
    res = client.post(
        "/api/v1/pricing/proposals",
        json={
            "article_id": f"RECALL-A-{uuid4().hex[:6]}",
            "current_price": "100.00",
            "proposed_price": "108.00",
            "delta_pp": "4.0",
            "payload": {"tier": "B", "effective_in_hours": 72},
        },
        headers=_csrf(client),
    )
    assert res.status_code in (200, 201)
    return res.json()["id"]


def test_draft_proposal_can_be_recalled(client: TestClient) -> None:
    proposal_id = _create_draft_proposal(client)
    res = client.post(
        f"/api/v1/pricing/proposals/{proposal_id}/recall",
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "recalled"


def test_submitted_proposal_cannot_be_recalled(client: TestClient) -> None:
    proposal_id = _create_draft_proposal(client)
    res = client.post(
        f"/api/v1/pricing/proposals/{proposal_id}/submit",
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    # Now the proposal is pending_approval. Recall must 409.
    res = client.post(
        f"/api/v1/pricing/proposals/{proposal_id}/recall",
        headers=_csrf(client),
    )
    assert res.status_code == 409, res.text
