"""Phase 5 — POST /api/v1/approvals/{instance_id}/decision contract."""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient


pytest.importorskip("psycopg2")


URL_DECISION = "/api/v1/approvals/{instance_id}/decision"


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _login_as(anon_client: TestClient, email: str, password: str) -> TestClient:
    from fastapi.testclient import TestClient as _TC

    from backend.main import app

    c = _TC(app)
    res = c.post("/api/v1/auth/login", json={"email": email, "password": password})
    if res.status_code != 200:
        pytest.skip(f"user {email} not seeded — run scripts/seed_auth.py")
    return c


def _create_pending_approval(client: TestClient) -> tuple[str, str]:
    """Create + submit a proposal so Frank has a pending approval routing
    to ``md`` (post-MF1: ``manuel`` role isn't seeded, so delta>5% routes
    to ``md``). Returns (proposal_id, approval_instance_id).
    """
    res = client.post(
        "/api/v1/pricing/proposals",
        json={
            "article_id": f"TEST-A-{uuid4().hex[:6]}",
            "current_price": "100.00",
            "proposed_price": "108.00",
            "delta_pp": "4.0",
            "payload": {"tier": "B", "effective_in_hours": 72},
        },
        headers=_csrf(client),
    )
    assert res.status_code in (200, 201), res.text
    proposal_id = res.json()["id"]

    res = client.post(
        f"/api/v1/pricing/proposals/{proposal_id}/submit",
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["proposal"]["status"] == "pending_approval"
    return proposal_id, body["approval_instance"]["id"]


def test_decision_requires_caller_to_be_next_step_approver(client: TestClient) -> None:
    """Frank (role=analyst) cannot approve his own proposal that routed to md."""
    _proposal_id, instance_id = _create_pending_approval(client)
    res = client.post(
        URL_DECISION.format(instance_id=instance_id),
        json={"decision": "approve"},
        headers=_csrf(client),
    )
    # 403 because frank's roles don't include 'md'.
    assert res.status_code == 403, res.text


def test_decision_404_when_instance_missing(client: TestClient) -> None:
    res = client.post(
        URL_DECISION.format(instance_id=uuid4()),
        json={"decision": "approve"},
        headers=_csrf(client),
    )
    assert res.status_code == 404


def test_decision_writes_audit_row_when_authorised(client: TestClient) -> None:
    """When a user holding the routed role calls /decision, the resulting
    proposal_approved audit row appears in the per-SKU audit drawer."""
    from backend.auth.security import AuthContext
    from backend.database import SessionLocal
    from backend.main import app
    from backend.models.pricing.audit import PricingAuditEntry

    proposal_id, instance_id = _create_pending_approval(client)

    # Find the aid for filtering audit rows later.
    aid_res = client.get(f"/api/v1/pricing/proposals/{proposal_id}")
    aid = aid_res.json()["article_id"]

    # Override require_auth so the next call has the 'md' role (the
    # routed approver post-MF1).
    from backend.auth.security import require_auth

    fake_user_id = UUID("00000000-0000-0000-0000-000000000001")  # frank

    def _fake_auth():
        return AuthContext(
            user_id=fake_user_id,
            email="md-test@example.com",
            name="MD Test",
            persona="frank",
            roles=["md"],
            permissions=[],
        )

    app.dependency_overrides[require_auth] = _fake_auth
    try:
        res = client.post(
            URL_DECISION.format(instance_id=instance_id),
            json={"decision": "approve", "comment": "looks good"},
            headers=_csrf(client),
        )
    finally:
        app.dependency_overrides.pop(require_auth, None)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["proposal_status"] == "approved"
    assert body["approval_instance"]["steps"][0]["decision"] == "approved"
    assert body["approval_instance"]["steps"][0]["actor"] == str(fake_user_id)

    # Audit row landed.
    db = SessionLocal()
    try:
        rows = (
            db.query(PricingAuditEntry)
            .filter(PricingAuditEntry.target_id == aid)
            .filter(PricingAuditEntry.action == "proposal_approved")
            .all()
        )
        assert len(rows) >= 1
    finally:
        db.close()


def test_decision_rejects_when_proposal_already_terminal(client: TestClient) -> None:
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
        client.post(
            URL_DECISION.format(instance_id=instance_id),
            json={"decision": "approve"},
            headers=_csrf(client),
        )
        # Second call should 409 because the proposal is already approved.
        res = client.post(
            URL_DECISION.format(instance_id=instance_id),
            json={"decision": "approve"},
            headers=_csrf(client),
        )
        assert res.status_code == 409, res.text
    finally:
        app.dependency_overrides.pop(require_auth, None)
