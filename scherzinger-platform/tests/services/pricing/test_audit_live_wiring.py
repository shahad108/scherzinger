"""Phase 4 (Pricing Studio v3) — record_audit live wiring + cost-ingest hook.

End-to-end: when ``record_audit`` runs it must
  - publish ``audit.appended`` on the SSE bus
  - drop the audit-query read cache

And: when ``on_cost_changed`` is called with a session, it must append a
``override_added`` audit row carrying ``after.unit_cost``.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Iterator
from uuid import uuid4

import pytest

from backend.database import SessionLocal
from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditEntry,
    PricingAuditTargetKind,
)
from backend.services import events as events_module
from backend.services.pricing.audit import record_audit
from backend.services.pricing.audit_query import _CACHE, invalidate_cache
from backend.services.pricing.cost_ingest_hook import on_cost_changed


@pytest.fixture
def db() -> Iterator:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


@pytest.fixture
def aid() -> str:
    return f"AUD-{uuid4().hex[:8].upper()}"


def test_record_audit_publishes_audit_appended_event(db, aid) -> None:
    """Bus-level acceptance: record_audit must trigger an audit.appended event."""

    async def _run() -> events_module.Event | None:
        original = events_module.get_bus()
        events_module.set_bus(events_module.InProcessEventBus())
        bus: events_module.InProcessEventBus = events_module.get_bus()  # type: ignore[assignment]
        sub = bus.open_subscription("audit", aid=aid)
        try:
            # publish_sync requires no running loop, so fire from a thread.
            import threading

            def _emit() -> None:
                # Tiny delay so the subscription is fully registered.
                time.sleep(0.05)
                record_audit(
                    actor="system",
                    action=PricingAuditAction.PRICE_SET,
                    target_kind=PricingAuditTargetKind.SKU,
                    target_id=aid,
                    after={"aid": aid, "price": "5.10"},
                    session=db,
                )

            threading.Thread(target=_emit, daemon=True).start()
            return await sub.next(timeout=2.0)
        finally:
            sub.close()
            events_module.set_bus(original)

    event = asyncio.run(_run())
    assert event is not None, "audit.appended did not reach the subscriber"
    assert event.topic == "audit.appended"
    assert event.aid == aid
    assert event.payload["target_id"] == aid
    assert event.payload["action"] == "price_set"


def test_record_audit_invalidates_read_cache(db, aid) -> None:
    """A fresh write must drop the audit-query read cache so the next read
    sees the new row inside the 30s TTL window."""
    # Pre-populate the cache.
    invalidate_cache()
    _CACHE[("list", aid, 50, 0, None, None, None)] = (
        time.monotonic(),
        {"rows": ["stale"], "total": 1},
    )
    assert len(_CACHE) == 1

    record_audit(
        actor="system",
        action=PricingAuditAction.PRICE_SET,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "price": "5.10"},
        session=db,
    )
    # Cache cleared by the write hook.
    assert len(_CACHE) == 0


def test_on_cost_changed_appends_audit_row(db, aid) -> None:
    on_cost_changed(
        aid,
        breakdown_changed=True,
        new_unit_cost="82.50",
        db_session=db,
        actor="etl",
    )
    rows = (
        db.query(PricingAuditEntry)
        .filter_by(target_id=aid)
        .order_by(PricingAuditEntry.at.desc())
        .all()
    )
    assert len(rows) == 1
    row = rows[0]
    assert row.action == PricingAuditAction.OVERRIDE_ADDED.value
    assert row.target_kind == PricingAuditTargetKind.SKU.value
    assert row.actor == "etl"
    assert (row.after or {}).get("aid") == aid
    assert (row.after or {}).get("unit_cost") == "82.50"
    assert (row.after or {}).get("breakdown_changed") is True
    assert row.reason == "cost_ingested"
