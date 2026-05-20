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

import logging
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models import AbTest, Note, Notification, User
from backend.services import audit_service
from backend.services import workflow_service
from backend.services import ab_lifecycle_service, ab_simulation_service
from backend.services import shell as shell_service
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
    # Phase 11 — share a Frank decision with Till or Heiko. Writes a
    # notification row for the recipient, a note row for the sender, and
    # an audit row tying both back to the recommendation.
    "share_decision",
}


_PERSONA_FRIENDLY = {"till": "Till (MD)", "heiko": "Heiko (Sales)", "frank": "Frank (Pricing)"}
_SHAREABLE_PERSONAS = {"till", "heiko"}
# "both" is a pseudo-recipient that fans out atomically into one notification
# per persona in _SHAREABLE_PERSONAS. Kept separate so the validator below can
# accept it without polluting the per-recipient User-lookup path.
_SHAREABLE_GROUPS = {"both"}


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


def _share_decision(
    db: Session, ctx: AuthContext, body: dict[str, Any], audit_hash: str
) -> dict[str, Any]:
    """Phase 11 — fan a Frank decision out to Till or Heiko.

    Side effects:
      * One ``Notification`` row for the recipient (unread, links back to
        the source surface so the recipient can click through).
      * One ``Note`` row owned by the sender (Frank's own record of what
        he shared, with the recipient + note text).
      * The audit row is written by the dispatcher around this call.
    """
    recipient = (body.get("recipient") or "till").lower().strip()
    if recipient not in _SHAREABLE_PERSONAS and recipient not in _SHAREABLE_GROUPS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"share_decision recipient must be one of "
            f"{sorted(_SHAREABLE_PERSONAS | _SHAREABLE_GROUPS)}",
        )
    # Resolve fan-out targets: a single persona stays single; "both" expands
    # into the full _SHAREABLE_PERSONAS set so one request writes one
    # notification per persona atomically (single DB transaction).
    if recipient in _SHAREABLE_GROUPS:
        fanout_recipients = sorted(_SHAREABLE_PERSONAS)
    else:
        fanout_recipients = [recipient]
    target_id = body.get("target_id") or body.get("recommendation_id") or body.get("aid")
    if not target_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "share_decision requires target_id (recommendation/article)",
        )

    headline = str(body.get("headline") or body.get("title") or f"Decision {target_id}")
    note_text = (body.get("note") or "").strip() or None
    link = body.get("link") or f"/action-center?focus=rec-{target_id}"

    sender_name = getattr(ctx, "name", None) or "Frank"
    fanout_results: list[dict[str, Any]] = []
    try:
        for r in fanout_recipients:
            recipient_user = (
                db.query(User)
                .filter(User.ui_persona_default == r, User.disabled.is_(False))
                .order_by(User.created_at.asc())
                .first()
            )

            notification_id: str | None = None
            if recipient_user is not None:
                notif = shell_service.notify(
                    db,
                    user_id=recipient_user.id,
                    tone="info",
                    title=f"{sender_name} shared: {headline[:120]}",
                    sub=(
                        note_text
                        if note_text
                        else f"Audit-trail receipt attached · audit_hash {audit_hash[:12]}…"
                    ),
                    link=link,
                    # Suffix audit_hash with recipient so fan-out doesn't collide
                    # on the (kind, external_id) idempotency key.
                    external_id=f"share:{audit_hash[:16]}:{r}",
                )
                notification_id = str(notif.id)

            fanout_results.append(
                {
                    "recipient": r,
                    "recipient_user_id": str(recipient_user.id) if recipient_user is not None else None,
                    "recipient_resolved": recipient_user is not None,
                    "notification_id": notification_id,
                }
            )
    except Exception:
        # Iron rule §1: never poison the session silently. A mid-loop failure
        # (e.g. notify() flush raises) would otherwise leave a partially-
        # flushed transaction that FastAPI's get_db wrapper rolls back, but
        # without any audit trail of why. Rollback explicitly + log here, and
        # surface a 500 so the caller can retry.
        logger.exception(
            "share_decision fan-out failed mid-loop recipient=%s fanout=%s",
            recipient,
            fanout_recipients,
        )
        db.rollback()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "share_decision fan-out failed",
        )

    # Sender-owned note as Frank's record of what was sent (one note per call,
    # listing all recipients).
    recipients_label = ", ".join(
        _PERSONA_FRIENDLY.get(r, r) for r in fanout_recipients
    )
    sender_note = Note(
        user_id=ctx.user_id,
        title=f"Shared with {recipients_label}: {headline[:160]}",
        body=(
            (note_text + "\n\n" if note_text else "")
            + f"target: {target_id}\nrecipient: {recipient}\nlink: {link}\n"
            + f"audit_hash: {audit_hash}\n"
        ),
        pinned=False,
    )
    db.add(sender_note)
    db.commit()
    db.refresh(sender_note)

    # Legacy shape: top-level recipient/user/resolved/notification fields
    # mirror the FIRST fanout entry (back-compat with existing consumers).
    primary = fanout_results[0] if fanout_results else {}
    return {
        "recipient": recipient,
        "recipient_user_id": primary.get("recipient_user_id"),
        "recipient_resolved": primary.get("recipient_resolved", False),
        "notification_id": primary.get("notification_id"),
        "note_id": str(sender_note.id),
        "share_link": link,
        "audit_hash": audit_hash,
        "fanout": fanout_results,
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
    elif kind == "share_decision":
        extras = _share_decision(db, ctx, body, row.audit_hash) or {}

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
