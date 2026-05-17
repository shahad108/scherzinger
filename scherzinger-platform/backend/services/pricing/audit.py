"""Pricing audit helper — single entry point for state-changing actions.

Phase 4 (Pricing Studio v3) wired ``record_audit`` to also:

  1. Invalidate the audit-query read cache (so the next read picks up
     the freshly-appended row without waiting for the 30s TTL).
  2. Publish ``audit.appended`` on the SSE bus so the Decision History
     drawer + the diff strip refresh live, no polling required.

Both side effects are best-effort — a failure must never block the audit
write itself (the append is the source of truth, the side effects are
freshness tooling on top).
"""
from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditEntry,
    PricingAuditTargetKind,
)

logger = logging.getLogger(__name__)


def _publish_audit_appended(entry: PricingAuditEntry) -> None:
    """Publish ``audit.appended`` on the SSE bus.

    aid is forwarded when the target is a SKU; for customer/cluster
    audits the aid is left ``None`` (the frontend filter widens
    appropriately — the audit drawer reads on target_id, not aid).
    """
    try:
        from backend.services.events import publish_sync

        aid = entry.target_id if entry.target_kind == "sku" else None
        # Pull the aid out of the payload for customer/cluster audits so
        # the SKU-keyed subscribers (the workbench) still receive it.
        if aid is None:
            payload_aid = None
            if isinstance(entry.after, dict):
                payload_aid = entry.after.get("aid")
            if payload_aid is None and isinstance(entry.before, dict):
                payload_aid = entry.before.get("aid")
            if isinstance(payload_aid, str):
                aid = payload_aid

        publish_sync(
            "audit.appended",
            {
                "audit_id": str(entry.id),
                "target_kind": entry.target_kind,
                "target_id": entry.target_id,
                "action": entry.action,
                "actor": entry.actor,
                "at": entry.at.isoformat() if entry.at is not None else None,
            },
            aid=aid,
        )
    except Exception:
        logger.exception("record_audit.publish audit.appended failed id=%s", entry.id)


def _invalidate_audit_read_cache() -> None:
    try:
        from backend.services.pricing.audit_query import invalidate_cache

        invalidate_cache()
    except Exception:
        logger.exception("record_audit.invalidate_cache failed")


def _build_entry(
    *,
    actor: str,
    action: PricingAuditAction | str,
    target_kind: PricingAuditTargetKind | str,
    target_id: str,
    before: Optional[dict[str, Any]],
    after: Optional[dict[str, Any]],
    reason: Optional[str],
    lineage_ref: Optional[UUID],
) -> PricingAuditEntry:
    action_value = action.value if isinstance(action, PricingAuditAction) else str(action)
    target_kind_value = (
        target_kind.value
        if isinstance(target_kind, PricingAuditTargetKind)
        else str(target_kind)
    )
    return PricingAuditEntry(
        actor=actor,
        action=action_value,
        target_kind=target_kind_value,
        target_id=target_id,
        before=before,
        after=after,
        reason=reason,
        lineage_ref_id=lineage_ref,
    )


def _audit_appended_payload(entry: PricingAuditEntry) -> tuple[dict[str, Any], Optional[str]]:
    """Build the ``audit.appended`` SSE payload + aid filter for ``entry``."""
    aid = entry.target_id if entry.target_kind == "sku" else None
    if aid is None:
        payload_aid = None
        if isinstance(entry.after, dict):
            payload_aid = entry.after.get("aid")
        if payload_aid is None and isinstance(entry.before, dict):
            payload_aid = entry.before.get("aid")
        if isinstance(payload_aid, str):
            aid = payload_aid
    return (
        {
            "audit_id": str(entry.id),
            "target_kind": entry.target_kind,
            "target_id": entry.target_id,
            "action": entry.action,
            "actor": entry.actor,
            "at": entry.at.isoformat() if entry.at is not None else None,
        },
        aid,
    )


def record_audit(
    *,
    actor: str,
    action: PricingAuditAction | str,
    target_kind: PricingAuditTargetKind | str,
    target_id: str,
    before: Optional[dict[str, Any]] = None,
    after: Optional[dict[str, Any]] = None,
    reason: Optional[str] = None,
    lineage_ref: Optional[UUID] = None,
    session: Session,
) -> PricingAuditEntry:
    """Append a pricing_audit row (sync call sites).

    Caller is responsible for ``session.commit()`` — keeps this composable
    inside the request/transaction boundary of higher-level workflows.

    Side effects:
      - ``services.pricing.audit_query`` read cache is dropped.
      - ``audit.appended`` is published on the SSE bus.

    Both side effects are best-effort and only fire after the row is
    successfully flushed to the session.

    For async call sites (e.g. the WS comment handler), use
    ``record_audit_async`` — ``publish_sync`` raises if invoked from
    inside a running event loop, and that error would be silently
    swallowed here, leaving subscribers without an ``audit.appended``
    refresh.
    """
    entry = _build_entry(
        actor=actor,
        action=action,
        target_kind=target_kind,
        target_id=target_id,
        before=before,
        after=after,
        reason=reason,
        lineage_ref=lineage_ref,
    )
    session.add(entry)
    session.flush()

    # Best-effort live wiring. Must not raise.
    _invalidate_audit_read_cache()
    _publish_audit_appended(entry)
    return entry


async def record_audit_async(
    *,
    actor: str,
    action: PricingAuditAction | str,
    target_kind: PricingAuditTargetKind | str,
    target_id: str,
    before: Optional[dict[str, Any]] = None,
    after: Optional[dict[str, Any]] = None,
    reason: Optional[str] = None,
    lineage_ref: Optional[UUID] = None,
    session: Session,
) -> PricingAuditEntry:
    """Async-safe variant of ``record_audit`` for use inside event loops.

    SF4 (Phase-5 review): the sync ``record_audit`` ultimately calls
    ``publish_sync`` which raises ``RuntimeError`` if invoked from a
    running event loop. That error was swallowed inside the audit module
    — so WS-driven comment frames silently dropped the
    ``audit.appended`` SSE event and subscribers (the audit drawer, the
    diff strip) had to wait for the next cache TTL to notice.

    The DB write itself runs synchronously on the event loop's thread
    (SQLAlchemy Sessions are not thread-safe; offloading them to
    ``asyncio.to_thread`` would create a hard-to-debug session-affinity
    bug for callers that mutate the same Session before/after this
    helper). The session writes are small and synchronous-by-design.

    The SSE publish goes via ``await publish(...)`` directly rather than
    ``publish_sync(...)`` — no loop guard, no swallowed error.
    """
    entry = _build_entry(
        actor=actor,
        action=action,
        target_kind=target_kind,
        target_id=target_id,
        before=before,
        after=after,
        reason=reason,
        lineage_ref=lineage_ref,
    )
    session.add(entry)
    session.flush()

    # Best-effort cache invalidate — must not raise into the WS handler.
    _invalidate_audit_read_cache()

    # Best-effort SSE publish via the async path — must not raise.
    try:
        from backend.services.events import publish

        payload, aid = _audit_appended_payload(entry)
        await publish("audit.appended", payload, aid=aid)
    except Exception:
        logger.exception(
            "record_audit_async.publish audit.appended failed id=%s", entry.id
        )

    return entry
