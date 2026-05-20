"""Post-hoc conformal scalar calibration.

After Fixes #1 and #2 the engine output is close to realised but still
carries a residual mean bias from compounding model errors (forecast MAPE,
default elasticity, fixed shock slope). One global multiplicative factor
fitted on a held-out slice of SKUs absorbs the residual without changing
the engine's mechanism.

We use leave-one-out median ratio: for each SKU, fit `k_i` = median
(realised / engine) on the other N-1 SKUs and apply it to SKU i. This
prevents any single SKU from calibrating itself.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def loo_scalars(engine: np.ndarray, realised: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    """Leave-one-out *aggregate-ratio* calibration scalar per SKU.

    `k_i = sum(realised[-i]) / sum(engine[-i])` — the ratio of total
    realised to total engine across the other SKUs. This is the right
    calibration when the metric we care about is the portfolio total
    (it preserves additivity), whereas a median-of-per-SKU-ratios is
    biased when per-SKU ratios are heavy-tailed.
    """
    eng = np.asarray(engine, dtype=float)
    rea = np.asarray(realised, dtype=float)
    n = eng.size
    out = np.ones(n)
    eng_total = eng.sum()
    rea_total = rea.sum()
    for i in range(n):
        denom = eng_total - eng[i]
        if abs(denom) < eps:
            continue
        out[i] = (rea_total - rea[i]) / denom
    return np.clip(out, 0.3, 4.0)


def global_scalar(engine: np.ndarray, realised: np.ndarray, eps: float = 1e-6) -> float:
    """Aggregate sum-ratio — for forward-run application."""
    eng = np.asarray(engine, dtype=float)
    rea = np.asarray(realised, dtype=float)
    denom = float(eng.sum())
    if abs(denom) < eps:
        return 1.0
    return float(np.clip(rea.sum() / denom, 0.3, 4.0))
