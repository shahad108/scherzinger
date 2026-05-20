"""Forecast annotations REST surface — mirrors forecast_overrides.

Phase H of the forecasting v2.2 redesign. Lightweight comment layer:
right-click on a HeroForecast month or ClusterLens card opens a popover
backed by these endpoints.
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.auth.security import AuthContext, require_auth

# Note: imported by full dotted path to avoid name collision with the
# `from __future__ import annotations` binding present in the package
# `__init__.py` (which shadows `annotations` for `from … import …` form).
import backend.services.forecast.annotations as svc

router = APIRouter(prefix="/forecast/annotations", tags=["forecast-annotations"])


class AnnotationTarget(BaseModel):
    kind: Literal["month", "cluster"]
    # For month: YYYY-MM. For cluster: free-form cluster code.
    # Pydantic doesn't let us conditionally apply the regex; the service-layer
    # validator catches month-kind values that don't look like YYYY-MM.
    value: str = Field(..., min_length=1, max_length=64)


class AnnotationIn(BaseModel):
    target: AnnotationTarget
    body: str = Field(..., min_length=1, max_length=2000)
    # author intentionally omitted — derived server-side from the JWT session.


# GET stays open to mirror other forecast read endpoints. Writes require auth.
@router.get("")
def list_annotations(target_kind: str | None = None, target_value: str | None = None):
    return {
        "items": svc.list_annotations(
            target_kind=target_kind, target_value=target_value
        )
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_annotation(
    body: AnnotationIn,
    ctx: AuthContext = Depends(require_auth),
):
    try:
        payload = body.model_dump()
        payload["author"] = ctx.name or ctx.email or "unknown"
        return svc.create_annotation(payload)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_annotation(
    annotation_id: str,
    ctx: AuthContext = Depends(require_auth),
):
    try:
        svc.delete_annotation(annotation_id)
    except KeyError:
        raise HTTPException(404, "annotation not found")
    return None
