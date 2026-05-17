"""Phase 12 — SSE end-to-end integration test.

Plan §12.1 requires: *publish an event, assert consumer receives within 2s*.

This file is a focused integration gate on top of the existing bus-level
coverage in ``tests/api/test_events_stream.py``. We keep it separate so the
Phase 12 deliverable is grep-able and so the timing budget (2s) is named
explicitly. The pattern used here matches the bus-level harness — we do
NOT exercise the FastAPI streaming endpoint via TestClient, because that
path is known to hang in CI on long-lived ``text/event-stream`` responses
(see Phase 0 notes). The live wire is exercised by the Playwright suite.
"""
from __future__ import annotations

import asyncio
import time
import threading
from typing import Optional

import pytest

from backend.services import events as events_module


@pytest.fixture(autouse=True)
def _fresh_bus():
    """Each test owns a fresh in-process bus so subscribers don't bleed."""
    original = events_module.get_bus()
    events_module.set_bus(events_module.InProcessEventBus())
    try:
        yield
    finally:
        events_module.set_bus(original)


def test_publish_sync_reaches_subscriber_within_2s() -> None:
    """Plan §12.1 acceptance — ``publish_sync`` from another thread is
    delivered to an async subscriber in the bus' loop in well under 2s.

    This is the canonical SSE integration check: the same code path used
    by ``record_audit``, ``publish_price``, etc. when they fire
    ``audit.appended`` / ``pricing.price_set`` / ``pricing.cost_moved``
    from inside a sync request handler.
    """

    async def _run() -> tuple[Optional[events_module.Event], float]:
        bus: events_module.InProcessEventBus = events_module.get_bus()  # type: ignore[assignment]
        sub = bus.open_subscription("pricing", aid="P12-INT-1")
        started = time.monotonic()

        def _publish_from_thread() -> None:
            # Sleep just long enough for the subscriber to be parked on
            # `await sub.next(...)`. publish_sync uses
            # call_soon_threadsafe under the hood — that's the real
            # integration path we care about here.
            time.sleep(0.05)
            events_module.publish_sync(
                "pricing.price_set",
                {"aid": "P12-INT-1", "new": "12.34"},
                aid="P12-INT-1",
            )

        threading.Thread(target=_publish_from_thread, daemon=True).start()
        event = await sub.next(timeout=2.0)
        elapsed = time.monotonic() - started
        sub.close()
        return event, elapsed

    event, elapsed = asyncio.run(_run())
    assert event is not None, "publish_sync never reached the subscriber"
    assert event.topic == "pricing.price_set"
    assert event.aid == "P12-INT-1"
    assert event.payload == {"aid": "P12-INT-1", "new": "12.34"}
    assert elapsed < 2.0, f"SSE delivery took {elapsed:.3f}s (budget 2s)"


def test_multiple_topics_fan_out_independently() -> None:
    """Two subscribers on different topic patterns each receive only
    their matching events. Validates the topic-prefix fan-out path that
    the Studio UI relies on (one subscriber per drawer/tile)."""

    async def _run() -> tuple[Optional[events_module.Event], Optional[events_module.Event]]:
        bus: events_module.InProcessEventBus = events_module.get_bus()  # type: ignore[assignment]
        pricing_sub = bus.open_subscription("pricing", aid="P12-INT-2")
        audit_sub = bus.open_subscription("audit", aid="P12-INT-2")

        async def _publishers() -> None:
            await asyncio.sleep(0.05)
            await bus.publish(
                "pricing.cost_moved", {"aid": "P12-INT-2"}, aid="P12-INT-2"
            )
            await asyncio.sleep(0.01)
            await bus.publish(
                "audit.appended", {"aid": "P12-INT-2"}, aid="P12-INT-2"
            )

        asyncio.create_task(_publishers())
        pricing_event = await pricing_sub.next(timeout=2.0)
        audit_event = await audit_sub.next(timeout=2.0)
        pricing_sub.close()
        audit_sub.close()
        return pricing_event, audit_event

    pricing_event, audit_event = asyncio.run(_run())
    assert pricing_event is not None and pricing_event.topic == "pricing.cost_moved"
    assert audit_event is not None and audit_event.topic == "audit.appended"
