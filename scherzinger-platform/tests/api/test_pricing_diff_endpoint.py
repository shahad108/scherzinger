"""Phase 4 (Pricing Studio v3) — "what changed since" diff endpoint.

GET /api/v1/pricing/sku/{aid}/diff?since=...
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.models.pricing.diff import ChangeKind, DiffChange, DiffSummary


URL = "/api/v1/pricing/sku/{aid}/diff"


def _stub_summary(aid: str = "A-1", since: datetime | None = None) -> DiffSummary:
    since_dt = since or (datetime.now(timezone.utc) - timedelta(days=2))
    return DiffSummary(
        aid=aid,
        since=since_dt,
        now=datetime.now(timezone.utc),
        changes=[
            DiffChange(
                kind=ChangeKind.COST,
                before=Decimal("70.00"),
                after=Decimal("78.40"),
                pct=Decimal("12.00"),
                lineage_ref=uuid4(),
                link_target=f"/forecasting?aid={aid}#commodities",
            ),
            DiffChange(
                kind=ChangeKind.PROPOSAL,
                after=Decimal("1"),
                label="proposal_created #p_88a3",
                lineage_ref=uuid4(),
                link_target=f"/studio/sku/{aid}/proposals",
            ),
        ],
        summary_lineage_ref=uuid4(),
    )


def test_diff_returns_changes_array_in_alpha_order(client: TestClient) -> None:
    """Changes must be alpha-ordered by kind so the frontend can render
    consistently without re-sorting."""
    with patch(
        "backend.services.pricing.diff.build_diff",
        return_value=_stub_summary(),
    ):
        res = client.get(URL.format(aid="A-1"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert "changes" in body and isinstance(body["changes"], list)
    kinds = [c["kind"] for c in body["changes"]]
    assert kinds == sorted(kinds), (
        f"changes are not deterministically ordered: {kinds}"
    )
    assert "summary_lineage_ref" in body
    assert "since" in body and "now" in body


def test_diff_since_defaults_to_user_view_state(client: TestClient) -> None:
    """When ``?since=`` is omitted, the endpoint reads
    ``user_view_state.last_seen_at`` for the current user/aid."""
    seen_at = datetime.now(timezone.utc) - timedelta(hours=6)

    captured: dict[str, Any] = {}

    def _capture_build(*, aid, since, now, db_session):
        captured["since"] = since
        return _stub_summary(aid=aid, since=since)

    with patch(
        "backend.services.user_view_state.get_last_seen",
        return_value=seen_at,
    ), patch(
        "backend.services.pricing.diff.build_diff",
        side_effect=_capture_build,
    ), patch(
        "backend.services.user_view_state.stamp_view",
        return_value=None,
    ):
        res = client.get(URL.format(aid="A-1"))
    assert res.status_code == 200, res.text
    # The captured ``since`` matches the stored view-state timestamp.
    assert captured["since"] == seen_at


def test_diff_since_defaults_to_7_days_when_no_view_state(
    client: TestClient,
) -> None:
    captured: dict[str, Any] = {}

    def _capture_build(*, aid, since, now, db_session):
        captured["since"] = since
        return _stub_summary(aid=aid, since=since)

    with patch(
        "backend.services.user_view_state.get_last_seen",
        return_value=None,
    ), patch(
        "backend.services.pricing.diff.build_diff",
        side_effect=_capture_build,
    ), patch(
        "backend.services.user_view_state.stamp_view",
        return_value=None,
    ):
        res = client.get(URL.format(aid="A-1"))
    assert res.status_code == 200, res.text
    # 7 days ago ± a minute of clock skew.
    delta = (
        datetime.now(timezone.utc) - timedelta(days=7) - captured["since"]
    ).total_seconds()
    assert abs(delta) < 120, f"unexpected default lookback: {captured['since']}"


def test_diff_explicit_since_overrides_default(client: TestClient) -> None:
    captured: dict[str, Any] = {}

    def _capture_build(*, aid, since, now, db_session):
        captured["since"] = since
        return _stub_summary(aid=aid, since=since)

    with patch(
        "backend.services.pricing.diff.build_diff",
        side_effect=_capture_build,
    ), patch(
        "backend.services.user_view_state.stamp_view",
        return_value=None,
    ), patch(
        "backend.services.user_view_state.get_last_seen",
        return_value=datetime(2026, 1, 1, tzinfo=timezone.utc),
    ):
        res = client.get(
            URL.format(aid="A-1"),
            params={"since": "2026-05-10T12:00:00Z"},
        )
    assert res.status_code == 200, res.text
    assert captured["since"].year == 2026
    assert captured["since"].month == 5
    assert captured["since"].day == 10
    assert captured["since"].hour == 12


def test_diff_stamps_user_view_state_after_call(client: TestClient) -> None:
    """Side effect: the endpoint must stamp ``last_seen_at = now()`` so
    the next call only surfaces post-now changes."""
    stamp_calls: list[dict[str, Any]] = []

    def _capture_stamp(*, user_id, surface, target_id, session, at=None):
        stamp_calls.append(
            {
                "user_id": user_id,
                "surface": getattr(surface, "value", surface),
                "target_id": target_id,
                "at": at,
            }
        )

    with patch(
        "backend.services.pricing.diff.build_diff",
        return_value=_stub_summary(),
    ), patch(
        "backend.services.user_view_state.stamp_view",
        side_effect=_capture_stamp,
    ), patch(
        "backend.services.user_view_state.get_last_seen",
        return_value=datetime.now(timezone.utc) - timedelta(hours=1),
    ):
        res = client.get(URL.format(aid="A-1"))
    assert res.status_code == 200, res.text
    assert len(stamp_calls) == 1
    call = stamp_calls[0]
    assert call["surface"] == "studio"
    assert call["target_id"] == "A-1"
    assert call["at"] is not None
    # ``at`` must be approximately ``now`` (not the prior view-state value).
    assert (datetime.now(timezone.utc) - call["at"]).total_seconds() < 5


def test_diff_empty_array_is_200_not_204(client: TestClient) -> None:
    summary = DiffSummary(
        aid="A-1",
        since=datetime.now(timezone.utc) - timedelta(days=1),
        now=datetime.now(timezone.utc),
        changes=[],
        summary_lineage_ref=uuid4(),
    )
    with patch(
        "backend.services.pricing.diff.build_diff",
        return_value=summary,
    ), patch(
        "backend.services.user_view_state.stamp_view",
        return_value=None,
    ), patch(
        "backend.services.user_view_state.get_last_seen",
        return_value=None,
    ):
        res = client.get(URL.format(aid="A-1"))
    assert res.status_code == 200
    body = res.json()
    assert body["changes"] == []


def test_diff_rejects_unauthenticated() -> None:
    from fastapi.testclient import TestClient

    from backend.main import app

    fresh = TestClient(app)
    res = fresh.get(URL.format(aid="A-1"))
    assert res.status_code == 401


def test_diff_invalid_since_returns_400(client: TestClient) -> None:
    res = client.get(URL.format(aid="A-1"), params={"since": "not-a-date"})
    assert res.status_code == 400
