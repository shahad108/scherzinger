from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from backend.services.forecast import overrides as svc

router = APIRouter(prefix="/forecast/overrides", tags=["forecast-overrides"])


class OverrideIn(BaseModel):
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    cluster: str | None = None
    mode: Literal["revenue", "margin", "volume"]
    actual: float
    modelP50: float
    source: Literal["erp", "manual", "contracted", "other"]
    confidence: Literal["low", "medium", "high"]
    reason: str = Field(..., min_length=10)
    author: str = "Frank"


class OverridePatch(BaseModel):
    actual: float | None = None
    source: Literal["erp", "manual", "contracted", "other"] | None = None
    confidence: Literal["low", "medium", "high"] | None = None
    reason: str | None = Field(default=None, min_length=10)


@router.get("")
def list_overrides(month: str | None = None, cluster: str | None = None):
    return {"items": svc.list_overrides(month=month, cluster=cluster)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_override(body: OverrideIn):
    try:
        return svc.create_override(body.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/{override_id}")
def update_override(override_id: str, body: OverridePatch):
    try:
        return svc.update_override(
            override_id,
            {k: v for k, v in body.model_dump().items() if v is not None},
        )
    except KeyError:
        raise HTTPException(404, "override not found")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_override(override_id: str):
    svc.delete_override(override_id)
    return None
