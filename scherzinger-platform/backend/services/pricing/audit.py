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
    """Append a pricing_audit row.

    Caller is responsible for ``session.commit()`` — keeps this composable
    inside the request/transaction boundary of higher-level workflows.

    Side effects:
      - ``services.pricing.audit_query`` read cache is dropped.
      - ``audit.appended`` is published on the SSE bus.

    Both side effects are best-effort and only fire after the row is
    successfully flushed to the session.
    """
    action_value = action.value if isinstance(action, PricingAuditAction) else str(action)
    target_kind_value = (
        target_kind.value
        if isinstance(target_kind, PricingAuditTargetKind)
        else str(target_kind)
    )
    entry = PricingAuditEntry(
        actor=actor,
        action=action_value,
        target_kind=target_kind_value,
        target_id=target_id,
        before=before,
        after=after,
        reason=reason,
        lineage_ref_id=lineage_ref,
    )
    session.add(entry)
    session.flush()

    # Best-effort live wiring. Must not raise.
    _invalidate_audit_read_cache()
    _publish_audit_appended(entry)
    return entry
