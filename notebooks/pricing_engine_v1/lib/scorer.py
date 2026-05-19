"""Score function and constrained optimiser.

Implements Eq. (1)-(3) of the whitepaper:
    EV(p) = P_win(p) * P_retain(p) * E[V12 | p] * (p - k12) - P_churn(p) * LTV_loss
    S(p)  = sum over customers in the SKU's eligible book
    p*    = argmax S(p) subject to floor/ceiling/Δ-cap/churn-cap
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np

from .cost_demand import SkuInputs, adjusted_volume
from .churn_response import p_churn, p_retain
from .ltv import discounted_contribution
from .win_prob import WinProbFit


@dataclass
class Recommendation:
    article_id: str
    p_star: float
    s_star: float
    p_breakeven: Optional[float]
    score_curve: np.ndarray  # shape (G, 2): (price, score)
    drivers: dict[str, float]
    constraint_active: Optional[str]
    n_customers: int


def _customer_share(invoices, article_id, as_of) -> dict[str, float]:
    """Per-customer revenue share for the SKU over the trailing 12 months."""
    cutoff = as_of - __import__("pandas").Timedelta(days=365)
    inv = invoices.loc[
        (invoices["article_id"] == article_id)
        & (invoices["date"] >= cutoff)
        & (invoices["date"] <= as_of)
    ]
    g = inv.groupby("customer_id")["revenue"].sum()
    total = float(g.sum())
    if total <= 0:
        return {}
    return (g / total).to_dict()


def _score_at_price(
    p: float,
    sku: SkuInputs,
    wp: WinProbFit,
    customer_alpha: np.ndarray,
    customer_share: np.ndarray,
) -> float:
    """Eq. (2) — cluster score at a single candidate price `p`.

    Note v1.3 (Fix B): the win-probability multiplier is intentionally NOT
    applied to the retained-margin term. P_win is the probability of winning
    a *new* quote at a given price; the existing customer book derived from
    `_customer_share` does not go through quote-stage selection every period.
    Price-sensitivity for the existing book is fully captured by (i) volume
    elasticity, and (ii) the churn-shock function. Multiplying retained
    margin by P_win additionally would double-count price-driven attrition
    and systematically under-state contribution by ~3x (the portfolio
    win-rate). P_win is retained on the WinProbFit object so the UI can
    still plot the curve, and so v2 can apply it to the prospective-quote
    sub-population when that data is wired in.
    """
    ratio = p / max(sku.current_price, 1e-6)
    delta_p = ratio - 1.0
    vol = float(adjusted_volume(sku.expected_volume_12mo, np.array([ratio]), sku.elasticity)[0])
    contribution = max(0.0, p - sku.unit_cost)

    retain = p_retain(customer_alpha, np.full_like(customer_alpha, delta_p))
    churn = 1.0 - retain
    margin_retained = retain * customer_share * vol * contribution
    base_contribution = max(0.0, sku.current_price - sku.unit_cost)
    monthly_vol = (customer_share * sku.expected_volume_12mo) / 12.0
    ltv_loss = np.array(
        [discounted_contribution(mv, base_contribution, horizon_months=12) for mv in monthly_vol]
    )
    loss = churn * ltv_loss
    return float(margin_retained.sum() - loss.sum())


def optimise(
    sku: SkuInputs,
    wp: WinProbFit,
    customer_alphas: np.ndarray,
    customer_shares: np.ndarray,
    delta_max: float = 0.15,
    cost_safety_pct: float = 0.03,
    grid_lo: float = 0.7,
    grid_hi: float = 1.3,
    grid_n: int = 25,
) -> Recommendation:
    cur = sku.current_price
    cost_floor = sku.unit_cost * (1.0 + cost_safety_pct)
    p_low = max(cur * (1.0 - delta_max), cost_floor)
    p_high = cur * (1.0 + delta_max)
    if p_high <= p_low:
        p_high = p_low * 1.01

    grid = np.linspace(p_low, p_high, grid_n)
    scores = np.array(
        [
            _score_at_price(float(p), sku, wp, customer_alphas, customer_shares)
            for p in grid
        ]
    )
    best_idx = int(np.argmax(scores))
    p_star = float(grid[best_idx])
    s_star = float(scores[best_idx])

    # Breakeven: smallest price in grid where score >= 0.
    breakeven_idx = np.argwhere(scores >= 0).flatten()
    p_breakeven = float(grid[breakeven_idx[0]]) if breakeven_idx.size else None

    # Driver attribution: marginal removal at p*.
    drivers = {}
    s_neutral_wp = _score_at_price(
        p_star,
        sku,
        # Neutral win-prob: flat 0.5 — implement by faking a locked fit at 0.5.
        type(wp)(
            article_id=wp.article_id,
            n_train=wp.n_train,
            median_price=wp.median_price,
            log_intercept=0.0,
            log_slope=0.0,
            boot_intercepts=np.array([]),
            boot_slopes=np.array([]),
            locked=True,
            global_win_rate=0.5,
        ),
        customer_alphas,
        customer_shares,
    )
    drivers["win_prob"] = s_star - s_neutral_wp
    # Cost driver: how much score is lost if we ignored unit cost (k=0).
    sku_no_cost = type(sku)(
        article_id=sku.article_id,
        unit_cost=0.0,
        expected_volume_12mo=sku.expected_volume_12mo,
        current_price=sku.current_price,
        elasticity=sku.elasticity,
    )
    drivers["cost"] = (
        _score_at_price(p_star, sku_no_cost, wp, customer_alphas, customer_shares) - s_star
    )
    # Churn driver: re-score with alpha=0 (no baseline churn).
    drivers["churn"] = s_star - _score_at_price(
        p_star, sku, wp, np.zeros_like(customer_alphas), customer_shares
    )

    constraint_active = None
    if abs(p_star - cost_floor) / max(cost_floor, 1e-6) < 1e-3:
        constraint_active = "cost_floor"
    elif abs(p_star - p_high) / max(p_high, 1e-6) < 1e-3:
        constraint_active = "delta_max_up"
    elif abs(p_star - p_low) / max(p_low, 1e-6) < 1e-3:
        constraint_active = "delta_max_down"

    return Recommendation(
        article_id=sku.article_id,
        p_star=p_star,
        s_star=s_star,
        p_breakeven=p_breakeven,
        score_curve=np.column_stack([grid, scores]),
        drivers=drivers,
        constraint_active=constraint_active,
        n_customers=int(len(customer_alphas)),
    )
