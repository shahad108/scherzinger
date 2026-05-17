"""Phase 6 — /api/v1/pricing/batches endpoint contract.

Exercises create/get/commit/cancel against a live test DB. Skips when
psycopg2 isn't installed or the DB is unreachable. We stub the heavy
loaders (``_load_inputs``, ``_project_db2``, elasticity curve build) so
the test runs in O(ms) regardless of seed depth.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


pytest.importorskip("psycopg2")


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


@pytest.fixture(autouse=True)
def _stub_heavy_loaders(monkeypatch):
    """Pin the per-SKU inputs + projection helpers so the endpoint test
    doesn't depend on whatever seed rows happen to live in the DB."""
    from backend.services.pricing import batch as batch_mod
    from backend.services.pricing.approval_rules import reset_cache_for_tests

    reset_cache_for_tests()

    def _fake_inputs(*, aid, db_session):
        return batch_mod._SkuInputs(
            aid=aid,
            current_price=Decimal("100"),
            floor=Decimal("80"),
            ceiling=Decimal("140"),
            unit_cost=Decimal("70"),
            wtp_p90=Decimal("125"),
            competitor_median=Decimal("105"),
        )

    monkeypatch.setattr(batch_mod, "_load_inputs", _fake_inputs)
    monkeypatch.setattr(
        batch_mod, "_scope_includes",
        lambda *, aid, scope, db_session: True,
    )
    monkeypatch.setattr(
        batch_mod, "_project_db2", lambda **kw: Decimal("12.34"),
    )

    from backend.models.pricing.elasticity import CurvePoint, WinProbCurve
    from backend.services.pricing import elasticity as elasticity_mod

    points = [
        CurvePoint(
            price=Decimal("100"),
            win_prob=Decimal("0.7"),
            lower_ci=Decimal("0.6"),
            upper_ci=Decimal("0.8"),
        )
    ]

    def _fake_curve(**_kw):
        return WinProbCurve(
            aid=_kw.get("aid", "X"),
            tier=None,
            points=points,
            n_deals=10,
            confidence_band="asymptotic",
            lineage_ref=None,
        )

    monkeypatch.setattr(elasticity_mod, "build_win_prob_curve", _fake_curve)
    yield
    reset_cache_for_tests()


def _create_batch(client: TestClient, *, aids: list[str], rule: dict[str, Any]):
    res = client.post(
        "/api/v1/pricing/batches",
        json={"aids": aids, "rule": rule, "scope_filter": {}},
        headers=_csrf(client),
    )
    assert res.status_code in (200, 201), res.text
    return res.json()


def test_post_creates_batch_and_returns_preview(client: TestClient) -> None:
    aids = [f"BATCH-A-{uuid4().hex[:6]}", f"BATCH-A-{uuid4().hex[:6]}"]
    body = _create_batch(
        client,
        aids=aids,
        rule={"kind": "pct_move", "pct": "5"},
    )
    assert body["status"] == "preview"
    assert len(body["items"]) == 2
    for item in body["items"]:
        assert Decimal(item["before_price"]) == Decimal("100")
        # +5% on 100 → 105
        assert Decimal(item["after_price"]) == Decimal("105.0000")


def test_get_returns_batch_with_kpi_summary(client: TestClient) -> None:
    aid = f"BATCH-A-{uuid4().hex[:6]}"
    created = _create_batch(
        client,
        aids=[aid],
        rule={"kind": "pct_move", "pct": "5"},
    )
    bid = created["batch_id"]
    res = client.get(f"/api/v1/pricing/batches/{bid}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["batch_id"] == bid
    assert "kpi_summary" in body
    assert body["kpi_summary"]["count"] == 1
    assert "approval_routing_summary" in body


def test_commit_creates_proposals_excluding_locked(client: TestClient) -> None:
    aids = [
        f"BATCH-A-{uuid4().hex[:6]}",
        f"BATCH-A-{uuid4().hex[:6]}",
        f"BATCH-A-{uuid4().hex[:6]}",
    ]
    # +10% triggers delta-over-5pct → routes to "md", no auto-approve.
    created = _create_batch(
        client,
        aids=aids,
        rule={"kind": "pct_move", "pct": "10"},
    )
    bid = created["batch_id"]
    locked_aid = aids[0]
    res = client.post(
        f"/api/v1/pricing/batches/{bid}/commit",
        json={"dry_run": False, "locked_aids": [locked_aid]},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    summary = res.json()
    # 2 unlocked AIDs → 2 proposals.
    assert len(summary["created_proposals"]) == 2
    # All non-locked routed to "md".
    assert summary["routed_by_role"].get("md") == 2

    # Re-commit returns 409.
    res = client.post(
        f"/api/v1/pricing/batches/{bid}/commit",
        json={"dry_run": False, "locked_aids": []},
        headers=_csrf(client),
    )
    assert res.status_code == 409


def test_dry_run_commit_creates_no_proposals(client: TestClient) -> None:
    aid = f"BATCH-A-{uuid4().hex[:6]}"
    created = _create_batch(
        client,
        aids=[aid],
        rule={"kind": "pct_move", "pct": "10"},
    )
    bid = created["batch_id"]
    res = client.post(
        f"/api/v1/pricing/batches/{bid}/commit",
        json={"dry_run": True, "locked_aids": []},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    summary = res.json()
    assert summary["dry_run"] is True
    assert summary["created_proposals"] == []
    # The summary still reports the would-be routing.
    assert summary["routed_by_role"].get("md") == 1


def test_cancel_marks_batch_cancelled(client: TestClient) -> None:
    aid = f"BATCH-A-{uuid4().hex[:6]}"
    created = _create_batch(
        client,
        aids=[aid],
        rule={"kind": "pct_move", "pct": "5"},
    )
    bid = created["batch_id"]
    res = client.post(
        f"/api/v1/pricing/batches/{bid}/cancel",
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "cancelled"


def test_cancel_after_commit_returns_400(client: TestClient) -> None:
    aid = f"BATCH-A-{uuid4().hex[:6]}"
    created = _create_batch(
        client,
        aids=[aid],
        rule={"kind": "pct_move", "pct": "10"},
    )
    bid = created["batch_id"]
    res = client.post(
        f"/api/v1/pricing/batches/{bid}/commit",
        json={"dry_run": False},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    res = client.post(
        f"/api/v1/pricing/batches/{bid}/cancel",
        headers=_csrf(client),
    )
    assert res.status_code == 400


def test_unknown_rule_kind_returns_422(client: TestClient) -> None:
    res = client.post(
        "/api/v1/pricing/batches",
        json={"aids": ["X-1"], "rule": {"kind": "made_up"}},
        headers=_csrf(client),
    )
    assert res.status_code == 422


def test_get_404_when_missing(client: TestClient) -> None:
    res = client.get(f"/api/v1/pricing/batches/{uuid4()}")
    assert res.status_code == 404
