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
from backend.services.pricing import lineage as lineage_service
from backend.services.pricing import quote_history as quote_history_service

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
# Phase E (Pricing Studio v3) — Quote history + lineage-by-aid endpoints.
# ---------------------------------------------------------------------------


@router.get("/sku/{aid}/quote-history")
def get_sku_quote_history(
    aid: str,
    limit: int = 50,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Recent quotes for the SKU joined with realised invoice margins."""
    return quote_history_service.get_quote_history(db, aid=aid, limit=limit)


@router.get("/sku/{aid}/lineage")
def get_sku_lineage(
    aid: str,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """List lineage rows whose source_id encodes this SKU."""
    return lineage_service.list_lineage_for_aid(db, aid=aid)


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


# ---------------------------------------------------------------------------
# Phase 6 (Pricing Studio v3) — batch repricing endpoints.
# ---------------------------------------------------------------------------


class BatchCreateIn(BaseModel):
    """Request body for ``POST /pricing/batches``.

    ``rule`` is a discriminated union on ``kind`` — see
    ``services.pricing.batch.BatchRule``. Pydantic v2 validates the
    payload against the per-kind shape automatically.
    """

    aids: list[str]
    rule: dict[str, Any]
    scope_filter: dict[str, Any] = {}


class BatchCommitIn(BaseModel):
    dry_run: bool = False
    locked_aids: list[str] = []


# Process-local TTL cache for the GET batch endpoint (30s per plan).
_BATCH_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_BATCH_CACHE_TTL = 30.0


def _invalidate_batch_cache(batch_id: Optional[str] = None) -> None:
    if batch_id is None:
        _BATCH_CACHE.clear()
        return
    _BATCH_CACHE.pop(batch_id, None)


def _parse_rule(raw: dict[str, Any]):
    """Coerce the dict into the appropriate BatchRule subclass.

    Pydantic discriminated unions need the ``kind`` field to dispatch;
    we hand-dispatch here so the resulting validation error message
    names the offending field rather than the union as a whole.
    """
    from backend.services.pricing.batch import (
        CustomJsonLogicRule,
        FloorPlusRule,
        MatchCompetitorRule,
        PctMoveRule,
        TargetDb2Rule,
    )

    kind = raw.get("kind")
    rule_classes = {
        "floor_plus": FloorPlusRule,
        "pct_move": PctMoveRule,
        "match_competitor": MatchCompetitorRule,
        "target_db2": TargetDb2Rule,
        "custom_jsonlogic": CustomJsonLogicRule,
    }
    cls = rule_classes.get(kind)
    if cls is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"unknown rule kind: {kind!r}",
        )
    try:
        return cls.model_validate(raw)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)
        ) from exc


def _load_batch_items(db: Session, batch_id: UUID):
    from backend.models.pricing.batch import PricingBatch, PricingBatchItem

    batch = db.get(PricingBatch, batch_id)
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "batch not found")
    items = (
        db.query(PricingBatchItem)
        .filter(PricingBatchItem.batch_id == batch.id)
        .order_by(PricingBatchItem.aid.asc())
        .all()
    )
    return batch, items


@router.post("/batches", status_code=status.HTTP_201_CREATED)
def create_batch(
    body: BatchCreateIn,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create a batch + run preview in one call. Returns the full payload."""
    from backend.services.pricing.batch import (
        ScopeFilter,
        build_batch_preview,
        serialize_batch,
    )

    rule = _parse_rule(body.rule)
    try:
        scope = ScopeFilter.model_validate(body.scope_filter or {})
    except Exception as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)
        ) from exc

    batch, items = build_batch_preview(
        aids=body.aids,
        rule=rule,
        scope_filter=scope,
        db_session=db,
        actor=str(ctx.user_id),
    )
    db.commit()
    db.refresh(batch)
    payload = serialize_batch(batch, items)
    _invalidate_batch_cache(str(batch.id))
    return payload


@router.get("/batches/{batch_id}")
def get_batch(
    batch_id: UUID,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from backend.services.pricing.batch import serialize_batch

    key = str(batch_id)
    import time

    now = time.monotonic()
    cached = _BATCH_CACHE.get(key)
    if cached is not None and (now - cached[0]) < _BATCH_CACHE_TTL:
        return cached[1]

    batch, items = _load_batch_items(db, batch_id)
    payload = serialize_batch(batch, items)
    _BATCH_CACHE[key] = (now, payload)
    return payload


@router.post("/batches/{batch_id}/commit")
def commit_batch_endpoint(
    batch_id: UUID,
    body: BatchCommitIn,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Run ``commit_batch`` for the named batch."""
    from backend.models.pricing.audit import (
        PricingAuditAction,
        PricingAuditTargetKind,
    )
    from backend.services.pricing.audit import record_audit
    from backend.services.pricing.batch import (
        BatchAlreadyCommittedError,
        commit_batch,
    )

    batch, _items = _load_batch_items(db, batch_id)
    try:
        summary = commit_batch(
            batch=batch,
            db_session=db,
            actor=str(ctx.user_id),
            actor_user_id=ctx.user_id,
            locked_aids=body.locked_aids,
            dry_run=body.dry_run,
        )
    except BatchAlreadyCommittedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    # Audit the batch-level commit (one row) — proposal-level audits
    # are written by the approval workflow as each proposal submits.
    if not body.dry_run:
        record_audit(
            actor=str(ctx.user_id),
            action=PricingAuditAction.PROPOSAL_SUBMITTED,
            target_kind=PricingAuditTargetKind.SKU,
            target_id=f"batch:{batch.id}",
            after={
                "batch_id": str(batch.id),
                "created_proposals": len(summary["created_proposals"]),
                "routed_by_role": summary["routed_by_role"],
                "total_revenue_impact": summary["total_revenue_impact"],
            },
            session=db,
        )
    db.commit()
    _invalidate_batch_cache(str(batch_id))
    return summary


@router.post("/batches/{batch_id}/cancel")
def cancel_batch_endpoint(
    batch_id: UUID,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from backend.services.pricing.batch import (
        BatchAlreadyCommittedError,
        cancel_batch,
        serialize_batch,
    )

    batch, items = _load_batch_items(db, batch_id)
    try:
        cancel_batch(batch=batch, db_session=db)
    except BatchAlreadyCommittedError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    db.commit()
    db.refresh(batch)
    _invalidate_batch_cache(str(batch_id))
    return serialize_batch(batch, items)


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


# ---------------------------------------------------------------------------
# Phase 7 (Pricing Studio v3) — publish + rollback + price-book + PDF.
# ---------------------------------------------------------------------------


class PublishIn(BaseModel):
    """Request body for ``POST /pricing/sku/{aid}/publish``.

    ``effective_at`` is optional — when omitted or in the past we publish
    immediately; when in the future we persist to ``scheduled_publishes``.
    """

    price: Decimal
    effective_at: Optional[datetime] = None
    source_proposal_id: Optional[UUID] = None


class RollbackIn(BaseModel):
    receipt_id: UUID
    reason: str


@router.post("/sku/{aid}/publish", status_code=status.HTTP_201_CREATED)
def publish_sku_price(
    aid: str,
    body: PublishIn,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Publish a price for ``aid`` either immediately or on a schedule."""
    from backend.services.pricing.publish import (
        publish_price,
        schedule_publish,
        serialize_receipt,
    )

    effective_at = body.effective_at or datetime.now(timezone.utc)
    if effective_at.tzinfo is None:
        effective_at = effective_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)

    if effective_at > now:
        scheduled = schedule_publish(
            aid=aid,
            price=body.price,
            effective_at=effective_at,
            source_proposal_id=body.source_proposal_id,
            actor=str(ctx.user_id),
            db_session=db,
        )
        db.commit()
        return {
            "scheduled": True,
            "scheduled_publish": scheduled.model_dump(mode="json"),
        }

    receipt = publish_price(
        aid=aid,
        price=body.price,
        effective_at=effective_at,
        source_proposal_id=body.source_proposal_id,
        actor=str(ctx.user_id),
        db_session=db,
    )
    db.commit()
    # Re-fetch the persisted row so serialize_receipt sees the
    # post-commit state (notifications_dispatched, etc.).
    from backend.models.pricing.publish import PublishReceiptRow

    row = db.get(PublishReceiptRow, receipt.id)
    return {
        "scheduled": False,
        "receipt": serialize_receipt(row) if row else receipt.model_dump(mode="json"),
    }


@router.post("/sku/{aid}/rollback")
def rollback_sku_price(
    aid: str,
    body: RollbackIn,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Rollback a previously published price within the 72h window."""
    from backend.models.pricing.publish import PublishReceiptRow
    from backend.services.pricing.publish import (
        ReceiptAlreadyRolledBackError,
        ReceiptNotFoundError,
        RollbackWindowExpiredError,
        rollback_publish,
        serialize_receipt,
    )

    # Defensive: ensure the receipt is for this aid (so a wrong aid in
    # the URL doesn't silently roll back a different SKU).
    receipt = db.get(PublishReceiptRow, body.receipt_id)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "receipt not found")
    if receipt.aid != aid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"receipt {body.receipt_id} belongs to aid {receipt.aid}, not {aid}",
        )

    try:
        rollback_publish(
            receipt_id=body.receipt_id,
            reason=body.reason,
            actor=str(ctx.user_id),
            db_session=db,
        )
    except RollbackWindowExpiredError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ReceiptAlreadyRolledBackError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ReceiptNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc

    db.commit()
    db.refresh(receipt)
    return {"receipt": serialize_receipt(receipt)}


@router.get("/sku/{aid}/price-book")
def get_sku_price_book(
    aid: str,
    limit: int = Query(default=20, ge=1, le=200),
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return the recent price_book history for ``aid``."""
    from backend.services.pricing.publish import list_price_book

    rows = list_price_book(aid=aid, db_session=db, limit=limit)
    return {"aid": aid, "rows": rows}


@router.get("/proposals/{proposal_id}/pdf")
def get_proposal_pdf(
    proposal_id: UUID,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Any:
    """Branded export of a proposal. Returns PDF when available,
    HTML fallback otherwise (Content-Type advertises which one)."""
    from fastapi import Response

    from backend.models.pricing.audit import (
        PricingAuditAction,
        PricingAuditTargetKind,
    )
    from backend.services.pricing.audit import record_audit
    from backend.services.reports.proposal_pdf import render_proposal_pdf

    proposal = db.get(PricingProposal, proposal_id)
    if proposal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "proposal not found")

    body, content_type = render_proposal_pdf(
        proposal_id=proposal_id, db_session=db
    )

    # Record an audit row so the export is visible in the timeline.
    record_audit(
        actor=str(ctx.user_id),
        action=PricingAuditAction.PUSH_TO_QUOTING,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=proposal.article_id,
        after={
            "proposal_id": str(proposal_id),
            "export_format": content_type,
        },
        reason="proposal_pdf_exported",
        session=db,
    )
    db.commit()

    filename = f"proposal-{proposal_id}.pdf" if content_type.startswith("application/pdf") else f"proposal-{proposal_id}.html"
    return Response(
        content=body,
        media_type=content_type,
        headers={
            "Content-Disposition": f"inline; filename=\"{filename}\"",
        },
    )


# ---------------------------------------------------------------------------
# Phase 8 — A/B test + simulator endpoints
# ---------------------------------------------------------------------------


class AbTestCreateIn(BaseModel):
    aid: str
    control_price: Decimal
    variant_price: Decimal
    eligibility: dict[str, Any] | None = None
    criterion: dict[str, Any] | None = None
    target_sample: int = 30
    duration_days: int | None = 14
    success_metric: str | None = "db2_margin"
    hypothesis: str | None = None


class AbTestDecisionIn(BaseModel):
    decision: str  # 'promote' | 'hold'


class SimulateIn(BaseModel):
    aid: str
    control_price: Decimal
    variant_price: Decimal
    eligibility: dict[str, Any] | None = None
    target_sample: int = 30
    tier: str | None = None
    horizon_months: int = 12


def _serialize_ab_test(t) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "aid": t.aid,
        "control_price": str(t.control_price),
        "variant_price": str(t.treatment_price),
        "status": t.status,
        "decision_state": t.decision_state,
        "target_sample": t.target_sample,
        "eligibility": t.eligibility_json,
        "criterion": t.criterion_json,
        "duration_days": t.duration_days,
        "success_metric": t.success_metric,
        "hypothesis": t.hypothesis,
        "start_date": t.start_date.isoformat() if t.start_date else None,
        "end_date": t.end_date.isoformat() if t.end_date else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.post("/ab-tests", status_code=status.HTTP_201_CREATED)
def create_pricing_ab_test(
    body: AbTestCreateIn,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create a new A/B price test for ``aid``."""
    from backend.services.pricing import ab_test as ab_test_svc

    try:
        test = ab_test_svc.create_ab_test(
            aid=body.aid,
            control_price=body.control_price,
            variant_price=body.variant_price,
            eligibility=body.eligibility,
            criterion=body.criterion,
            target_sample=body.target_sample,
            actor=str(ctx.user_id),
            db_session=db,
            duration_days=body.duration_days,
            success_metric=body.success_metric,
            hypothesis=body.hypothesis,
        )
    except ab_test_svc.AbTestEligibilityEmptyError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"no eligible customers: {exc}"
        ) from exc
    db.commit()
    db.refresh(test)
    return {"ab_test": _serialize_ab_test(test)}


@router.get("/ab-tests/{test_id}")
def get_pricing_ab_test(
    test_id: UUID,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from backend.models import AbTest
    from backend.services.pricing import ab_test as ab_test_svc

    test = db.get(AbTest, test_id)
    if test is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ab_test not found")
    try:
        result = ab_test_svc.score_ab_test(test_id=test.id, db_session=db).to_dict()
    except ab_test_svc.AbTestNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return {
        "ab_test": _serialize_ab_test(test),
        "scoring": result,
    }


@router.post("/ab-tests/{test_id}/score")
def score_pricing_ab_test(
    test_id: UUID,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from backend.services.pricing import ab_test as ab_test_svc

    try:
        result = ab_test_svc.score_ab_test(test_id=test_id, db_session=db)
    except ab_test_svc.AbTestNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return {"scoring": result.to_dict()}


@router.post("/ab-tests/{test_id}/decision")
def decide_pricing_ab_test(
    test_id: UUID,
    body: AbTestDecisionIn,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from backend.services.pricing import ab_test as ab_test_svc

    if body.decision not in ("promote", "hold"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "decision must be 'promote' or 'hold'"
        )
    try:
        outcome = ab_test_svc.promote_or_hold(
            test_id=test_id,
            decision=body.decision,  # type: ignore[arg-type]
            actor=str(ctx.user_id),
            db_session=db,
        )
    except ab_test_svc.AbTestNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    db.commit()
    return outcome.to_dict()


@router.post("/simulate")
def simulate_pricing(
    body: SimulateIn,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Read-only simulation — no writes."""
    from backend.services.pricing.simulator import simulate

    return simulate(
        aid=body.aid,
        control_price=body.control_price,
        variant_price=body.variant_price,
        eligibility=body.eligibility,
        target_sample=body.target_sample,
        tier=body.tier,
        horizon_months=body.horizon_months,
        db_session=db,
    )


# ---------------------------------------------------------------------------
# Pricing Engine v1.4 — new endpoints (W1)
# ---------------------------------------------------------------------------
#
# These run the validated notebook engine (whitepaper v1.4) against the
# Scherzinger parquet files. Live alongside the legacy `/simulate` route
# so the UI can adopt them incrementally without breaking the existing
# workbench. Promotion to the canonical workbench BFF is Phase W3.


class ScoreAtPriceIn(BaseModel):
    aid: str
    candidate_price: Decimal
    as_of: str | None = None


@router.get("/v2/score/{aid}")
def v2_score(
    aid: str,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001
    db: Session = Depends(get_db),  # noqa: ARG001 (parquet-backed for v1)
) -> dict[str, Any]:
    """Full recommendation packet from the v1.4 engine."""
    from backend.services.pricing.engine_v2 import score_sku

    try:
        return score_sku(aid)
    except Exception as exc:  # noqa: BLE001 — surface the cause to the client
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, f"engine_v2 failed: {exc!s}"
        ) from exc


@router.post("/v2/score_at_price")
def v2_score_at_price(
    body: ScoreAtPriceIn,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001
    db: Session = Depends(get_db),  # noqa: ARG001
) -> dict[str, Any]:
    """Score a single candidate price for the Custom-card live preview."""
    from backend.services.pricing.engine_v2.orchestrator import score_at_custom_price

    try:
        return score_at_custom_price(
            body.aid, float(body.candidate_price), as_of=body.as_of
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, f"engine_v2 failed: {exc!s}"
        ) from exc


# ---------------------------------------------------------------------------
# Phase 9 — Alerts endpoints
# ---------------------------------------------------------------------------


def _serialize_alert(alert) -> dict[str, Any]:
    return {
        "id": str(alert.id),
        "kind": alert.kind,
        "spec_json": dict(alert.spec_json or {}),
        "scope": {
            "aid": alert.scope_aid,
            "cluster": alert.scope_cluster,
            "family": alert.scope_family,
        },
        "channels": list(alert.channels or []),
        "created_by": alert.created_by,
        "enabled": alert.enabled,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
    }


def _serialize_alert_event(event, alert=None) -> dict[str, Any]:
    out = {
        "id": str(event.id),
        "alert_id": str(event.alert_id),
        "triggered_at": (
            event.triggered_at.isoformat() if event.triggered_at else None
        ),
        "payload": dict(event.payload or {}),
        "channels_dispatched": list(event.channels_dispatched or []),
    }
    if alert is not None:
        out["kind"] = alert.kind
        out["scope"] = {
            "aid": alert.scope_aid,
            "cluster": alert.scope_cluster,
            "family": alert.scope_family,
        }
    return out


@router.post("/alerts", status_code=status.HTTP_201_CREATED)
def create_pricing_alert(
    body: dict[str, Any],
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create an alert. Body is a raw spec dict (discriminated by ``kind``)."""
    from pydantic import ValidationError

    from backend.services.pricing import alerts as alerts_service

    # Force the spec's created_by to the authenticated user so clients
    # can't impersonate. We accept (and overwrite) any incoming value.
    payload = dict(body or {})
    payload["created_by"] = str(ctx.user_id)
    try:
        spec = alerts_service.parse_spec(payload)
    except ValidationError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"invalid alert spec: {exc.errors()}"
        ) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    try:
        alert = alerts_service.create_alert(spec, db)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    db.commit()
    db.refresh(alert)
    return {"alert": _serialize_alert(alert)}


@router.get("/alerts")
def list_pricing_alerts(
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
    include_disabled: bool = Query(False),
) -> dict[str, Any]:
    """List the authenticated user's alerts."""
    from backend.services.pricing import alerts as alerts_service

    rows = alerts_service.list_alerts_for_user(
        str(ctx.user_id), db, include_disabled=include_disabled
    )
    return {"alerts": [_serialize_alert(r) for r in rows]}


@router.delete("/alerts/{alert_id}")
def disable_pricing_alert(
    alert_id: UUID,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Soft-disable an alert (sets ``enabled=False``)."""
    from backend.services.pricing import alerts as alerts_service

    try:
        alert = alerts_service.get_alert(alert_id, db)
    except alerts_service.AlertNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    if alert.created_by != str(ctx.user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your alert")
    alerts_service.disable_alert(alert_id, db)
    db.commit()
    db.refresh(alert)
    return {"alert": _serialize_alert(alert)}


@router.get("/alerts/inbox")
def get_pricing_alert_inbox(
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
    limit: int = Query(100, ge=1, le=500),
) -> dict[str, Any]:
    """Return the authenticated user's recent triggered alert events."""
    from backend.models.pricing.alerts import PricingAlert
    from backend.services.pricing import alerts as alerts_service

    events = alerts_service.get_alert_inbox(str(ctx.user_id), db, limit=limit)
    # Eager-load the parent alert for each event so the wire payload
    # carries kind + scope without N+1 queries on the frontend.
    out = []
    for ev in events:
        alert = db.get(PricingAlert, ev.alert_id)
        out.append(_serialize_alert_event(ev, alert=alert))
    return {"events": out}


@router.post("/alerts/{alert_id}/test")
def test_pricing_alert(
    alert_id: UUID,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Manually evaluate a single alert (QA seam).

    Fires the alert if the trigger condition is met and returns a
    summary including the event_id + payload.
    """
    from backend.services.pricing import alerts as alerts_service
    from backend.services.pricing import alerts_runner

    try:
        alert = alerts_service.get_alert(alert_id, db)
    except alerts_service.AlertNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    if alert.created_by != str(ctx.user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your alert")
    result = alerts_runner.run_for_alert(alert_id, db)
    db.commit()
    return result
