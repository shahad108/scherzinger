"""Pricing proposal workflow endpoints."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models import PricingProposal, Recommendation
from backend.services import workflow_service
from backend.services.action_center.composer import (
    invalidate_cache as invalidate_action_center_cache,
)

router = APIRouter(prefix="/pricing", tags=["pricing"])


class ProposalIn(BaseModel):
    recommendation_id: str | None = None
    article_id: str
    current_price: float | None = None
    proposed_price: float | None = None
    delta_pp: float | None = None
    approval_required: bool = False
    payload: dict[str, Any] = {}


class ProposalPatch(BaseModel):
    current_price: float | None = None
    proposed_price: float | None = None
    delta_pp: float | None = None
    status: str | None = None
    approval_required: bool | None = None
    payload: dict[str, Any] | None = None


def _get_proposal(db: Session, proposal_id: UUID, ctx: AuthContext) -> PricingProposal:
    row = db.get(PricingProposal, proposal_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "proposal not found")
    # Frank can read proposals created by other users once MD approval exists;
    # this MVP only restricts writes below.
    return row


@router.get("/proposals")
def list_proposals(
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
    article_id: str | None = None,
    recommendation_id: str | None = None,
    status_filter: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """Phase 5 — query proposals by article + recommendation + status so
    the Studio context panel and the Action Center status chips can fetch
    the active proposal in a single round-trip."""
    q = db.query(PricingProposal)
    if article_id:
        q = q.filter(PricingProposal.article_id == article_id)
    if recommendation_id:
        # recommendation_id may come in as a stable source_ref or a UUID.
        rec = workflow_service.get_recommendation_by_ref(db, recommendation_id)
        if rec is None:
            try:
                rec = db.get(Recommendation, UUID(recommendation_id))
            except ValueError:
                rec = None
        if rec is not None:
            q = q.filter(PricingProposal.recommendation_id == rec.id)
        else:
            return {"items": [], "total": 0}
    if status_filter:
        q = q.filter(PricingProposal.status == status_filter)
    rows = q.order_by(PricingProposal.created_at.desc()).limit(max(1, min(limit, 200))).all()
    return {
        "items": [workflow_service.serialize_proposal(r) for r in rows],
        "total": len(rows),
    }


@router.get("/proposals/{proposal_id}")
def get_proposal(
    proposal_id: UUID,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return workflow_service.serialize_proposal(_get_proposal(db, proposal_id, ctx))


@router.post("/proposals", status_code=status.HTTP_201_CREATED)
def create_proposal(
    body: ProposalIn,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rec = None
    if body.recommendation_id:
        rec = workflow_service.get_recommendation_by_ref(db, body.recommendation_id)
        if rec is None:
            try:
                rec = db.get(Recommendation, UUID(body.recommendation_id))
            except ValueError:
                rec = None
    payload = dict(body.payload or {})
    payload.update(
        {
            "article_id": body.article_id,
            "current_price": body.current_price,
            "proposed_price": body.proposed_price,
            "delta_pp": body.delta_pp,
            "approval_required": body.approval_required,
        }
    )
    if rec is None:
        rec = workflow_service.ensure_recommendation(
            db,
            actor_user_id=ctx.user_id,
            body={
                "recommendation_id": body.recommendation_id or f"manual:{body.article_id}",
                "article_id": body.article_id,
                "source_kind": "pricing_studio",
                "after": payload,
            },
        )
    proposal = workflow_service.create_pricing_proposal(
        db,
        recommendation=rec,
        actor_user_id=ctx.user_id,
        body=payload,
        status="draft",
    )
    # Phase 5 — creating a proposal flips the recommendation lifecycle so
    # the Action Center status chip + composer filter reflect the new
    # proposal on the next refresh. Skip if it's already past the open
    # state (e.g. a partial proposal flow already moved it).
    if rec.status == "open":
        workflow_service.record_event(
            db,
            recommendation=rec,
            audit=None,
            event_kind="studio_save_proposal",
            to_status="accepted_as_proposal",
            actor_user_id=ctx.user_id,
            payload={"proposal_id": str(proposal.id)},
        )
    db.commit()
    db.refresh(proposal)
    invalidate_action_center_cache()
    return workflow_service.serialize_proposal(proposal)


@router.patch("/proposals/{proposal_id}")
def update_proposal(
    proposal_id: UUID,
    body: ProposalPatch,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = _get_proposal(db, proposal_id, ctx)
    if row.created_by != ctx.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the creator can edit this proposal")
    if body.current_price is not None:
        row.current_price = body.current_price
    if body.proposed_price is not None:
        row.proposed_price = body.proposed_price
    if body.delta_pp is not None:
        row.delta_pp = body.delta_pp
    if body.status is not None:
        if body.status not in workflow_service.PROPOSAL_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid proposal status")
        row.status = body.status
    if body.approval_required is not None:
        row.approval_required = body.approval_required
    if body.payload is not None:
        merged = dict(row.payload or {})
        merged.update(body.payload)
        row.payload = merged
    db.commit()
    db.refresh(row)
    return workflow_service.serialize_proposal(row)


@router.post("/proposals/{proposal_id}/submit")
def submit_proposal(
    proposal_id: UUID,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    row = _get_proposal(db, proposal_id, ctx)
    if row.created_by != ctx.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the creator can submit this proposal")
    row.status = "pending_approval" if row.approval_required else "approved"
    db.commit()
    db.refresh(row)
    invalidate_action_center_cache()
    return workflow_service.serialize_proposal(row)


@router.post("/proposals/{proposal_id}/approve")
def approve_proposal(
    proposal_id: UUID,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if "act.approve_md_authority" not in ctx.permissions and ctx.persona != "till":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "MD approval permission required")
    row = _get_proposal(db, proposal_id, ctx)
    row.status = "approved"
    db.commit()
    db.refresh(row)
    return workflow_service.serialize_proposal(row)


# ---------------------------------------------------------------------------
# Phase 2 (Pricing Studio v3) — Customer Drill-in side panel.
# ---------------------------------------------------------------------------

@router.get("/customer/{customer_id}/sku/{aid}/drill-in")
def get_customer_drill_in(
    customer_id: str,
    aid: str,
    proposed_price: str | None = None,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Phase 2 — single-customer × single-SKU drill-in.

    Returns the per-(customer, SKU) reality row, optional at_proposed
    block (only when ``?proposed_price`` is supplied), the customer's
    top-5 wallet SKUs, and 24mo transaction history.

    ``proposed_price`` is accepted as a string-encoded Decimal so the
    URL query never loses precision through JS/float conversion.
    """
    from decimal import Decimal, InvalidOperation

    from backend.services.pricing.customer_drill_in import build_drill_in

    parsed_price = None
    if proposed_price is not None and proposed_price != "":
        try:
            parsed_price = Decimal(proposed_price)
        except (InvalidOperation, ValueError) as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"invalid proposed_price: {proposed_price}",
            ) from exc

    payload = build_drill_in(
        customer_id=customer_id,
        aid=aid,
        proposed_price=parsed_price,
        db_session=db,
    )
    if payload is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"customer {customer_id} has no record on aid {aid}",
        )
    return payload
