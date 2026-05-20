"""Phase 12 + 17 — A/B tests read API.

GET /ab-tests              — list (now includes lifecycle + sim status)
GET /ab-tests/{id}         — full experiment detail
POST /ab-tests/{id}/refresh-results — recompute the snapshot from assignments
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models import AbTest
from backend.services import ab_results_service, ab_simulation_service

router = APIRouter(prefix="/ab-tests", tags=["ab-tests"])


def _serialize_summary(t: AbTest, latest_snapshot=None) -> dict[str, Any]:
    """Lightweight list-row projection."""
    out: dict[str, Any] = {
        "id": str(t.id),
        "aid": t.aid,
        "slice_pct": float(t.slice_pct) if t.slice_pct is not None else None,
        "start_date": t.start_date.isoformat() if t.start_date else None,
        "end_date": t.end_date.isoformat() if t.end_date else None,
        "control_price": float(t.control_price) if t.control_price is not None else None,
        "treatment_price": float(t.treatment_price) if t.treatment_price is not None else None,
        "status": t.status,
        "decision_state": t.decision_state,
        "simulation_status": t.simulation_status,
        "promotion_eligible": bool(t.promotion_eligible),
        "created_by": str(t.created_by),
        "audit_hash": t.audit_hash,
        "success_metric": t.success_metric,
    }
    if latest_snapshot is not None:
        out["lift_pp"] = (
            float(latest_snapshot.lift_pp) if latest_snapshot.lift_pp is not None else None
        )
        out["p_value"] = (
            float(latest_snapshot.p_value) if latest_snapshot.p_value is not None else None
        )
        out["sample_size"] = {
            "control": latest_snapshot.sample_size_control,
            "treatment": latest_snapshot.sample_size_treatment,
        }
    return out


def _parse_uuid(test_id: str) -> UUID:
    try:
        return UUID(test_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid test_id") from e


@router.get("")
def list_ab_tests(
    status_filter: str | None = None,
    decision_state: str | None = None,
    aid: str | None = None,
    limit: int = 50,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    q = db.query(AbTest)
    if status_filter:
        q = q.filter(AbTest.status == status_filter)
    if decision_state:
        q = q.filter(AbTest.decision_state == decision_state)
    if aid:
        q = q.filter(AbTest.aid == aid)
    rows = q.order_by(AbTest.start_date.desc()).limit(min(limit, 200)).all()
    items: list[dict[str, Any]] = []
    for t in rows:
        snap = ab_results_service.latest(db, t.id)
        items.append(_serialize_summary(t, snap))
    return {"items": items}


@router.get("/{test_id}")
def get_ab_test(
    test_id: str,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    t = db.get(AbTest, _parse_uuid(test_id))
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ab_test not found")

    snap = ab_results_service.latest(db, t.id)
    pre = ab_simulation_service.latest_for_stage(
        db, t.id, stage=ab_simulation_service.STAGE_PRE_LAUNCH
    )
    in_flight = ab_simulation_service.latest_for_stage(
        db, t.id, stage=ab_simulation_service.STAGE_IN_FLIGHT
    )
    gate = ab_simulation_service.latest_for_stage(
        db, t.id, stage=ab_simulation_service.STAGE_PROMOTION_GATE
    )

    return {
        **_serialize_summary(t, snap),
        "hypothesis": t.hypothesis,
        "duration_days": t.duration_days,
        "status_reason": t.status_reason,
        "promotion_blockers": (t.promotion_blockers or {}).get("blockers", []),
        "observed_result": ab_results_service.serialize(snap),
        "simulation": {
            "pre_launch": pre.to_dict() if pre else None,
            "in_flight": in_flight.to_dict() if in_flight else None,
            "promotion_gate": gate.to_dict() if gate else None,
            "latest_simulation_id": t.latest_simulation_id,
        },
        "audit_refs": {"audit_hash": t.audit_hash},
    }


@router.post("/{test_id}/refresh-results")
def refresh_results(
    test_id: str,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    t = db.get(AbTest, _parse_uuid(test_id))
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ab_test not found")
    snap = ab_results_service.compute(db, t)
    # Recompute the in-flight forecast against the fresh snapshot.
    in_flight = ab_simulation_service.run(
        db,
        t,
        stage=ab_simulation_service.STAGE_IN_FLIGHT,
        observed=snap,
        seed=int(t.id.int % (2**31)),
    )
    db.commit()
    return {
        "ab_test_id": str(t.id),
        "observed_result": ab_results_service.serialize(snap),
        "simulation_in_flight": in_flight.to_dict(),
    }
