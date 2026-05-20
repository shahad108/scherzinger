"""Pricing Studio v3 / Phase 2 — risk-if-moved model.

Computes the probability that a customer churns in the next 4 quarters
GIVEN a proposed Δprice on a SKU they buy from us.

Composition:
    risk = clamp(churn_p × wallet_multiplier × delta_multiplier, 0, 1)

Where:
    wallet_multiplier — high-share customers (>20% of their wallet on this
        SKU) are *stickier* (0.8x), light-share (<5%) customers are
        *flightier* (1.2x). Wallet share in the (0.05, 0.20] band gets a
        neutral 1.0x.
    delta_multiplier — every +1pp Δprice above zero adds 0.02·Δpp to the
        risk; every -1pp Δprice (price cut) subtracts 0.01·Δpp from it.
        Asymmetry reflects empirical loss aversion: a price *cut* lowers
        churn risk less than a *hike* raises it.

References:
    - Kahneman & Tversky (1979) — Prospect theory + loss aversion.
    - Reichheld & Sasser (1990) — Customer-share retention curve.
    - Internal Pryzm pricing-elasticity backtest (notebooks/M8).

Decimal end-to-end (no float). Output quantised to 4 decimals.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP


# Multiplier thresholds — also surfaced for tests.
_WALLET_DEEP_THRESHOLD = Decimal("0.20")
_WALLET_LIGHT_THRESHOLD = Decimal("0.05")
_WALLET_DEEP_MULT = Decimal("0.8")
_WALLET_LIGHT_MULT = Decimal("1.2")
_WALLET_NEUTRAL_MULT = Decimal("1.0")

# Delta sensitivity (per 1pp of Δprice).
_DELTA_UP_PER_PP = Decimal("0.02")
_DELTA_DOWN_PER_PP = Decimal("0.01")

_QUANT = Decimal("0.0001")


def _wallet_multiplier(wallet_share_pct: Decimal) -> Decimal:
    """Customers deeply embedded in our wallet are stickier; light ones
    are flightier. Returns the multiplier applied to baseline churn.
    """
    if wallet_share_pct > _WALLET_DEEP_THRESHOLD:
        return _WALLET_DEEP_MULT
    if wallet_share_pct < _WALLET_LIGHT_THRESHOLD:
        return _WALLET_LIGHT_MULT
    return _WALLET_NEUTRAL_MULT


def _delta_increment(delta_pct: Decimal) -> Decimal:
    """Additive risk adjustment from the proposed Δprice (as percent points).

    +Δ → adds risk at 0.02 per pp.
    -Δ → subtracts risk at 0.01 per pp.
    Δ=0 → no adjustment.
    """
    if delta_pct == 0:
        return Decimal("0")
    if delta_pct > 0:
        return _DELTA_UP_PER_PP * delta_pct
    # delta_pct < 0 — subtract |delta| × DOWN_PER_PP
    return _DELTA_DOWN_PER_PP * delta_pct  # already negative


def _clamp01(x: Decimal) -> Decimal:
    if x < 0:
        return Decimal("0")
    if x > 1:
        return Decimal("1")
    return x


def risk_if_moved(
    *,
    churn_p: Decimal,
    wallet_share_pct: Decimal,
    delta_pct: Decimal,
) -> Decimal:
    """Probability the customer churns in 4Q at the proposed Δprice.

    Args:
        churn_p: baseline 4Q churn probability for this customer × SKU,
            already in [0, 1].
        wallet_share_pct: fraction of the customer's wallet on this SKU,
            in [0, 1]. Higher = stickier embed.
        delta_pct: proposed price delta as percent points (e.g. ``5``
            = +5% above last paid; ``-3`` = -3%).

    Returns:
        4-decimal Decimal in [0, 1].
    """
    if not isinstance(churn_p, Decimal):
        churn_p = Decimal(str(churn_p))
    if not isinstance(wallet_share_pct, Decimal):
        wallet_share_pct = Decimal(str(wallet_share_pct))
    if not isinstance(delta_pct, Decimal):
        delta_pct = Decimal(str(delta_pct))

    base = churn_p * _wallet_multiplier(wallet_share_pct)
    adjusted = base + _delta_increment(delta_pct)
    clamped = _clamp01(adjusted)
    return clamped.quantize(_QUANT, rounding=ROUND_HALF_UP)


# Tone thresholds — BFF-private. NOT a Pydantic enum on purpose: the
# strings are only emitted on the wire; the frontend never re-computes.
_TONE_ALERT_GT = Decimal("0.30")
_TONE_WARN_GT = Decimal("0.15")


def compute_tone(risk: Decimal | None) -> str:
    """Map a ``risk_if_moved`` value to one of ``alert | warn | plain``.

    Tone is BFF-side truth: the frontend renders the string but never
    re-derives it. Keeping it server-side means we can re-tune the
    thresholds without an FE deploy.
    """
    if risk is None:
        return "plain"
    if not isinstance(risk, Decimal):
        risk = Decimal(str(risk))
    if risk > _TONE_ALERT_GT:
        return "alert"
    if risk > _TONE_WARN_GT:
        return "warn"
    return "plain"
