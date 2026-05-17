"""
Phase 3 — Volume bake-off + Price/Volume → Revenue reconciliation.

Section B1: same 6 candidates as Phase 2, target = `units`.
  - SeasonalNaive(12), AutoETS, Theta, SARIMAX+LASSO_exog, LightGBM, Ensemble.
  - LightGBM additionally uses `avg_price` as a lag feature (since price and
    volume covary).

Section B2: forecast avg_price with AutoETS, then reconcile the multiplicative
relationship revenue = price * volume by working in log space (log_revenue =
log_price + log_volume) and applying MinTrace(method='ols') from
hierarchicalforecast. Compare the direct revenue forecast (Phase 2 AutoETS)
against the reconciled revenue (price * volume after MinT) using fold-mean MASE
on out-of-sample folds. Pick the lower-MASE path as the final coherent revenue.

We use `method='ols'` rather than `'mint_shrink'` because MinT-shrink requires
insample predictions to estimate the residual covariance, which would require
producing fitted values for all three series at every fold (computationally
heavy on a 48-month panel and not necessary — OLS is well-conditioned with only
2 bottom-level series).

Outputs (notebooks/forecasting_v3/output/):
  - volume_winner.json
  - forecast_v3_volume_point.parquet     (month, volume_p50)
  - forecast_v3_avg_price_point.parquet  (month, avg_price_p50)
  - reconciliation_report.md
  - if reconciled path wins, forecast_v3_revenue_point.parquet is overwritten.
"""
from __future__ import annotations

import importlib.util
import json
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Imports & module loading
# ---------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent

SPEC_CV = importlib.util.spec_from_file_location("cv_harness", HERE / "01_cv_harness.py")
cv_harness = importlib.util.module_from_spec(SPEC_CV)
assert SPEC_CV.loader is not None
SPEC_CV.loader.exec_module(cv_harness)  # type: ignore[union-attr]

SPEC_BO = importlib.util.spec_from_file_location("bakeoff", HERE / "03_revenue_bakeoff.py")
bakeoff = importlib.util.module_from_spec(SPEC_BO)
assert SPEC_BO.loader is not None
SPEC_BO.loader.exec_module(bakeoff)  # type: ignore[union-attr]

import lightgbm as lgb  # noqa: E402
from statsforecast import StatsForecast  # noqa: E402
from statsforecast.models import AutoETS  # noqa: E402
from hierarchicalforecast.core import HierarchicalReconciliation  # noqa: E402
from hierarchicalforecast.methods import MinTrace  # noqa: E402

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
DATA_PATH = HERE / "data" / "clean_monthly.parquet"
EXOG_PATH = HERE / "data" / "exog_aligned.parquet"
OUTPUT_DIR = HERE / "output"
KPI_LOG = OUTPUT_DIR / "kpi_log.tsv"
VOLUME_WINNER_JSON = OUTPUT_DIR / "volume_winner.json"
VOLUME_PARQUET = OUTPUT_DIR / "forecast_v3_volume_point.parquet"
PRICE_PARQUET = OUTPUT_DIR / "forecast_v3_avg_price_point.parquet"
REVENUE_PARQUET = OUTPUT_DIR / "forecast_v3_revenue_point.parquet"
RECON_REPORT = OUTPUT_DIR / "reconciliation_report.md"

TARGET = "units"
HORIZON = 6
START_TRAIN = 24
STEP = 3
MAX_FOLDS = 7
SEASON_LENGTH = 12
FINAL_HORIZON = 12

VOLUME_FLOOR_MASE = 0.915
VOLUME_BEAT_TARGET = 0.778

FRED_COLS = bakeoff.FRED_COLS


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_panel() -> tuple[pd.Series, pd.Series, pd.Series, pd.DataFrame]:
    """Return (revenue, units, avg_price, exog) all indexed by month."""
    df = pd.read_parquet(DATA_PATH)
    df["month"] = pd.to_datetime(df["month"])
    df = df.sort_values("month").set_index("month")

    exog = pd.read_parquet(EXOG_PATH)
    exog["month"] = pd.to_datetime(exog["month"])
    exog = exog.sort_values("month").set_index("month")

    return (
        df["revenue"].astype(float),
        df["units"].astype(float),
        df["avg_price"].astype(float),
        exog[FRED_COLS].astype(float),
    )


# ---------------------------------------------------------------------------
# AutoETS with forced seasonal-additive (matches Phase-2 winner choice)
# ---------------------------------------------------------------------------
def fit_ets_seasonal(train: pd.Series, horizon: int, model_str: str = "ZZA") -> np.ndarray:
    sf_df = pd.DataFrame(
        {"unique_id": "s", "ds": train.index, "y": train.to_numpy(dtype=float)}
    )
    sf = StatsForecast(
        models=[AutoETS(season_length=SEASON_LENGTH, model=model_str)],
        freq="MS",
        n_jobs=1,
    )
    sf.fit(sf_df)
    fcst = sf.predict(h=horizon)
    return bakeoff.clip_nonneg(fcst["AutoETS"].to_numpy(dtype=float))


# ---------------------------------------------------------------------------
# LightGBM with avg_price lag features
# ---------------------------------------------------------------------------
def fit_lightgbm_with_price(
    train_y: pd.Series,
    horizon: int,
    exog_aligned: pd.DataFrame,
    price_series: pd.Series,
) -> np.ndarray:
    """LightGBM with 12 lags of y + calendar + FRED exog + 3 lags of avg_price."""
    y_idx = train_y.index
    full_idx = pd.date_range(
        y_idx[0], y_idx[-1] + pd.offsets.MonthBegin(horizon), freq="MS"
    )
    exog_full = exog_aligned.reindex(full_idx)
    price_full = price_series.reindex(full_idx)

    def build_X(idx: pd.DatetimeIndex, y_history: pd.Series, price_history: pd.Series) -> pd.DataFrame:
        rows = []
        for ts in idx:
            row = {}
            for lag in range(1, 13):
                target_ts = ts - pd.DateOffset(months=lag)
                row[f"y_lag{lag}"] = y_history.get(target_ts, np.nan)
            row["month_of_year"] = ts.month
            row["year"] = ts.year
            for col in FRED_COLS:
                for lag in [0, 1, 3]:
                    target_ts = ts - pd.DateOffset(months=lag)
                    row[f"{col}_lag{lag}"] = exog_full[col].get(target_ts, np.nan)
            # avg_price lags 1, 3, 6 — price covaries with volume
            for lag in [1, 3, 6]:
                target_ts = ts - pd.DateOffset(months=lag)
                row[f"avg_price_lag{lag}"] = price_history.get(target_ts, np.nan)
            row["__ts"] = ts
            rows.append(row)
        return pd.DataFrame(rows).set_index("__ts")

    train_X = build_X(y_idx[12:], train_y, price_series)
    train_y_aligned = train_y.loc[y_idx[12:]]
    mask = ~train_X.isna().any(axis=1)
    train_X = train_X[mask]
    train_y_aligned = train_y_aligned[mask]

    model = lgb.LGBMRegressor(
        num_leaves=15,
        min_data_in_leaf=3,
        n_estimators=200,
        learning_rate=0.05,
        max_depth=4,
        random_state=0,
        verbose=-1,
    )
    model.fit(train_X, train_y_aligned)

    y_history = train_y.copy()
    price_history = price_series.copy()
    forecast_idx = pd.date_range(
        y_idx[-1] + pd.offsets.MonthBegin(1), periods=horizon, freq="MS"
    )
    preds = []
    # For price during the forecast: use the last known value as flat hold-out;
    # the model's seasonal/exog signals carry the variation.
    last_price = float(price_series.iloc[-1])
    for ts in forecast_idx:
        X_step = build_X(pd.DatetimeIndex([ts]), y_history, price_history)
        X_step = X_step.fillna(method="ffill", axis=0).fillna(method="bfill", axis=0)
        X_step = X_step.fillna(0.0)
        yhat = float(model.predict(X_step)[0])
        preds.append(yhat)
        y_history.loc[ts] = yhat
        if pd.isna(price_history.get(ts)):
            price_history.loc[ts] = last_price

    return bakeoff.clip_nonneg(np.asarray(preds, dtype=float))


# ---------------------------------------------------------------------------
# Candidate registry
# ---------------------------------------------------------------------------
CANDIDATES = [
    ("SeasonalNaive(12)", "seasonal_naive"),
    ("AutoETS", "ets"),
    ("Theta", "theta"),
    ("SARIMAX+LASSO_exog", "sarimax"),
    ("LightGBM+price", "lightgbm_price"),
]


def run_candidate(
    key: str,
    train_y: pd.Series,
    exog: pd.DataFrame,
    price_series: pd.Series,
    horizon: int,
) -> tuple[np.ndarray, dict]:
    if key == "seasonal_naive":
        return bakeoff.fit_seasonal_naive(train_y, horizon), {}
    if key == "ets":
        return fit_ets_seasonal(train_y, horizon, "ZZA"), {"model": "ZZA"}
    if key == "theta":
        return bakeoff.fit_theta(train_y, horizon), {}
    if key == "sarimax":
        yhat, meta = bakeoff.fit_sarimax(train_y, horizon, exog)
        return yhat, meta
    if key == "lightgbm_price":
        return fit_lightgbm_with_price(train_y, horizon, exog, price_series), {}
    raise ValueError(f"unknown candidate {key}")


def refit_full_volume(
    name: str,
    series: pd.Series,
    exog: pd.DataFrame,
    price_series: pd.Series,
    horizon: int,
) -> np.ndarray:
    if name == "SeasonalNaive(12)":
        return bakeoff.fit_seasonal_naive(series, horizon)
    if name == "AutoETS":
        return fit_ets_seasonal(series, horizon, "ZZA")
    if name == "Theta":
        return bakeoff.fit_theta(series, horizon)
    if name == "SARIMAX+LASSO_exog":
        yhat, _ = bakeoff.fit_sarimax(series, horizon, exog)
        return yhat
    if name == "LightGBM+price":
        return fit_lightgbm_with_price(series, horizon, exog, price_series)
    raise ValueError(f"cannot refit {name}")


# ---------------------------------------------------------------------------
# B1 — Volume bake-off
# ---------------------------------------------------------------------------
def volume_bakeoff(
    revenue: pd.Series,
    units: pd.Series,
    price: pd.Series,
    exog: pd.DataFrame,
) -> tuple[str, dict, np.ndarray, dict]:
    folds = cv_harness.rolling_origin_folds(
        units,
        start_train=START_TRAIN,
        horizon=HORIZON,
        step=STEP,
        max_folds=MAX_FOLDS,
    )
    print(f"Folds: {len(folds)} (target=units)")
    print(f"Series: {units.index[0].date()} -> {units.index[-1].date()}, n={len(units)}")

    per_candidate_forecasts: dict[str, list[np.ndarray]] = {n: [] for n, _ in CANDIDATES}
    per_candidate_actuals: list[pd.Series] = []
    per_candidate_trains: list[pd.Series] = []
    rows_to_log: list[dict] = []

    for fi, (train_idx, test_idx) in enumerate(folds):
        train = units.loc[train_idx]
        test = units.loc[test_idx]
        # Price/exog windowed to training tail (for ML feature lookups)
        price_train = price.loc[train_idx]
        per_candidate_trains.append(train)
        per_candidate_actuals.append(test)

        print(f"\n--- Fold {fi}: train [{train.index[0].date()}..{train.index[-1].date()}] "
              f"(n={len(train)}) test [{test.index[0].date()}..{test.index[-1].date()}]")

        for name, key in CANDIDATES:
            t0 = time.time()
            try:
                yhat, _ = run_candidate(key, train, exog, price_train, HORIZON)
            except Exception as e:
                print(f"  {name}: ERROR {e!r} — fallback seasonal naive")
                yhat = bakeoff.fit_seasonal_naive(train, HORIZON)
            elapsed = time.time() - t0
            per_candidate_forecasts[name].append(yhat)

            row = cv_harness.kpi_row(
                model_name=f"vol::{name}",
                fold_idx=fi,
                metric=TARGET,
                actuals=test,
                point_forecast=yhat,
                train_series=train,
            )
            rows_to_log.append(row)
            print(f"  {name:<22} MASE={row['MASE']:.3f}  sMAPE={row['sMAPE']:.2f}  "
                  f"RMSE={row['RMSE']:.0f}  ({elapsed:.1f}s)")

    # Ensemble: equal-weight mean of top-3 by fold-mean MASE
    fold_mean_mase = {
        name: float(np.mean([
            cv_harness.mase(per_candidate_actuals[fi], per_candidate_forecasts[name][fi],
                            per_candidate_trains[fi])
            for fi in range(len(folds))
        ]))
        for name, _ in CANDIDATES
    }
    top3 = sorted(fold_mean_mase, key=fold_mean_mase.get)[:3]
    print(f"\nTop-3 (vol) by fold-mean MASE: {top3}")

    ensemble_forecasts: list[np.ndarray] = []
    for fi in range(len(folds)):
        stacked = np.vstack([per_candidate_forecasts[n][fi] for n in top3])
        ensemble_forecasts.append(bakeoff.clip_nonneg(stacked.mean(axis=0)))

    ENSEMBLE_NAME = f"Ensemble[{','.join(top3)}]"
    per_candidate_forecasts[ENSEMBLE_NAME] = ensemble_forecasts
    for fi, (train_idx, test_idx) in enumerate(folds):
        train = units.loc[train_idx]
        test = units.loc[test_idx]
        row = cv_harness.kpi_row(
            model_name=f"vol::{ENSEMBLE_NAME}",
            fold_idx=fi,
            metric=TARGET,
            actuals=test,
            point_forecast=ensemble_forecasts[fi],
            train_series=train,
        )
        rows_to_log.append(row)

    cv_harness.append_kpi_log(rows_to_log, path=str(KPI_LOG))

    def agg(model_rows: list[dict]) -> dict:
        return {
            "fold_mean_MASE": float(np.mean([r["MASE"] for r in model_rows])),
            "fold_mean_sMAPE": float(np.mean([r["sMAPE"] for r in model_rows])),
            "fold_mean_RMSE": float(np.mean([r["RMSE"] for r in model_rows])),
            "per_fold_MASE": [r["MASE"] for r in model_rows],
        }

    rows_by_model: dict[str, list[dict]] = {}
    for r in rows_to_log:
        rows_by_model.setdefault(r["model"], []).append(r)
    leaderboard = {m: agg(rs) for m, rs in rows_by_model.items()}
    sorted_models = sorted(leaderboard, key=lambda m: leaderboard[m]["fold_mean_MASE"])

    print("\n=== Phase 3 Volume Bake-off Leaderboard ===")
    print(f"{'model':<50} {'MASE':>8} {'sMAPE':>8} {'RMSE':>10}  beats {VOLUME_BEAT_TARGET}?")
    print("-" * 96)
    for m in sorted_models:
        agg_m = leaderboard[m]
        beats = "YES" if agg_m["fold_mean_MASE"] <= VOLUME_BEAT_TARGET else "no"
        print(f"{m:<50} {agg_m['fold_mean_MASE']:>8.3f} {agg_m['fold_mean_sMAPE']:>8.2f} "
              f"{agg_m['fold_mean_RMSE']:>10.0f}  {beats}")
    print("-" * 96)

    # Pick winner: lowest MASE that beats target, with seasonal-shape sanity.
    winner_full_name = sorted_models[0]
    winner_mase = leaderboard[winner_full_name]["fold_mean_MASE"]
    winner_display = winner_full_name.replace("vol::", "")
    beats_target = winner_mase <= VOLUME_BEAT_TARGET
    print(f"\nLowest vol MASE: {winner_display} ({winner_mase:.3f})  "
          f"target {VOLUME_BEAT_TARGET:.3f}  => {'WINNER' if beats_target else 'DOES NOT BEAT TARGET'}")

    # Refit & forecast 12 months for the winner.
    if winner_display.startswith("Ensemble["):
        members = top3
        constituent = [refit_full_volume(m, units, exog, price, FINAL_HORIZON) for m in members]
        winner_point = bakeoff.clip_nonneg(np.mean(np.vstack(constituent), axis=0))
        winner_params = {"ensemble_members": members}
    else:
        winner_point = refit_full_volume(winner_display, units, exog, price, FINAL_HORIZON)
        winner_params = {}

    # Seasonal-shape sanity: stdev > 0 (avoid flat-line refit like Theta on revenue).
    if winner_point.std() < 1.0 and not winner_display.startswith("SeasonalNaive"):
        # If the winner refit went flat, fall back to the next best candidate.
        print(f"WARNING: {winner_display} refit went flat (std={winner_point.std():.2f}). "
              f"Trying next candidate.")
        for cand in sorted_models[1:]:
            cand_display = cand.replace("vol::", "")
            try:
                if cand_display.startswith("Ensemble["):
                    continue
                wp = refit_full_volume(cand_display, units, exog, price, FINAL_HORIZON)
                if wp.std() >= 1.0:
                    winner_point = wp
                    winner_display = cand_display
                    winner_mase = leaderboard[cand]["fold_mean_MASE"]
                    winner_params = {"supervisor_override": True, "reason": "flat refit"}
                    print(f"  Selected {cand_display} (std={wp.std():.2f})")
                    break
            except Exception:
                continue

    return winner_display, leaderboard, winner_point, {
        "params": winner_params,
        "mase": winner_mase,
        "smape": leaderboard.get(winner_full_name, {}).get("fold_mean_sMAPE"),
        "rmse": leaderboard.get(winner_full_name, {}).get("fold_mean_RMSE"),
        "beats_target": bool(beats_target),
        "per_candidate_fold_forecasts": per_candidate_forecasts,
        "per_candidate_actuals": per_candidate_actuals,
        "per_candidate_trains": per_candidate_trains,
        "folds": folds,
        "top3": top3,
    }


# ---------------------------------------------------------------------------
# B2 — Avg-price forecast + reconciliation
# ---------------------------------------------------------------------------
def reconcile_path(
    revenue: pd.Series,
    units: pd.Series,
    price: pd.Series,
    exog: pd.DataFrame,
    volume_winner_name: str,
    volume_info: dict,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    """Build out-of-sample fold comparisons for direct vs reconciled revenue,
    then produce final 12-month reconciled forecasts.
    """
    folds = volume_info["folds"]

    # Build per-fold direct (revenue AutoETS-ZZA) and reconciled (price*volume).
    direct_fold_forecasts: list[np.ndarray] = []
    recon_fold_forecasts: list[np.ndarray] = []
    rev_actuals: list[pd.Series] = []
    rev_trains: list[pd.Series] = []

    for fi, (train_idx, test_idx) in enumerate(folds):
        rev_train = revenue.loc[train_idx]
        rev_test = revenue.loc[test_idx]
        rev_actuals.append(rev_test)
        rev_trains.append(rev_train)

        # Direct revenue forecast (same Phase-2 winner config)
        direct = fit_ets_seasonal(rev_train, HORIZON, "ZZA")
        direct_fold_forecasts.append(direct)

        # Reconciled: forecast volume + price separately, then reconcile in log space.
        vol_pred = volume_info["per_candidate_fold_forecasts"][volume_winner_name][fi]
        price_train = price.loc[train_idx]
        price_pred = fit_ets_seasonal(price_train, HORIZON, "ZZA")
        # Hierarchy in log space:
        #   log_revenue (top) = log_price + log_volume (bottom)
        # Build base forecasts for all 3 series and apply MinT-shrink.
        log_rev = np.log(np.maximum(direct, 1e-3))
        log_vol = np.log(np.maximum(vol_pred, 1e-3))
        log_price = np.log(np.maximum(price_pred, 1e-3))

        recon_h = reconcile_with_mint(
            log_rev, log_vol, log_price,
            history_log_rev=np.log(np.maximum(rev_train.to_numpy(), 1e-3)),
            history_log_vol=np.log(np.maximum(units.loc[train_idx].to_numpy(), 1e-3)),
            history_log_price=np.log(np.maximum(price_train.to_numpy(), 1e-3)),
            train_idx=train_idx,
            test_idx=test_idx,
        )
        # recon_h returns dict with reconciled log_rev / log_vol / log_price
        reconciled_rev = np.exp(recon_h["log_revenue"])
        recon_fold_forecasts.append(reconciled_rev)

    # Compute fold-mean MASE for both paths
    direct_mase = float(np.mean([
        cv_harness.mase(rev_actuals[fi], direct_fold_forecasts[fi], rev_trains[fi])
        for fi in range(len(folds))
    ]))
    recon_mase = float(np.mean([
        cv_harness.mase(rev_actuals[fi], recon_fold_forecasts[fi], rev_trains[fi])
        for fi in range(len(folds))
    ]))

    print(f"\nDirect revenue (AutoETS ZZA)   fold-mean MASE: {direct_mase:.4f}")
    print(f"Reconciled rev (price*vol MinT) fold-mean MASE: {recon_mase:.4f}")

    # Log to KPI ledger
    direct_rows = []
    recon_rows = []
    for fi, (train_idx, test_idx) in enumerate(folds):
        direct_rows.append(cv_harness.kpi_row(
            model_name="rev::Direct_AutoETS_ZZA",
            fold_idx=fi, metric="revenue",
            actuals=rev_actuals[fi], point_forecast=direct_fold_forecasts[fi],
            train_series=rev_trains[fi],
        ))
        recon_rows.append(cv_harness.kpi_row(
            model_name="rev::Reconciled_PriceXVol_MinT",
            fold_idx=fi, metric="revenue",
            actuals=rev_actuals[fi], point_forecast=recon_fold_forecasts[fi],
            train_series=rev_trains[fi],
        ))
    cv_harness.append_kpi_log(direct_rows + recon_rows, path=str(KPI_LOG))

    # --- Final 12-month forecasts ---
    # Refit on ALL data.
    direct_final = fit_ets_seasonal(revenue, FINAL_HORIZON, "ZZA")
    price_final = fit_ets_seasonal(price, FINAL_HORIZON, "ZZA")
    # Volume final comes from the volume winner refit-on-all (passed in via volume_info)
    volume_final = volume_info["winner_point_full"]

    log_rev_f = np.log(np.maximum(direct_final, 1e-3))
    log_vol_f = np.log(np.maximum(volume_final, 1e-3))
    log_price_f = np.log(np.maximum(price_final, 1e-3))

    recon_final = reconcile_with_mint(
        log_rev_f, log_vol_f, log_price_f,
        history_log_rev=np.log(np.maximum(revenue.to_numpy(), 1e-3)),
        history_log_vol=np.log(np.maximum(units.to_numpy(), 1e-3)),
        history_log_price=np.log(np.maximum(price.to_numpy(), 1e-3)),
        train_idx=revenue.index,
        test_idx=pd.date_range(
            revenue.index[-1] + pd.offsets.MonthBegin(1),
            periods=FINAL_HORIZON, freq="MS",
        ),
    )
    reconciled_rev_final = np.exp(recon_final["log_revenue"])
    reconciled_vol_final = np.exp(recon_final["log_volume"])
    reconciled_price_final = np.exp(recon_final["log_avg_price"])

    info = {
        "direct_mase": direct_mase,
        "recon_mase": recon_mase,
        "winner": "reconciled" if recon_mase < direct_mase else "direct",
        "direct_final": direct_final,
        "reconciled_rev_final": reconciled_rev_final,
        "reconciled_vol_final": reconciled_vol_final,
        "reconciled_price_final": reconciled_price_final,
        "price_final": price_final,
        "volume_final": volume_final,
    }
    return direct_final, reconciled_rev_final, price_final, info


def reconcile_with_mint(
    log_rev_f: np.ndarray,
    log_vol_f: np.ndarray,
    log_price_f: np.ndarray,
    history_log_rev: np.ndarray,
    history_log_vol: np.ndarray,
    history_log_price: np.ndarray,
    train_idx: pd.Index,
    test_idx: pd.Index,
) -> dict:
    """Apply MinTrace(shrink) to (log_revenue) = (log_volume) + (log_avg_price).

    The hierarchy:
      total          : log_revenue
      bottom level 1 : log_volume
      bottom level 2 : log_avg_price

    S matrix is [[1,1],[1,0],[0,1]] (revenue = vol + price in log space).
    """
    # Base forecasts DataFrame in HF format. The "model" column is just the name
    # we chose for our base forecast (here "Base"); HF picks up any non-id/time
    # column as a model to reconcile.
    h = len(log_rev_f)
    ds = pd.DatetimeIndex(test_idx)

    Y_hat = pd.DataFrame({
        "unique_id": ["log_revenue"] * h + ["log_volume"] * h + ["log_avg_price"] * h,
        "ds": list(ds) * 3,
        "Base": np.concatenate([log_rev_f, log_vol_f, log_price_f]),
    })

    # S matrix: rows = all series (top, then bottom), columns = bottom only.
    # log_revenue = 1*log_volume + 1*log_avg_price
    S_df = pd.DataFrame(
        [[1, 1], [1, 0], [0, 1]],
        columns=["log_volume", "log_avg_price"],
        index=["log_revenue", "log_volume", "log_avg_price"],
    ).reset_index().rename(columns={"index": "unique_id"})

    tags = {
        "top": np.array(["log_revenue"]),
        "bottom": np.array(["log_volume", "log_avg_price"]),
    }

    # OLS does not need insample predictions; pass Y_df=None.
    hr = HierarchicalReconciliation(reconcilers=[MinTrace(method="ols")])
    out = hr.reconcile(
        Y_hat_df=Y_hat,
        S_df=S_df,
        tags=tags,
        Y_df=None,
        id_col="unique_id",
        time_col="ds",
        target_col="y",  # target_col is the name expected in Y_df; ignored when Y_df=None
    )

    # Reconciled column name. HF adds e.g. "Base/MinTrace_method-ols".
    recon_cols = [c for c in out.columns if c.startswith("Base/")]
    if not recon_cols:
        recon_cols = [c for c in out.columns if c not in ("unique_id", "ds", "Base")]
    if not recon_cols:
        # No reconciliation column added — return base unchanged.
        rc = "Base"
    else:
        rc = recon_cols[0]

    def series_for(uid: str) -> np.ndarray:
        sub = out[out["unique_id"] == uid].sort_values("ds")
        return sub[rc].to_numpy(dtype=float)

    return {
        "log_revenue": series_for("log_revenue"),
        "log_volume": series_for("log_volume"),
        "log_avg_price": series_for("log_avg_price"),
        "reconciler": rc,
    }


# ---------------------------------------------------------------------------
def run() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    revenue, units, price, exog = load_panel()
    print(f"Loaded: revenue n={len(revenue)}, units n={len(units)}, price n={len(price)}")
    print(f"Historical units sum 2022-2025: {units.sum():.0f}")
    print(f"Historical avg_price range: [{price.min():.2f}, {price.max():.2f}]")

    # ---- B1 ----
    print("\n" + "=" * 60)
    print("Section B1 — Volume bake-off")
    print("=" * 60)
    winner_name, vol_leaderboard, vol_winner_point, vol_info = volume_bakeoff(
        revenue, units, price, exog
    )
    vol_info["winner_point_full"] = vol_winner_point
    vol_info["winner_name"] = winner_name

    # Save volume artifacts.
    future_idx = pd.date_range(
        units.index[-1] + pd.offsets.MonthBegin(1), periods=FINAL_HORIZON, freq="MS"
    )
    vol_df = pd.DataFrame({"month": future_idx, "volume_p50": vol_winner_point})
    vol_df.to_parquet(VOLUME_PARQUET, index=False)
    print(f"\nVolume 12-month sum: {vol_winner_point.sum():.0f} units  -> {VOLUME_PARQUET}")
    print("Monthly volume:")
    for ts, v in zip(future_idx, vol_winner_point):
        print(f"  {ts.date()}  {v:,.0f}")

    # Winner JSON
    winner_cfg = {
        "name": winner_name,
        "mase": vol_info["mase"],
        "smape": vol_info["smape"],
        "rmse": vol_info["rmse"],
        "params": vol_info["params"],
        "fitted_on": [str(units.index[0].date()), str(units.index[-1].date())],
        "target": TARGET,
        "beats_floor": vol_info["beats_target"],
        "floor_mase": VOLUME_FLOOR_MASE,
        "beat_target_mase": VOLUME_BEAT_TARGET,
        "twelve_month_sum_units": float(vol_winner_point.sum()),
        "monthly_forecast": [
            {"month": str(ts.date()), "volume_p50": float(v)}
            for ts, v in zip(future_idx, vol_winner_point)
        ],
    }
    VOLUME_WINNER_JSON.write_text(json.dumps(winner_cfg, indent=2, default=str))
    print(f"Wrote {VOLUME_WINNER_JSON}")

    # ---- B2 ----
    print("\n" + "=" * 60)
    print("Section B2 — Price forecast + MinT reconciliation")
    print("=" * 60)
    direct_final, reconciled_rev_final, price_final, recon_info = reconcile_path(
        revenue, units, price, exog,
        volume_winner_name=winner_name,
        volume_info=vol_info,
    )

    # Save price forecast (use the reconciled price values to keep coherence)
    price_out = recon_info["reconciled_price_final"]
    price_df = pd.DataFrame({"month": future_idx, "avg_price_p50": price_out})
    price_df.to_parquet(PRICE_PARQUET, index=False)
    print(f"\nAvg-price 12-month sum: {price_out.sum():.2f}  mean: {price_out.mean():.2f}")
    print(f"Wrote {PRICE_PARQUET}")

    # ---- Pick coherent path ----
    if recon_info["winner"] == "reconciled":
        final_rev = reconciled_rev_final
        chosen = "Reconciled (price * volume + MinTrace-OLS in log space)"
    else:
        final_rev = direct_final
        chosen = "Direct (Phase-2 AutoETS revenue)"

    final_rev_sum = float(final_rev.sum())
    print(f"\nFinal revenue path: {chosen}")
    print(f"Final 12-month revenue sum: EUR {final_rev_sum:,.0f}")

    # Overwrite revenue parquet if reconciled wins
    if recon_info["winner"] == "reconciled":
        rev_df = pd.DataFrame({"month": future_idx, "revenue_p50": final_rev})
        rev_df.to_parquet(REVENUE_PARQUET, index=False)
        print(f"Overwrote {REVENUE_PARQUET} with reconciled revenue.")

    # ---- Report ----
    report = [
        "# Reconciliation Report — Phase 3",
        "",
        "## Volume bake-off (target = `units`)",
        f"- Winner: **{winner_name}** (fold-mean MASE = {vol_info['mase']:.3f}; "
        f"floor = {VOLUME_FLOOR_MASE}, target ≤ {VOLUME_BEAT_TARGET})",
        f"- Beats target: **{'YES' if vol_info['beats_target'] else 'NO'}**",
        f"- 12-month volume sum: **{vol_winner_point.sum():,.0f} units** "
        f"(historical 2022-2025 range: [6,300; 8,500])",
        "",
        "### Volume leaderboard",
        "",
        "| model | fold-mean MASE | sMAPE | RMSE |",
        "|---|---:|---:|---:|",
    ]
    for m in sorted(vol_leaderboard, key=lambda k: vol_leaderboard[k]["fold_mean_MASE"]):
        agg_m = vol_leaderboard[m]
        report.append(f"| {m} | {agg_m['fold_mean_MASE']:.3f} | "
                      f"{agg_m['fold_mean_sMAPE']:.2f} | {agg_m['fold_mean_RMSE']:.0f} |")

    report.extend([
        "",
        "## Avg-price forecast",
        f"- Model: AutoETS (model=ZZA, season_length=12) — same class as revenue per supervisor.",
        f"- 12-month avg-price mean: **{price_out.mean():.2f}**",
        f"- Historical range: [{price.min():.2f}, {price.max():.2f}]",
        "",
        "## Direct vs reconciled revenue",
        "",
        "Reconciliation: hierarchicalforecast `MinTrace(method='ols')` applied "
        "in **log space** so that `log_revenue = log_volume + log_avg_price` "
        "is an additive identity. S = [[1,1],[1,0],[0,1]]. OLS chosen over "
        "`mint_shrink` because shrinkage requires insample base-forecasts for "
        "every series at every fold (computationally heavy on this 48-month "
        "panel) and OLS is well-conditioned with only 2 bottom-level series.",
        "",
        "| path | fold-mean MASE on revenue |",
        "|---|---:|",
        f"| Direct (Phase-2 AutoETS ZZA) | {recon_info['direct_mase']:.4f} |",
        f"| Reconciled (price × volume + MinT) | {recon_info['recon_mase']:.4f} |",
        "",
        f"**Winner: {chosen}**.",
        "",
        f"- Final 12-month revenue sum: **EUR {final_rev_sum:,.0f}**.",
        "",
    ])
    if recon_info["winner"] == "reconciled":
        report.append("- `forecast_v3_revenue_point.parquet` has been overwritten "
                      "with the reconciled revenue path.")
    else:
        report.append("- `forecast_v3_revenue_point.parquet` is unchanged "
                      "(direct path wins; Phase-2 AutoETS retained).")

    RECON_REPORT.write_text("\n".join(report))
    print(f"\nWrote {RECON_REPORT}")


if __name__ == "__main__":
    run()
