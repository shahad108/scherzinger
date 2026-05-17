"""Pricing Studio v3 / Phase 3 — Cost Trajectory Drawer data source.

GET /api/v1/pricing/sku/{aid}/cost-outlook?horizon_months=6

Returns the per-SKU cost outlook payload powering the Cost Trajectory Drawer:

  - ``today``       — current unit cost + component breakdown
  - ``forecast``    — next ``horizon_months`` p20/p50/p80 unit-cost projections
  - ``components``  — per-component (material/labor/outsourcing/overhead)
                       today→forecast deltas with the dominant commodity label
  - ``floor_crosses_at`` — month when today's list price equals the projected
                       unit cost + safety margin (None when never inside horizon)
  - ``commodity_trend``  — top commodity drivers (monthly YoY %)
  - ``lineage_ref``

60-second per-(aid, horizon_months) TTL cache to keep slider-drag latency
inside the < 500ms p50 budget the plan specifies.
"""
from __future__ import annotations

import logging
import time
from collections import OrderedDict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.pricing.cost_state import CostBreakdown, CostStateRow
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.models.pricing.pricing_state import PriceStateRow
from backend.services.forecast.commodity_trajectories import (
    get_commodity_trajectories,
)
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


_CACHE_TTL_SECONDS = 60.0
_CACHE_MAX_ENTRIES = 256
_CACHE: "OrderedDict[tuple[str, int], tuple[float, dict[str, Any]]]" = OrderedDict()


class CostOutlookMissing(Exception):
    """Raised when no CostState exists for the SKU."""


def invalidate_cache(aid: Optional[str] = None) -> None:
    """Clear the cost-outlook cache.

    Called by ``pricing.cost_moved`` subscribers so the drawer reloads
    fresh data after a cost ingest. ``aid=None`` drops everything (test
    seam).
    """
    if aid is None:
        _CACHE.clear()
        return
    for key in [k for k in _CACHE if k[0] == aid]:
        _CACHE.pop(key, None)


# ---------------------------------------------------------------------------
# Component helpers — p20/p50/p80 projection assumes a deterministic +/- band
# anchored on the cluster's commodity slope. Replace with a real model once
# Phase 8 (simulation) lands.
# ---------------------------------------------------------------------------


_COMMODITY_FOR_COMPONENT = {
    "material": "Steel S355",
    "labor": "Industrial wage index",
    "outsourcing": "Logistics index",
    "overhead": "Energy index",
}


def _month_offset_to_date(today: date, n: int) -> str:
    y = today.year
    m = today.month + n
    while m > 12:
        m -= 12
        y += 1
    return f"{y:04d}-{m:02d}"


def _safe_breakdown(cost_row: CostStateRow) -> CostBreakdown:
    if not cost_row.breakdown:
        return CostBreakdown()
    try:
        return CostBreakdown(**cost_row.breakdown)
    except Exception:
        logger.exception("cost_outlook._safe_breakdown aid=%s", cost_row.aid)
        return CostBreakdown()


def _cluster_for_aid(db: Session, aid: str) -> Optional[str]:
    from sqlalchemy import text

    try:
        row = db.execute(
            text(
                "SELECT commodity_group FROM invoices "
                "WHERE article_id = :aid ORDER BY date DESC LIMIT 1"
            ),
            {"aid": aid},
        ).fetchone()
    except Exception:
        logger.exception("cost_outlook._cluster_for_aid aid=%s", aid)
        return None
    if row is None or row[0] is None:
        return None
    return str(row[0])


def _monthly_growth_from_trajectory(traj: dict[str, Any], cluster: Optional[str]) -> Decimal:
    """Estimate monthly growth pct from the cluster's commodity DB2 slope.

    The slope is in *pp per year* on DB2 margin — a negative slope means
    margin compressing → cost rising. We invert sign + divide by 12 to
    get a coarse monthly cost-growth %.
    """
    groups = traj.get("groups") or []
    for g in groups:
        gid = str(g.get("id") or "")
        if cluster and gid == cluster:
            slope = g.get("slopePerYear")
            try:
                return Decimal(str(-slope)) / Decimal("12") / Decimal("100")
            except Exception:
                return Decimal("0")
    return Decimal("0")


def _build_components(
    *, today_breakdown: CostBreakdown, monthly_growth: Decimal, horizon_months: int
) -> list[dict[str, Any]]:
    components: list[dict[str, Any]] = []
    growth = Decimal("1") + (monthly_growth * Decimal(str(horizon_months)))
    for name in ("material", "labor", "outsourcing", "overhead"):
        today_v = Decimal(str(getattr(today_breakdown, name, Decimal("0"))))
        forecast_v = (today_v * growth).quantize(Decimal("0.0001"))
        change_pct = (
            ((forecast_v - today_v) / today_v * Decimal("100"))
            if today_v > 0
            else Decimal("0")
        ).quantize(Decimal("0.01"))
        components.append(
            {
                "name": name,
                "today_value": str(today_v.quantize(Decimal("0.0001"))),
                "forecast_value": str(forecast_v),
                "change_pct": str(change_pct),
                "commodity_label": _COMMODITY_FOR_COMPONENT.get(name, "—"),
            }
        )
    return components


def _build_forecast(
    *, today_cost: Decimal, monthly_growth: Decimal, horizon_months: int
) -> list[dict[str, Any]]:
    """Deterministic p20/p50/p80 projections.

    p50 follows the cluster-implied monthly growth; p20/p80 widen by
    ±0.4% / month so the ribbon shows uncertainty growing with horizon.
    """
    out: list[dict[str, Any]] = []
    half_band = Decimal("0.004")  # ±0.4% / month
    for offset in range(1, horizon_months + 1):
        center = today_cost * (Decimal("1") + monthly_growth * Decimal(str(offset)))
        low = today_cost * (
            Decimal("1") + (monthly_growth - half_band) * Decimal(str(offset))
        )
        high = today_cost * (
            Decimal("1") + (monthly_growth + half_band) * Decimal(str(offset))
        )
        out.append(
            {
                "month_offset": offset,
                "p20_unit_cost": str(min(low, center).quantize(Decimal("0.0001"))),
                "p50_unit_cost": str(center.quantize(Decimal("0.0001"))),
                "p80_unit_cost": str(max(high, center).quantize(Decimal("0.0001"))),
            }
        )
    return out


def _build_commodity_trend(traj: dict[str, Any], cluster: Optional[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for g in traj.get("groups") or []:
        gid = str(g.get("id") or "")
        if cluster and gid != cluster:
            continue
        slope = g.get("slopePerYear")
        try:
            yoy = float(-slope) if slope is not None else 0.0
        except Exception:
            yoy = 0.0
        out.append({"commodity": g.get("name") or gid, "monthly_yoy_pct": yoy})
    return out


def _find_floor_cross(
    *, list_price: Optional[Decimal], forecast: list[dict[str, Any]], safety_margin: Decimal, today: date
) -> Optional[str]:
    if list_price is None:
        return None
    threshold = list_price / (Decimal("1") + safety_margin)
    for entry in forecast:
        p50 = Decimal(entry["p50_unit_cost"])
        if p50 >= threshold:
            return _month_offset_to_date(today, int(entry["month_offset"]))
    return None


def _persist_lineage(*, aid: str, horizon_months: int, db_session: Session) -> LineageRef:
    row = create_lineage(
        source_kind=LineageSourceKind.COST_INGEST,
        source_id=f"cost_outlook:{aid}:{horizon_months}",
        sql=None,
        model="cost_outlook_v1",
        computed_by="system",
        session=db_session,
    )
    return LineageRef(
        id=row.id,
        source_kind=row.source_kind,
        source_id=row.source_id,
        sql=row.sql,
        model=row.model,
        computed_at=row.computed_at,
        computed_by=row.computed_by,
    )


def build_cost_outlook(
    *,
    aid: str,
    horizon_months: int = 6,
    db_session: Session,
    bypass_cache: bool = False,
) -> dict[str, Any]:
    """Compose the Cost Trajectory Drawer payload.

    Raises ``CostOutlookMissing`` when no CostState exists for ``aid`` —
    the API layer translates that to 404 with a clear error code.
    """
    horizon_months = max(1, min(int(horizon_months), 24))
    cache_key = (aid, horizon_months)
    now = time.monotonic()
    if not bypass_cache:
        cached = _CACHE.get(cache_key)
        if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
            _CACHE.move_to_end(cache_key)
            return cached[1]

    cost_row = db_session.execute(
        select(CostStateRow).where(CostStateRow.aid == aid)
    ).scalar_one_or_none()
    if cost_row is None:
        raise CostOutlookMissing(aid)

    today_cost = Decimal(str(cost_row.unit_cost))
    today_breakdown = _safe_breakdown(cost_row)

    price_row = db_session.execute(
        select(PriceStateRow).where(PriceStateRow.aid == aid)
    ).scalar_one_or_none()
    list_price = None
    if price_row is not None:
        candidate = price_row.list_price if price_row.list_price is not None else price_row.current_price
        if candidate is not None:
            list_price = Decimal(str(candidate))

    cluster = _cluster_for_aid(db_session, aid)
    traj = get_commodity_trajectories(db_session, aid=aid)
    monthly_growth = _monthly_growth_from_trajectory(traj, cluster)

    forecast = _build_forecast(
        today_cost=today_cost,
        monthly_growth=monthly_growth,
        horizon_months=horizon_months,
    )
    components = _build_components(
        today_breakdown=today_breakdown,
        monthly_growth=monthly_growth,
        horizon_months=horizon_months,
    )
    floor_crosses_at = _find_floor_cross(
        list_price=list_price,
        forecast=forecast,
        safety_margin=Decimal("0.10"),
        today=date.today(),
    )
    commodity_trend = _build_commodity_trend(traj, cluster)
    lineage = _persist_lineage(
        aid=aid, horizon_months=horizon_months, db_session=db_session
    )

    payload: dict[str, Any] = {
        "aid": aid,
        "horizon_months": horizon_months,
        "today": {
            "unit_cost": str(today_cost.quantize(Decimal("0.0001"))),
            "breakdown": {
                "material": str(today_breakdown.material),
                "labor": str(today_breakdown.labor),
                "outsourcing": str(today_breakdown.outsourcing),
                "overhead": str(today_breakdown.overhead),
            },
        },
        "forecast": forecast,
        "components": components,
        "floor_crosses_at": floor_crosses_at,
        "commodity_trend": commodity_trend,
        "lineage_ref": lineage.model_dump(mode="json"),
    }

    _CACHE[cache_key] = (now, payload)
    _CACHE.move_to_end(cache_key)
    while len(_CACHE) > _CACHE_MAX_ENTRIES:
        _CACHE.popitem(last=False)
    return payload
