"""Forecasting composer."""
from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import blocks
from .real_backtest import build_walk_forward as _build_walk_forward_live
from .real_clusters import build_clusters as _build_clusters_live
from .real_pareto import build_pareto as _build_pareto_live
from .real_price_floor import build_price_floor as _build_price_floor_live
from .real_new_product import build_new_product as _build_new_product_live
from .calibration import get_calibration
from .commodity_trajectories import get_commodity_trajectories
from .market_direction import get_market_direction
from .cost_decomposition import get_cost_decomposition
from .customers import get_top_at_risk_customers
from .distributions import get_distributions
from .margin_trajectory import get_margin_trajectory
from .methodology import get_methodology
from .quote_to_revenue import get_quote_to_revenue
from .seasonal_overlay import get_seasonal_overlay
from .tornado import get_tornado

CACHE_TTL_SECONDS = 60
_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}


def invalidate_cache() -> None:
    _CACHE.clear()


async def build_forecast(
    *,
    user_id: str,
    persona: str,
    mode: str | None,
    horizon: int | None,
    tier: str | None,
    family: str | None,
    cluster: str | None,
    lang: str | None,
    db: Session | None = None,
) -> dict[str, Any]:
    if persona == "frank":
        pass
    elif persona == "till":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "till",
                "message": "Till Forecasting (collapsed Pareto, new-product hidden) coming in Phase 10.",
            },
        )
    elif persona == "heiko":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "heiko",
                "message": "Heiko forecasting (own-customer Pareto + price floor) coming in Phase 11.",
            },
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unknown persona"
        )

    key = (user_id, persona, mode, horizon, tier, family, cluster, lang)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    (
        header,
        hero,
        input_cost,
        pareto,
        price_floor,
        footnote,
        new_product,
    ) = await asyncio.gather(
        blocks.header(mode=mode),
        blocks.hero(
            horizon=horizon, db=db,
            mode=(mode if mode in ("revenue", "margin", "volume") else "revenue"),
        ),
        blocks.input_cost(db=db),
        blocks.pareto(tier=tier),
        blocks.price_floor(family=family),
        blocks.price_floor_footnote(),
        blocks.new_product(),
    )

    # Real-data swaps (phase 45) — replace the Pareto, Price-floor, and
    # New-product seed payloads with live queries when a DB session is
    # available. Each swap is independently guarded so one broken block
    # doesn't cascade.
    if db is not None:
        try:
            pareto = _build_pareto_live(db, tier=tier)
        except Exception:  # pragma: no cover — safety net
            pass
        try:
            price_floor = _build_price_floor_live(db, family=family)
        except Exception:  # pragma: no cover — safety net
            pass
        try:
            new_product = _build_new_product_live(db)
        except Exception:  # pragma: no cover — safety net
            pass

    # Real walk-forward backtest sourced from `backtest_results` (Phase 8 wiring).
    # Falls back to the seed if no DB session is supplied (legacy callers).
    if db is not None:
        try:
            walk_forward = _build_walk_forward_live(db)
        except Exception:  # pragma: no cover — safety net
            walk_forward = await blocks.walk_forward()
            walk_forward["source"] = "seed_fallback"
    else:
        walk_forward = await blocks.walk_forward()
        walk_forward["source"] = "seed_no_db"

    # Real cluster cards from `margin_forecasts` × `invoices` LTM (Phase 8 wiring).
    if db is not None:
        try:
            clusters_block = _build_clusters_live(
                db,
                horizon_months=horizon if horizon in (1, 3, 6, 12) else 12,
                only=cluster,
            )
        except Exception:
            clusters_block = await blocks.clusters(cluster=cluster)
    else:
        clusters_block = await blocks.clusters(cluster=cluster)

    # Phase 1 — simulator surface (tornado + distributions + mode toggle).
    # ``mode`` and ``horizon`` from the query string drive which slice of
    # ``monte_carlo_results`` we serve. ``db`` is None inside the BFF path —
    # the helpers fall back to the bundled seed in that case.
    active_mode = mode if mode in ("revenue", "margin", "volume") else "revenue"
    # Frontend uses "volume" / backend uses "quantity". Translate one way so
    # downstream filters match the persisted ``metric`` column.
    backend_metric = "quantity" if active_mode == "volume" else active_mode
    horizon_months = horizon if horizon in (3, 6, 12) else 12

    tornado = get_tornado(
        db=db,
        entity_type="commodity_group",
        metric=backend_metric,
        horizon_months=horizon_months,
    )
    distributions = get_distributions(
        db=db,
        entity_type="commodity_group",
        metric=backend_metric,
        horizon_months=horizon_months,
    )

    methodology = get_methodology(db=db)
    margin_trajectory = get_margin_trajectory(db=db)
    cost_decomposition = get_cost_decomposition(db=db)
    seasonal_overlay = get_seasonal_overlay(db=db)
    commodity_trajectories = get_commodity_trajectories(db=db)
    customers = get_top_at_risk_customers(db=db, risk_filter="all")
    quote_to_revenue = get_quote_to_revenue(db=db)
    calibration = get_calibration(db=db)
    market_direction = get_market_direction(db=db)

    payload = {
        "header": header,
        "hero": hero,
        "clusters": clusters_block,
        "walkForward": walk_forward,
        "inputCost": input_cost,
        "pareto": pareto,
        "priceFloor": price_floor,
        "priceFloorFootnote": footnote,
        "newProduct": new_product,
        "mode": {
            "active": active_mode,
            "horizonMonths": horizon_months,
        },
        "tornado": tornado,
        "distributions": distributions,
        "methodology": methodology,
        # Phase 3 — diagnostic charts.
        "marginTrajectory": margin_trajectory,
        "costDecomposition": cost_decomposition,
        "seasonalOverlay": seasonal_overlay,
        "commodityTrajectories": commodity_trajectories,
        # Phase 4 — per-customer preview (top at risk).
        "customers": customers,
        # Phase 6 — Quote-to-Revenue bridge + per-cluster CI calibration.
        "quoteToRevenue": quote_to_revenue,
        "calibration": calibration,
        # Phase 7 — Market direction widget.
        "marketDirection": market_direction,
    }
    _CACHE[key] = (now, payload)
    return payload
