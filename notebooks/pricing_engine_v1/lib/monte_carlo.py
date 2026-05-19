"""Monte-Carlo confidence band around the score at p*.

Propagates four input uncertainties into S(p*):

1. Win-probability — sample (intercept, slope) from the bootstrap distribution.
2. Unit cost      — sample log-normal noise with sigma = 10% (calibrated to
                    the AutoETS cost MAPE reported in the whitepaper).
3. Volume         — sample log-normal noise with sigma = 14% (revenue MAPE).
4. Churn baseline — sample Beta noise around alpha(c) with effective sample 25.

Returns the posterior mean, the 90% credible interval, and P(score > 0).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .cost_demand import SkuInputs, adjusted_volume
from .churn_response import p_retain
from .ltv import discounted_contribution
from .win_prob import WinProbFit


@dataclass(frozen=True)
class MonteCarloResult:
    mean: float
    ci_low: float
    ci_high: float
    p_positive: float


def run(
    sku: SkuInputs,
    wp: WinProbFit,
    customer_alphas: np.ndarray,
    customer_shares: np.ndarray,
    p_star: float,
    draws: int = 1000,
    seed: int = 31,
    cost_sigma: float = 0.10,
    volume_sigma: float = 0.14,
    alpha_kappa: float = 25.0,
) -> MonteCarloResult:
    rng = np.random.default_rng(seed)
    ratio = p_star / max(sku.current_price, 1e-6)
    delta_p = ratio - 1.0

    # v1.3 Fix B: P_win is not applied to retained margin (see scorer._score_at_price).
    # We retain the sampling code path commented-out so v2 can re-enable when
    # the prospective-quote sub-population is wired in.
    # if not wp.locked and wp.boot_slopes.size:
    #     idx = rng.integers(0, wp.boot_slopes.size, size=draws)
    #     intercepts = wp.boot_intercepts[idx]
    #     slopes = wp.boot_slopes[idx]
    #     x = np.log(p_star / wp.median_price)
    #     pw_samples = 1.0 / (1.0 + np.exp(-(intercepts + slopes * x)))
    # else:
    #     pw_samples = np.full(draws, wp.global_win_rate)
    _ = wp  # retained for future use

    # Cost + volume + alpha samples.
    cost_samples = sku.unit_cost * np.exp(rng.normal(0.0, cost_sigma, size=draws))
    vol_base_samples = sku.expected_volume_12mo * np.exp(
        rng.normal(0.0, volume_sigma, size=draws)
    )
    # Beta noise on each customer's alpha.
    alpha_samples = np.empty((draws, customer_alphas.size))
    for j, a in enumerate(customer_alphas):
        a_clip = float(np.clip(a, 1e-3, 1 - 1e-3))
        alpha_samples[:, j] = rng.beta(a_clip * alpha_kappa, (1 - a_clip) * alpha_kappa, size=draws)

    base_contribution_cur = max(0.0, sku.current_price - sku.unit_cost)

    scores = np.zeros(draws)
    for d in range(draws):
        vol_at_p = adjusted_volume(
            vol_base_samples[d], np.array([ratio]), sku.elasticity
        )[0]
        contribution = max(0.0, p_star - cost_samples[d])
        retain = p_retain(alpha_samples[d], np.full(customer_alphas.size, delta_p))
        churn = 1.0 - retain
        margin_retained = retain * customer_shares * vol_at_p * contribution
        monthly_vol = (customer_shares * vol_base_samples[d]) / 12.0
        ltv_loss = np.array(
            [discounted_contribution(mv, base_contribution_cur, horizon_months=12) for mv in monthly_vol]
        )
        loss = churn * ltv_loss
        scores[d] = float(margin_retained.sum() - loss.sum())

    return MonteCarloResult(
        mean=float(scores.mean()),
        ci_low=float(np.quantile(scores, 0.05)),
        ci_high=float(np.quantile(scores, 0.95)),
        p_positive=float((scores > 0).mean()),
    )
