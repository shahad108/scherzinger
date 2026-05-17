"""Pricing proposal workflow endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models import PricingProposal, Recommendation
from backend.models.user_view_state import UserViewSurface
from backend.services import workflow_service
from backend.services.action_center.composer import (
    invalidate_cache as invalidate_action_center_cache,
)

router = APIRouter(prefix="/pricing", tags=["pricing"])


# SF1 (Phase 2.2.5): accept ``Decimal`` rather than ``float`` for prices so the
# wire shape can carry the canonical decimal string (e.g. ``"5.10"``) end-to-end
# without ever passing through a JS float. Pydantic v2 will coerce numeric JSON
# tokens as well, so existing clients posting numbers continue to work.
class ProposalIn(BaseModel):
    recommendation_id: str | None = None
    article_id: str
    current_price: Decimal | None = None
    proposed_price: Decimal | None = None
    delta_pp: Decimal | None = None
    approval_required: bool = False
    payload: dict[str, Any] = {}


class ProposalPatch(BaseModel):
    current_price: Decimal | None = None
    proposed_price: Decimal | None = None
    delta_pp: Decimal | None = None
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
    # SF1 (Phase 2.2.5): the request model carries ``Decimal``; the JSONB
    # column can't serialize Decimal directly through psycopg2, so the
    # persisted payload uses canonical *string-encoded* decimals (no JS
    # float ever touches the value). The SQLAlchemy ``Numeric`` columns
    # are filled from explicit Decimal kwargs after the insert via the
    # ORM column setters so cent precision survives the round-trip.
    stored_payload = dict(body.payload or {})
    stored_payload.update(
        {
            "article_id": body.article_id,
            "current_price": (
                str(body.current_price)
                if body.current_price is not None
                else None
            ),
            "proposed_price": (
                str(body.proposed_price)
                if body.proposed_price is not None
                else None
            ),
            "delta_pp": (
                str(body.delta_pp) if body.delta_pp is not None else None
            ),
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
                "after": stored_payload,
            },
        )
    # Build the call body around the JSON-safe ``stored_payload`` (so the
    # JSONB column never sees a raw Decimal — psycopg2 can't encode it)
    # and re-attach the typed ``Decimal`` values to the columns *after*
    # the row is created — ``create_pricing_proposal`` reads them off the
    # body dict and SQLAlchemy's Numeric type accepts ``Decimal`` for the
    # typed columns. The columns and the JSONB payload therefore see
    # different shapes intentionally.
    proposal = workflow_service.create_pricing_proposal(
        db,
        recommendation=rec,
        actor_user_id=ctx.user_id,
        body=stored_payload,
        status="draft",
    )
    if body.current_price is not None:
        proposal.current_price = body.current_price
    if body.proposed_price is not None:
        proposal.proposed_price = body.proposed_price
    if body.delta_pp is not None:
        proposal.delta_pp = body.delta_pp
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
    """Phase 5 — submit a draft proposal into the approval workflow.

    Consults ``approval_rules.should_route_for_approval`` via the
    workflow service; builds an ``approval_instance`` with one step per
    routed role. Auto-approve rules short-circuit straight to ``approved``;
    everything else lands in ``pending_approval`` until the routed
    approvers decide.
    """
    from backend.services.pricing import approval_workflow

    row = _get_proposal(db, proposal_id, ctx)
    if row.created_by != ctx.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the creator can submit this proposal")
    if row.status not in {"draft", "changes_requested"}:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"proposal cannot be submitted from status {row.status!r}",
        )

    instance, decision = approval_workflow.submit_proposal_for_approval(
        session=db,
        proposal=row,
        actor=str(ctx.user_id),
    )
    db.commit()
    db.refresh(row)
    db.refresh(instance)
    invalidate_action_center_cache()
    return {
        "proposal": workflow_service.serialize_proposal(row),
        "approval_instance": approval_workflow.serialize_instance(instance),
        "decision": {
            "needs": list(decision.needs),
            "thresholds_hit": list(decision.thresholds_hit),
            "auto_approve": decision.auto_approve and not decision.needs and not decision.block,
            "block": decision.block,
            "reasons": list(decision.reasons),
        },
    }


@router.post("/proposals/{proposal_id}/recall")
def recall_proposal(
    proposal_id: UUID,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Phase 5 (§5.5) — auto-recall a still-draft proposal.

    Only the proposal creator can recall, and only while in ``draft``.
    Submitted/approved/rejected proposals cannot be recalled.
    """
    from backend.services.pricing import approval_workflow

    row = _get_proposal(db, proposal_id, ctx)
    if row.created_by != ctx.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the creator can recall this proposal")
    try:
        approval_workflow.recall_proposal(session=db, proposal=row, actor=str(ctx.user_id))
    except approval_workflow.ApprovalWorkflowError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    db.commit()
    db.refresh(row)
    return workflow_service.serialize_proposal(row)


@router.get("/proposals/{proposal_id}/approval")
def get_proposal_approval(
    proposal_id: UUID,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Phase 5 — full approval instance + step history for the stepper."""
    from backend.models.pricing.approval import ApprovalAction, ApprovalInstance
    from backend.services.pricing import approval_workflow

    row = _get_proposal(db, proposal_id, ctx)
    instance = (
        db.query(ApprovalInstance)
        .filter(ApprovalInstance.proposal_id == row.id)
        .order_by(ApprovalInstance.created_at.desc())
        .first()
    )
    if instance is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no approval instance for this proposal")
    actions = (
        db.query(ApprovalAction)
        .filter(ApprovalAction.approval_instance_id == instance.id)
        .order_by(ApprovalAction.at.asc())
        .all()
    )
    return {
        "approval_instance": approval_workflow.serialize_instance(instance),
        "actions": [
            {
                "id": str(a.id),
                "actor": a.actor,
                "decision": a.decision,
                "comment": a.comment,
                "at": a.at.isoformat() if a.at else None,
            }
            for a in actions
        ],
        "proposal": workflow_service.serialize_proposal(row),
    }


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


# ---------------------------------------------------------------------------
# Phase 3 (Pricing Studio v3) — Cost Trajectory Drawer endpoint.
# ---------------------------------------------------------------------------


@router.get("/sku/{aid}/cost-outlook")
def get_sku_cost_outlook(
    aid: str,
    horizon_months: int = 6,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Per-SKU cost outlook for the Cost Trajectory Drawer.

    Returns ``today`` (current unit cost + breakdown), ``forecast``
    (p20/p50/p80 per next ``horizon_months``), per-component deltas,
    ``floor_crosses_at``, top commodity-trend rows, and a lineage_ref.

    404 when the SKU has no CostState row (clear ``cost_state_missing``
    error code so the frontend can render an empty state rather than a
    generic 404).
    """
    from backend.services.pricing.cost_outlook import (
        CostOutlookMissing,
        build_cost_outlook,
    )

    try:
        return build_cost_outlook(
            aid=aid, horizon_months=horizon_months, db_session=db
        )
    except CostOutlookMissing as exc:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail={
                "code": "cost_state_missing",
                "aid": aid,
                "message": f"no cost state recorded for {aid}",
            },
        ) from exc


# ---------------------------------------------------------------------------
# Phase 4 (Pricing Studio v3) — Decision history + "what changed since".
# ---------------------------------------------------------------------------


def _parse_csv_action_in(raw: Optional[str]) -> Optional[list[str]]:
    """Accept ``?action_in=a,b,c`` as a CSV string or repeated query param."""
    if raw is None or raw == "":
        return None
    return [v.strip() for v in raw.split(",") if v.strip()]


def _parse_iso_datetime(raw: Optional[str], *, field: str) -> Optional[datetime]:
    if raw is None or raw == "":
        return None
    try:
        # Accept "Z" suffix as UTC.
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"invalid {field}: expected ISO 8601 timestamp, got {raw!r}",
        ) from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@router.get("/sku/{aid}/audit")
def get_sku_audit(
    aid: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action_in: Optional[str] = Query(default=None),
    actor: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Decision history rows for the per-SKU audit drawer.

    Returns ``{rows, total, lineage_ref}``. ``rows`` includes direct
    ``target_kind='sku'`` events AND customer/cluster/family events
    where the SKU appears in the payload's ``aid`` field.
    """
    from backend.services.pricing.audit_query import list_audit_for_sku

    actions = _parse_csv_action_in(action_in)
    since_dt = _parse_iso_datetime(since, field="since")
    # SF2 — the service owns the read-side lineage row now (created once
    # per cached (aid, filters) window, skipped when ``rows`` is empty).
    rows, total, lineage_ref_id = list_audit_for_sku(
        aid=aid,
        db_session=db,
        limit=limit,
        offset=offset,
        action_in=actions,
        actor=actor,
        since=since_dt,
    )
    db.commit()
    return {
        "rows": rows,
        "total": total,
        "lineage_ref": str(lineage_ref_id) if lineage_ref_id is not None else None,
    }


@router.get("/sku/{aid}/diff")
def get_sku_diff(
    aid: str,
    since: Optional[str] = Query(default=None),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """"What changed since you last looked" diff for the per-SKU strip.

    When ``?since=`` is omitted we read the caller's ``user_view_state``
    row for this (aid, surface=studio); falling back to "7 days ago" if
    no row exists (first-time view).

    Side effect: after computing the diff we stamp
    ``user_view_state.last_seen_at = now()`` for the caller so the next
    poll only surfaces post-``now`` deltas.
    """
    from backend.services.pricing.diff import build_diff, default_lookback
    from backend.services.user_view_state import get_last_seen, stamp_view

    user_id = str(ctx.user_id)
    since_dt = _parse_iso_datetime(since, field="since")
    if since_dt is None:
        stored = get_last_seen(
            user_id=user_id,
            surface=UserViewSurface.STUDIO,
            target_id=aid,
            session=db,
        )
        since_dt = stored if stored is not None else default_lookback()

    now = datetime.now(timezone.utc)
    summary = build_diff(aid=aid, since=since_dt, now=now, db_session=db)

    # Stamp the view so the next call advances ``since``.
    stamp_view(
        user_id=user_id,
        surface=UserViewSurface.STUDIO,
        target_id=aid,
        session=db,
        at=now,
    )
    db.commit()
    return summary.model_dump(mode="json")
