"""Phase 3 (Pricing Studio v3) — trigger_context composer tests.

Verifies:
  - Known (source, reason) tuples produce a headline + link.
  - Unknown returns None.
  - Missing source or reason returns None.
  - Lineage_ref is attached when a banner is produced.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing import trigger_context as tc


def _lineage() -> LineageRef:
    return LineageRef(
        id=uuid4(),
        source_kind=LineageSourceKind.MANUAL_OVERRIDE,
        source_id="test",
        sql=None,
        model="trigger_context_v1",
        computed_at=datetime.now(timezone.utc),
        computed_by="test",
    )


@pytest.fixture
def fake_db():
    return MagicMock()


@pytest.fixture(autouse=True)
def _patch_lineage(monkeypatch):
    monkeypatch.setattr(tc, "_persist_lineage", lambda **kwargs: _lineage())
    yield


def test_unknown_source_returns_none(fake_db) -> None:
    assert tc.build_trigger_context(
        aid="A-1",
        source="unknown",
        reason="cost-spike",
        db_session=fake_db,
    ) is None


def test_unknown_reason_returns_none(fake_db) -> None:
    assert tc.build_trigger_context(
        aid="A-1",
        source="forecasting",
        reason="not-a-thing",
        db_session=fake_db,
    ) is None


def test_missing_source_returns_none(fake_db) -> None:
    assert tc.build_trigger_context(
        aid="A-1",
        source=None,
        reason="cost-spike",
        db_session=fake_db,
    ) is None


def test_missing_reason_returns_none(fake_db) -> None:
    assert tc.build_trigger_context(
        aid="A-1",
        source="forecasting",
        reason=None,
        db_session=fake_db,
    ) is None


def test_forecasting_cost_spike_known_tuple(monkeypatch, fake_db) -> None:
    monkeypatch.setattr(
        tc, "_steel_pct_from_market_direction", lambda db: Decimal("8.2")
    )
    ctx = tc.build_trigger_context(
        aid="A-1",
        source="forecasting",
        reason="cost-spike",
        cluster="BKAGG",
        db_session=fake_db,
    )
    assert ctx is not None
    assert ctx.source == "forecasting"
    assert ctx.reason == "cost-spike"
    assert "8.2" in ctx.headline or "moved" in ctx.headline.lower()
    assert ctx.link_label == "View commodity trend"
    assert "BKAGG" in ctx.link_target
    assert ctx.lineage_ref is not None


def test_forecasting_cost_spike_falls_back_when_proxy_unavailable(
    monkeypatch, fake_db
) -> None:
    monkeypatch.setattr(
        tc, "_steel_pct_from_market_direction", lambda db: None
    )
    ctx = tc.build_trigger_context(
        aid="A-1",
        source="forecasting",
        reason="cost-spike",
        cluster="BKAGG",
        db_session=fake_db,
    )
    assert ctx is not None
    # No raw {pct} placeholder should leak through the templated headline.
    assert "{pct" not in ctx.headline
    assert "{pct" not in ctx.details


def test_margin_erosion_known_tuple(fake_db) -> None:
    ctx = tc.build_trigger_context(
        aid="A-1",
        source="margin",
        reason="erosion",
        cluster="BKAGG",
        db_session=fake_db,
    )
    assert ctx is not None
    assert ctx.source == "margin"
    assert ctx.reason == "erosion"
    assert "BKAGG" in ctx.link_target
    assert "erosion" in ctx.link_target


def test_action_center_leakage_known_tuple(fake_db) -> None:
    ctx = tc.build_trigger_context(
        aid="A-1",
        source="action-center",
        reason="leakage",
        db_session=fake_db,
    )
    assert ctx is not None
    assert ctx.link_target == "/action-center"


def test_source_reason_case_insensitive(fake_db) -> None:
    ctx = tc.build_trigger_context(
        aid="A-1",
        source="MARGIN",
        reason="EROSION",
        cluster="BKAGG",
        db_session=fake_db,
    )
    assert ctx is not None
