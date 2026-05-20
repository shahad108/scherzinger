"""Pricing Studio v3 / Phase 10 — `dataThrough` on StudioShell.

The freshness chip in the workbench header binds to the canonical
`dataThrough` ISO datetime. The composer should derive it from the
most-recent ingestion timestamp across cost_state and competitor_ref
(or fall back to ``now - 24h`` when both are absent).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from backend.services.studio.composer import build_studio_shell, invalidate_cache


@pytest.fixture(autouse=True)
def _clear_cache():
    invalidate_cache()
    yield
    invalidate_cache()


def _run(coro):
    """Drive an async coroutine inside a sync test.

    Use a fresh event loop per call — re-using ``get_event_loop`` after
    another suite has closed the loop raises RuntimeError on 3.11+.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _build(persona: str = "frank") -> dict:
    return _run(
        build_studio_shell(
            user_id="test-user",
            persona=persona,
            aid=None,
            filter_value=None,
            hide_locked=False,
            lang=None,
        )
    )


def test_data_through_field_present(monkeypatch) -> None:
    payload = _build()
    assert "dataThrough" in payload
    assert isinstance(payload["dataThrough"], str)
    # Parses as ISO-8601 (allowing trailing Z).
    iso = payload["dataThrough"].replace("Z", "+00:00")
    parsed = datetime.fromisoformat(iso)
    assert parsed.tzinfo is not None


def test_data_through_uses_cost_state_when_present(monkeypatch) -> None:
    """When the data-through resolver finds a newer ingest, surface it."""
    fixed = datetime(2026, 5, 14, 10, 30, 0, tzinfo=timezone.utc)

    def _fake_resolve():
        return fixed

    monkeypatch.setattr(
        "backend.services.studio.composer._resolve_data_through",
        _fake_resolve,
    )
    payload = _build()
    # ISO with trailing Z or +00:00 either acceptable.
    iso = payload["dataThrough"].replace("Z", "+00:00")
    parsed = datetime.fromisoformat(iso)
    assert parsed == fixed


def test_data_through_falls_back_to_recent_window(monkeypatch) -> None:
    """No signals available → composer falls back to ``now - 24h``-ish."""
    monkeypatch.setattr(
        "backend.services.studio.composer._resolve_data_through",
        lambda: None,
    )
    payload = _build()
    iso = payload["dataThrough"].replace("Z", "+00:00")
    parsed = datetime.fromisoformat(iso)
    # Allow a generous window: ``now - 48h`` ≤ value ≤ ``now``.
    now = datetime.now(timezone.utc)
    assert parsed <= now + timedelta(seconds=5)
    assert parsed >= now - timedelta(hours=48)
