"""Phase 5 — scenarios CRUD + share endpoints.

Mounted at ``/api/v1/scenarios``. Each request goes through ``require_auth``
so the owner_user_id is the calling user.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.services import scenario_service

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


class ScenarioInput(BaseModel):
    name: str
    kind: Literal["market_series", "internal_lever", "commodity_override"] = "market_series"
    unit: str = ""
    perturbation: dict[str, Any] = Field(default_factory=dict)


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    inputs: list[ScenarioInput] = Field(default_factory=list)
    visibility: Literal["private", "team"] = "private"
    derived_from_scenario_id: str | None = None


class ScenarioUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    inputs: list[ScenarioInput] | None = None
    visibility: Literal["private", "team"] | None = None


class ScenarioShareRequest(BaseModel):
    recipient: Literal["till", "heiko", "team"] = "team"


@router.get("")
def list_all(
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return scenario_service.list_scenarios(db=db, user_id=ctx.user_id)


@router.get("/{scenario_id}")
def get_one(
    scenario_id: str,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    payload = scenario_service.get_scenario(db=db, scenario_id=scenario_id)
    if not payload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "scenario not found")
    return payload


@router.post("", status_code=status.HTTP_201_CREATED)
def create(
    body: ScenarioCreate,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return scenario_service.save_scenario(
        db=db,
        user_id=ctx.user_id,
        name=body.name,
        description=body.description,
        inputs=[i.model_dump() for i in body.inputs],
        visibility=body.visibility,
        derived_from_scenario_id=body.derived_from_scenario_id,
    )


@router.patch("/{scenario_id}")
def update(
    scenario_id: str,
    body: ScenarioUpdate,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    payload = scenario_service.update_scenario(
        db=db,
        scenario_id=scenario_id,
        user_id=ctx.user_id,
        name=body.name,
        description=body.description,
        inputs=[i.model_dump() for i in body.inputs] if body.inputs is not None else None,
        visibility=body.visibility,
    )
    if not payload:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "scenario not found")
    return payload


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    scenario_id: str,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
):
    ok = scenario_service.delete_scenario(db=db, scenario_id=scenario_id, user_id=ctx.user_id)
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "scenario not found")


@router.post("/{scenario_id}/share")
def share(
    scenario_id: str,
    body: ScenarioShareRequest,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return scenario_service.share_scenario(
        db=db, scenario_id=scenario_id, recipient=body.recipient
    )


class ScenarioRunRequest(BaseModel):
    persona: Literal["frank", "till", "heiko"] | None = None
    horizon: int = Field(default=12, ge=1, le=24)


@router.post("/{scenario_id}/run")
async def run_scenario(
    scenario_id: str,
    body: ScenarioRunRequest | None = None,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Run a scenario end-to-end and return baseline vs. shifted forecast.

    Calls the v3 forecast composer twice (baseline + scenario-applied),
    extracts hero per-mode (revenue / volume / margin), and returns a slim
    payload the FE can render without re-fetching the whole shell.

    First-time runs trigger v3 inference (Chronos + AutoETS + reconciliation);
    subsequent runs are served from the composer's in-memory cache.
    """
    from backend.services.forecast import build_forecast

    persona = (body.persona if body else None) or ctx.persona or "frank"
    horizon = (body.horizon if body else 12)

    async def _hero(target: str, sid: str | None) -> dict[str, Any]:
        payload = await build_forecast(
            user_id=str(ctx.user_id),
            persona=persona,
            mode=target,
            horizon=horizon,
            tier=None, family=None, cluster=None, lang=None,
            db=db,
            scenario_id=sid,
        )
        hero = payload.get("hero") or {}
        series = hero.get("series") or []
        forecast_only = [p for p in series if p.get("actual") is None][:horizon]
        return {
            "total": hero.get("forecast12moTotal"),
            "unit": hero.get("unit"),
            "monthly": [
                {
                    "month": p.get("month"),
                    "p50": p.get("p50"),
                    "p80Low": p.get("p80Low"),
                    "p80High": p.get("p80High"),
                }
                for p in forecast_only
            ],
            "scenarioApplied": payload.get("scenarioApplied"),
        }

    baseline = {
        "revenue": await _hero("revenue", None),
        "volume":  await _hero("volume",  None),
        "margin":  await _hero("margin",  None),
    }
    shifted = {
        "revenue": await _hero("revenue", scenario_id),
        "volume":  await _hero("volume",  scenario_id),
        "margin":  await _hero("margin",  scenario_id),
    }

    def _pct(b: float | None, s: float | None) -> float | None:
        if b is None or s is None or b == 0:
            return None
        return round((s - b) / b * 100.0, 2)

    deltas = {
        target: {
            "baseline": baseline[target]["total"],
            "shifted":  shifted[target]["total"],
            "absoluteDelta": (
                None
                if (baseline[target]["total"] is None or shifted[target]["total"] is None)
                else round(shifted[target]["total"] - baseline[target]["total"], 2)
            ),
            "pctDelta": _pct(baseline[target]["total"], shifted[target]["total"]),
        }
        for target in ("revenue", "volume", "margin")
    }

    return {
        "scenarioId": scenario_id,
        "horizonMonths": horizon,
        "baseline": baseline,
        "shifted": shifted,
        "deltas": deltas,
        "receipt": shifted["revenue"].get("scenarioApplied"),
    }
