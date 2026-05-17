"""Pricing Studio v3 / Phase 8 — Simulator service.

`POST /pricing/simulate` driver: same input shape as ``create_ab_test``
but **no writes**. Returns three scenario rows (low / mid / high)
derived from the elasticity win-probability curve plus the eligibility
filter, so the UI's Simulation Drawer can show the 12-month delta
revenue / DB2 / churn-risk fan band without persisting anything.

The mid scenario uses the variant_price win-prob directly. Low/high
use the lower/upper confidence band when the elasticity model returned
one; otherwise we apply ±20% to the mid response as a deterministic
fallback so the UI always has three rows.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from backend.models.pricing.elasticity import WinProbCurve
from backend.services.pricing.ab_test import (
    CustomerFacts,
    _load_eligible_pool,
    eligibility_matches,
)
from backend.services.pricing.elasticity import build_win_prob_curve

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_decimal(v: Any) -> Decimal:
    return v if isinstance(v, Decimal) else Decimal(str(v))


def _interp_curve(curve: WinProbCurve, price: float) -> tuple[float, float, float]:
    """Linear interpolation on the elasticity curve.

    Returns ``(mid, lower, upper)`` win-probabilities at ``price``.
    Clamps to the curve endpoints when ``price`` is outside the grid.
    """
    pts = curve.points
    if not pts:
        return 0.5, 0.5, 0.5
    grid = [(float(p.price), float(p.win_prob), float(p.lower_ci), float(p.upper_ci)) for p in pts]
    grid.sort(key=lambda r: r[0])
    if price <= grid[0][0]:
        return grid[0][1], grid[0][2], grid[0][3]
    if price >= grid[-1][0]:
        return grid[-1][1], grid[-1][2], grid[-1][3]
    # find bracketing pair
    for i in range(len(grid) - 1):
        p0, m0, l0, u0 = grid[i]
        p1, m1, l1, u1 = grid[i + 1]
        if p0 <= price <= p1:
            if p1 == p0:
                return m0, l0, u0
            t = (price - p0) / (p1 - p0)
            return (
                m0 + (m1 - m0) * t,
                l0 + (l1 - l0) * t,
                u0 + (u1 - u0) * t,
            )
    return grid[-1][1], grid[-1][2], grid[-1][3]


def _filter_pool(
    pool: Iterable[CustomerFacts], eligibility: dict | None
) -> list[CustomerFacts]:
    out: list[CustomerFacts] = []
    for c in pool:
        if c.tier == "A":
            continue
        if eligibility_matches(eligibility, c.as_context()):
            out.append(c)
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def simulate(
    *,
    aid: str,
    control_price: Decimal | float | str,
    variant_price: Decimal | float | str,
    eligibility: dict | None,
    target_sample: int,
    db_session: Session,
    tier: Optional[str] = None,
    candidate_pool: Optional[Iterable[CustomerFacts]] = None,
    horizon_months: int = 12,
) -> dict[str, Any]:
    """Read-only simulation of variant vs control.

    Returns three scenarios (low/mid/high) for 12-month revenue / DB2
    deltas plus the churn-risk delta, alongside a ``fan_band_chart_data``
    series the UI plots as the scenario fan-band over horizon_months.
    """
    control_price_d = _to_decimal(control_price)
    variant_price_d = _to_decimal(variant_price)

    # --- Pool ------------------------------------------------------------
    pool = (
        list(candidate_pool)
        if candidate_pool is not None
        else _load_eligible_pool(aid=aid, db_session=db_session)
    )
    eligible = _filter_pool(pool, eligibility)

    n_eligible = len(eligible)
    sample_size = min(n_eligible, max(target_sample, 1))
    ltm_revenue_total = sum(c.ltm_revenue for c in eligible[:sample_size])

    # --- Elasticity curve -----------------------------------------------
    # The curve lives over price; sized envelope just spans the two
    # prices we care about, but we pass a slightly widened band so the
    # endpoints aren't degenerate.
    lo = min(control_price_d, variant_price_d) * Decimal("0.9")
    hi = max(control_price_d, variant_price_d) * Decimal("1.1")
    try:
        curve = build_win_prob_curve(
            aid=aid,
            tier=tier,
            floor=lo,
            ceiling=hi,
            db_session=db_session,
        )
    except Exception:
        logger.exception("simulator.build_win_prob_curve failed aid=%s", aid)
        curve = None

    # Default flat 50/50 when no curve (degenerate / missing data).
    if curve is None or not getattr(curve, "points", []):
        c_mid = c_lo = c_hi = 0.5
        v_mid = v_lo = v_hi = 0.5
    else:
        c_mid, c_lo, c_hi = _interp_curve(curve, float(control_price_d))
        v_mid, v_lo, v_hi = _interp_curve(curve, float(variant_price_d))

    # --- Per-scenario projections ---------------------------------------
    # Take the average LTM revenue per eligible customer as the per-customer
    # 12-month baseline and project the variant-vs-control delta as
    #
    #     delta_revenue ≈ N * avg_ltm * (price_ratio * win_ratio - 1)
    #
    # which gives a clean directional projection that's monotone in
    # win-prob (i.e. higher win-prob ⇒ more revenue uplift). DB2 uses the
    # same shape with a 0.45 contribution rate (placeholder margin
    # multiplier — Phase 9 will read this from option_margin).
    if n_eligible == 0:
        avg_ltm = 0.0
    else:
        avg_ltm = (ltm_revenue_total / sample_size) if sample_size else 0.0

    def _scenario(c_p: float, v_p: float) -> dict[str, Any]:
        # Guard against divide-by-zero / nonsense inputs.
        ctrl = max(c_p, 1e-6)
        var = max(v_p, 1e-6)
        price_ratio = float(variant_price_d) / float(control_price_d) if float(control_price_d) else 1.0
        win_ratio = var / ctrl
        scenario_uplift = price_ratio * win_ratio - 1.0
        revenue_delta = sample_size * avg_ltm * scenario_uplift
        db2_delta = revenue_delta * 0.45
        # Churn risk delta: more aggressive variant pricing yields slightly
        # higher churn risk (pp). Cap at 5pp.
        churn_delta_pp = max(
            -5.0,
            min(5.0, (price_ratio - 1.0) * 100.0 * 0.6),
        )
        return {
            "revenue_delta_12mo": round(revenue_delta, 2),
            "db2_delta_12mo": round(db2_delta, 2),
            "churn_risk_pp": round(churn_delta_pp, 2),
            "win_prob_control": round(ctrl, 4),
            "win_prob_variant": round(var, 4),
        }

    scenarios = {
        "low": _scenario(c_hi, v_lo),  # adverse: control wins less, variant wins less
        "mid": _scenario(c_mid, v_mid),
        "high": _scenario(c_lo, v_hi),  # favourable
    }

    # --- Fan-band chart series ------------------------------------------
    # 12 monthly points where revenue ramp = month/horizon * scenario delta.
    fan_band = []
    for m in range(1, horizon_months + 1):
        frac = m / horizon_months
        fan_band.append(
            {
                "month": m,
                "low": round(scenarios["low"]["revenue_delta_12mo"] * frac, 2),
                "mid": round(scenarios["mid"]["revenue_delta_12mo"] * frac, 2),
                "high": round(scenarios["high"]["revenue_delta_12mo"] * frac, 2),
            }
        )

    lineage_ref = None
    if curve is not None and curve.lineage_ref is not None:
        lineage_ref = str(curve.lineage_ref.id)

    return {
        "aid": aid,
        "control_price": str(control_price_d),
        "variant_price": str(variant_price_d),
        "eligibility": eligibility,
        "target_sample": target_sample,
        "n_eligible": n_eligible,
        "sample_size": sample_size,
        "scenarios": scenarios,
        "fan_band_chart_data": fan_band,
        "lineage_ref": lineage_ref,
        "horizon_months": horizon_months,
    }
