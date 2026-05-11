"""Phase 12 — consolidated action dispatcher.

Every state-changing call from the UI hits ``POST /api/v1/actions/{kind}``.
The handler:

  1. Validates the kind is in the allow-list.
  2. Looks up the optional ``x-pryzm-idempotency-key`` header. If a row already
     exists for this (actor, key) tuple we replay the response instead of
     producing a duplicate audit row.
  3. Runs the per-kind side-effect (currently: write an audit row; some kinds
     also schedule an A/B test or flip notification.unread).
  4. Returns the audit row + any kind-specific extra fields.

The list of kinds follows MIGRATION_PLAN §18 P12.T2.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models import AbTest, Notification
from backend.services import audit_service
from backend.services import workflow_service
from backend.services import ab_lifecycle_service, ab_simulation_service
from backend.services.action_center.composer import (
    invalidate_cache as invalidate_action_center_cache,
)

router = APIRouter(prefix="/actions", tags=["actions"])

ACTION_KINDS = {
    "accept_recommendation",
    "decline_recommendation",
    "partial_accept",
    "snooze_recommendation",
    "queue_renewal",
    "start_ab_test",
    "stop_ab_test",
    "hold_ab_test",
    "promote_ab_test",
    "quote_approve",
    "quote_counter",
    "quote_decline",
    "quote_hold",
    "quote_bulk",
    "studio_accept",
    "briefing_forward",
    "briefing_pdf",
    "briefing_email",
    "guardrail_edit_request",
    "guardrail_apply",
    "forecast_override",
    "notification_read",
    "section_save",
    "section_remove",
}


def _target_from_body(body: dict[str, Any]) -> tuple[str | None, str | None]:
    target_type = body.get("target_type") or body.get("targetType")
    target_id = body.get("target_id") or body.get("targetId") or body.get("aid")
    return target_type, str(target_id) if target_id is not None else None


def _maybe_start_ab_test(
    db: Session, ctx: AuthContext, body: dict[str, Any], audit_hash: str
) -> dict[str, Any] | None:
    """For ``start_ab_test`` write the ab_tests row alongside the audit row."""
    aid = body.get("aid") or body.get("target_id")
    if not aid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "start_ab_test requires 'aid'")
    test = AbTest(
        id=uuid4(),
        aid=str(aid),
        slice_pct=float(body.get("slice_pct") or 50.0),
        start_date=datetime.utcnow(),
        end_date=None,
        control_price=float(body.get("control_price") or 0),
        treatment_price=float(body.get("treatment_price") or 0),
        status="running",
        decision_state=ab_lifecycle_service.STATE_RUNNING,
        created_by=ctx.user_id,
        audit_hash=audit_hash,
        success_metric=body.get("success_metric") or "margin",
        duration_days=body.get("duration_days"),
        hypothesis=body.get("hypothesis"),
        simulation_status="pending",
    )
    db.add(test)
    db.flush()

    # Pre-launch simulation: pin a deterministic seed off the test id so
    # repeated calls in tests stay stable.
    sim = ab_simulation_service.run(
        db,
        test,
        stage=ab_simulation_service.STAGE_PRE_LAUNCH,
        seed=int(test.id.int % (2**31)),
    )
    launch_ready = sim.recommendation == ab_simulation_service.RECOMMEND_LAUNCH
    db.commit()
    return {
        "ab_test_id": str(test.id),
        "aid": test.aid,
        "status": test.status,
        "decision_state": test.decision_state,
        "simulation_status": test.simulation_status,
        "simulation_summary": sim.to_dict(),
        "launch_readiness": "ready" if launch_ready else "blocked",
        "blockers": sim.blockers,
    }


def _load_test(db: Session, body: dict[str, Any], *, kind: str) -> AbTest:
    test_id = body.get("test_id") or body.get("ab_test_id")
    if not test_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{kind} requires 'test_id'")
    try:
        test = db.get(AbTest, UUID(str(test_id)))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid test_id") from e
    if test is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ab_test not found")
    return test


def _lifecycle_transition(
    db: Session, body: dict[str, Any], *, kind: str, target: str
) -> dict[str, Any] | None:
    test = _load_test(db, body, kind=kind)
    reason = body.get("reason") or body.get("status_reason")
    try:
        extras = ab_lifecycle_service.transition(db, test, target=target, reason=reason)
    except ab_lifecycle_service.LifecycleError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    db.commit()
    return {
        "ab_test_id": str(test.id),
        "status": test.status,
        "decision_state": test.decision_state,
        **extras,
    }


def _maybe_mark_notification_read(
    db: Session, ctx: AuthContext, body: dict[str, Any]
) -> dict[str, Any] | None:
    external_id = body.get("notification_id") or body.get("external_id")
    if not external_id:
        return None
    notif = (
        db.query(Notification)
        .filter_by(user_id=ctx.user_id, external_id=str(external_id))
        .one_or_none()
    )
    if notif is None:
        try:
            notif = db.get(Notification, UUID(str(external_id)))
        except ValueError:
            notif = None
        if notif is None or notif.user_id != ctx.user_id:
            return None
    notif.unread = False
    db.commit()
    return {"notification_id": str(external_id), "unread": False}


@router.post("/{kind}")
def dispatch_action(
    kind: str,
    body: dict[str, Any] = Body(default_factory=dict),
    idempotency_key: str | None = Header(default=None, alias="x-pryzm-idempotency-key"),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if kind not in ACTION_KINDS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"unknown action kind: {kind!r} (allowed: {sorted(ACTION_KINDS)})",
        )

    # Replay short-circuit — same actor + same key always returns the same row.
    existing = audit_service.find_replay(db, ctx.user_id, idempotency_key)
    if existing is not None:
        return {"replay": True, "audit": audit_service.serialize(existing)}

    target_type, target_id = _target_from_body(body)
    delta_pp = body.get("delta_pp")
    after = body.get("after") or body
    before = body.get("before")

    row = audit_service.record(
        db,
        actor_user_id=ctx.user_id,
        actor_persona=ctx.persona,
        kind=kind,
        target_type=target_type,
        target_id=target_id,
        before=before if isinstance(before, dict) else None,
        after=after if isinstance(after, dict) else None,
        delta_pp=float(delta_pp) if delta_pp is not None else None,
        idempotency_key=idempotency_key,
    )

    extras: dict[str, Any] = {}
    if kind == "start_ab_test":
        extras = _maybe_start_ab_test(db, ctx, body, row.audit_hash) or {}
    elif kind == "stop_ab_test":
        extras = _lifecycle_transition(
            db, body, kind=kind, target=ab_lifecycle_service.STATE_STOPPED
        ) or {}
    elif kind == "hold_ab_test":
        extras = _lifecycle_transition(
            db, body, kind=kind, target=ab_lifecycle_service.STATE_HELD
        ) or {}
    elif kind == "promote_ab_test":
        extras = _lifecycle_transition(
            db, body, kind=kind, target=ab_lifecycle_service.STATE_PROMOTED
        ) or {}
    elif kind == "notification_read":
        extras = _maybe_mark_notification_read(db, ctx, body) or {}

    if kind in {
        "accept_recommendation",
        "partial_accept",
        "decline_recommendation",
        "snooze_recommendation",
        "queue_renewal",
        "start_ab_test",
    }:
        rec = workflow_service.ensure_recommendation(db, body=body, actor_user_id=ctx.user_id)
        status_by_kind = {
            "accept_recommendation": "accepted_as_proposal",
            "partial_accept": "partial_proposed",
            "decline_recommendation": "rejected",
            "snooze_recommendation": "snoozed",
            "queue_renewal": "queued_for_renewal",
            "start_ab_test": "in_ab_test",
        }
        workflow_service.record_event(
            db,
            recommendation=rec,
            audit=row,
            event_kind=kind,
            to_status=status_by_kind[kind],
            actor_user_id=ctx.user_id,
            payload=body,
        )
        if kind in {"accept_recommendation", "partial_accept"}:
            proposal = workflow_service.create_pricing_proposal(
                db,
                recommendation=rec,
                actor_user_id=ctx.user_id,
                body=body,
                status="draft",
            )
            extras["recommendation"] = workflow_service.serialize_recommendation(rec)
            extras["proposal"] = workflow_service.serialize_proposal(proposal)
        else:
            extras["recommendation"] = workflow_service.serialize_recommendation(rec)
        db.commit()

    # Drop the 60s composer cache so the next /action-center fetch reflects this row.
    invalidate_action_center_cache()

    return {"replay": False, "audit": audit_service.serialize(row), **extras}
