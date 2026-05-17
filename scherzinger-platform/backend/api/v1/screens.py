"""BFF screens layer.

Phase 1: every endpoint reads its bundled seed JSON (mirror of the frontend
mock at ``frontend-v2/src/data/mocks/<name>.json``) and returns it byte-for-byte.
Subsequent phases replace the seed read with real composition over existing
analytical services.

ETag is computed once per process startup from the seed bytes; clients that
send a matching ``If-None-Match`` get a 304.
"""
from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, Request, Response, status
from fastapi.responses import Response as RawResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.schemas.screens import (
    ActionCenterData,
    AiShell,
    ForecastShell,
    MarginCockpitData,
    QuotesShell,
    ShellRailData,
    StudioShell,
)
from backend.services.action_center import build_action_center
from backend.services.ai_briefing import build_ai_briefing
from backend.services.forecast import build_forecast
from backend.services.margin_cockpit import build_margin_cockpit
from backend.services.persona_overview import build_deal_inbox, build_md_overview
from backend.services.quotes import build_quotes
from backend.services.shell import build_shell
from backend.services.studio import (
    build_comparable as build_studio_comparable,
    build_studio_shell,
    build_workbench as build_studio_workbench,
)

router = APIRouter(prefix="/screens", tags=["screens"])

SEEDS_DIR = Path(__file__).resolve().parents[2] / "seeds" / "screens"


@lru_cache(maxsize=None)
def _load_seed(filename: str) -> tuple[Any, str]:
    """Load a seed JSON once and compute its strong ETag."""
    raw = (SEEDS_DIR / filename).read_bytes()
    payload = json.loads(raw.decode("utf-8"))
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    return payload, etag


def _serve(filename: str, response: Response, if_none_match: str | None) -> Any:
    payload, etag = _load_seed(filename)
    if if_none_match and if_none_match == etag:
        # Returning a raw Response bypasses response_model validation, which
        # would otherwise try to coerce the empty 304 body into the screen
        # schema and fail.
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/shell", response_model=ShellRailData)
def get_shell(
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Phase 3: live, user-scoped shell-rail payload.

    ETag is the sha256 of the serialized payload. When the body changes
    (e.g. a notification was added), the ETag changes and the client cache
    invalidates.
    """
    payload = build_shell(db, ctx.user_id)
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/action-center", response_model=ActionCenterData)
async def get_action_center(
    request: Request,
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    persona: str | None = None,
    week: str | None = None,
    cluster: str | None = None,
    hide_locked: bool = False,
    limit: int = 5,
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 4: live composition over per-block service helpers.

    The persona defaults to the authenticated user's persona; explicit
    ``?persona=`` overrides for previewing other variants (and yields a
    documented 404 for till/heiko until P10/P11).

    ``limit`` controls the row count for paginated list blocks (rejections;
    extended to decisions/sku_table in follow-up commits). Default 5 keeps
    the page compact; the frontend's "Show all" pill bumps it to 200.
    """
    effective_persona = persona or ctx.persona
    payload = await build_action_center(
        user_id=str(ctx.user_id),
        user_name=ctx.name or ctx.email,
        persona=effective_persona,
        week=week,
        cluster=cluster,
        hide_locked=hide_locked,
        limit=max(1, min(int(limit), 200)),
    )
    stable_payload = deepcopy(payload)
    stable_payload.setdefault("meta", {})
    stable_payload["meta"]["traceId"] = "__trace__"
    raw = json.dumps(stable_payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response_payload = deepcopy(payload)
    response_payload.setdefault("meta", {})
    response_payload["meta"]["traceId"] = getattr(
        request.state, "trace_id", response_payload["meta"].get("traceId")
    )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return response_payload


@router.get("/margin-cockpit", response_model=MarginCockpitData)
async def get_margin_cockpit(
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    persona: str | None = None,
    cluster: str | None = None,
    family: str | None = None,
    tier: str | None = None,
    period: str | None = None,
    customer_id: str | None = None,
    lang: str | None = None,
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 5: live composition over per-block helpers."""
    effective_persona = persona or ctx.persona
    payload = await build_margin_cockpit(
        user_id=str(ctx.user_id),
        persona=effective_persona,
        cluster=cluster,
        family=family,
        tier=tier,
        period=period,
        customer_id=customer_id,
        lang=lang,
    )
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/quotes", response_model=QuotesShell)
async def get_quotes(
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    persona: str | None = None,
    week: str | None = None,
    rep: str | None = None,
    customer_id: str | None = None,
    family: str | None = None,
    tier: str | None = None,
    lang: str | None = None,
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 6: live composition for Quotes & Guardrails."""
    effective_persona = persona or ctx.persona
    payload = await build_quotes(
        user_id=str(ctx.user_id),
        persona=effective_persona,
        week=week,
        rep=rep,
        customer_id=customer_id,
        family=family,
        tier=tier,
        lang=lang,
    )
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/forecast", response_model=ForecastShell)
async def get_forecast(
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    persona: str | None = None,
    mode: str | None = None,
    horizon: int | None = None,
    tier: str | None = None,
    family: str | None = None,
    cluster: str | None = None,
    lang: str | None = None,
    scenario_id: str | None = None,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Phase 7: live composition for Forecasting. Phase 5 (forecasting):
    optional ``?scenario_id=`` applies a saved scenario's perturbations.
    """
    effective_persona = persona or ctx.persona
    # Phase B — scenario_id is now resolved + applied INSIDE build_forecast
    # so the cache key includes the scenario, the shift is propagated
    # across every section (not just distributions), and presets resolve
    # the same way as system / saved scenarios.
    payload = await build_forecast(
        user_id=str(ctx.user_id),
        persona=effective_persona,
        mode=mode,
        horizon=horizon,
        tier=tier,
        family=family,
        cluster=cluster,
        lang=lang,
        db=db,
        scenario_id=scenario_id,
    )
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/studio", response_model=StudioShell)
async def get_studio(
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    persona: str | None = None,
    aid: str | None = None,
    filter: str | None = None,
    hide_locked: bool = False,
    lang: str | None = None,
    tier: str | None = None,
    family: str | None = None,
    cluster: str | None = None,
    scenario_id: str | None = None,
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 8: live composition for Pricing Studio shell.

    Phase 21 adds the deep-link filter quartet (tier/family/cluster/scenario_id)
    so the URL round-trips a full slice of the Studio.
    """
    effective_persona = persona or ctx.persona
    payload = await build_studio_shell(
        user_id=str(ctx.user_id),
        persona=effective_persona,
        aid=aid,
        filter_value=filter,
        hide_locked=hide_locked,
        lang=lang,
        tier=tier,
        family=family,
        cluster=cluster,
        scenario_id=scenario_id,
    )
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/studio/workbench/{aid}")
async def get_studio_workbench(
    aid: str,
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    tier: str | None = None,
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 8 P8.T1: per-SKU workbench, lazy-fetched by the picker.

    Phase 1 (Pricing Studio v3) attaches optional ``recommendation``,
    ``wtp``, ``win_prob_curve`` and ``competitor_ref`` blocks. The
    ``tier`` query param narrows the WTP + elasticity slices when the
    caller wants a tier-specific recommendation.
    """
    payload = await build_studio_workbench(aid=aid, tier=tier)
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


class _FanoutRequest(BaseModel):
    """Body for POST /studio/fanout — re-score the customer fanout at a price."""

    aid: str
    proposed_price: Decimal


@router.post("/studio/fanout")
def post_studio_fanout(
    body: _FanoutRequest,
    ctx: AuthContext = Depends(require_auth),  # noqa: ARG001 (auth gate)
    db: Session = Depends(get_db),
):
    """Phase 2 — reactive customer fanout re-score.

    Same shape as ``workbench.customer_fanout``. Cached by
    (aid, proposed_price) for 60s so repeated drags on the slider are
    near-instant. Spec acceptance: < 500ms p50.
    """
    from backend.services.pricing.customer_fanout import build_customer_fanout

    return build_customer_fanout(
        aid=body.aid,
        proposed_price=body.proposed_price,
        db_session=db,
    )


@router.get("/studio/comparable/{aid}")
async def get_studio_comparable(
    aid: str,
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 8 P8.T1: comparable-cluster panel for new SKUs."""
    payload = await build_studio_comparable(aid=aid)
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/ai", response_model=AiShell)
async def get_ai(
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    persona: str | None = None,
    week: str | None = None,
    lang: str | None = None,
    ctx: AuthContext = Depends(require_auth),
):
    """Phase 9: live composition for AI Briefing."""
    effective_persona = persona or ctx.persona
    payload = await build_ai_briefing(
        user_id=str(ctx.user_id),
        persona=effective_persona,
        week=week,
        lang=lang,
    )
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/md-overview")
def get_md_overview(
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Any:
    """Phase 12 — Till MD read-only overview.

    No persona gate beyond auth — any user can preview Till's landing
    page so Frank can validate what he just shared looks right on
    Till's side.
    """
    payload = build_md_overview(db, user_id=ctx.user_id, user_name=ctx.name)
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/deal-inbox")
def get_deal_inbox(
    response: Response,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> Any:
    """Phase 12 — Heiko Sales read-only deal inbox."""
    payload = build_deal_inbox(db, user_id=ctx.user_id, user_name=ctx.name)
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'
    if if_none_match and if_none_match == etag:
        return RawResponse(
            status_code=status.HTTP_304_NOT_MODIFIED,
            headers={"ETag": etag, "Cache-Control": "private, max-age=60"},
        )
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, max-age=60"
    return payload


@router.get("/version")
def get_version() -> dict[str, str]:
    """Phase 1.T10: schema/version handshake.

    backend_commit is filled by the deploy pipeline via env var; defaults to
    'dev' locally.
    schema_hash is a stable digest of the bundled seed shapes — when it
    changes, the frontend should hard-reload.
    """
    import os

    digest = hashlib.sha256()
    for fn in sorted(p.name for p in SEEDS_DIR.glob("*.json")):
        digest.update((SEEDS_DIR / fn).read_bytes())
    return {
        "version": "1.0.0",
        "backend_commit": os.environ.get("BACKEND_COMMIT", "dev"),
        "schema_hash": digest.hexdigest()[:16],
    }
