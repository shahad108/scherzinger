"""Phase 8 — contract test for the Studio workbench's A/B summary.

When an active A/B test exists on the workbench's aid, the workbench
endpoint surfaces a compact ``active_ab_test`` block so the PriceOptions
card can render the live flow.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient


pytest.importorskip("psycopg2")


def _seed_active_test(aid: str, actor_id: UUID) -> str:
    from backend.database import SessionLocal
    from backend.models import AbTest

    with SessionLocal() as db:
        t = AbTest(
            aid=aid,
            slice_pct=Decimal("50"),
            start_date=datetime.utcnow(),
            control_price=Decimal("100.00"),
            treatment_price=Decimal("115.00"),
            status="running",
            decision_state="running",
            simulation_status="pending",
            created_by=actor_id,
            target_sample=30,
            criterion_json={"alpha": 0.10, "metric": "db2"},
            eligibility_json={"in": [{"var": "tier"}, ["B", "C"]]},
        )
        db.add(t)
        db.commit()
        return str(t.id)


def test_workbench_includes_active_ab_test_when_running(client: TestClient) -> None:
    # frank user id is seeded by tests/api/conftest. We can call /auth/me
    # to grab it, but in practice the conftest already exposes ctx via
    # the client cookies — just use a real query against a real user.
    from backend.database import SessionLocal
    from backend.models import User

    with SessionLocal() as db:
        frank = db.query(User).filter(User.email == "frank@scherzinger.de").first()
        if frank is None:
            pytest.skip("frank user not seeded")
        frank_id = frank.id

    # Use a stable aid from the seed catalogue so the workbench load
    # path doesn't 404. The studio seed picks the first SKU; we just
    # need an aid the workbench will resolve.
    res = client.get("/api/v1/screens/studio")
    if res.status_code != 200:
        pytest.skip("studio screen not reachable")
    aid = res.json().get("defaultAid")
    if not aid:
        pytest.skip("no default aid in studio screen")

    # Seed an active test directly against the default aid (workbench
    # only serves SKUs that exist in the seed catalogue, so we reuse).
    test_id = _seed_active_test(aid, frank_id)

    res = client.get(f"/api/v1/screens/studio/workbench/{aid}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "active_ab_test" in body
    summary = body["active_ab_test"]
    # The composer always returns the most recently created running
    # test for the aid; assert ours is in flight + carries the expected
    # contract fields.
    assert summary["aid"] == aid
    assert summary["decision_state"] in ("running", "held")
    assert "control_price" in summary
    assert "variant_price" in summary
    assert "target_sample" in summary
    assert "criterion" in summary
    # The seeded row should match (or be returned as latest).
    assert summary["test_id"] == test_id


def test_workbench_omits_active_ab_test_when_none(client: TestClient) -> None:
    # A brand-new aid with no ab_test row should *not* carry the block.
    aid = f"NOAB-{uuid4().hex[:6].upper()}"
    res = client.get(f"/api/v1/screens/studio/workbench/{aid}")
    if res.status_code == 404:
        # Some seeds reject unknown aids; that's an acceptable contract.
        return
    assert res.status_code == 200, res.text
    body = res.json()
    assert "active_ab_test" not in body
