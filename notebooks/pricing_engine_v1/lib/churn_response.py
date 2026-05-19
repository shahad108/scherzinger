"""Two-stage churn-response model.

    P_churn(p | c) = alpha(c) + (1 - alpha(c)) * eta(Δp)

* alpha(c) — baseline 12-month churn probability from churn_predictions.csv.
  We project the 1-quarter probability to 12 months using survival composition:
  alpha_12 = 1 - (1 - p_churn_1q)^4. Where p_churn_4q is present we prefer it.
* eta(Δp) — monotone non-negative shock as a function of relative price change.
  v1 uses a clipped linear function with a sensible default slope. Calibrating
  against quote-renewal transitions is queued as a v1.x upgrade.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

DEFAULT_SHOCK_SLOPE = 0.6  # 10% price hike -> +6pp churn shock on the residual mass
DEFAULT_SHOCK_CAP = 0.40   # clip the shock at 40pp


@dataclass(frozen=True)
class ChurnTable:
    by_customer: pd.DataFrame  # index=customer_id, cols=alpha_12

    def alpha(self, customer_ids: list[str]) -> np.ndarray:
        s = self.by_customer["alpha_12"]
        return np.array(
            [float(s.get(cid, s.median() if not s.empty else 0.1)) for cid in customer_ids]
        )


def build_table(
    churn_df: pd.DataFrame,
    invoices: pd.DataFrame | None = None,
    as_of: pd.Timestamp | None = None,
    empirical_window_days: int = 730,
    shrink_weight: float = 0.15,
) -> ChurnTable:
    """Customer-level 12-month baseline churn α(c).

    v1.4 Fix #1: empirical-Bayes calibration. The raw `churn_predictions.csv`
    file holds a model forecast that historically over-predicted 12-mo
    churn versus what was actually observed. We compute the realised
    historical 1-year customer-churn rate from the invoice book and
    shrink every customer's predicted α toward it.

        alpha_cal = (1-w) * alpha_pred + w * empirical_book_churn

    A weight of `shrink_weight=0.7` is a moderate prior. Setting it to 0
    recovers the v1.3 behaviour.
    """
    df = churn_df.copy()
    df["customer_id"] = df["customer_id"].astype(str)
    if "p_churn_4q" in df.columns:
        alpha_pred = df["p_churn_4q"].fillna(1 - (1 - df["p_churn_1q"].fillna(0)) ** 4)
    else:
        alpha_pred = 1 - (1 - df["p_churn_1q"].fillna(0)) ** 4
    alpha_pred = alpha_pred.clip(0, 1)

    empirical_rate = 0.0
    if invoices is not None and as_of is not None:
        inv = invoices.copy()
        inv["date"] = pd.to_datetime(inv["date"])
        inv["customer_id"] = inv["customer_id"].astype(str)
        prior_start = as_of - pd.Timedelta(days=empirical_window_days)
        mid = as_of - pd.Timedelta(days=365)
        prior = inv.loc[(inv["date"] >= prior_start) & (inv["date"] <= mid)]
        # Restrict the empirical churn measure to *recurring* customers in the
        # prior window — at least 2 invoices AND positive revenue. One-time
        # buyers from 24 months ago are not "churned recurring customers",
        # they're acquisition tail. Including them inflates the empirical
        # churn rate to >50% on this portfolio (observed 2024-12 cut).
        prior_grouped = prior.groupby("customer_id").agg(
            n_inv=("invoice_id", "count"), rev=("revenue", "sum")
        )
        recurring = set(
            prior_grouped.loc[
                (prior_grouped["n_inv"] >= 2) & (prior_grouped["rev"] > 0)
            ].index
        )
        last_year_book = set(
            inv.loc[(inv["date"] > mid) & (inv["date"] <= as_of), "customer_id"]
        )
        if recurring:
            churned = recurring - last_year_book
            empirical_rate = float(len(churned) / len(recurring))

    alpha_cal = (1 - shrink_weight) * alpha_pred + shrink_weight * empirical_rate
    alpha_cal = alpha_cal.clip(0, 1)
    out = pd.DataFrame({"customer_id": df["customer_id"], "alpha_12": alpha_cal})
    return ChurnTable(by_customer=out.set_index("customer_id"))


def shock(delta_p: np.ndarray, slope: float = DEFAULT_SHOCK_SLOPE,
          cap: float = DEFAULT_SHOCK_CAP) -> np.ndarray:
    """eta(Δp) — only price increases (Δp > 0) cause additional churn risk."""
    raw = np.clip(delta_p, 0.0, None) * slope
    return np.clip(raw, 0.0, cap)


def p_churn(alpha: np.ndarray, delta_p: np.ndarray) -> np.ndarray:
    return alpha + (1.0 - alpha) * shock(delta_p)


def p_retain(alpha: np.ndarray, delta_p: np.ndarray) -> np.ndarray:
    return 1.0 - p_churn(alpha, delta_p)
