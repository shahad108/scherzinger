"""Forecasting composer."""
from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import HTTPException, status

from . import blocks
from .commodity_trajectories import get_commodity_trajectories
from .cost_decomposition import get_cost_decomposition
from .customers import get_top_at_risk_customers
from .distributions import get_distributions
from .margin_trajectory import get_margin_trajectory
from .methodology import get_methodology
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
        clusters_block,
        walk_forward,
        input_cost,
        pareto,
        price_floor,
        footnote,
        new_product,
    ) = await asyncio.gather(
        blocks.header(mode=mode),
        blocks.hero(horizon=horizon),
        blocks.clusters(cluster=cluster),
        blocks.walk_forward(),
        blocks.input_cost(),
        blocks.pareto(tier=tier),
        blocks.price_floor(family=family),
        blocks.price_floor_footnote(),
        blocks.new_product(),
    )

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
        db=None,
        entity_type="commodity_group",
        metric=backend_metric,
        horizon_months=horizon_months,
    )
    distributions = get_distributions(
        db=None,
        entity_type="commodity_group",
        metric=backend_metric,
        horizon_months=horizon_months,
    )

    methodology = get_methodology(db=None)
    margin_trajectory = get_margin_trajectory(db=None)
    cost_decomposition = get_cost_decomposition(db=None)
    seasonal_overlay = get_seasonal_overlay(db=None)
    commodity_trajectories = get_commodity_trajectories(db=None)
    customers = get_top_at_risk_customers(db=None, risk_filter="all")

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
    }
    _CACHE[key] = (now, payload)
    return payload
