"""24-month discounted lifetime contribution per (customer, SKU).

Used as the loss term: if the customer churns at the proposed price, we lose
the discounted stream of contribution that would have been earned at the
current price over the next 24 months.
"""
from __future__ import annotations

import numpy as np

DEFAULT_DISCOUNT_RATE = 0.08  # annual
DEFAULT_HORIZON_MONTHS = 24


def discounted_contribution(
    monthly_volume: float,
    contribution_per_unit: float,
    horizon_months: int = DEFAULT_HORIZON_MONTHS,
    discount_rate: float = DEFAULT_DISCOUNT_RATE,
) -> float:
    """Closed-form geometric sum of a flat monthly contribution stream."""
    if monthly_volume <= 0 or contribution_per_unit <= 0:
        return 0.0
    monthly_rate = (1.0 + discount_rate) ** (1.0 / 12.0) - 1.0
    months = np.arange(1, horizon_months + 1)
    discount = 1.0 / np.power(1.0 + monthly_rate, months)
    return float(monthly_volume * contribution_per_unit * discount.sum())
