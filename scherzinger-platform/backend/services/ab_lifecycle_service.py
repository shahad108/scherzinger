"""Phase 17 — A/B experiment lifecycle.

Encodes the allowed transitions on ``ab_tests.decision_state`` and the gate
checks that hang off promotion. Lives separately from the action dispatcher
so it can be reused by /actions/* and /ab-tests/* without duplication.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models import AbTest, AbTestResult
from backend.services import ab_results_service, ab_simulation_service


# --------------------------------------------------------------------------- #
# Lifecycle constants                                                         #
# --------------------------------------------------------------------------- #

STATE_DRAFT = "draft"
STATE_READY = "ready_to_launch"
STATE_RUNNING = "running"
STATE_HELD = "held"
STATE_COMPLETED = "completed"
STATE_PROMOTED = "promoted"
STATE_STOPPED = "stopped"

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    STATE_DRAFT: {STATE_READY, STATE_RUNNING, STATE_STOPPED},
    STATE_READY: {STATE_RUNNING, STATE_STOPPED},
    STATE_RUNNING: {STATE_HELD, STATE_STOPPED, STATE_PROMOTED, STATE_COMPLETED},
    STATE_HELD: {STATE_RUNNING, STATE_STOPPED},
    STATE_COMPLETED: {STATE_PROMOTED, STATE_STOPPED},
    STATE_PROMOTED: set(),
    STATE_STOPPED: set(),
}


class LifecycleError(ValueError):
    """Raised when a requested transition is not allowed by ALLOWED_TRANSITIONS."""


def assert_transition(current: str, target: str) -> None:
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise LifecycleError(
            f"cannot transition from {current!r} to {target!r} "
            f"(allowed: {sorted(allowed) or 'terminal'})"
        )


# --------------------------------------------------------------------------- #
# Promotion gate                                                              #
# --------------------------------------------------------------------------- #

def evaluate_promotion(
    db: Session, test: AbTest
) -> tuple[bool, list[str], dict[str, Any]]:
    """Check both observed evidence and simulation gate for promotion.

    Returns ``(eligible, blockers, debug)`` — when ``eligible`` is False the
    blockers list is non-empty and the API surfaces them verbatim.
    """
    blockers: list[str] = []
    debug: dict[str, Any] = {}

    observed = ab_results_service.latest(db, test.id)
    debug["has_observed"] = observed is not None

    # Always recompute the promotion-gate simulation against the latest
    # observed snapshot so we never promote on stale modelling.
    sim_summary = ab_simulation_service.run(
        db,
        test,
        stage=ab_simulation_service.STAGE_PROMOTION_GATE,
        observed=observed,
        seed=int(test.id.int % (2**31)) if isinstance(test.id, UUID) else None,
    )
    debug["simulation"] = sim_summary.to_dict()
    blockers.extend(sim_summary.blockers)

    eligible = len(blockers) == 0
    test.promotion_eligible = eligible
    test.promotion_blockers = {"blockers": blockers} if blockers else None
    return eligible, blockers, debug


# --------------------------------------------------------------------------- #
# Apply a lifecycle move                                                      #
# --------------------------------------------------------------------------- #

def transition(
    db: Session,
    test: AbTest,
    *,
    target: str,
    reason: str | None = None,
    enforce_promote_gate: bool = True,
) -> dict[str, Any]:
    assert_transition(test.decision_state, target)

    extras: dict[str, Any] = {}
    if target == STATE_PROMOTED and enforce_promote_gate:
        eligible, blockers, debug = evaluate_promotion(db, test)
        if not eligible:
            from fastapi import HTTPException, status as http_status

            raise HTTPException(
                http_status.HTTP_409_CONFLICT,
                detail={
                    "error": "promotion gate failed",
                    "blockers": blockers,
                    "simulation": debug.get("simulation"),
                },
            )
        extras["simulation"] = debug.get("simulation")

    test.decision_state = target
    if reason:
        test.status_reason = reason

    # Keep the legacy ``status`` column in sync so the existing list/get
    # endpoints and Action Center stub continue to work without rewriting
    # their queries.
    test.status = {
        STATE_RUNNING: "running",
        STATE_HELD: "held",
        STATE_STOPPED: "stopped",
        STATE_PROMOTED: "promoted",
        STATE_COMPLETED: "completed",
        STATE_READY: "ready",
        STATE_DRAFT: "draft",
    }.get(target, target)

    if target in {STATE_HELD, STATE_STOPPED, STATE_PROMOTED, STATE_COMPLETED}:
        test.end_date = test.end_date or datetime.utcnow()

    test.updated_at = datetime.utcnow()
    db.flush()
    return extras
