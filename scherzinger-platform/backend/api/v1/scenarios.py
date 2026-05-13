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
