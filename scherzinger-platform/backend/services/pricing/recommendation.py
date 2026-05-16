"""Phase 1 — recommendation composer.

``build_recommendation(aid, …)`` composes the per-SKU Recommendation by:

  1. Loading the input states (PriceState, CostState, WtpBand,
     CompetitorRef, WinProbCurve).
  2. Picking the DB2-maximising price on the win-prob curve.
  3. Computing SHAP-style driver attributions via marginal removal.
  4. Rendering a deterministic templated ``rationale_md``.
  5. Attaching lineage.

When inputs are missing the function degrades gracefully to a fallback
Recommendation (confidence=low, lineage marked ``model="fallback_v1"``).
Calls are **never** allowed to silently return zero — the plan requires
missing fields to be visible to the operator.

``recompute(aid)`` is the live-wiring hook: rebuilds the recommendation
and publishes ``pricing.recommendation_updated`` on the SSE bus.
"""
from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.pricing.competitor import CompetitorRef
from backend.models.pricing.cost_state import CostBreakdown, CostState, CostStateRow
from backend.models.pricing.elasticity import CurvePoint, WinProbCurve
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.models.pricing.pricing_state import PriceState, PriceStateRow
from backend.models.pricing.recommendation import (
    ConfidenceLevel,
    Driver,
    DriverKind,
    Recommendation,
    RecommendationBand,
)
from backend.models.pricing.wtp import WtpBand
from backend.services.competitor.index import build_competitor_ref
from backend.services.events import publish
from backend.services.pricing import elasticity as elasticity_mod
from backend.services.pricing import wtp as wtp_mod
from backend.services.pricing.envelope import resolve_envelope
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Input loaders — broken out so tests can monkey-patch them.
# ---------------------------------------------------------------------------


def _load_price(*, aid: str, db_session: Session) -> Optional[PriceState]:
    row = db_session.execute(
        select(PriceStateRow).where(PriceStateRow.aid == aid)
    ).scalar_one_or_none()
    if row is None:
        return None
    return PriceState(
        aid=row.aid,
        current_price=row.current_price,
        currency=row.currency,
        floor=row.floor,
        ceiling=row.ceiling,
        list_price=row.list_price,
        last_set_by=row.last_set_by,
        last_set_at=row.last_set_at,
        lineage_ref=None,
    )


def _load_cost(*, aid: str, db_session: Session) -> Optional[CostState]:
    row = db_session.execute(
        select(CostStateRow).where(CostStateRow.aid == aid)
    ).scalar_one_or_none()
    if row is None:
        return None
    breakdown_dict = row.breakdown or {}
    return CostState(
        aid=row.aid,
        unit_cost=row.unit_cost,
        breakdown=CostBreakdown(**breakdown_dict) if breakdown_dict else CostBreakdown(),
        last_ingested_at=row.last_ingested_at,
        trajectory_30d=[],
        lineage_ref=None,
    )


def _load_wtp(
    *,
    aid: str,
    tier: Optional[str],
    cluster: Optional[str] = None,
    customer_id: Optional[str] = None,
    db_session: Session,
) -> Optional[WtpBand]:
    """Build the WTP band, threading ``cluster`` for the n<5 cluster-anchor
    fallback. ``customer_id`` is accepted today as a lineage hint; once a
    per-customer WTP query exists it will drive a per-customer band.
    """
    # TODO(pricing-studio-v3/p2): when the customer-deal table lands,
    # branch here on ``customer_id is not None`` and call
    # ``wtp_mod.build_customer_wtp(...)`` for a per-customer band — for
    # Phase 1 we still use the SKU × tier band but tag the lineage so
    # the attribution stays auditable.
    try:
        return wtp_mod.build_wtp(
            aid=aid,
            tier=tier,
            cluster=cluster,
            window_days=540,
            db_session=db_session,
        )
    except Exception:
        logger.exception(
            "recommendation._load_wtp failed aid=%s customer_id=%s",
            aid,
            customer_id,
        )
        return None


def _load_competitor(*, aid: str, db_session: Session) -> Optional[CompetitorRef]:
    try:
        return build_competitor_ref(aid=aid, n_days=90, db_session=db_session)
    except Exception:
        logger.exception("recommendation._load_competitor failed aid=%s", aid)
        return None


def _load_curve(
    *,
    aid: str,
    tier: Optional[str],
    floor: Decimal,
    ceiling: Decimal,
    db_session: Session,
) -> Optional[WinProbCurve]:
    try:
        return elasticity_mod.build_win_prob_curve(
            aid=aid,
            tier=tier,
            points=20,
            floor=floor,
            ceiling=ceiling,
            db_session=db_session,
        )
    except Exception:
        logger.exception("recommendation._load_curve failed aid=%s", aid)
        return None


def _persist_lineage(*, aid: str, db_session: Session) -> LineageRef:
    row = create_lineage(
        source_kind=LineageSourceKind.ELASTICITY_MODEL,
        source_id=f"rec:{aid}",
        sql=None,
        model="recommender_v1",
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


# ---------------------------------------------------------------------------
# Maths — DB2-maximising price + bands.
# ---------------------------------------------------------------------------


def _expected_db2(price: Decimal, cost: Decimal, win_prob: Decimal) -> Decimal:
    return (price - cost) * win_prob


def _pick_optimum(curve: WinProbCurve, cost: Decimal) -> Decimal:
    """Price that maximises DB2 = (price - cost) × win_prob."""
    best_price = curve.points[0].price
    best_db2 = _expected_db2(best_price, cost, curve.points[0].win_prob)
    for pt in curve.points[1:]:
        db2 = _expected_db2(pt.price, cost, pt.win_prob)
        if db2 > best_db2:
            best_db2 = db2
            best_price = pt.price
    return best_price


def _band_min(curve: WinProbCurve) -> Decimal:
    """Lowest price with win-prob ≥ 80% (least 'easy' floor).

    We walk left→right (low→high price) and remember the last point that
    still cleared 80% — that's the upper bound of "safe-to-win" range.
    """
    threshold = Decimal("0.8")
    candidates = [pt.price for pt in curve.points if pt.win_prob >= threshold]
    if candidates:
        return min(candidates)
    # No safe-win threshold met — fall back to curve's lowest price.
    return curve.points[0].price


def _band_max(curve: WinProbCurve) -> Decimal:
    """Highest price with win-prob ≥ 50%."""
    threshold = Decimal("0.5")
    candidates = [pt.price for pt in curve.points if pt.win_prob >= threshold]
    if candidates:
        return max(candidates)
    return curve.points[-1].price


# ---------------------------------------------------------------------------
# Driver attribution — marginal removal (SHAP-style for 5 inputs).
# ---------------------------------------------------------------------------


def _neutral_curve(curve: WinProbCurve) -> WinProbCurve:
    """A 'neutral' win-prob curve — flat 50% at all sampled prices.

    Used when measuring the curve's contribution to the recommendation:
    we re-run the optimiser pretending the curve carried no information.
    """
    neutral_points = [
        CurvePoint(
            price=pt.price,
            win_prob=Decimal("0.5"),
            lower_ci=Decimal("0.5"),
            upper_ci=Decimal("0.5"),
        )
        for pt in curve.points
    ]
    return WinProbCurve(
        aid=curve.aid,
        tier=curve.tier,
        points=neutral_points,
        n_deals=curve.n_deals,
        confidence_band=None,
        lineage_ref=curve.lineage_ref,
    )


def _pick_with_floor(curve: WinProbCurve, cost: Decimal, floor: Decimal) -> Decimal:
    """Optimum subject to ``price ≥ floor``."""
    best_price: Optional[Decimal] = None
    best_db2: Optional[Decimal] = None
    for pt in curve.points:
        if pt.price < floor:
            continue
        db2 = _expected_db2(pt.price, cost, pt.win_prob)
        if best_db2 is None or db2 > best_db2:
            best_db2 = db2
            best_price = pt.price
    if best_price is None:
        # Every grid point is below the floor — clamp to floor.
        return floor
    return best_price


def _customer_mix_lineage(
    *,
    aid: str,
    cluster: Optional[str],
    customer_id: Optional[str],
    db_session: Session,
) -> LineageRef:
    """Persist a dedicated lineage row for the customer-mix driver.

    ``source_id`` encodes ``cust:<id>:cluster:<id>`` so a downstream
    auditor can replay which (customer × cluster) pair drove the
    attribution. When neither is provided we still tag it ``cust:any``
    so the lineage is unambiguous.

    TODO(pricing-studio-v3/p2): once ``customer_on_sku.share`` lands
    (Phase 2 data source), use it to weight the customer-mix
    contribution by actual revenue share rather than the WTP-p50
    proxy. For Phase 1 we tag the lineage so the attribution is
    replayable, but the magnitude still comes from the SKU-wide WTP.
    """
    cust_tag = customer_id or "any"
    cluster_tag = cluster or "none"
    row = create_lineage(
        source_kind=LineageSourceKind.WON_DEAL_SAMPLE,
        source_id=f"rec:{aid}:cust:{cust_tag}:cluster:{cluster_tag}",
        sql=None,
        model="customer_mix_v1",
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


def _compute_drivers(
    *,
    rec_price: Decimal,
    cost: Decimal,
    cost_floor: Decimal,
    curve: WinProbCurve,
    competitor: Optional[CompetitorRef],
    wtp: Optional[WtpBand],
    lineages: dict[str, Optional[LineageRef]],
    cluster: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> list[Driver]:
    """Marginal-removal driver attribution.

    For each Phase-1 driver, compute the recommended price with that
    driver "removed" (replaced by a neutral value); the magnitude of the
    delta is its contribution. Contributions are then L1-normalised so
    they sum to 1.0 (matches the wire model's 0..1 range — spec said
    "100 ±1%", we use the canonical fractional form).
    """
    # Pre-compute reference moves.
    neutral_curve = _neutral_curve(curve)
    rec_no_curve = _pick_optimum(neutral_curve, cost)
    rec_no_floor = _pick_optimum(curve, cost)
    # "No cost trajectory" baseline: treat current cost as the *reference*
    # unit cost (i.e. no-move). We don't have a historic baseline here, so
    # we approximate by using the WTP p50 as the neutral cost proxy when
    # available, else fall back to a 0% margin neutral price.
    neutral_cost = (
        wtp.p50 if (wtp is not None and wtp.p50 > 0) else cost
    )
    rec_neutral_cost = _pick_optimum(curve, neutral_cost)
    # "No competitor signal": replace competitor median with WTP p50 when
    # we have one, else replace with the rec price itself (zero delta).
    if competitor is not None and wtp is not None:
        # Tilt the curve as if competitor median anchored at p50 (pull
        # toward p50). Approximate by re-running the optimum with the
        # cost shifted by the competitor delta.
        cost_shift = competitor.median_price - wtp.p50
        shifted_cost = max(Decimal("0"), cost + cost_shift * Decimal("0.1"))
        rec_no_competitor = _pick_optimum(curve, shifted_cost)
    else:
        rec_no_competitor = rec_price
    # "No customer mix": tier-agnostic curve — we don't have a separate
    # untiered curve here, so we attribute the spread between the WTP p50
    # and the recommended price as the customer-mix signal magnitude.
    # When a ``cluster`` is provided, we mix in the cluster-median price
    # (approximated by the WTP p50 — which is the cluster anchor when
    # the band was anchored from cluster) as a tertiary signal so the
    # magnitude reflects the cluster pull, not just the SKU's own
    # won-deal mean.
    rec_no_customer_mix = wtp.p50 if wtp is not None else rec_price
    if cluster is not None and wtp is not None:
        # Tertiary signal: nudge the customer-mix reference toward the
        # cluster median (proxied by wtp.p50 when anchored_from_cluster;
        # else by an equally-weighted blend with the recommended price
        # so the signal magnitude is still cluster-aware).
        if getattr(wtp, "anchored_from_cluster", False):
            cluster_median = wtp.p50
        else:
            cluster_median = (wtp.p50 + rec_price) / Decimal("2")
        rec_no_customer_mix = (
            (rec_no_customer_mix + cluster_median) / Decimal("2")
        )

    raw: dict[DriverKind, Decimal] = {
        DriverKind.COST_TRAJECTORY: abs(rec_price - rec_neutral_cost),
        DriverKind.COMPETITOR_SIGNAL: abs(rec_price - rec_no_competitor),
        DriverKind.CUSTOMER_MIX: abs(rec_price - rec_no_customer_mix),
        DriverKind.WIN_PROB_OPTIMUM: abs(rec_price - rec_no_curve),
        DriverKind.FLOOR_PROTECTION: (
            abs(rec_price - rec_no_floor)
            if rec_no_floor < cost_floor
            else Decimal("0")
        ),
    }
    # Always assign a small ε so every driver pill renders with a
    # non-zero contribution (matches the spec's "every kind present").
    epsilon = Decimal("0.0001")
    total = sum((v + epsilon for v in raw.values()), Decimal("0"))
    if total == 0:
        # Degenerate: every signal said "no move". Give equal share.
        share = Decimal("1") / Decimal(str(len(raw)))
        normalised = {k: share for k in raw}
    else:
        normalised = {k: (v + epsilon) / total for k, v in raw.items()}

    # Snap to two decimal places so the wire shape is friendly and the
    # sum stays inside ±0.01 of 1.0.
    quantised = {k: v.quantize(Decimal("0.0001")) for k, v in normalised.items()}
    # Renormalise after quantisation to keep the sum within tolerance.
    s = sum(quantised.values(), Decimal("0"))
    if s != 0:
        quantised = {k: (v / s).quantize(Decimal("0.0001")) for k, v in quantised.items()}

    labels: dict[DriverKind, str] = {
        DriverKind.COST_TRAJECTORY: "Cost trajectory",
        DriverKind.COMPETITOR_SIGNAL: "Competitor signal",
        DriverKind.CUSTOMER_MIX: "Customer mix",
        DriverKind.WIN_PROB_OPTIMUM: "Win-prob optimum",
        DriverKind.FLOOR_PROTECTION: "Floor protection",
    }
    lineage_for: dict[DriverKind, Optional[LineageRef]] = {
        DriverKind.COST_TRAJECTORY: lineages.get("cost"),
        DriverKind.COMPETITOR_SIGNAL: lineages.get("competitor"),
        # Prefer the customer-mix specific lineage (with cust/cluster
        # tags) when we built one; fall back to the WTP lineage.
        DriverKind.CUSTOMER_MIX: (
            lineages.get("customer_mix") or lineages.get("wtp")
        ),
        DriverKind.WIN_PROB_OPTIMUM: lineages.get("curve"),
        DriverKind.FLOOR_PROTECTION: lineages.get("price"),
    }
    return [
        Driver(
            kind=k,
            label=labels[k],
            contribution_pct=quantised[k],
            lineage_ref=lineage_for[k] or lineages.get("rec"),
        )
        for k in (
            DriverKind.COST_TRAJECTORY,
            DriverKind.COMPETITOR_SIGNAL,
            DriverKind.CUSTOMER_MIX,
            DriverKind.WIN_PROB_OPTIMUM,
            DriverKind.FLOOR_PROTECTION,
        )
    ]


# ---------------------------------------------------------------------------
# Confidence bucket — combines WTP confidence with curve sample size.
# ---------------------------------------------------------------------------


def _confidence_level(
    wtp: Optional[WtpBand], curve: Optional[WinProbCurve]
) -> ConfidenceLevel:
    if wtp is None or curve is None or curve.confidence_band is None:
        return ConfidenceLevel.LOW
    if wtp.confidence == ConfidenceLevel.LOW:
        return ConfidenceLevel.LOW
    if wtp.confidence == ConfidenceLevel.HIGH and curve.n_deals >= 15:
        return ConfidenceLevel.HIGH
    return ConfidenceLevel.MED


def _numeric_confidence(level: ConfidenceLevel) -> Decimal:
    return {
        ConfidenceLevel.LOW: Decimal("0.35"),
        ConfidenceLevel.MED: Decimal("0.65"),
        ConfidenceLevel.HIGH: Decimal("0.9"),
    }[level]


# ---------------------------------------------------------------------------
# Rationale — deterministic templated markdown.
# ---------------------------------------------------------------------------


def _render_rationale(
    *,
    rec_price: Decimal,
    cost: Decimal,
    cost_floor: Decimal,
    safety_margin_pp: Decimal,
    competitor: Optional[CompetitorRef],
    wtp: Optional[WtpBand],
    curve: Optional[WinProbCurve],
    drivers: list[Driver],
) -> str:
    lines = [f"**Why €{rec_price:.2f}?**"]
    cost_drv = next((d for d in drivers if d.kind == DriverKind.COST_TRAJECTORY), None)
    if cost_drv is not None:
        pct = (cost_drv.contribution_pct * Decimal("100")).quantize(Decimal("1"))
        lines.append(
            f"- Cost trajectory contributes {pct}%: unit cost at €{cost:.2f}."
        )
    if competitor is not None:
        lines.append(
            f"- Competitor signal at €{competitor.median_price:.2f} "
            f"(n={competitor.sample_count} lost quotes)."
        )
    else:
        lines.append("- Competitor signal: no recent lost-quote samples (PA/PR).")
    lines.append(
        f"- Floor protection holds at €{cost_floor:.2f} "
        f"({safety_margin_pp:.0f}pp margin)."
    )
    if wtp is not None:
        lines.append(
            f"- WTP p50 = €{wtp.p50:.2f} (n={wtp.n_deals} deals, "
            f"window={wtp.window_days}d)."
        )
    else:
        lines.append("- WTP band: insufficient won-deal sample.")
    if curve is not None and curve.points:
        # Find win-prob at the recommended price (nearest grid point).
        closest = min(curve.points, key=lambda p: abs(p.price - rec_price))
        wp_pct = (closest.win_prob * Decimal("100")).quantize(Decimal("1"))
        lines.append(f"- Optimum win-prob at recommended: {wp_pct}%.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API.
# ---------------------------------------------------------------------------


def build_recommendation(
    *,
    aid: str,
    tier: Optional[str] = None,
    cluster: Optional[str] = None,
    customer_id: Optional[str] = None,
    db_session: Session,
) -> Recommendation:
    """Compose the per-SKU Recommendation. Never returns None.

    On missing inputs we degrade to a fallback Recommendation marked
    ``confidence_level == LOW`` so the operator sees a visible "data
    incomplete" pill rather than a silent 0.
    """
    price = _load_price(aid=aid, db_session=db_session)
    cost = _load_cost(aid=aid, db_session=db_session)
    wtp = _load_wtp(
        aid=aid,
        tier=tier,
        cluster=cluster,
        customer_id=customer_id,
        db_session=db_session,
    )
    competitor = _load_competitor(aid=aid, db_session=db_session)

    # Determine the optimisation envelope — same canonical cascade the
    # workbench uses when it asks elasticity for the win-prob curve.
    # See ``backend.services.pricing.envelope`` for the cascade.
    floor, ceiling = resolve_envelope(price, cost)

    curve = _load_curve(
        aid=aid, tier=tier, floor=floor, ceiling=ceiling, db_session=db_session
    )

    # Customer-mix lineage carries the cluster/customer_id tags so the
    # attribution stays auditable even when the magnitude still comes
    # from the SKU-wide WTP (per the TODO in _customer_mix_lineage).
    # Only persisted when at least one of the tags is set — otherwise
    # the customer-mix driver re-uses the WTP lineage as before.
    customer_mix_lineage: Optional[LineageRef] = None
    if cluster is not None or customer_id is not None:
        customer_mix_lineage = _customer_mix_lineage(
            aid=aid,
            cluster=cluster,
            customer_id=customer_id,
            db_session=db_session,
        )
    lineages: dict[str, Optional[LineageRef]] = {
        "price": price.lineage_ref if price else None,
        "cost": cost.lineage_ref if cost else None,
        "wtp": wtp.lineage_ref if wtp else None,
        "competitor": competitor.lineage_ref if competitor else None,
        "curve": curve.lineage_ref if curve else None,
        "customer_mix": customer_mix_lineage,
        "rec": _persist_lineage(aid=aid, db_session=db_session),
    }

    # Fallback path — anything critical missing.
    if cost is None or curve is None or curve.confidence_band is None:
        # Use a defensible fallback price.
        if price is not None:
            fallback = price.current_price
        elif wtp is not None:
            fallback = wtp.p50
        elif cost is not None:
            fallback = (cost.unit_cost * Decimal("1.3")).quantize(Decimal("0.01"))
        else:
            fallback = Decimal("0.01")  # last-ditch — never zero
        # MF1: clamp the fallback price to the curve envelope so the
        # workbench's curve and the recommended price always live on the
        # same grid. Without this clamp a low-data SKU with a healthy
        # WTP sample could land far outside the [floor, ceiling] the
        # curve was built on (e.g. wtp.p50=727 vs envelope=[85,120]).
        if fallback < floor:
            fallback = floor
        elif fallback > ceiling:
            fallback = ceiling
        rationale = (
            "**Why this price?**\n"
            "- This is a fallback recommendation; one or more inputs were missing.\n"
            f"- Inputs available: cost={cost is not None}, "
            f"price={price is not None}, wtp={wtp is not None}, "
            f"competitor={competitor is not None}, curve={curve is not None}.\n"
            "- Confidence is forced to LOW until inputs are healed."
        )
        drivers = [
            Driver(
                kind=k,
                label=label,
                contribution_pct=Decimal("0.20"),
                lineage_ref=lineages["rec"],
            )
            for k, label in (
                (DriverKind.COST_TRAJECTORY, "Cost trajectory (fallback)"),
                (DriverKind.COMPETITOR_SIGNAL, "Competitor signal (fallback)"),
                (DriverKind.CUSTOMER_MIX, "Customer mix (fallback)"),
                (DriverKind.WIN_PROB_OPTIMUM, "Win-prob optimum (fallback)"),
                (DriverKind.FLOOR_PROTECTION, "Floor protection (fallback)"),
            )
        ]
        return Recommendation(
            aid=aid,
            recommended_price=fallback,
            confidence=_numeric_confidence(ConfidenceLevel.LOW),
            confidence_level=ConfidenceLevel.LOW,
            band=RecommendationBand(min=fallback, target=fallback, max=fallback),
            drivers=drivers,
            rationale_md=rationale,
            lineage_ref=lineages["rec"],
        )

    # Healthy path.
    unit_cost = cost.unit_cost
    # Safety margin: 10pp above unit cost is the cost-floor proxy when
    # PriceState doesn't carry a floor.
    safety_margin_pp = Decimal("10")
    cost_floor = (
        price.floor
        if (price is not None and price.floor is not None)
        else (unit_cost * (Decimal("1") + safety_margin_pp / Decimal("100")))
    )
    cost_floor = cost_floor.quantize(Decimal("0.01"))

    # DB2-optimum, respecting the cost floor.
    optimum = _pick_with_floor(curve, unit_cost, cost_floor)
    rec_price = optimum.quantize(Decimal("0.01"))
    band_min = _band_min(curve).quantize(Decimal("0.01"))
    band_max = _band_max(curve).quantize(Decimal("0.01"))
    # Order guarantees: min ≤ target ≤ max.
    band_min = min(band_min, rec_price)
    band_max = max(band_max, rec_price)

    drivers = _compute_drivers(
        rec_price=rec_price,
        cost=unit_cost,
        cost_floor=cost_floor,
        curve=curve,
        competitor=competitor,
        wtp=wtp,
        lineages=lineages,
        cluster=cluster,
        customer_id=customer_id,
    )

    level = _confidence_level(wtp, curve)
    rationale = _render_rationale(
        rec_price=rec_price,
        cost=unit_cost,
        cost_floor=cost_floor,
        safety_margin_pp=safety_margin_pp,
        competitor=competitor,
        wtp=wtp,
        curve=curve,
        drivers=drivers,
    )

    return Recommendation(
        aid=aid,
        recommended_price=rec_price,
        confidence=_numeric_confidence(level),
        confidence_level=level,
        band=RecommendationBand(min=band_min, target=rec_price, max=band_max),
        drivers=drivers,
        rationale_md=rationale,
        lineage_ref=lineages["rec"],
    )


def _recommendation_to_dict(rec: Recommendation) -> dict[str, Any]:
    """Pydantic → JSON-safe dict (Decimal → str, datetime → ISO)."""
    return rec.model_dump(mode="json")


def recompute(aid: str, *, tier: Optional[str] = None) -> Optional[Recommendation]:
    """Rebuild the recommendation and publish ``pricing.recommendation_updated``.

    Called by the cost-ingest service when ``pricing.cost_moved`` fires.
    Safe to call from any context — pubsub uses ``publish_sync`` when no
    event loop is running.
    """
    try:
        with SessionLocal() as db:
            rec = build_recommendation(aid=aid, tier=tier, db_session=db)
            db.commit()
    except Exception:
        logger.exception("recommendation.recompute failed aid=%s", aid)
        return None

    payload = _recommendation_to_dict(rec)
    try:
        # If we're in an async context, schedule on the running loop;
        # otherwise fall through to the sync façade.
        loop = asyncio.get_running_loop()
        loop.create_task(
            publish("pricing.recommendation_updated", payload, aid=aid)
        )
    except RuntimeError:
        # No running loop — use the sync path.
        from backend.services.events import publish_sync

        publish_sync("pricing.recommendation_updated", payload, aid=aid)
    return rec
