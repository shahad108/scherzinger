"""Workflow helpers for recommendations, proposals, and report jobs."""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models import AuditLog, PricingProposal, Recommendation, RecommendationEvent, ReportJob

PROPOSAL_STATUSES = {
    "draft",
    "pending_approval",
    "approved",
    "implemented",
    "rejected",
    # Phase 5 — added by the approval workflow.
    "changes_requested",
    "recalled",
}


def recommendation_ref(body: dict[str, Any]) -> str:
    return str(
        body.get("recommendation_id")
        or body.get("recommendationId")
        or body.get("target_id")
        or body.get("targetId")
        or body.get("aid")
        or "manual"
    )


def serialize_recommendation(row: Recommendation) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "source_kind": row.source_kind,
        "source_ref": row.source_ref,
        "article_id": row.article_id,
        "customer_id": row.customer_id,
        "cluster": row.cluster,
        "title": row.title,
        "status": row.status,
        "authority": row.authority,
        "impact_estimate": float(row.impact_estimate) if row.impact_estimate is not None else None,
        "payload": row.payload or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def serialize_proposal(row: PricingProposal) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "recommendation_id": str(row.recommendation_id) if row.recommendation_id else None,
        "article_id": row.article_id,
        "current_price": float(row.current_price) if row.current_price is not None else None,
        "proposed_price": float(row.proposed_price) if row.proposed_price is not None else None,
        "delta_pp": float(row.delta_pp) if row.delta_pp is not None else None,
        "status": row.status,
        "approval_required": row.approval_required,
        "payload": row.payload or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def get_recommendation_by_ref(db: Session, source_ref: str) -> Recommendation | None:
    return db.query(Recommendation).filter_by(source_ref=source_ref).one_or_none()


def get_recommendation_status_map(db: Session, refs: list[str]) -> dict[str, Recommendation]:
    if not refs:
        return {}
    rows = db.query(Recommendation).filter(Recommendation.source_ref.in_(refs)).all()
    return {r.source_ref: r for r in rows}


def ensure_recommendation(
    db: Session,
    *,
    body: dict[str, Any],
    actor_user_id: UUID,
) -> Recommendation:
    source_ref = recommendation_ref(body)
    existing = get_recommendation_by_ref(db, source_ref)
    if existing is not None:
        patch_payload = dict(existing.payload or {})
        patch_payload.update(body.get("after") if isinstance(body.get("after"), dict) else {})
        existing.payload = patch_payload
        existing.updated_at = datetime.utcnow()
        return existing

    after = body.get("after") if isinstance(body.get("after"), dict) else {}
    title = str(
        body.get("title")
        or after.get("headline")
        or after.get("title")
        or body.get("headline")
        or source_ref
    )
    source_kind = str(body.get("source_kind") or body.get("sourceKind") or body.get("target_type") or "action_center")
    rec = Recommendation(
        source_kind=source_kind,
        source_ref=source_ref,
        article_id=body.get("article_id") or body.get("articleId") or body.get("aid"),
        customer_id=body.get("customer_id") or body.get("customerId"),
        cluster=body.get("cluster"),
        title=title[:300],
        status="open",
        owner_user_id=actor_user_id,
        authority=body.get("authority"),
        impact_estimate=body.get("impact_estimate") or body.get("impactEstimate"),
        payload={**after, **body},
    )
    db.add(rec)
    db.flush()
    return rec


def record_event(
    db: Session,
    *,
    recommendation: Recommendation,
    audit: AuditLog | None,
    event_kind: str,
    to_status: str,
    actor_user_id: UUID,
    payload: dict[str, Any] | None = None,
) -> RecommendationEvent:
    old_status = recommendation.status
    recommendation.status = to_status
    recommendation.updated_at = datetime.utcnow()
    ev = RecommendationEvent(
        recommendation_id=recommendation.id,
        audit_id=audit.id if audit else None,
        event_kind=event_kind,
        from_status=old_status,
        to_status=to_status,
        actor_user_id=actor_user_id,
        payload=payload or {},
    )
    db.add(ev)
    db.flush()
    return ev


def create_pricing_proposal(
    db: Session,
    *,
    recommendation: Recommendation,
    actor_user_id: UUID,
    body: dict[str, Any],
    status: str = "draft",
) -> PricingProposal:
    if status not in PROPOSAL_STATUSES:
        status = "draft"
    article_id = (
        body.get("article_id")
        or body.get("articleId")
        or body.get("aid")
        or recommendation.article_id
    )
    if not article_id:
        article_id = recommendation.source_ref
    proposal = PricingProposal(
        recommendation_id=recommendation.id,
        article_id=str(article_id),
        current_price=body.get("current_price") or body.get("currentPrice"),
        proposed_price=body.get("proposed_price") or body.get("proposedPrice"),
        delta_pp=body.get("delta_pp"),
        status=status,
        approval_required=bool(body.get("approval_required") or body.get("approvalRequired") or False),
        created_by=actor_user_id,
        payload=body,
    )
    db.add(proposal)
    db.flush()
    return proposal


def latest_proposal_for_recommendation(db: Session, recommendation_id: UUID) -> PricingProposal | None:
    return (
        db.query(PricingProposal)
        .filter_by(recommendation_id=recommendation_id)
        .order_by(PricingProposal.created_at.desc())
        .first()
    )


def serialize_report(row: ReportJob) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "screen": row.screen,
        "filters": row.filters or {},
        "status": row.status,
        "artifact_url": row.artifact_url,
        "payload": row.payload or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
