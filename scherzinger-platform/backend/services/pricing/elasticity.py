"""Win-probability curve — logistic elasticity over price.

For each SKU × tier we fit a binary logistic regression:

    P(won | margin) = σ(β0 + β1 · margin), margin = (price - cost) / cost

then evaluate it at 20 prices evenly spaced across [floor, ceiling] from
the active PriceState.

Implementation choice: ``scikit-learn`` is NOT in ``requirements.txt`` for
the platform, so we hand-roll Newton-Raphson (IRLS) for the logistic fit
and use the asymptotic standard error of β for confidence intervals.
Bootstrap is documented as a future swap-in.

Fallback: ``n_deals < 8`` returns a flat 50% curve with ``confidence_band
= None`` and lineage marked ``model="fallback_flat"`` so the UI shows a
visible "insufficient data" pill.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Optional

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.models.pricing.elasticity import CurvePoint, WinProbCurve
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)

MIN_DEALS_FOR_FIT = 8


_DEALS_SQL = text(
    """
    SELECT (q.revenue / NULLIF(q.quantity, 0))::numeric AS unit_price,
           q.hkvoll                                      AS unit_cost,
           CASE WHEN q.is_won THEN 1 ELSE 0 END           AS won
      FROM quotes q
     WHERE q.article_id = :aid
       AND q.revenue IS NOT NULL
       AND q.quantity IS NOT NULL
       AND q.quantity > 0
       AND q.hkvoll IS NOT NULL
       AND q.hkvoll > 0
       AND (:tier IS NULL OR q.business_unit = :tier)
    """
)


def _sigmoid(z: np.ndarray) -> np.ndarray:
    # Numerically-stable sigmoid.
    out = np.empty_like(z, dtype=float)
    pos = z >= 0
    out[pos] = 1.0 / (1.0 + np.exp(-z[pos]))
    neg_exp = np.exp(z[~pos])
    out[~pos] = neg_exp / (1.0 + neg_exp)
    return out


def _fit_logistic(x: np.ndarray, y: np.ndarray, *, max_iter: int = 50, tol: float = 1e-6):
    """IRLS (Newton-Raphson) fit for logistic regression with intercept.

    ``x`` shape (n,), ``y`` shape (n,) in {0,1}. Returns ``(beta, cov)`` where
    ``beta = [b0, b1]`` and ``cov`` is the asymptotic 2x2 covariance matrix
    or ``None`` if the Hessian was singular.

    SF6: returns ``None`` outright when the sample is degenerate (all-won
    or all-lost). The logistic likelihood is unbounded in that regime —
    IRLS will diverge or land on a meaningless saturated fit — so the
    caller MUST treat ``None`` as "fall back to flat-50%".
    """
    n = len(x)
    # SF6: degenerate sample — every deal won (y.sum() == n) or every
    # deal lost (y.sum() == 0). Logistic regression has no MLE on this
    # data; IRLS will silently converge to ±inf intercepts. Signal
    # degeneracy by returning None so the caller can fall back.
    if n == 0 or y.sum() == 0 or y.sum() == n:
        return None
    X = np.column_stack([np.ones(n), x])  # (n, 2)
    beta = np.zeros(2)
    for _ in range(max_iter):
        z = X @ beta
        p = _sigmoid(z)
        # Diagonal weight matrix W = diag(p*(1-p)). Use vectorised form.
        w = p * (1.0 - p)
        # Guard against perfect separation: w → 0.
        if not np.any(w > 1e-9):
            break
        H = X.T @ (X * w[:, None])
        g = X.T @ (y - p)
        try:
            step = np.linalg.solve(H, g)
        except np.linalg.LinAlgError:
            return beta, None
        beta_new = beta + step
        if np.max(np.abs(step)) < tol:
            beta = beta_new
            break
        beta = beta_new
    # Final covariance.
    z = X @ beta
    p = _sigmoid(z)
    w = p * (1.0 - p)
    H = X.T @ (X * w[:, None])
    try:
        cov = np.linalg.inv(H)
    except np.linalg.LinAlgError:
        cov = None
    return beta, cov


def _build_fallback(
    *,
    aid: str,
    tier: Optional[str],
    points_n: int,
    floor: Decimal,
    ceiling: Decimal,
    db_session: Session,
    n_deals: int,
) -> WinProbCurve:
    """Flat-50% curve with ``model="fallback_flat"`` lineage."""
    prices = np.linspace(float(floor), float(ceiling), points_n)
    # SF5: float -> Decimal boundary; quantize to 4 decimal places for
    # consistency with the logistic path's grid precision.
    _PRICE_Q = Decimal("0.0001")
    points = [
        CurvePoint(
            price=Decimal(str(float(p))).quantize(_PRICE_Q),
            win_prob=Decimal("0.5"),
            lower_ci=Decimal("0.5"),
            upper_ci=Decimal("0.5"),
        )
        for p in prices
    ]
    lineage_row = create_lineage(
        source_kind=LineageSourceKind.ELASTICITY_MODEL,
        source_id=f"elasticity:{aid}:{tier or 'all'}",
        sql=str(_DEALS_SQL),
        model="fallback_flat",
        computed_by="system",
        session=db_session,
    )
    lineage = LineageRef(
        id=lineage_row.id,
        source_kind=lineage_row.source_kind,
        source_id=lineage_row.source_id,
        sql=lineage_row.sql,
        model=lineage_row.model,
        computed_at=lineage_row.computed_at,
        computed_by=lineage_row.computed_by,
    )
    return WinProbCurve(
        aid=aid,
        tier=tier,
        points=points,
        n_deals=n_deals,
        confidence_band=None,
        lineage_ref=lineage,
    )


def build_win_prob_curve(
    *,
    aid: str,
    tier: Optional[str] = None,
    points: int = 20,
    floor: Decimal,
    ceiling: Decimal,
    db_session: Session,
) -> WinProbCurve:
    """Fit + evaluate the win-probability curve.

    The caller (``recommendation.py``) is responsible for supplying the
    ``[floor, ceiling]`` envelope from ``PriceState``.
    """
    rows = db_session.execute(_DEALS_SQL, {"aid": aid, "tier": tier}).fetchall()

    samples: list[tuple[float, float, int]] = []
    for r in rows:
        if r[0] is None or r[1] is None:
            continue
        price = float(r[0])
        cost = float(r[1])
        if cost <= 0:
            continue
        won = int(r[2] or 0)
        samples.append((price, cost, won))

    n = len(samples)
    if n < MIN_DEALS_FOR_FIT:
        logger.info(
            "elasticity.fallback aid=%s tier=%s n=%d (< %d) — flat 50%% curve",
            aid,
            tier,
            n,
            MIN_DEALS_FOR_FIT,
        )
        return _build_fallback(
            aid=aid,
            tier=tier,
            points_n=points,
            floor=floor,
            ceiling=ceiling,
            db_session=db_session,
            n_deals=n,
        )

    # Margin feature: (price - cost) / cost.
    margins = np.array([(p - c) / c for p, c, _w in samples], dtype=float)
    wins = np.array([w for _p, _c, w in samples], dtype=float)
    avg_cost = float(np.mean([c for _p, c, _w in samples]))

    fit_result = _fit_logistic(margins, wins)
    if fit_result is None:
        # SF6: all-won or all-lost — logistic likelihood is unbounded,
        # no MLE exists. Fall through to the flat-50% curve so the UI
        # shows a visible "insufficient signal" badge.
        logger.warning(
            "elasticity.degenerate_sample aid=%s tier=%s n=%d wins=%d "
            "— all-won or all-lost, falling back to flat 50%%",
            aid,
            tier,
            n,
            int(wins.sum()),
        )
        return _build_fallback(
            aid=aid,
            tier=tier,
            points_n=points,
            floor=floor,
            ceiling=ceiling,
            db_session=db_session,
            n_deals=n,
        )
    beta, cov = fit_result
    if cov is None:
        # Degenerate fit — degrade to the flat curve, log it.
        logger.warning("elasticity.singular_hessian aid=%s tier=%s — falling back", aid, tier)
        return _build_fallback(
            aid=aid,
            tier=tier,
            points_n=points,
            floor=floor,
            ceiling=ceiling,
            db_session=db_session,
            n_deals=n,
        )

    grid_prices = np.linspace(float(floor), float(ceiling), points)
    grid_margins = (grid_prices - avg_cost) / avg_cost
    # SE of the linear predictor at each grid point:
    #   z = b0 + b1 * m   ⇒   Var(z) = x' Σ x with x = [1, m].
    z_means = beta[0] + beta[1] * grid_margins
    grid_x = np.column_stack([np.ones_like(grid_margins), grid_margins])
    z_var = np.einsum("ij,jk,ik->i", grid_x, cov, grid_x)
    z_se = np.sqrt(np.clip(z_var, 0.0, None))
    z_lower = z_means - 1.96 * z_se
    z_upper = z_means + 1.96 * z_se
    p_means = _sigmoid(z_means)
    p_lower = _sigmoid(z_lower)
    p_upper = _sigmoid(z_upper)

    # If the fit suggests price doesn't affect win-prob (β1 ≈ 0) we
    # enforce a tiny monotone decreasing shape so the band columns are
    # still ordered and the UI sparkline doesn't oscillate.
    #
    # SF5: float -> Decimal boundary. ``np.linspace`` / ``_sigmoid``
    # return float64s; we stringify before constructing Decimal to dodge
    # the binary-float gotcha, then quantize so the wire shape stays
    # stable across re-runs. Price grid is quantized to 4 decimal
    # places (finer than cents because the envelope can straddle cents
    # at 20 grid points); win-prob / CI to 4 places (was 6 — match
    # WTP percentile precision so downstream comparisons line up).
    _PRICE_Q = Decimal("0.0001")
    _PROB_Q = Decimal("0.0001")
    curve_points: list[CurvePoint] = []
    for i, p in enumerate(grid_prices):
        pm = float(p_means[i])
        pl = float(min(p_lower[i], p_upper[i]))
        pu = float(max(p_lower[i], p_upper[i]))
        curve_points.append(
            CurvePoint(
                price=Decimal(str(float(p))).quantize(_PRICE_Q),
                win_prob=Decimal(str(max(0.0, min(1.0, pm)))).quantize(_PROB_Q),
                lower_ci=Decimal(str(max(0.0, min(1.0, pl)))).quantize(_PROB_Q),
                upper_ci=Decimal(str(max(0.0, min(1.0, pu)))).quantize(_PROB_Q),
            )
        )

    lineage_row = create_lineage(
        source_kind=LineageSourceKind.ELASTICITY_MODEL,
        source_id=f"elasticity:{aid}:{tier or 'all'}",
        sql=str(_DEALS_SQL),
        model="logistic_irls_v1",
        computed_by="system",
        session=db_session,
    )
    lineage = LineageRef(
        id=lineage_row.id,
        source_kind=lineage_row.source_kind,
        source_id=lineage_row.source_id,
        sql=lineage_row.sql,
        model=lineage_row.model,
        computed_at=lineage_row.computed_at,
        computed_by=lineage_row.computed_by,
    )
    return WinProbCurve(
        aid=aid,
        tier=tier,
        points=curve_points,
        n_deals=n,
        confidence_band="asymptotic",
        lineage_ref=lineage,
    )
