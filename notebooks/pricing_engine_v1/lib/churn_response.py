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


def build_table(churn_df: pd.DataFrame) -> ChurnTable:
    df = churn_df.copy()
    df["customer_id"] = df["customer_id"].astype(str)
    # Prefer p_churn_4q (already at 12mo horizon) when present.
    if "p_churn_4q" in df.columns:
        alpha_12 = df["p_churn_4q"].fillna(1 - (1 - df["p_churn_1q"].fillna(0)) ** 4)
    else:
        alpha_12 = 1 - (1 - df["p_churn_1q"].fillna(0)) ** 4
    out = pd.DataFrame({"customer_id": df["customer_id"], "alpha_12": alpha_12.clip(0, 1)})
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
