"""Phase 5 — SF5: PROPOSAL_STATUSES canonical-set contract.

The approval workflow introduced ``pending_approval``, ``changes_requested``,
and ``recalled`` as valid proposal states. The PATCH validator + the
workflow_service.create_pricing_proposal helper read from
``workflow_service.PROPOSAL_STATUSES`` to decide whether a status string
is acceptable. If those values are missing from the canonical set,
PATCH calls 400 and create_pricing_proposal silently downgrades the
status back to ``draft`` — both of which would be a regression.

This test asserts each new value is in the set, and exercises the
PATCH endpoint to confirm a proposal can be moved into each state
without a 400.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.services import workflow_service

pytest.importorskip("psycopg2")


_PHASE5_STATUSES = {"pending_approval", "changes_requested", "recalled"}


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def test_phase5_statuses_are_in_canonical_set() -> None:
    """The set must include every status the approval workflow emits."""
    missing = _PHASE5_STATUSES - workflow_service.PROPOSAL_STATUSES
    assert missing == set(), (
        f"PROPOSAL_STATUSES missing Phase-5 statuses: {missing!r}"
    )


@pytest.mark.parametrize("target_status", sorted(_PHASE5_STATUSES))
def test_patch_proposal_accepts_each_phase5_status(
    client: TestClient, target_status: str
) -> None:
    """PATCH /pricing/proposals/{id} must accept each new status without 400."""
    res = client.post(
        "/api/v1/pricing/proposals",
        json={
            "article_id": f"SF5-{uuid4().hex[:6]}",
            "current_price": "100.00",
            "proposed_price": "101.00",
            "delta_pp": "1.0",
            "payload": {"tier": "C", "effective_in_hours": 72},
        },
        headers=_csrf(client),
    )
    assert res.status_code in (200, 201), res.text
    proposal_id = res.json()["id"]

    res = client.patch(
        f"/api/v1/pricing/proposals/{proposal_id}",
        json={"status": target_status},
        headers=_csrf(client),
    )
    assert res.status_code == 200, (
        f"PATCH rejected status={target_status!r}: {res.status_code} {res.text}"
    )
    assert res.json()["status"] == target_status
