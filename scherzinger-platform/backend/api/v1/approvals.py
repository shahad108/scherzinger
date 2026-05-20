"""Phase 5 (Pricing Studio v3) — approver-side endpoints.

Surfaces:

  POST /api/v1/approvals/{instance_id}/decision
      Approver applies approve / reject / request_changes (+ comment).

  GET  /api/v1/approvals/inbox
      Approver's queue: instances awaiting a role they hold.

Decision-side authorisation is role-based: the caller's ``roles`` claim
must include the role at ``approval_instances.steps[current_step].role``.
"""
from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models import PricingProposal
from backend.models.pricing.approval import ApprovalDecisionKind, ApprovalInstance
from backend.services.action_center.composer import (
    invalidate_cache as invalidate_action_center_cache,
)
from backend.services.pricing import approval_workflow

router = APIRouter(prefix="/approvals", tags=["approvals"])


class DecisionIn(BaseModel):
    decision: ApprovalDecisionKind = Field(...)
    comment: str | None = None


# ---------------------------------------------------------------------------
# Inbox cache — 30s TTL, invalidated on proposal.* events.
# ---------------------------------------------------------------------------

_INBOX_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_INBOX_TTL_SECONDS = 30.0


def invalidate_inbox_cache() -> None:
    """Drop the per-user inbox cache (called from the event listener)."""
    _INBOX_CACHE.clear()


def _cached_inbox_key(user_id: str, roles: list[str]) -> str:
    return f"{user_id}:{','.join(sorted(roles))}"


@router.get("/inbox")
def get_inbox(
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    key = _cached_inbox_key(str(ctx.user_id), ctx.roles)
    now = time.monotonic()
    cached = _INBOX_CACHE.get(key)
    if cached is not None and (now - cached[0]) < _INBOX_TTL_SECONDS:
        return {"items": cached[1], "total": len(cached[1]), "cached": True}

    items = approval_workflow.inbox_for_roles(session=db, user_roles=ctx.roles)
    _INBOX_CACHE[key] = (now, items)
    return {"items": items, "total": len(items), "cached": False}


@router.post("/{instance_id}/decision")
def decide(
    instance_id: UUID,
    body: DecisionIn,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    instance = db.get(ApprovalInstance, instance_id)
    if instance is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "approval instance not found")
    proposal = db.get(PricingProposal, instance.proposal_id)
    if proposal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "underlying proposal not found")

    try:
        approval_workflow.apply_decision(
            session=db,
            instance=instance,
            proposal=proposal,
            actor=str(ctx.user_id),
            actor_roles=ctx.roles,
            decision=body.decision,
            comment=body.comment,
        )
    except approval_workflow.ApprovalWorkflowError as exc:
        # 403 specifically when the caller's roles don't cover the step;
        # 409 for everything else (already-terminal, no pending step).
        message = str(exc)
        if "roles do not include" in message:
            raise HTTPException(status.HTTP_403_FORBIDDEN, message) from exc
        raise HTTPException(status.HTTP_409_CONFLICT, message) from exc

    db.commit()
    db.refresh(instance)
    db.refresh(proposal)

    invalidate_inbox_cache()
    invalidate_action_center_cache()

    return {
        "approval_instance": approval_workflow.serialize_instance(instance),
        "proposal_status": proposal.status,
    }


__all__ = ["router", "invalidate_inbox_cache"]
