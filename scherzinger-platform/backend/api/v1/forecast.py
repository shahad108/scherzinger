"""Per-block forecast endpoints (Phase 1 — Simulator UI).

Mounted at ``/api/v1/forecast``. Distinct from the existing plural router
``forecasts.py`` (mounted at ``/api/v1/forecasts``) — these endpoints are the
dedicated block fetchers the new frontend tornado / distribution / mode-toggle
hooks call, so the cache layer can invalidate the right slices independently
of the screen-wide BFF.

Each endpoint reads from ``monte_carlo_results`` via the matching service
helper in ``backend/services/forecast/``. If the table isn't populated yet,
the helpers fall back to the bundled seed so the FE always has data.
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.forecast.distributions import get_distributions
from backend.services.forecast.tornado import get_tornado

router = APIRouter(prefix="/forecast", tags=["forecast-blocks"])

EntityType = Literal["commodity_group", "customer", "business_unit"]
Metric = Literal["margin", "revenue", "quantity"]


def _coerce_metric(metric: str | None) -> str:
    """Frontend uses ``volume``; persisted ``monte_carlo_results.metric`` uses ``quantity``."""
    if metric == "volume":
        return "quantity"
    if metric in ("margin", "revenue", "quantity"):
        return metric
    return "margin"


@router.get("/tornado")
def tornado(
    entity_type: EntityType = Query(default="commodity_group"),
    metric: Optional[str] = Query(default="margin"),
    horizon_months: int = Query(default=12, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """Tornado bars sorted by ``|delta|`` desc. See ``services/forecast/tornado.py``."""
    return get_tornado(
        db=db,
        entity_type=entity_type,
        metric=_coerce_metric(metric),
        horizon_months=horizon_months,
    )


@router.get("/distributions")
def distributions(
    entity_type: EntityType = Query(default="commodity_group"),
    metric: Optional[str] = Query(default="margin"),
    horizon_months: int = Query(default=12, ge=1, le=24),
    db: Session = Depends(get_db),
):
    """Per-entity Monte Carlo distribution summary."""
    return get_distributions(
        db=db,
        entity_type=entity_type,
        metric=_coerce_metric(metric),
        horizon_months=horizon_months,
    )
