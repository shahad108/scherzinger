"""Per-SKU workbench + comparable services.

Phase 8 stub — each helper slices the seed today; later phases flesh out
the real derivation per §14.3 P8.T2:

    build_options(unit_cost, current_price, target_margin, annual_units,
                  customer_count, cluster_id) → hold/floor/market/A-B options
    build_fanout(unit_cost, target_margin, current_price, annual_units,
                 cluster_id, top_n=6) → fan-out rows from real customers,
                 weighted by share, with per-customer churn risk
    build_cost(unit_cost, components, target_margin, cluster_id)
    build_decision(...) / build_memo(...)

Phase 21 / Pricing Studio v3 §1.2.5: the workbench also carries
``recommendation``, ``wtp``, ``win_prob_curve`` and ``competitor_ref``
when the services can compute them. Each is optional — on ``None`` or
exception we omit the field so the frontend can render a
``DataMissingBadge`` instead of 500ing.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException, status

from backend.database import SessionLocal
from backend.services.competitor.index import build_competitor_ref
from backend.services.pricing import elasticity as elasticity_mod
from backend.services.pricing import recommendation as recommendation_mod
from backend.services.pricing import wtp as wtp_mod
from backend.services.pricing.envelope import resolve_envelope

from ._seed import load_seed

logger = logging.getLogger(__name__)


def _find_sku(aid: str) -> dict[str, Any] | None:
    seed = load_seed()
    for s in seed.get("skus", []):
        if str(s.get("aid")) == aid:
            return s
    if seed.get("defaultAid") == aid:
        return {"aid": aid}
    return None


def _resolve_envelope(
    aid: str, db
) -> tuple[Decimal, Decimal]:
    """Resolve a (floor, ceiling) envelope for the win-prob curve.

    Delegates to ``backend.services.pricing.envelope.resolve_envelope`` —
    the canonical cascade used by BOTH the workbench attach and the
    recommendation composer's optimiser. Keeping both call sites on the
    same cascade guarantees the recommended price is on-grid relative to
    the curve the UI renders.

    Reads ``PriceStateRow`` and ``CostStateRow`` once and feeds them
    straight to the canonical resolver.
    """
    from sqlalchemy import select

    from backend.models.pricing.cost_state import CostStateRow
    from backend.models.pricing.pricing_state import PriceStateRow

    price_row = db.execute(
        select(PriceStateRow).where(PriceStateRow.aid == aid)
    ).scalar_one_or_none()
    cost_row = db.execute(
        select(CostStateRow).where(CostStateRow.aid == aid)
    ).scalar_one_or_none()
    return resolve_envelope(price_row, cost_row)


def _attach_phase2_signals(
    workbench: dict[str, Any],
    aid: str,
) -> None:
    """Phase 2: customer-fanout block (BFF-computed, no proposed price yet).

    Initial fanout uses ``proposed_price=None`` so ``risk_if_moved`` is
    null and ``tone`` defaults to ``plain`` for every row. The frontend
    POSTs ``/screens/studio/fanout`` with the user-selected price to
    re-score on demand.
    """
    try:
        from backend.services.pricing.customer_fanout import build_customer_fanout

        with SessionLocal() as db:
            payload = build_customer_fanout(
                aid=aid, proposed_price=None, db_session=db
            )
            workbench["customer_fanout"] = payload
            db.commit()
    except Exception:
        logger.exception("workbench customer_fanout failed aid=%s", aid)
        # Leave the field absent — workbench shell + Phase 1 blocks still render.


def _attach_phase1_signals(
    workbench: dict[str, Any],
    aid: str,
    tier: Optional[str],
    cluster: Optional[str] = None,
) -> None:
    """Best-effort: attach recommendation + WTP + curve + competitor.

    Each field is optional. We swallow exceptions per spec — the frontend
    renders ``<DataMissingBadge reason=…>`` when a field is missing. Every
    exception is logged with ``aid`` so we still see them in prod.
    """
    try:
        with SessionLocal() as db:
            try:
                rec = recommendation_mod.build_recommendation(
                    aid=aid,
                    tier=tier,
                    cluster=cluster,
                    db_session=db,
                )
                workbench["recommendation"] = rec.model_dump(mode="json")
            except Exception:
                logger.exception(
                    "workbench.recommendation failed aid=%s tier=%s", aid, tier
                )
            try:
                wtp_band = wtp_mod.build_wtp(
                    aid=aid,
                    tier=tier,
                    cluster=cluster,
                    window_days=540,
                    db_session=db,
                )
                if wtp_band is not None:
                    workbench["wtp"] = wtp_band.model_dump(mode="json")
            except Exception:
                logger.exception("workbench.wtp failed aid=%s tier=%s", aid, tier)
            try:
                floor, ceiling = _resolve_envelope(aid, db)
                curve = elasticity_mod.build_win_prob_curve(
                    aid=aid,
                    tier=tier,
                    points=20,
                    floor=floor,
                    ceiling=ceiling,
                    db_session=db,
                )
                if curve is not None:
                    workbench["win_prob_curve"] = curve.model_dump(mode="json")
            except Exception:
                logger.exception(
                    "workbench.win_prob_curve failed aid=%s tier=%s", aid, tier
                )
            try:
                comp = build_competitor_ref(aid=aid, n_days=90, db_session=db)
                if comp is not None:
                    workbench["competitor_ref"] = comp.model_dump(mode="json")
                else:
                    # Explicit None tells the frontend "no competitor data" without
                    # ambiguity between "not computed" vs "computed-and-empty".
                    workbench["competitor_ref"] = None
            except Exception:
                logger.exception(
                    "workbench.competitor_ref failed aid=%s", aid
                )
            db.commit()
    except Exception:
        # Database itself unavailable — leave the optional fields off so
        # the workbench shell still renders. Logged for ops visibility.
        logger.exception("workbench Phase 1 signal attach failed aid=%s", aid)


async def build_workbench(*, aid: str, tier: Optional[str] = None) -> dict[str, Any]:
    """Per-SKU workbench. Today the seed only carries the default SKU's
    workbench; for any other aid we return that same template tagged with
    the requested aid so the contract holds end-to-end.

    Phase 1 attaches ``recommendation/wtp/win_prob_curve/competitor_ref``
    as optional fields (omitted on failure, never 500).
    """
    sku = _find_sku(aid)
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"unknown aid: {aid}"
        )
    seed = load_seed()
    workbench = dict(seed["workbench"])
    if "hero" in workbench:
        hero = dict(workbench["hero"])
        hero["aid"] = aid
        if sku.get("shortHero"):
            short = sku["shortHero"]
            hero["title"] = short.get("title", hero.get("title"))
            hero["sub"] = short.get("sub", hero.get("sub"))
        workbench["hero"] = hero
    workbench["aid"] = aid
    cluster = str(sku.get("cluster") or "") or None
    _attach_phase1_signals(
        workbench,
        aid,
        tier or str(sku.get("tier") or "") or None,
        cluster=cluster,
    )
    _attach_phase2_signals(workbench, aid)
    return workbench


async def build_comparable(*, aid: str) -> dict[str, Any]:
    """Comparable-cluster panel. Only meaningful for ``isNew=true`` SKUs;
    for known SKUs we still return the seed payload so the frontend can
    decide whether to render.
    """
    sku = _find_sku(aid)
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"unknown aid: {aid}"
        )
    seed = load_seed()
    comparable = dict(seed["comparable"])
    comparable["aid"] = aid
    comparable["isNew"] = bool(sku.get("isNew", False))
    return comparable
