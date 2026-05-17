"""
Phase 2 — Revenue forecasting bake-off (6 candidates + ensemble).

Runs all candidates on the REVENUE target using the same rolling-origin folds
(start_train=24, horizon=6, step=3, max_folds=7). Picks a winner that must beat
the SeasonalNaive(12) floor (MASE 0.929) by >=15% (i.e. MASE <= 0.790).

Outputs:
  - notebooks/forecasting_v3/output/kpi_log.tsv       (appended per fold)
  - notebooks/forecasting_v3/output/revenue_bakeoff_details.json
  - notebooks/forecasting_v3/output/revenue_winner.json
  - notebooks/forecasting_v3/output/forecast_v3_revenue_point.parquet
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Imports & module loading
# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("cv_harness", HERE / "01_cv_harness.py")
cv_harness = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(cv_harness)  # type: ignore[union-attr]

from statsforecast import StatsForecast  # noqa: E402
from statsforecast.models import SeasonalNaive, AutoETS, Theta  # noqa: E402
from statsmodels.tsa.statespace.sarimax import SARIMAX  # noqa: E402
from sklearn.linear_model import LassoCV  # noqa: E402
import lightgbm as lgb  # noqa: E402
from mlforecast import MLForecast  # noqa: E402

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
DATA_PATH = HERE / "data" / "clean_monthly.parquet"
EXOG_PATH = HERE / "data" / "exog_aligned.parquet"
OUTPUT_DIR = HERE / "output"
KPI_LOG = OUTPUT_DIR / "kpi_log.tsv"
DETAILS_JSON = OUTPUT_DIR / "revenue_bakeoff_details.json"
WINNER_JSON = OUTPUT_DIR / "revenue_winner.json"
FORECAST_PARQUET = OUTPUT_DIR / "forecast_v3_revenue_point.parquet"

TARGET = "revenue"
HORIZON = 6
START_TRAIN = 24
STEP = 3
MAX_FOLDS = 7
SEASON_LENGTH = 12

FRED_COLS = [
    "WPU101",
    "PCOPPUSDM",
    "PALUMUSDM",
    "DCOILBRENTEU",
    "DEXUSEU",
    "PNRGINDEXM",
    "IRLTLT01DEM156N",
    "INDPRO",
]

# Baselines from Phase 1
FLOOR_MASE = 0.929
BEAT_TARGET = 0.790  # 15% better than floor

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_data() -> tuple[pd.Series, pd.DataFrame]:
    df = pd.read_parquet(DATA_PATH)
    df["month"] = pd.to_datetime(df["month"])
    df = df.sort_values("month").set_index("month")
    series = df[TARGET].astype(float)

    exog = pd.read_parquet(EXOG_PATH)
    exog["month"] = pd.to_datetime(exog["month"])
    exog = exog.sort_values("month").set_index("month")
    return series, exog[FRED_COLS].astype(float)


def clip_nonneg(arr: np.ndarray) -> np.ndarray:
    return np.clip(arr, 0.0, None)


# ---------------------------------------------------------------------------
# Candidate 1: SeasonalNaive
# ---------------------------------------------------------------------------
def fit_seasonal_naive(train: pd.Series, horizon: int) -> np.ndarray:
    sf_df = pd.DataFrame(
        {"unique_id": "s", "ds": train.index, "y": train.to_numpy(dtype=float)}
    )
    sf = StatsForecast(models=[SeasonalNaive(season_length=SEASON_LENGTH)], freq="MS", n_jobs=1)
    sf.fit(sf_df)
    fcst = sf.predict(h=horizon)
    return clip_nonneg(fcst["SeasonalNaive"].to_numpy(dtype=float))


# ---------------------------------------------------------------------------
# Candidate 2: AutoETS
# ---------------------------------------------------------------------------
def fit_ets(train: pd.Series, horizon: int) -> np.ndarray:
    sf_df = pd.DataFrame(
        {"unique_id": "s", "ds": train.index, "y": train.to_numpy(dtype=float)}
    )
    sf = StatsForecast(models=[AutoETS(season_length=SEASON_LENGTH)], freq="MS", n_jobs=1)
    sf.fit(sf_df)
    fcst = sf.predict(h=horizon)
    return clip_nonneg(fcst["AutoETS"].to_numpy(dtype=float))


# ---------------------------------------------------------------------------
# Candidate 3: Theta
# ---------------------------------------------------------------------------
def fit_theta(train: pd.Series, horizon: int) -> np.ndarray:
    sf_df = pd.DataFrame(
        {"unique_id": "s", "ds": train.index, "y": train.to_numpy(dtype=float)}
    )
    sf = StatsForecast(models=[Theta(season_length=SEASON_LENGTH)], freq="MS", n_jobs=1)
    sf.fit(sf_df)
    fcst = sf.predict(h=horizon)
    return clip_nonneg(fcst["Theta"].to_numpy(dtype=float))


# ---------------------------------------------------------------------------
# Candidate 4: SARIMAX with FRED exog (LASSO-selected)
# ---------------------------------------------------------------------------
SARIMAX_ORDERS = [(0, 1, 1), (1, 1, 0), (1, 1, 1)]
SARIMAX_SEASONAL = [(0, 1, 1, 12), (1, 0, 1, 12)]
EXOG_LAGS = [0, 1, 3, 6]


def build_exog_features(exog_aligned: pd.DataFrame) -> pd.DataFrame:
    """Build lagged exog feature matrix on the *aligned* exog frame (full history)."""
    feats = {}
    for col in FRED_COLS:
        for lag in EXOG_LAGS:
            feats[f"{col}_lag{lag}"] = exog_aligned[col].shift(lag)
    return pd.DataFrame(feats, index=exog_aligned.index)


def select_exog_lasso(train_y: pd.Series, train_exog: pd.DataFrame, top_k: int = 5) -> list[str]:
    """LASSO on differenced revenue vs lagged exog. Returns top-k by |coef|."""
    # Differenced y to remove unit-root; align with exog
    y_diff = train_y.diff().dropna()
    X = train_exog.loc[y_diff.index].dropna()
    y = y_diff.loc[X.index]
    if len(y) < 12 or X.shape[1] == 0:
        return []
    # Standardize for fair LASSO
    X_std = (X - X.mean()) / X.std().replace(0, 1)
    try:
        lasso = LassoCV(cv=3, max_iter=5000, n_jobs=1, random_state=0)
        lasso.fit(X_std.to_numpy(), y.to_numpy())
        coefs = pd.Series(np.abs(lasso.coef_), index=X.columns)
        nonzero = coefs[coefs > 0].sort_values(ascending=False)
        return list(nonzero.head(top_k).index)
    except Exception:
        return []


def fit_sarimax(
    train: pd.Series, horizon: int, exog_aligned: pd.DataFrame
) -> tuple[np.ndarray, dict]:
    """Try grid; pick by AIC; fall back to no-exog (0,1,1)(0,1,1,12) on failure."""
    all_feats = build_exog_features(exog_aligned)
    train_feats_full = all_feats.loc[train.index]
    selected = select_exog_lasso(train, train_feats_full)
    used_exog = bool(selected)

    if used_exog:
        train_exog = train_feats_full[selected].dropna()
        # Align y to the rows where exog is fully defined
        y = train.loc[train_exog.index]
        # Future exog for the test horizon
        future_idx = pd.date_range(
            train.index[-1] + pd.offsets.MonthBegin(1), periods=horizon, freq="MS"
        )
        future_exog = all_feats.reindex(future_idx)[selected]
        # If future exog has NaNs (e.g. lag-6 past end of exog frame), fall back.
        if future_exog.isna().any().any():
            used_exog = False
    else:
        y = train
        train_exog = None
        future_exog = None

    best = None
    best_aic = np.inf
    best_cfg = None
    fallback_used = False

    for order in SARIMAX_ORDERS:
        for seasonal_order in SARIMAX_SEASONAL:
            try:
                model = SARIMAX(
                    y.to_numpy(dtype=float),
                    exog=train_exog.to_numpy(dtype=float) if used_exog else None,
                    order=order,
                    seasonal_order=seasonal_order,
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                res = model.fit(disp=False, maxiter=200)
                if np.isfinite(res.aic) and res.aic < best_aic:
                    best_aic = res.aic
                    best = res
                    best_cfg = (order, seasonal_order)
            except Exception:
                continue

    if best is None:
        # Fall back: (0,1,1)(0,1,1,12), no exog.
        fallback_used = True
        try:
            res = SARIMAX(
                train.to_numpy(dtype=float),
                order=(0, 1, 1),
                seasonal_order=(0, 1, 1, 12),
                enforce_stationarity=False,
                enforce_invertibility=False,
            ).fit(disp=False, maxiter=200)
            yhat = res.forecast(steps=horizon)
            return clip_nonneg(np.asarray(yhat, dtype=float)), {
                "order": (0, 1, 1),
                "seasonal_order": (0, 1, 1, 12),
                "used_exog": False,
                "selected_exog": [],
                "fallback": True,
                "aic": float(res.aic),
            }
        except Exception as e:
            # Last resort: seasonal naive forecast
            return fit_seasonal_naive(train, horizon), {
                "order": None,
                "seasonal_order": None,
                "used_exog": False,
                "selected_exog": [],
                "fallback": True,
                "error": str(e),
            }

    try:
        if used_exog:
            yhat = best.forecast(steps=horizon, exog=future_exog.to_numpy(dtype=float))
        else:
            yhat = best.forecast(steps=horizon)
        yhat = np.asarray(yhat, dtype=float)
        if not np.all(np.isfinite(yhat)):
            raise ValueError("non-finite forecast")
    except Exception:
        # Fall back if forecast itself blows up
        fallback_used = True
        res = SARIMAX(
            train.to_numpy(dtype=float),
            order=(0, 1, 1),
            seasonal_order=(0, 1, 1, 12),
            enforce_stationarity=False,
            enforce_invertibility=False,
        ).fit(disp=False, maxiter=200)
        yhat = res.forecast(steps=horizon)
        return clip_nonneg(np.asarray(yhat, dtype=float)), {
            "order": (0, 1, 1),
            "seasonal_order": (0, 1, 1, 12),
            "used_exog": False,
            "selected_exog": [],
            "fallback": True,
            "aic": float(res.aic),
        }

    return clip_nonneg(yhat), {
        "order": list(best_cfg[0]),
        "seasonal_order": list(best_cfg[1]),
        "used_exog": used_exog,
        "selected_exog": selected if used_exog else [],
        "fallback": fallback_used,
        "aic": float(best_aic),
    }


# ---------------------------------------------------------------------------
# Candidate 5: LightGBM via mlforecast
# ---------------------------------------------------------------------------
def fit_lightgbm(
    train: pd.Series, horizon: int, exog_aligned: pd.DataFrame
) -> np.ndarray:
    """LightGBM with 12 lags of revenue + calendar + FRED exog (lag 0/1/3)."""
    # Build a frame with exog values at lags 0,1,3 (current, 1mo back, 3mo back).
    # We'll feed exog as static_features through mlforecast's exog API.
    # mlforecast expects an `X_df` with future exog matched on (unique_id, ds).
    # Simpler approach: build the feature matrix manually and use sklearn-style.

    # Combine y + exog into one frame
    y_idx = train.index
    full_idx = pd.date_range(y_idx[0], y_idx[-1] + pd.offsets.MonthBegin(horizon), freq="MS")
    exog_aligned = exog_aligned.reindex(full_idx)

    # Build features
    def build_X(idx: pd.DatetimeIndex, y_history: pd.Series) -> pd.DataFrame:
        rows = []
        for ts in idx:
            row = {}
            # 12 lags of y
            for lag in range(1, 13):
                target_ts = ts - pd.DateOffset(months=lag)
                row[f"y_lag{lag}"] = y_history.get(target_ts, np.nan)
            # Calendar
            row["month_of_year"] = ts.month
            row["year"] = ts.year
            # Exog lag 0, 1, 3
            for col in FRED_COLS:
                for lag in [0, 1, 3]:
                    target_ts = ts - pd.DateOffset(months=lag)
                    row[f"{col}_lag{lag}"] = exog_aligned[col].get(target_ts, np.nan)
            row["__ts"] = ts
            rows.append(row)
        df = pd.DataFrame(rows).set_index("__ts")
        return df

    # Training rows: need at least 12 lags available
    train_X = build_X(y_idx[12:], train)
    train_y = train.loc[y_idx[12:]]

    # Drop any rows with NaN in features (early exog lags missing)
    mask = ~train_X.isna().any(axis=1)
    train_X = train_X[mask]
    train_y = train_y[mask]

    model = lgb.LGBMRegressor(
        num_leaves=15,
        min_data_in_leaf=3,
        n_estimators=200,
        learning_rate=0.05,
        max_depth=4,
        random_state=0,
        verbose=-1,
    )
    model.fit(train_X, train_y)

    # Recursive forecast: extend y_history one step at a time
    y_history = train.copy()
    forecast_idx = pd.date_range(
        y_idx[-1] + pd.offsets.MonthBegin(1), periods=horizon, freq="MS"
    )
    preds = []
    for ts in forecast_idx:
        X_step = build_X(pd.DatetimeIndex([ts]), y_history)
        # Some exog lags into the future window may also be NaN; impute with the
        # last available value to keep the model going.
        X_step = X_step.fillna(method="ffill", axis=0).fillna(method="bfill", axis=0)
        X_step = X_step.fillna(0.0)
        yhat = float(model.predict(X_step)[0])
        preds.append(yhat)
        y_history.loc[ts] = yhat

    return clip_nonneg(np.asarray(preds, dtype=float))


# ---------------------------------------------------------------------------
# Bake-off driver
# ---------------------------------------------------------------------------
CANDIDATES = [
    ("SeasonalNaive(12)", "seasonal_naive"),
    ("AutoETS", "ets"),
    ("Theta", "theta"),
    ("SARIMAX+LASSO_exog", "sarimax"),
    ("LightGBM", "lightgbm"),
]


def run_candidate(name: str, key: str, train: pd.Series, exog: pd.DataFrame) -> tuple[np.ndarray, dict]:
    meta: dict = {}
    if key == "seasonal_naive":
        return fit_seasonal_naive(train, HORIZON), meta
    if key == "ets":
        return fit_ets(train, HORIZON), meta
    if key == "theta":
        return fit_theta(train, HORIZON), meta
    if key == "sarimax":
        yhat, meta = fit_sarimax(train, HORIZON, exog)
        return yhat, meta
    if key == "lightgbm":
        return fit_lightgbm(train, HORIZON, exog), meta
    raise ValueError(f"unknown candidate {key}")


def run() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    series, exog = load_data()
    folds = cv_harness.rolling_origin_folds(
        series,
        start_train=START_TRAIN,
        horizon=HORIZON,
        step=STEP,
        max_folds=MAX_FOLDS,
    )
    print(f"Folds: {len(folds)} (target={TARGET})")
    print(f"Series: {series.index[0].date()} → {series.index[-1].date()}, n={len(series)}")

    # Holders
    per_candidate_forecasts: dict[str, list[np.ndarray]] = {n: [] for n, _ in CANDIDATES}
    per_candidate_actuals: list[pd.Series] = []
    per_candidate_trains: list[pd.Series] = []
    per_candidate_meta: dict[str, list[dict]] = {n: [] for n, _ in CANDIDATES}

    rows_to_log: list[dict] = []
    t0 = time.time()

    for fi, (train_idx, test_idx) in enumerate(folds):
        train = series.loc[train_idx]
        test = series.loc[test_idx]
        per_candidate_trains.append(train)
        per_candidate_actuals.append(test)

        print(f"\n--- Fold {fi}: train [{train.index[0].date()}..{train.index[-1].date()}] "
              f"(n={len(train)}) test [{test.index[0].date()}..{test.index[-1].date()}]")

        for name, key in CANDIDATES:
            ts_start = time.time()
            try:
                yhat, meta = run_candidate(name, key, train, exog)
            except Exception as e:
                print(f"  {name}: ERROR {e!r} — falling back to seasonal naive")
                yhat = fit_seasonal_naive(train, HORIZON)
                meta = {"error": str(e), "fallback": True}
            elapsed = time.time() - ts_start

            per_candidate_forecasts[name].append(yhat)
            per_candidate_meta[name].append({"fold": fi, "elapsed_s": elapsed, **meta})

            row = cv_harness.kpi_row(
                model_name=name,
                fold_idx=fi,
                metric=TARGET,
                actuals=test,
                point_forecast=yhat,
                train_series=train,
            )
            rows_to_log.append(row)
            print(f"  {name:<22} MASE={row['MASE']:.3f}  sMAPE={row['sMAPE']:.2f}  "
                  f"RMSE={row['RMSE']:.0f}  ({elapsed:.1f}s)")

    # ---------------------------------------------------------------------
    # Ensemble: equal-weight mean of top-3 by fold-mean MASE
    # ---------------------------------------------------------------------
    fold_mean_mase = {
        name: float(np.mean([
            cv_harness.mase(per_candidate_actuals[fi], per_candidate_forecasts[name][fi],
                            per_candidate_trains[fi])
            for fi in range(len(folds))
        ]))
        for name, _ in CANDIDATES
    }
    top3 = sorted(fold_mean_mase, key=fold_mean_mase.get)[:3]
    print(f"\nTop-3 by fold-mean MASE: {top3}")

    ensemble_forecasts: list[np.ndarray] = []
    for fi in range(len(folds)):
        stacked = np.vstack([per_candidate_forecasts[n][fi] for n in top3])
        ensemble_forecasts.append(clip_nonneg(stacked.mean(axis=0)))

    ENSEMBLE_NAME = f"Ensemble[{','.join(top3)}]"
    for fi, (train_idx, test_idx) in enumerate(folds):
        train = series.loc[train_idx]
        test = series.loc[test_idx]
        row = cv_harness.kpi_row(
            model_name=ENSEMBLE_NAME,
            fold_idx=fi,
            metric=TARGET,
            actuals=test,
            point_forecast=ensemble_forecasts[fi],
            train_series=train,
        )
        rows_to_log.append(row)

    # Persist KPI rows
    cv_harness.append_kpi_log(rows_to_log, path=str(KPI_LOG))

    # ---------------------------------------------------------------------
    # Build leaderboard (all 6 models)
    # ---------------------------------------------------------------------
    def agg(model_rows: list[dict]) -> dict:
        return {
            "fold_mean_MASE": float(np.mean([r["MASE"] for r in model_rows])),
            "fold_mean_sMAPE": float(np.mean([r["sMAPE"] for r in model_rows])),
            "fold_mean_RMSE": float(np.mean([r["RMSE"] for r in model_rows])),
            "per_fold_MASE": [r["MASE"] for r in model_rows],
            "per_fold_sMAPE": [r["sMAPE"] for r in model_rows],
            "per_fold_RMSE": [r["RMSE"] for r in model_rows],
        }

    rows_by_model: dict[str, list[dict]] = {}
    for r in rows_to_log:
        rows_by_model.setdefault(r["model"], []).append(r)

    leaderboard = {m: agg(rs) for m, rs in rows_by_model.items()}

    # Sort
    sorted_models = sorted(leaderboard, key=lambda m: leaderboard[m]["fold_mean_MASE"])

    print("\n=== Phase 2 Revenue Bake-off Leaderboard ===")
    print(f"{'model':<40} {'MASE':>8} {'sMAPE':>8} {'RMSE':>12}  beats {BEAT_TARGET}?")
    print("-" * 84)
    for m in sorted_models:
        agg_m = leaderboard[m]
        beats = "YES" if agg_m["fold_mean_MASE"] <= BEAT_TARGET else "no"
        print(f"{m:<40} {agg_m['fold_mean_MASE']:>8.3f} {agg_m['fold_mean_sMAPE']:>8.2f} "
              f"{agg_m['fold_mean_RMSE']:>12.0f}  {beats}")
    print("-" * 84)

    # ---------------------------------------------------------------------
    # Winner & refit
    # ---------------------------------------------------------------------
    winner_name = sorted_models[0]
    winner_mase = leaderboard[winner_name]["fold_mean_MASE"]
    no_winner = winner_mase > BEAT_TARGET

    print(f"\nLowest MASE: {winner_name} ({winner_mase:.3f})  "
          f"vs floor {FLOOR_MASE:.3f}  target {BEAT_TARGET:.3f}  "
          f"=> {'WINNER' if not no_winner else 'NO WINNER (does not beat target)'}")

    # Build the winner's 12-month forecast
    FINAL_HORIZON = 12
    if winner_name.startswith("Ensemble["):
        # Refit each constituent on full data and average
        members = top3
        constituent_forecasts = []
        for m in members:
            constituent_forecasts.append(forecast_full(m, series, exog, FINAL_HORIZON))
        winner_point = clip_nonneg(np.mean(np.vstack(constituent_forecasts), axis=0))
        winner_params = {"ensemble_members": members}
    else:
        winner_point = forecast_full(winner_name, series, exog, FINAL_HORIZON)
        winner_params = {}
        # Capture model-specific params (e.g. SARIMAX order) from the last fold
        last_meta = per_candidate_meta.get(winner_name, [])
        if last_meta:
            winner_params = {k: v for k, v in last_meta[-1].items()
                             if k not in ("fold", "elapsed_s")}

    # Forecast index: next 12 months after last data point
    future_idx = pd.date_range(
        series.index[-1] + pd.offsets.MonthBegin(1), periods=FINAL_HORIZON, freq="MS"
    )

    forecast_df = pd.DataFrame({"month": future_idx, "revenue_p50": winner_point})
    forecast_df.to_parquet(FORECAST_PARQUET, index=False)

    sum_12mo = float(winner_point.sum())
    print(f"\n12-month forecast sum (p50): €{sum_12mo:,.0f}")
    print(f"  saved to {FORECAST_PARQUET}")
    print("\n  Monthly:")
    for ts, val in zip(future_idx, winner_point):
        print(f"    {ts.date()}  €{val:,.0f}")

    # ---------------------------------------------------------------------
    # Save winner config + details
    # ---------------------------------------------------------------------
    winner_cfg = {
        "name": winner_name,
        "mase": winner_mase,
        "smape": leaderboard[winner_name]["fold_mean_sMAPE"],
        "rmse": leaderboard[winner_name]["fold_mean_RMSE"],
        "params": winner_params,
        "fitted_on": [str(series.index[0].date()), str(series.index[-1].date())],
        "target": TARGET,
        "beats_floor": not no_winner,
        "floor_mase": FLOOR_MASE,
        "beat_target_mase": BEAT_TARGET,
        "twelve_month_sum_eur": sum_12mo,
        "monthly_forecast": [
            {"month": str(ts.date()), "revenue_p50": float(val)}
            for ts, val in zip(future_idx, winner_point)
        ],
    }
    WINNER_JSON.write_text(json.dumps(winner_cfg, indent=2))

    details = {
        "config": {
            "start_train": START_TRAIN,
            "horizon": HORIZON,
            "step": STEP,
            "max_folds": MAX_FOLDS,
            "season_length": SEASON_LENGTH,
            "target": TARGET,
            "floor_mase": FLOOR_MASE,
            "beat_target_mase": BEAT_TARGET,
        },
        "leaderboard": leaderboard,
        "candidate_meta": per_candidate_meta,
        "ensemble": {"members": top3, "name": ENSEMBLE_NAME},
        "winner": winner_name,
    }
    DETAILS_JSON.write_text(json.dumps(details, indent=2, default=str))

    elapsed = time.time() - t0
    print(f"\nTotal elapsed: {elapsed:.1f}s")
    print(f"Winner config: {WINNER_JSON}")
    print(f"Details:       {DETAILS_JSON}")


def forecast_full(model_name: str, series: pd.Series, exog: pd.DataFrame, horizon: int) -> np.ndarray:
    """Refit a single candidate on the full series and forecast `horizon` steps."""
    if model_name.startswith("SeasonalNaive"):
        return fit_seasonal_naive(series, horizon)
    if model_name == "AutoETS":
        return fit_ets(series, horizon)
    if model_name == "Theta":
        return fit_theta(series, horizon)
    if model_name == "SARIMAX+LASSO_exog":
        yhat, _ = fit_sarimax(series, horizon, exog)
        return yhat
    if model_name == "LightGBM":
        return fit_lightgbm(series, horizon, exog)
    raise ValueError(f"cannot refit {model_name}")


if __name__ == "__main__":
    run()
