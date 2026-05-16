"""Pricing audit helper — single entry point for state-changing actions."""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditEntry,
    PricingAuditTargetKind,
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
    """Append a pricing_audit row.

    Caller is responsible for ``session.commit()`` — keeps this composable
    inside the request/transaction boundary of higher-level workflows.
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
    return entry
