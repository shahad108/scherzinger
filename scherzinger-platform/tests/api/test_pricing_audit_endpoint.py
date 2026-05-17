"""Phase 4 (Pricing Studio v3) — Decision History endpoint contract.

GET /api/v1/pricing/sku/{aid}/audit
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


URL = "/api/v1/pricing/sku/{aid}/audit"


def _stub_rows(aid: str = "A-1", n: int = 3) -> list[dict[str, Any]]:
    base = datetime(2026, 5, 10, 12, 0, 0, tzinfo=timezone.utc)
    rows = []
    for i in range(n):
        rows.append(
            {
                "id": str(uuid4()),
                "at": (base + timedelta(minutes=i)).isoformat(),
                "actor": "frank",
                "action": "price_set" if i % 2 == 0 else "proposal_created",
                "target_kind": "sku",
                "target_id": aid,
                "before": {"price": "5.00"},
                "after": {"price": "5.10", "aid": aid},
                "reason": None,
                "lineage_ref": {
                    "id": str(uuid4()),
                    "source_kind": "manual_override",
                    "source_id": "test",
                    "sql": None,
                    "model": None,
                    "computed_at": base.isoformat(),
                    "computed_by": "system",
                },
                "linked_rec": None,
            }
        )
    return rows


@pytest.fixture(autouse=True)
def _clear_audit_cache():
    from backend.services.pricing.audit_query import invalidate_cache

    invalidate_cache()
    yield
    invalidate_cache()


def test_audit_returns_paginated_rows_and_total(client: TestClient) -> None:
    rows = _stub_rows("A-1", n=3)
    with patch(
        "backend.services.pricing.audit_query.list_audit_for_sku",
        return_value=(rows, 7, uuid4()),
    ):
        res = client.get(URL.format(aid="A-1"), params={"limit": 3, "offset": 0})
    assert res.status_code == 200, res.text
    body = res.json()
    assert "rows" in body and "total" in body and "lineage_ref" in body
    assert len(body["rows"]) == 3
    assert body["total"] == 7
    row = body["rows"][0]
    for field in ("id", "at", "actor", "action", "target_kind", "target_id"):
        assert field in row
    # Lineage ref is preserved (the "View lineage" pill needs it).
    assert "lineage_ref" in row
    # ``linked_rec`` is always present (None when not applicable).
    assert "linked_rec" in row


def test_audit_action_in_filter_is_forwarded(client: TestClient) -> None:
    captured: dict[str, Any] = {}

    def _capture(*, aid, db_session, limit, offset, action_in, actor, since, **kw):
        captured["action_in"] = action_in
        captured["limit"] = limit
        captured["offset"] = offset
        return [], 0, None

    with patch(
        "backend.services.pricing.audit_query.list_audit_for_sku",
        side_effect=_capture,
    ):
        res = client.get(
            URL.format(aid="A-1"),
            params={"action_in": "price_set,proposal_approved", "limit": 10},
        )
    assert res.status_code == 200, res.text
    assert captured["action_in"] == ["price_set", "proposal_approved"]
    assert captured["limit"] == 10


def test_audit_since_filter_is_forwarded(client: TestClient) -> None:
    captured: dict[str, Any] = {}

    def _capture(*, aid, db_session, limit, offset, action_in, actor, since, **kw):
        captured["since"] = since
        return [], 0, None

    with patch(
        "backend.services.pricing.audit_query.list_audit_for_sku",
        side_effect=_capture,
    ):
        res = client.get(
            URL.format(aid="A-1"),
            params={"since": "2026-05-10T00:00:00Z"},
        )
    assert res.status_code == 200, res.text
    assert captured["since"] is not None
    assert captured["since"].year == 2026
    assert captured["since"].month == 5
    assert captured["since"].day == 10
    assert captured["since"].tzinfo is not None


def test_audit_actor_filter_is_forwarded(client: TestClient) -> None:
    captured: dict[str, Any] = {}

    def _capture(*, aid, db_session, limit, offset, action_in, actor, since, **kw):
        captured["actor"] = actor
        return [], 0, None

    with patch(
        "backend.services.pricing.audit_query.list_audit_for_sku",
        side_effect=_capture,
    ):
        res = client.get(URL.format(aid="A-1"), params={"actor": "till"})
    assert res.status_code == 200
    assert captured["actor"] == "till"


def test_audit_empty_when_no_rows(client: TestClient) -> None:
    with patch(
        "backend.services.pricing.audit_query.list_audit_for_sku",
        return_value=([], 0, None),
    ):
        res = client.get(URL.format(aid="MISSING"))
    assert res.status_code == 200
    body = res.json()
    assert body["rows"] == []
    assert body["total"] == 0
    # SF2 — empty audit query returns ``lineage_ref: None`` so no
    # ``lineage_refs`` row gets allocated for read-only empty paginations.
    assert body["lineage_ref"] is None


def test_audit_rejects_unauthenticated() -> None:
    """Auth gate: requesting without a session cookie 401s."""
    from fastapi.testclient import TestClient

    from backend.main import app

    # Use a fresh TestClient — the session-scoped ``anon_client`` shares
    # cookies with the authenticated ``client`` so a unilateral call
    # would carry frank's session.
    fresh = TestClient(app)
    res = fresh.get(URL.format(aid="A-1"))
    assert res.status_code == 401


def test_audit_clamps_limit_to_max(client: TestClient) -> None:
    """``limit`` is validated by FastAPI; > 200 should be rejected (422)."""
    res = client.get(URL.format(aid="A-1"), params={"limit": 500})
    assert res.status_code == 422


def test_audit_linked_rec_extracted_for_proposal_created(client: TestClient) -> None:
    """Audit rows for ``proposal_created`` carry ``linked_rec`` when the
    payload references a recommendation.

    This is exercised on the service path so the wire shape carries the
    enrichment by default.
    """
    from backend.models.pricing.audit import (
        PricingAuditAction,
        PricingAuditTargetKind,
    )
    from backend.services.pricing.audit_query import _serialize_row

    class _Stub:
        id = uuid4()
        at = datetime.now(timezone.utc)
        actor = "frank"
        action = PricingAuditAction.PROPOSAL_CREATED.value
        target_kind = PricingAuditTargetKind.SKU.value
        target_id = "A-1"
        before = None
        after = {"rec_ref": "rec_88a3", "rec_label": "draft #p_88a3", "aid": "A-1"}
        reason = None
        lineage_ref_id = None

    row = _serialize_row(_Stub(), lineage_row=None)
    assert row["linked_rec"] == {"ref": "rec_88a3", "label": "draft #p_88a3"}
