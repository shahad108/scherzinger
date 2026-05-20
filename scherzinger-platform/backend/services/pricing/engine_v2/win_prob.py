"""Win-probability model: logistic regression on log(price) per SKU.

For v1 we use a frequentist `LogisticRegression` with a small bootstrap to
produce a credible band. This is a pragmatic stand-in for the full Bayesian
posterior described in the whitepaper; the interface (predict + ci) is
identical so a swap to Stan/NumPyro is a drop-in change later.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression

MIN_QUOTES = 12  # mirrors the existing production guard
MIN_WINS = 2
MIN_LOSSES = 2


@dataclass
class WinProbFit:
    article_id: str
    n_train: int
    median_price: float
    log_intercept: float
    log_slope: float  # coefficient on log(p / median_price)
    boot_intercepts: np.ndarray  # (B,)
    boot_slopes: np.ndarray  # (B,)
    locked: bool  # True if sample is too small; predictions fall back to global rate
    global_win_rate: float

    def predict(self, prices: np.ndarray) -> np.ndarray:
        if self.locked:
            return np.full_like(prices, self.global_win_rate, dtype=float)
        x = np.log(np.maximum(prices, 1e-9) / self.median_price)
        z = self.log_intercept + self.log_slope * x
        return 1.0 / (1.0 + np.exp(-z))

    def predict_band(
        self, prices: np.ndarray, lo: float = 0.05, hi: float = 0.95
    ) -> tuple[np.ndarray, np.ndarray]:
        if self.locked:
            base = np.full_like(prices, self.global_win_rate, dtype=float)
            spread = 0.15
            return np.clip(base - spread, 0, 1), np.clip(base + spread, 0, 1)
        x = np.log(np.maximum(prices, 1e-9) / self.median_price)
        z = self.boot_intercepts[:, None] + self.boot_slopes[:, None] * x[None, :]
        p = 1.0 / (1.0 + np.exp(-z))
        return np.quantile(p, lo, axis=0), np.quantile(p, hi, axis=0)


def fit(
    quotes: pd.DataFrame,
    article_id: str,
    global_win_rate: float,
    boot: int = 200,
    seed: int = 17,
) -> WinProbFit:
    """Fit one SKU's win-probability curve."""
    df = quotes.loc[
        (quotes["article_id"] == article_id)
        & quotes["price_per_unit"].notna()
        & (quotes["price_per_unit"] > 0)
    ].copy()
    n = len(df)
    n_won = int(df["is_won"].sum())
    n_lost = n - n_won
    locked = (n < MIN_QUOTES) or (n_won < MIN_WINS) or (n_lost < MIN_LOSSES)
    median_price = float(df["price_per_unit"].median()) if n else 1.0

    if locked or median_price <= 0:
        return WinProbFit(
            article_id=article_id,
            n_train=n,
            median_price=max(median_price, 1.0),
            log_intercept=0.0,
            log_slope=0.0,
            boot_intercepts=np.array([]),
            boot_slopes=np.array([]),
            locked=True,
            global_win_rate=global_win_rate,
        )

    x = np.log(df["price_per_unit"].to_numpy() / median_price).reshape(-1, 1)
    y = df["is_won"].to_numpy().astype(int)

    base = LogisticRegression(C=2.0, solver="lbfgs", max_iter=200)
    base.fit(x, y)

    rng = np.random.default_rng(seed)
    boot_intercepts = np.zeros(boot)
    boot_slopes = np.zeros(boot)
    for b in range(boot):
        idx = rng.integers(0, n, size=n)
        xb, yb = x[idx], y[idx]
        if yb.sum() < 1 or yb.sum() > n - 1:
            boot_intercepts[b] = base.intercept_[0]
            boot_slopes[b] = base.coef_[0, 0]
            continue
        try:
            m = LogisticRegression(C=2.0, solver="lbfgs", max_iter=200).fit(xb, yb)
            boot_intercepts[b] = m.intercept_[0]
            boot_slopes[b] = m.coef_[0, 0]
        except Exception:
            boot_intercepts[b] = base.intercept_[0]
            boot_slopes[b] = base.coef_[0, 0]

    return WinProbFit(
        article_id=article_id,
        n_train=n,
        median_price=median_price,
        log_intercept=float(base.intercept_[0]),
        log_slope=float(base.coef_[0, 0]),
        boot_intercepts=boot_intercepts,
        boot_slopes=boot_slopes,
        locked=False,
        global_win_rate=global_win_rate,
    )
