"""Per-SKU cost + demand inputs.

* Cost: trailing-12mo invoiced `hkvoll_per_unit` (volume-weighted). This is the
  freshest unit-cost truth we have at as-of time and matches what the FastAPI
  cost service ultimately reads from.
* Volume: a per-SKU forecast for the upcoming 12 months, derived from the
  existing sku_forecasts.parquet (revenue forecast) by dividing by the trailing
  median price. Where the forecast is unavailable we fall back to trailing-12mo
  invoiced volume.
* Elasticity: a fixed per-SKU constant in [-3, 0]. v1 uses a portfolio-mean of
  -0.8 unless the SKU has enough price-volume covariation; that requires more
  data than we have today, so we default for all SKUs.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

DEFAULT_ELASTICITY = -0.8


@dataclass(frozen=True)
class SkuInputs:
    article_id: str
    unit_cost: float
    expected_volume_12mo: float
    current_price: float
    elasticity: float


def compute_inputs(
    invoices: pd.DataFrame,
    sku_forecasts: pd.DataFrame,
    article_id: str,
    as_of: pd.Timestamp,
    lookback_days: int = 365,
    elasticity: float = DEFAULT_ELASTICITY,
) -> SkuInputs:
    cutoff = as_of - pd.Timedelta(days=lookback_days)
    inv = invoices.loc[
        (invoices["article_id"] == article_id)
        & (invoices["date"] >= cutoff)
        & (invoices["date"] <= as_of)
    ]
    qty = float(inv["quantity"].sum())
    rev = float(inv["revenue"].sum())
    cost_total = float((inv["hkvoll_per_unit"].fillna(0) * inv["quantity"]).sum())
    unit_cost = (cost_total / qty) if qty > 0 else float(inv["hkvoll_per_unit"].median() or 0.0)
    current_price = (rev / qty) if qty > 0 else float(inv["revenue_per_unit"].median() or 0.0)

    # Forecast-based volume: sum revenue forecast / current_price.
    fc = sku_forecasts.loc[sku_forecasts["article_key"] == article_id].copy()
    fc = fc.loc[fc["ts"] > as_of].sort_values("ts").head(12)
    if not fc.empty and current_price > 0:
        expected_volume = float(fc["p50"].sum() / current_price)
    else:
        # Fallback: project trailing 12-month volume forward.
        expected_volume = qty

    if not np.isfinite(expected_volume) or expected_volume < 0:
        expected_volume = 0.0
    if not np.isfinite(unit_cost) or unit_cost <= 0:
        unit_cost = 0.0
    if not np.isfinite(current_price) or current_price <= 0:
        current_price = max(unit_cost * 1.2, 1.0)

    return SkuInputs(
        article_id=article_id,
        unit_cost=unit_cost,
        expected_volume_12mo=expected_volume,
        current_price=current_price,
        elasticity=elasticity,
    )


def adjusted_volume(base_volume: float, price_ratio: np.ndarray, elasticity: float) -> np.ndarray:
    """E[V | p] = V_base * (p / p_cur) ** elasticity, clipped to non-negative."""
    return np.maximum(0.0, base_volume * np.power(np.maximum(price_ratio, 1e-6), elasticity))
