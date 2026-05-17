"""Pricing Studio v3 / Phase 3 — per-option pocket waterfall composer.

For each PriceOption the workbench surfaces (Hold / Floor / Market / Custom /
Recommendation) we compute the full pocket waterfall AT THAT OPTION'S PRICE:

    list → quoted → booked → invoiced → db2

The frontend renders a horizontal mini-waterfall inside each option card from
this typed payload — no client math.

Math
----
We reuse the cluster-level ``forecast/pocket_waterfall`` step structure to
derive *step leakage ratios* (quoted/list, booked/quoted, invoiced/booked).
Those ratios are applied to the option's price to get the per-unit list →
quoted → booked → invoiced trajectory. ``db2`` is then ``invoiced − unit_cost``
(pocket margin EUR per unit), clamped to ≥ 0.

Falls back to deterministic seed ratios (88% / 91% / 95%) when the cluster
ledger is unavailable so the option card always renders.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.pricing.cost_state import CostStateRow
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.models.pricing.option_margin import OptionMargin
from backend.models.pricing.pricing_state import PriceStateRow
from backend.services.forecast.pocket_waterfall import (
    build_pocket_waterfall_from_db,
)
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


# Seed ratios — used when the cluster ledger has no signal. Mirror the
# defaults in ``forecast/pocket_waterfall.build_pocket_waterfall`` so the
# seeded mini-waterfall looks like Frank's reference mockup.
_SEED_QUOTED_OVER_LIST = Decimal("0.88")
_SEED_BOOKED_OVER_QUOTED = Decimal("0.9091")  # 80/88
_SEED_INVOICED_OVER_BOOKED = Decimal("0.95")  # 76/80

_PRICE_QUANT = Decimal("0.0001")
_PCT_QUANT = Decimal("0.01")


def _load_cluster(*, aid: str, db_session: Session) -> Optional[str]:
    """Lookup the cluster (commodity_group) for the SKU via invoices.

    Pure best-effort — when the ledger has no row for ``aid`` we return
    None and ``build_pocket_waterfall_from_db`` falls through to the
    cluster-agnostic seed.
    """
    try:
        from sqlalchemy import text

        row = db_session.execute(
            text(
                "SELECT commodity_group FROM invoices "
                "WHERE article_id = :aid "
                "ORDER BY date DESC LIMIT 1"
            ),
            {"aid": aid},
        ).fetchone()
    except Exception:
        logger.exception("option_margin._load_cluster aid=%s", aid)
        return None
    if row is None:
        return None
    return str(row[0]) if row[0] is not None else None


def _load_unit_cost(*, aid: str, db_session: Session) -> Optional[Decimal]:
    cost_row = db_session.execute(
        select(CostStateRow).where(CostStateRow.aid == aid)
    ).scalar_one_or_none()
    if cost_row is None:
        return None
    return Decimal(str(cost_row.unit_cost))


def _load_list_price(*, aid: str, db_session: Session) -> Optional[Decimal]:
    price_row = db_session.execute(
        select(PriceStateRow).where(PriceStateRow.aid == aid)
    ).scalar_one_or_none()
    if price_row is None:
        return None
    list_price = price_row.list_price if price_row.list_price is not None else price_row.current_price
    return Decimal(str(list_price)) if list_price is not None else None


def _extract_cluster_ratios(
    *, aid: str, db_session: Session
) -> tuple[Decimal, Decimal, Decimal]:
    """Return (quoted/list, booked/quoted, invoiced/booked) ratios.

    Pulled from the cluster-level pocket waterfall composer; falls back to
    seed defaults when any step is non-positive.
    """
    cluster = _load_cluster(aid=aid, db_session=db_session)
    try:
        wf = build_pocket_waterfall_from_db(db_session, cluster=cluster)
    except Exception:
        logger.exception("option_margin._extract_cluster_ratios aid=%s", aid)
        return (
            _SEED_QUOTED_OVER_LIST,
            _SEED_BOOKED_OVER_QUOTED,
            _SEED_INVOICED_OVER_BOOKED,
        )

    steps: dict[str, Decimal] = {}
    for step in wf.get("steps", []):
        name = step.get("name")
        try:
            value = Decimal(str(step.get("value")))
        except Exception:
            continue
        if name is not None:
            steps[name] = value

    list_v = steps.get("list", Decimal("0"))
    quoted_v = steps.get("quoted", Decimal("0"))
    booked_v = steps.get("booked", Decimal("0"))
    invoiced_v = steps.get("invoiced", Decimal("0"))

    if list_v <= 0 or quoted_v <= 0 or booked_v <= 0:
        return (
            _SEED_QUOTED_OVER_LIST,
            _SEED_BOOKED_OVER_QUOTED,
            _SEED_INVOICED_OVER_BOOKED,
        )

    quoted_over_list = (quoted_v / list_v).quantize(Decimal("0.000001"))
    booked_over_quoted = (booked_v / quoted_v).quantize(Decimal("0.000001"))
    invoiced_over_booked = (
        (invoiced_v / booked_v).quantize(Decimal("0.000001"))
        if booked_v > 0
        else _SEED_INVOICED_OVER_BOOKED
    )

    # Defensive clamps — leakage ratios must live in (0, 1].
    def _clamp(r: Decimal, default: Decimal) -> Decimal:
        if r <= Decimal("0") or r > Decimal("1"):
            return default
        return r

    return (
        _clamp(quoted_over_list, _SEED_QUOTED_OVER_LIST),
        _clamp(booked_over_quoted, _SEED_BOOKED_OVER_QUOTED),
        _clamp(invoiced_over_booked, _SEED_INVOICED_OVER_BOOKED),
    )


def _persist_lineage(
    *, aid: str, option_id: str, price: Decimal, db_session: Session
) -> LineageRef:
    row = create_lineage(
        source_kind=LineageSourceKind.INVOICE_LEDGER,
        source_id=f"option_margin:{aid}:{option_id}:{price}",
        sql=None,
        model="option_margin_v1",
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


def _waterfall_from_price(
    *,
    price: Decimal,
    ratios: tuple[Decimal, Decimal, Decimal],
    unit_cost: Decimal,
) -> tuple[Decimal, Decimal, Decimal, Decimal, Decimal, list[Decimal]]:
    """Compute (list, quoted, booked, invoiced, db2, leakage_per_step_pct).

    ``price`` is treated as the list value (the option's price). All values
    are quantized to 4 decimal places for stable wire-shape.
    """
    quoted_over_list, booked_over_quoted, invoiced_over_booked = ratios
    list_v = price.quantize(_PRICE_QUANT)
    quoted_v = (list_v * quoted_over_list).quantize(_PRICE_QUANT)
    booked_v = (quoted_v * booked_over_quoted).quantize(_PRICE_QUANT)
    invoiced_v = (booked_v * invoiced_over_booked).quantize(_PRICE_QUANT)
    db2_v = (invoiced_v - unit_cost).quantize(_PRICE_QUANT)
    if db2_v < 0:
        db2_v = Decimal("0").quantize(_PRICE_QUANT)

    base = list_v if list_v > 0 else Decimal("1")

    def _leak_pct(prev: Decimal, cur: Decimal) -> Decimal:
        return ((prev - cur) / base * Decimal("100")).quantize(_PCT_QUANT)

    leakage = [
        _leak_pct(list_v, quoted_v),
        _leak_pct(quoted_v, booked_v),
        _leak_pct(booked_v, invoiced_v),
        _leak_pct(invoiced_v, db2_v),
    ]
    return list_v, quoted_v, booked_v, invoiced_v, db2_v, leakage


def build_option_margin(
    *,
    aid: str,
    option_id: str,
    price: Decimal,
    db_session: Session,
    unit_cost: Optional[Decimal] = None,
    ratios: Optional[tuple[Decimal, Decimal, Decimal]] = None,
) -> OptionMargin:
    """Pocket waterfall for the given (aid, option, price): list→…→db2.

    Decimal end-to-end. The caller can pass ``unit_cost`` and ``ratios``
    pre-loaded to amortise the DB cost across the 5-option fanout (the
    workbench composer does this). When omitted we load them lazily.
    """
    if not isinstance(price, Decimal):
        price = Decimal(str(price))

    if unit_cost is None:
        unit_cost = _load_unit_cost(aid=aid, db_session=db_session)
    if unit_cost is None:
        unit_cost = Decimal("0")
    if not isinstance(unit_cost, Decimal):
        unit_cost = Decimal(str(unit_cost))

    if ratios is None:
        ratios = _extract_cluster_ratios(aid=aid, db_session=db_session)

    list_v, quoted_v, booked_v, invoiced_v, db2_v, leakage = _waterfall_from_price(
        price=price, ratios=ratios, unit_cost=unit_cost
    )

    lineage = _persist_lineage(
        aid=aid, option_id=option_id, price=price, db_session=db_session
    )

    return OptionMargin(
        option_id=option_id,
        price=price.quantize(_PRICE_QUANT),
        list=list_v,
        quoted=quoted_v,
        booked=booked_v,
        invoiced=invoiced_v,
        db2=db2_v,
        leakage_per_step_pct=leakage,
        lineage_ref=lineage,
    )


# ---------------------------------------------------------------------------
# Workbench helper — compute all five canonical options at once.
# ---------------------------------------------------------------------------


def _resolve_canonical_options(
    *,
    aid: str,
    db_session: Session,
    recommended_price: Optional[Decimal] = None,
    custom_price: Optional[Decimal] = None,
) -> list[tuple[str, Decimal]]:
    """Return the (option_id, price) tuples to compute for this SKU.

    Hold = current price; Floor = price floor (or unit_cost × 1.10);
    Market = cluster median (proxied by list price when floor is set);
    Custom = optional user-typed override; Recommendation = the
    recommender's optimum. When a value is missing we skip that option
    rather than render zeros.
    """
    options: list[tuple[str, Decimal]] = []
    price_row = db_session.execute(
        select(PriceStateRow).where(PriceStateRow.aid == aid)
    ).scalar_one_or_none()
    cost_row = db_session.execute(
        select(CostStateRow).where(CostStateRow.aid == aid)
    ).scalar_one_or_none()

    current_price = (
        Decimal(str(price_row.current_price)) if price_row is not None else None
    )
    floor = (
        Decimal(str(price_row.floor))
        if price_row is not None and price_row.floor is not None
        else None
    )
    list_price = (
        Decimal(str(price_row.list_price))
        if price_row is not None and price_row.list_price is not None
        else current_price
    )
    unit_cost = (
        Decimal(str(cost_row.unit_cost)) if cost_row is not None else None
    )

    if current_price is not None:
        options.append(("hold", current_price))

    floor_price: Optional[Decimal] = None
    if floor is not None:
        floor_price = floor
    elif unit_cost is not None:
        floor_price = (unit_cost * Decimal("1.10")).quantize(_PRICE_QUANT)
    if floor_price is not None:
        options.append(("floor", floor_price))

    if list_price is not None:
        options.append(("market", list_price))

    if custom_price is not None:
        if not isinstance(custom_price, Decimal):
            custom_price = Decimal(str(custom_price))
        options.append(("custom", custom_price))

    if recommended_price is not None:
        if not isinstance(recommended_price, Decimal):
            recommended_price = Decimal(str(recommended_price))
        options.append(("recommendation", recommended_price))

    return options


def build_option_margins(
    *,
    aid: str,
    db_session: Session,
    recommended_price: Optional[Decimal] = None,
    custom_price: Optional[Decimal] = None,
) -> list[OptionMargin]:
    """Compute the canonical option-margin fanout for the workbench.

    Loads unit_cost + cluster ratios once and reuses them across all
    options. Returns an empty list if neither current price nor recommended
    price are available (the workbench then renders the empty state).
    """
    unit_cost = _load_unit_cost(aid=aid, db_session=db_session) or Decimal("0")
    ratios = _extract_cluster_ratios(aid=aid, db_session=db_session)

    out: list[OptionMargin] = []
    for option_id, price in _resolve_canonical_options(
        aid=aid,
        db_session=db_session,
        recommended_price=recommended_price,
        custom_price=custom_price,
    ):
        try:
            out.append(
                build_option_margin(
                    aid=aid,
                    option_id=option_id,
                    price=price,
                    db_session=db_session,
                    unit_cost=unit_cost,
                    ratios=ratios,
                )
            )
        except Exception:
            logger.exception(
                "option_margin compose failed aid=%s option=%s",
                aid,
                option_id,
            )
    return out


def _option_margin_to_dict(om: OptionMargin) -> dict[str, Any]:
    return om.model_dump(mode="json")
