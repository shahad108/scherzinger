"""Approval workflow service — proposal submit, decide, recall, inbox.

This sits between the HTTP layer (``api/v1/pricing.py`` + the new
``api/v1/approvals.py``) and the rules engine (``approval_rules.py``).

Responsibilities:
  - Build an ``ApprovalInstance`` from a freshly-submitted proposal by
    consulting ``approval_rules.should_route_for_approval`` and laying
    out one step per routed role.
  - Apply approver decisions: write an ``ApprovalAction`` row, update
    the matching ``steps[current_step]`` entry, advance / terminate the
    instance, flip the proposal status, write the mirroring audit row,
    publish the SSE event.
  - Build the inbox view for an approver (proposals where the next step
    role matches one of the caller's roles).
  - Build the stepper-shape response used by the proposal context panel.

All mutations are session-scoped — the caller commits.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models import PricingProposal
from backend.models.pricing.approval import (
    ApprovalAction,
    ApprovalDecisionKind,
    ApprovalInstance,
    ApprovalStepState,
)
from backend.models.pricing.audit import PricingAuditAction, PricingAuditTargetKind
from backend.services.pricing.approval_rules import (
    ApprovalDecision,
    Proposal as RulesProposal,
    should_route_for_approval,
)
from backend.services.pricing.audit import record_audit

logger = logging.getLogger(__name__)


# Map between the workflow decision kind and the per-step state we write
# into ``approval_instances.steps[i].decision``.
_STEP_STATE_FOR_DECISION = {
    ApprovalDecisionKind.APPROVE: ApprovalStepState.APPROVED,
    ApprovalDecisionKind.REJECT: ApprovalStepState.REJECTED,
    ApprovalDecisionKind.REQUEST_CHANGES: ApprovalStepState.CHANGES_REQUESTED,
}

# Map decision → (proposal status, audit action, SSE event topic) so the
# state-transition table is in one place rather than duplicated across
# code paths.
_DECISION_OUTCOMES: dict[ApprovalDecisionKind, dict[str, str]] = {
    ApprovalDecisionKind.APPROVE: {
        "status": "approved",
        "audit_action": PricingAuditAction.PROPOSAL_APPROVED.value,
        "event_topic": "proposal.approved",
    },
    ApprovalDecisionKind.REJECT: {
        "status": "rejected",
        "audit_action": PricingAuditAction.PROPOSAL_REJECTED.value,
        "event_topic": "proposal.rejected",
    },
    ApprovalDecisionKind.REQUEST_CHANGES: {
        # "changes_requested" is in PROPOSAL_STATUSES (workflow_service.py) so
        # downstream consumers (PATCH validators, persona-overview, reports)
        # treat it as a valid editable state, not a 500.
        "status": "changes_requested",
        "audit_action": PricingAuditAction.PROPOSAL_CHANGES_REQUESTED.value,
        "event_topic": "proposal.changes_requested",
    },
}


class ApprovalWorkflowError(Exception):
    """Raised for caller-fixable workflow errors (mapped to 4xx by the API)."""


# ---------------------------------------------------------------------------
# Rules-context construction
# ---------------------------------------------------------------------------


def _decimal_or_none(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:  # pragma: no cover — defensive
        return None


def _rules_proposal_from_db(proposal: PricingProposal) -> RulesProposal:
    """Project the persisted proposal into the rules-engine input shape.

    ``delta_pct`` is computed from current/proposed when not pre-stored;
    ``delta_pp`` is read from the dedicated column. ``tier``,
    ``effective_in_hours``, ``customer_id`` come from the proposal's
    JSONB payload (where the Studio composer stashed them).
    """
    payload: dict[str, Any] = dict(proposal.payload or {})
    current = _decimal_or_none(proposal.current_price)
    proposed = _decimal_or_none(proposal.proposed_price)
    delta_pp = _decimal_or_none(proposal.delta_pp)

    delta_pct = 0.0
    if current and proposed and current != 0:
        try:
            delta_pct = float((proposed - current) / current * 100)
        except Exception:  # pragma: no cover — defensive
            delta_pct = 0.0
    # Studio can short-circuit by stashing delta_pct on the payload directly
    # (e.g. when proposed/current weren't both available at compose time).
    if payload.get("delta_pct") is not None:
        try:
            delta_pct = float(payload["delta_pct"])
        except (TypeError, ValueError):
            pass

    tier = str(payload.get("tier") or payload.get("customer_tier") or "C")
    effective = payload.get("effective_in_hours")
    try:
        effective_in_hours = float(effective) if effective is not None else 999.0
    except (TypeError, ValueError):
        effective_in_hours = 999.0

    return RulesProposal(
        delta_pct=delta_pct,
        delta_pp=float(delta_pp) if delta_pp is not None else 0.0,
        tier=tier,
        effective_in_hours=effective_in_hours,
        customer_id=payload.get("customer_id"),
        aid=proposal.article_id,
        extras={k: v for k, v in payload.items() if k not in {"delta_pct", "tier", "effective_in_hours", "customer_id"}},
    )


def _initial_steps(roles: Iterable[str]) -> list[dict[str, Any]]:
    return [
        {
            "role": role,
            "decision": ApprovalStepState.PENDING.value,
            "actor": None,
            "at": None,
            "comment": None,
        }
        for role in roles
    ]


# ---------------------------------------------------------------------------
# Live wiring helpers
# ---------------------------------------------------------------------------


def _publish_event(topic: str, *, proposal_id: UUID, aid: Optional[str] = None,
                   extra: Optional[dict[str, Any]] = None) -> None:
    """Best-effort SSE publish. Must not raise into the request path."""
    try:
        from backend.services.events import publish_sync

        payload: dict[str, Any] = {"proposal_id": str(proposal_id)}
        if extra:
            payload.update(extra)
        publish_sync(topic, payload, aid=aid)
    except Exception:
        logger.exception("approval_workflow.publish %s failed proposal_id=%s", topic, proposal_id)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def serialize_instance(instance: ApprovalInstance) -> dict[str, Any]:
    return {
        "id": str(instance.id),
        "proposal_id": str(instance.proposal_id),
        "current_step": instance.current_step,
        "steps": list(instance.steps or []),
        "created_at": instance.created_at.isoformat() if instance.created_at else None,
        "updated_at": instance.updated_at.isoformat() if instance.updated_at else None,
    }


def submit_proposal_for_approval(
    *,
    session: Session,
    proposal: PricingProposal,
    actor: str,
) -> tuple[ApprovalInstance, ApprovalDecision]:
    """Route a submitted proposal through the rules engine.

    Side effects:
      - Creates one ``ApprovalInstance`` row with one step per routed role.
      - If the decision auto-approves OR routes to zero approvers, marks
        the proposal as ``approved`` immediately and emits
        ``proposal.approved``.
      - Otherwise marks the proposal as ``pending_approval`` and emits
        ``proposal.submitted``.
      - Always writes a ``proposal_submitted`` audit row.

    Returns the (instance, decision) pair so the caller can serialise.
    """
    decision = should_route_for_approval(_rules_proposal_from_db(proposal))

    # The plan calls for one step per routed role. Blocked proposals get
    # routed to whichever blocking role the rule names (e.g.
    # ``needs_lead_time``) so the approver inbox still surfaces them —
    # a future iteration can teach the UI to render those differently.
    steps = _initial_steps(decision.needs)
    instance = ApprovalInstance(
        proposal_id=proposal.id,
        current_step=0,
        steps=steps,
    )
    session.add(instance)
    session.flush()

    auto_approve_now = decision.auto_approve and not decision.block and not decision.needs
    if auto_approve_now:
        proposal.status = "approved"
        proposal.approval_required = False
    else:
        proposal.status = "pending_approval"
        proposal.approval_required = True
    proposal.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Always write the audit row for the submit itself.
    record_audit(
        actor=actor,
        action=PricingAuditAction.PROPOSAL_SUBMITTED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=proposal.article_id,
        before=None,
        after={
            "proposal_id": str(proposal.id),
            "aid": proposal.article_id,
            "needs": list(decision.needs),
            "auto_approve": auto_approve_now,
            "thresholds_hit": list(decision.thresholds_hit),
        },
        session=session,
    )

    if auto_approve_now:
        record_audit(
            actor="system",
            action=PricingAuditAction.PROPOSAL_APPROVED,
            target_kind=PricingAuditTargetKind.SKU,
            target_id=proposal.article_id,
            after={
                "proposal_id": str(proposal.id),
                "aid": proposal.article_id,
                "auto_approve_rule": [r for r in decision.thresholds_hit] or None,
            },
            session=session,
        )
        _publish_event(
            "proposal.approved",
            proposal_id=proposal.id,
            aid=proposal.article_id,
            extra={"auto_approve": True},
        )
        # Phase 6 — auto-approved proposals immediately mark the linked
        # batch item committed. The batch_subscribers helper is a no-op
        # when the proposal isn't linked to a batch.
        try:
            from backend.services.pricing import batch_subscribers

            batch_subscribers.on_proposal_decided(
                proposal_id=proposal.id,
                decision="approve",
                db_session=session,
            )
        except Exception:
            logger.exception(
                "pricing:approval_workflow:submit batch_subscribers failed proposal_id=%s",
                proposal.id,
            )
            try:
                session.rollback()
            except Exception:
                pass
    else:
        _publish_event(
            "proposal.submitted",
            proposal_id=proposal.id,
            aid=proposal.article_id,
            extra={"needs": list(decision.needs), "thresholds_hit": list(decision.thresholds_hit)},
        )

    return instance, decision


def _next_pending_step_index(instance: ApprovalInstance) -> Optional[int]:
    for i, step in enumerate(instance.steps or []):
        if step.get("decision") == ApprovalStepState.PENDING.value:
            return i
    return None


def apply_decision(
    *,
    session: Session,
    instance: ApprovalInstance,
    proposal: PricingProposal,
    actor: str,
    actor_roles: Iterable[str],
    decision: ApprovalDecisionKind,
    comment: Optional[str],
) -> ApprovalInstance:
    """Apply an approver decision to an instance.

    Validates the caller's roles cover the current pending step. Writes
    the action row, advances ``current_step`` on approve, flips the
    proposal status terminally on reject/request_changes/last-approve,
    writes the mirroring audit row, publishes the SSE event.

    MF3 (Phase-5 review): the approval_instance row is re-fetched with
    ``SELECT ... FOR UPDATE`` at the top so two approvers passing through
    concurrently can't both observe the same pending step and double-
    apply. The second transaction blocks until the first commits, then
    re-reads the freshly-updated state and bounces out via the
    no-pending-step / proposal-terminal guard below.
    """
    # Acquire a row-level lock on the approval_instance for the duration
    # of this transaction. ``refresh(with_for_update=True)`` issues a
    # ``SELECT ... FOR UPDATE`` against the row and re-syncs the
    # ORM-attached instance so we read the latest steps/current_step.
    session.refresh(instance, with_for_update=True)
    # Also refresh the proposal — the parallel transaction may have just
    # flipped its status, and the row lock on the instance doesn't cover
    # the proposal row. Re-reading here means the terminal-status guard
    # below sees the post-commit truth.
    session.refresh(proposal)

    if proposal.status in {"approved", "rejected", "implemented"}:
        raise ApprovalWorkflowError(f"proposal is already {proposal.status!r}")

    current_index = _next_pending_step_index(instance)
    if current_index is None:
        raise ApprovalWorkflowError("approval instance has no pending step")

    steps = list(instance.steps or [])
    step = dict(steps[current_index])
    required_role = step.get("role")
    if required_role and required_role not in set(actor_roles):
        raise ApprovalWorkflowError(
            f"caller roles do not include the next approver role {required_role!r}"
        )

    now = datetime.now(timezone.utc)

    # Persist the raw action row first — this is the audit-of-record.
    action_row = ApprovalAction(
        approval_instance_id=instance.id,
        actor=actor,
        decision=decision.value,
        comment=comment,
    )
    session.add(action_row)
    session.flush()

    # Update the embedded steps[current_index] entry. Use a fresh dict
    # so SQLAlchemy notices the JSONB mutation on flush.
    step.update(
        {
            "decision": _STEP_STATE_FOR_DECISION[decision].value,
            "actor": actor,
            "at": now.isoformat(),
            "comment": comment,
        }
    )
    steps[current_index] = step

    # Decide whether to advance or terminate.
    terminal = decision in (ApprovalDecisionKind.REJECT, ApprovalDecisionKind.REQUEST_CHANGES)
    next_index = current_index + 1
    if not terminal and next_index < len(steps):
        instance.current_step = next_index
    else:
        # Either reject/request_changes (terminal) or final approve.
        instance.current_step = next_index if not terminal else current_index
    instance.steps = steps
    instance.updated_at = now

    fully_approved = (
        decision == ApprovalDecisionKind.APPROVE
        and next_index >= len(steps)
    )

    # Status transitions:
    outcome = _DECISION_OUTCOMES[decision]
    if decision == ApprovalDecisionKind.APPROVE:
        if fully_approved:
            proposal.status = "approved"
            audit_action = PricingAuditAction.PROPOSAL_APPROVED.value
            event_topic = "proposal.approved"
        else:
            # Still pending — intermediate approve, no status flip on the
            # proposal itself. We still publish a ``proposal.step_approved``
            # event so watchers can refresh the stepper.
            audit_action = PricingAuditAction.PROPOSAL_APPROVED.value
            event_topic = "proposal.step_approved"
    else:
        proposal.status = outcome["status"]
        audit_action = outcome["audit_action"]
        event_topic = outcome["event_topic"]
    proposal.updated_at = now.replace(tzinfo=None)

    record_audit(
        actor=actor,
        action=audit_action,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=proposal.article_id,
        after={
            "proposal_id": str(proposal.id),
            "aid": proposal.article_id,
            "approval_instance_id": str(instance.id),
            "step_index": current_index,
            "role": required_role,
            "decision": decision.value,
            "comment": comment,
        },
        reason=comment,
        session=session,
    )

    _publish_event(
        event_topic,
        proposal_id=proposal.id,
        aid=proposal.article_id,
        extra={
            "approval_instance_id": str(instance.id),
            "step_index": current_index,
            "decision": decision.value,
        },
    )

    # Phase 6 — propagate to the batch subscriber. We only flip the
    # batch item's status on the *terminal* transition (final approve /
    # reject / request_changes) so intermediate approves don't prematurely
    # mark the item committed.
    try:
        from backend.services.pricing import batch_subscribers

        if fully_approved or terminal:
            batch_subscribers.on_proposal_decided(
                proposal_id=proposal.id,
                decision=decision.value,
                db_session=session,
            )
    except Exception:
        logger.exception(
            "pricing:approval_workflow:apply_decision batch_subscribers failed "
            "proposal_id=%s decision=%s",
            proposal.id,
            decision.value,
        )
        try:
            session.rollback()
        except Exception:
            pass

    return instance


def recall_proposal(
    *,
    session: Session,
    proposal: PricingProposal,
    actor: str,
) -> PricingProposal:
    """Auto-recall handler: only allowed while the proposal is in draft.

    Per plan §5.5. Marks the proposal as ``recalled``, writes the audit
    row, publishes ``proposal.recalled``.
    """
    if proposal.status != "draft":
        raise ApprovalWorkflowError(
            f"only draft proposals can be recalled (status={proposal.status!r})"
        )
    proposal.status = "recalled"
    proposal.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    record_audit(
        actor=actor,
        action=PricingAuditAction.PROPOSAL_RECALLED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=proposal.article_id,
        after={"proposal_id": str(proposal.id), "aid": proposal.article_id},
        session=session,
    )
    _publish_event("proposal.recalled", proposal_id=proposal.id, aid=proposal.article_id)
    return proposal


def inbox_for_roles(
    *,
    session: Session,
    user_roles: Iterable[str],
) -> list[dict[str, Any]]:
    """Return approval instances awaiting any of ``user_roles``.

    An instance is "in the inbox" when the step at ``current_step`` is
    pending AND its role is in ``user_roles``. The query joins through
    ``pricing_proposals`` so the wire shape carries proposal context.
    """
    roles = set(user_roles)
    if not roles:
        return []

    rows = (
        session.query(ApprovalInstance, PricingProposal)
        .join(PricingProposal, ApprovalInstance.proposal_id == PricingProposal.id)
        .order_by(ApprovalInstance.created_at.desc())
        .all()
    )
    inbox: list[dict[str, Any]] = []
    for inst, prop in rows:
        steps = list(inst.steps or [])
        if inst.current_step >= len(steps):
            continue
        step = steps[inst.current_step]
        if step.get("decision") != ApprovalStepState.PENDING.value:
            continue
        role = step.get("role")
        if role not in roles:
            continue
        inbox.append(
            {
                "approval_instance_id": str(inst.id),
                "proposal_id": str(prop.id),
                "aid": prop.article_id,
                "current_price": (
                    float(prop.current_price) if prop.current_price is not None else None
                ),
                "proposed_price": (
                    float(prop.proposed_price) if prop.proposed_price is not None else None
                ),
                "delta_pp": float(prop.delta_pp) if prop.delta_pp is not None else None,
                "status": prop.status,
                "current_step": inst.current_step,
                "step_role": role,
                "created_at": inst.created_at.isoformat() if inst.created_at else None,
            }
        )
    return inbox


__all__ = [
    "ApprovalWorkflowError",
    "apply_decision",
    "inbox_for_roles",
    "recall_proposal",
    "serialize_instance",
    "submit_proposal_for_approval",
]
