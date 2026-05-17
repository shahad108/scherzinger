"""
Phase 1 — CV harness for the forecasting-v3 rebuild.

Provides:
  - rolling_origin_folds: rolling-origin train/test splits
  - KPIs: MASE, sMAPE, RMSE, pinball, coverage, Winkler
  - kpi_row + append_kpi_log: structured logging to a TSV ledger every
    candidate writes to so leaderboards accumulate across phases.

Run standalone (`python notebooks/forecasting_v3/01_cv_harness.py`) to execute
self-tests.
"""
from __future__ import annotations

import os
from typing import Iterable

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Folds
# ---------------------------------------------------------------------------
def rolling_origin_folds(
    series: pd.Series,
    *,
    start_train: int = 24,
    horizon: int = 6,
    step: int = 3,
    max_folds: int = 7,
) -> list[tuple[pd.DatetimeIndex, pd.DatetimeIndex]]:
    """Generate (train_idx, test_idx) pairs for rolling-origin evaluation.

    Train grows from ``start_train`` months. Each fold slides ``step`` months,
    so adjacent folds share part of the test window only when ``step < horizon``.
    With default step=3 and horizon=6, test windows partially overlap but their
    *origins* are non-redundant (a different anchor each fold).

    Parameters
    ----------
    series : pd.Series
        Time-ordered series with a DatetimeIndex (or any index of length n).
    start_train : int
        Number of observations in the first training window.
    horizon : int
        Forecast horizon in periods.
    step : int
        Sliding step between consecutive folds.
    max_folds : int
        Hard cap on folds returned.

    Returns
    -------
    list of (train_index, test_index) tuples.
    """
    n = len(series)
    idx = series.index
    folds: list[tuple[pd.Index, pd.Index]] = []

    origin = start_train  # first index of the test window
    while origin + horizon <= n and len(folds) < max_folds:
        train_idx = idx[:origin]
        test_idx = idx[origin : origin + horizon]
        folds.append((train_idx, test_idx))
        origin += step
    return folds


# ---------------------------------------------------------------------------
# Point-forecast KPIs
# ---------------------------------------------------------------------------
def _to_array(x) -> np.ndarray:
    if isinstance(x, pd.Series):
        return x.to_numpy(dtype=float)
    return np.asarray(x, dtype=float)


def mase(actuals, forecasts, train_series, seasonality: int = 12) -> float:
    """Mean Absolute Scaled Error vs seasonal naive on the training window."""
    y = _to_array(actuals)
    f = _to_array(forecasts)
    train = _to_array(train_series)

    if len(train) <= seasonality:
        # Fall back to lag-1 naive if not enough history for the season.
        diffs = np.abs(np.diff(train))
    else:
        diffs = np.abs(train[seasonality:] - train[:-seasonality])

    scale = diffs.mean() if len(diffs) else np.nan
    if not np.isfinite(scale) or scale == 0:
        return float("inf")
    return float(np.mean(np.abs(y - f)) / scale)


def smape(actuals, forecasts) -> float:
    """Symmetric MAPE in [0, 200]. Zero numerator+denom contributes 0."""
    y = _to_array(actuals)
    f = _to_array(forecasts)
    denom = (np.abs(y) + np.abs(f))
    # Avoid 0/0; treat as 0 error where both are zero.
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.where(denom == 0, 0.0, 2.0 * np.abs(f - y) / denom)
    return float(100.0 * ratio.mean())


def rmse(actuals, forecasts) -> float:
    y = _to_array(actuals)
    f = _to_array(forecasts)
    return float(np.sqrt(np.mean((y - f) ** 2)))


# ---------------------------------------------------------------------------
# Probabilistic KPIs
# ---------------------------------------------------------------------------
def pinball_loss(actuals, quantile_forecasts, q: float) -> float:
    """Mean pinball loss at quantile q in (0, 1)."""
    y = _to_array(actuals)
    qf = _to_array(quantile_forecasts)
    diff = y - qf
    loss = np.where(diff >= 0, q * diff, (q - 1) * diff)
    return float(loss.mean())


def coverage(actuals, lower, upper) -> float:
    """Empirical coverage rate for the [lower, upper] band."""
    y = _to_array(actuals)
    lo = _to_array(lower)
    hi = _to_array(upper)
    return float(np.mean((y >= lo) & (y <= hi)))


def winkler_score(actuals, lower, upper, alpha: float) -> float:
    """Winkler interval score for a (1-alpha) prediction interval."""
    y = _to_array(actuals)
    lo = _to_array(lower)
    hi = _to_array(upper)
    width = hi - lo
    below = (lo - y) * (y < lo)
    above = (y - hi) * (y > hi)
    penalty = (2.0 / alpha) * (below + above)
    return float(np.mean(width + penalty))


# ---------------------------------------------------------------------------
# KPI row + log
# ---------------------------------------------------------------------------
KPI_COLUMNS = [
    "model",
    "metric",
    "fold",
    "MASE",
    "sMAPE",
    "RMSE",
    "pinball_P10",
    "pinball_P50",
    "pinball_P90",
    "coverage_P80",
    "winkler_P80",
]


def kpi_row(
    *,
    model_name: str,
    fold_idx: int,
    metric: str,
    actuals,
    point_forecast,
    train_series,
    q10=None,
    q50=None,
    q80=None,
    q90=None,
) -> dict:
    """Build one structured KPI row for the leaderboard log.

    Probabilistic KPIs are filled in only when the relevant quantiles are
    supplied. The P80 band uses (q10, q90).
    """
    row: dict = {
        "model": model_name,
        "metric": metric,
        "fold": fold_idx,
        "MASE": mase(actuals, point_forecast, train_series),
        "sMAPE": smape(actuals, point_forecast),
        "RMSE": rmse(actuals, point_forecast),
        "pinball_P10": np.nan,
        "pinball_P50": np.nan,
        "pinball_P90": np.nan,
        "coverage_P80": np.nan,
        "winkler_P80": np.nan,
    }
    if q10 is not None:
        row["pinball_P10"] = pinball_loss(actuals, q10, 0.10)
    if q50 is not None:
        row["pinball_P50"] = pinball_loss(actuals, q50, 0.50)
    if q90 is not None:
        row["pinball_P90"] = pinball_loss(actuals, q90, 0.90)
    if q10 is not None and q90 is not None:
        row["coverage_P80"] = coverage(actuals, q10, q90)
        row["winkler_P80"] = winkler_score(actuals, q10, q90, alpha=0.20)
    return row


def append_kpi_log(
    rows: Iterable[dict],
    path: str = "notebooks/forecasting_v3/output/kpi_log.tsv",
) -> None:
    """Append rows to the persistent TSV leaderboard log.

    Header is written on first creation. Missing columns are filled with NaN.
    """
    rows = list(rows)
    if not rows:
        return
    df = pd.DataFrame(rows)
    for col in KPI_COLUMNS:
        if col not in df.columns:
            df[col] = np.nan
    df = df[KPI_COLUMNS]

    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_header = not os.path.exists(path)
    df.to_csv(path, sep="\t", mode="a", header=write_header, index=False)


# ---------------------------------------------------------------------------
# Self-tests
# ---------------------------------------------------------------------------
def _self_tests() -> None:
    # Synthetic sine + trend, 48 monthly points.
    rng = pd.date_range("2022-01-01", periods=48, freq="MS")
    t = np.arange(48)
    series = pd.Series(
        100 + 2 * t + 20 * np.sin(2 * np.pi * t / 12),
        index=rng,
        name="y",
    )

    # 1. Folds: 48 obs, start=24, horizon=6, step=3 => origins at 24, 27, 30,
    #    33, 36, 39, 42 (each + 6 <= 48) = 7 folds.
    folds = rolling_origin_folds(series, start_train=24, horizon=6, step=3, max_folds=7)
    assert len(folds) == 7, f"expected 7 folds, got {len(folds)}"
    for train_idx, test_idx in folds:
        assert len(test_idx) == 6
        assert train_idx[-1] < test_idx[0]
    origins = [t[0] for _, t in folds]
    assert len(set(origins)) == 7, "fold origins must be distinct (non-redundant)"

    # 2. MASE of a perfect forecast == 0.
    train, test = series.iloc[:36], series.iloc[36:42]
    perfect = test.copy()
    assert mase(test, perfect, train) == 0.0

    # 3. MASE of seasonal-naive on the synthetic series < 1.0
    #    (seasonal-naive is, by construction, the scaling reference computed on
    #    train; applying it to test should land near-zero given the clean
    #    periodicity + linear trend bumps it slightly above zero but well
    #    below 1.0).
    sn_forecast = train.iloc[-12:-6].to_numpy()  # repeat last full season slice
    sn_mase = mase(test, sn_forecast, train)
    assert sn_mase < 1.0, f"seasonal-naive MASE on synthetic should be <1.0, got {sn_mase}"

    # 4. sMAPE bounded in [0, 200].
    assert 0.0 <= smape(test, perfect) <= 200.0
    assert 0.0 <= smape(test, sn_forecast) <= 200.0
    # Worst case: opposite-sign forecast => approaches 200.
    worst = -test
    assert smape(test, worst) <= 200.0 + 1e-9

    # 5. Coverage of (actuals ± 999) == 1.0
    lo = test - 999
    hi = test + 999
    assert coverage(test, lo, hi) == 1.0

    # Bonus sanity: pinball at q=0.5 == 0.5 * MAE
    pf = perfect + 10  # shift forecasts up by 10
    pb50 = pinball_loss(test, pf, 0.5)
    mae = float(np.mean(np.abs(test.to_numpy() - pf.to_numpy())))
    assert abs(pb50 - 0.5 * mae) < 1e-9

    # Bonus sanity: winkler reduces to mean width when fully covered.
    w = winkler_score(test, lo, hi, alpha=0.2)
    assert abs(w - float(np.mean(hi - lo))) < 1e-9

    print("✓ CV harness self-tests passed")


if __name__ == "__main__":
    _self_tests()
