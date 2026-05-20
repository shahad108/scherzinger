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
from pydantic import BaseModel

from backend.auth.security import AuthContext, require_auth
from backend.services.forecast import alerts as alerts_service
from backend.services.forecast.briefing import generate_briefing
from backend.services.forecast.calibration import get_calibration
from backend.services.forecast.market_direction import get_market_direction
from backend.services.forecast.scenarios_parse import parse_scenario_prompt
from backend.services.forecast.customers import (
    get_customer_detail,
    get_top_at_risk_customers,
)
from backend.services.forecast.distributions import get_distributions
from backend.services.forecast.methodology import get_lineage, get_methodology
from backend.services.forecast.quote_to_revenue import get_quote_to_revenue
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


@router.get("/methodology")
def methodology(db: Session = Depends(get_db)):
    """Phase 2 — methodology + assumptions + models payload.

    Renders the notebook's ``validation_report.md`` content + a structured
    ``assumptions`` block (growth, pass-through, seasonality, win-rate,
    data-through date). The FE renders this as a collapsible panel and an
    ``AssumptionsFooter`` strip.
    """
    return get_methodology(db)


@router.get("/customers")
def customers(
    risk_filter: Optional[str] = Query(default="high", regex="^(high|medium|low|all)$"),
    db: Session = Depends(get_db),
):
    """Phase 4 — top customers at decline risk."""
    return get_top_at_risk_customers(db=db, risk_filter=risk_filter)


@router.get("/customers/{customer_id}")
def customer_detail(customer_id: str, db: Session = Depends(get_db)):
    """Phase 4 — single-customer distributions + risk + history."""
    return get_customer_detail(db=db, customer_id=customer_id)


@router.get("/quote-to-revenue")
def quote_to_revenue(db: Session = Depends(get_db)):
    """Phase 6 — Open Quotes × Win Rate × Avg Margin for 30/60/90 days."""
    return get_quote_to_revenue(db=db)


@router.get("/calibration")
def calibration(db: Session = Depends(get_db)):
    """Phase 6 — per-cluster CI calibration (nominal 80% vs actual hit rate)."""
    return get_calibration(db=db)


# ----- Phase 7 -----

@router.get("/market-direction")
def market_direction(db: Session = Depends(get_db)):
    """Phase 7 — 6–8 external market tiles + a WoW/MoM/YoY digest."""
    return get_market_direction(db=db)


class BriefingRequest(BaseModel):
    scenario_id: str | None = None
    output_format: Literal["pdf", "html"] = "pdf"
    recipient: Literal["till", "heiko", "self"] = "self"
    # v2.2 Phase I — briefing persona toggle (Manuel mode + German).
    persona: Literal["manuel_1pager", "analyst_memo"] | None = None
    language: Literal["de", "en"] | None = None


@router.post("/briefing")
def briefing(
    body: BriefingRequest,
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 7 — generate a forecast briefing artifact (PDF/HTML).

    v2.2 Phase I: optional ``persona`` / ``language`` route the prompt pack.
    Defaults: persona = ``analyst_memo`` (preserves prior behavior). When the
    caller picks ``manuel_1pager`` without specifying a language, auto-flip
    to ``de`` (Manuel reads German). Otherwise default language to ``en``.
    """
    persona = body.persona or "analyst_memo"
    if body.language is not None:
        language = body.language
    else:
        language = "de" if persona == "manuel_1pager" else "en"
    return generate_briefing(
        user_id=str(ctx.user_id),
        scenario_id=body.scenario_id,
        output_format=body.output_format,
        recipient=body.recipient,
        persona=persona,
        language=language,
    )


@router.get("/alerts")
def list_alerts(ctx: AuthContext = Depends(require_auth)):
    return {"alerts": alerts_service.list_alerts(str(ctx.user_id))}


class AlertCreate(BaseModel):
    metric: str
    entity_type: str
    entity_id: str | None = None
    threshold_kind: Literal["mape_above", "margin_below_pct", "revenue_decline_prob_above"]
    threshold_value: float
    notify_via: Literal["in_app", "email"] = "in_app"


@router.post("/alerts")
def create_alert(body: AlertCreate, ctx: AuthContext = Depends(require_auth)):
    return alerts_service.create_alert(
        user_id=str(ctx.user_id),
        metric=body.metric,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        threshold_kind=body.threshold_kind,
        threshold_value=body.threshold_value,
        notify_via=body.notify_via,
    )


@router.delete("/alerts/{alert_id}", status_code=204)
def delete_alert(alert_id: str, ctx: AuthContext = Depends(require_auth)):
    if not alerts_service.delete_alert(alert_id, str(ctx.user_id)):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="alert not found")


@router.post("/alerts/{alert_id}/test")
def test_alert(alert_id: str, ctx: AuthContext = Depends(require_auth)):
    return alerts_service.test_alert(alert_id, str(ctx.user_id))


class ScenarioParseRequest(BaseModel):
    prompt: str


@router.post("/scenarios/parse")
def scenario_parse(
    body: ScenarioParseRequest,
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 7 — NL → scenario JSON (feature-flagged behind ?ai_scenarios=1)."""
    return parse_scenario_prompt(body.prompt)


@router.get("/lineage")
def lineage(
    entity_type: EntityType = Query(default="commodity_group"),
    entity_id: Optional[str] = Query(default=None),
    metric: Optional[str] = Query(default=None),
    model_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Phase 2 — lineage chain for one (entity, metric, model)."""
    return get_lineage(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
        metric=metric,
        model_id=model_id,
    )
