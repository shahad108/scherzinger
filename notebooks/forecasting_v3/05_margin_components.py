"""
Phase 4 — Margin forecasting via component method (Chen-Lewis-Yan 2020).

Section 1: Cost bake-off (6 candidates, 7-fold rolling-origin CV). Floor is
SeasonalNaive MASE = 0.786; winner must hit MASE <= 0.668 (15% better).

Section 2: Margin via components vs direct ratio. The components method
forecasts revenue and cost separately and derives
    margin_t = (revenue_p50_t - cost_p50_t) / revenue_p50_t.
The direct method forecasts the `margin_ratio` column directly with the same
6-candidate bake-off. The two methods are compared OOS over the same 7 folds
in MAE-pp (margin percentage points). Lower wins.

NOTE: clean_monthly.margin_ratio is `(revenue - material_cost) / revenue`
(material-only margin, ~85%). The FE displays DB2 gross margin (~27%) which
uses `db2_total / revenue`. We forecast what's in the data and flag the
definition mismatch in margin_method_comparison.md for the Phase 8 wiring.

Outputs:
  - output/cost_winner.json
  - output/forecast_v3_cost_point.parquet
  - output/margin_winner.json
  - output/forecast_v3_margin_point.parquet
  - output/margin_method_comparison.md
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
HERE = Path(__file__).resolve().parent
SPEC_CV = importlib.util.spec_from_file_location("cv_harness", HERE / "01_cv_harness.py")
cv_harness = importlib.util.module_from_spec(SPEC_CV)
assert SPEC_CV.loader is not None
SPEC_CV.loader.exec_module(cv_harness)  # type: ignore[union-attr]

SPEC_RB = importlib.util.spec_from_file_location("revenue_bakeoff", HERE / "03_revenue_bakeoff.py")
revenue_bakeoff = importlib.util.module_from_spec(SPEC_RB)
assert SPEC_RB.loader is not None
SPEC_RB.loader.exec_module(revenue_bakeoff)  # type: ignore[union-attr]

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
DATA_PATH = HERE / "data" / "clean_monthly.parquet"
EXOG_PATH = HERE / "data" / "exog_aligned.parquet"
OUTPUT_DIR = HERE / "output"
KPI_LOG = OUTPUT_DIR / "kpi_log.tsv"

COST_WINNER_JSON = OUTPUT_DIR / "cost_winner.json"
COST_FORECAST_PARQUET = OUTPUT_DIR / "forecast_v3_cost_point.parquet"
MARGIN_WINNER_JSON = OUTPUT_DIR / "margin_winner.json"
MARGIN_FORECAST_PARQUET = OUTPUT_DIR / "forecast_v3_margin_point.parquet"
MARGIN_COMP_MD = OUTPUT_DIR / "margin_method_comparison.md"
REVENUE_FORECAST_PARQUET = OUTPUT_DIR / "forecast_v3_revenue_point.parquet"

HORIZON = 6
START_TRAIN = 24
STEP = 3
MAX_FOLDS = 7
SEASON_LENGTH = 12

# Cost baseline floor from Phase 1 SeasonalNaive
COST_FLOOR_MASE = 0.786
COST_BEAT_TARGET = 0.668  # 15% better than floor

# For LightGBM cost, the literal cost drivers are commodity prices
COST_FRED_COLS = ["WPU101", "PCOPPUSDM", "PALUMUSDM"]

# Restrict candidate list to the same 6 names used in Phase 2
COST_CANDIDATES = [
    ("SeasonalNaive(12)", "seasonal_naive"),
    ("AutoETS", "ets"),
    ("Theta", "theta"),
    ("SARIMAX+LASSO_exog", "sarimax"),
    ("LightGBM", "lightgbm"),
]


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_clean() -> pd.DataFrame:
    df = pd.read_parquet(DATA_PATH)
    df["month"] = pd.to_datetime(df["month"])
    return df.sort_values("month").set_index("month")


def load_exog() -> pd.DataFrame:
    exog = pd.read_parquet(EXOG_PATH)
    exog["month"] = pd.to_datetime(exog["month"])
    return exog.sort_values("month").set_index("month")


def clip_nonneg(arr: np.ndarray) -> np.ndarray:
    return np.clip(arr, 0.0, None)


# ---------------------------------------------------------------------------
# Candidate runner (delegate to revenue_bakeoff functions on arbitrary target)
# ---------------------------------------------------------------------------
def run_candidate(name: str, key: str, train: pd.Series, exog: pd.DataFrame,
                  horizon: int = HORIZON) -> tuple[np.ndarray, dict]:
    """Wrap revenue_bakeoff candidate functions for any target series."""
    meta: dict = {}
    if key == "seasonal_naive":
        return revenue_bakeoff.fit_seasonal_naive(train, horizon), meta
    if key == "ets":
        return revenue_bakeoff.fit_ets(train, horizon), meta
    if key == "theta":
        return revenue_bakeoff.fit_theta(train, horizon), meta
    if key == "sarimax":
        yhat, meta = revenue_bakeoff.fit_sarimax(train, horizon, exog)
        return yhat, meta
    if key == "lightgbm":
        return revenue_bakeoff.fit_lightgbm(train, horizon, exog), meta
    raise ValueError(f"unknown candidate {key}")


def forecast_full(model_name: str, series: pd.Series, exog: pd.DataFrame,
                  horizon: int) -> np.ndarray:
    """Refit on the full series and forecast `horizon` steps."""
    if model_name.startswith("SeasonalNaive"):
        return revenue_bakeoff.fit_seasonal_naive(series, horizon)
    if model_name == "AutoETS":
        return revenue_bakeoff.fit_ets(series, horizon)
    if model_name == "Theta":
        return revenue_bakeoff.fit_theta(series, horizon)
    if model_name == "SARIMAX+LASSO_exog":
        yhat, _ = revenue_bakeoff.fit_sarimax(series, horizon, exog)
        return yhat
    if model_name == "LightGBM":
        return revenue_bakeoff.fit_lightgbm(series, horizon, exog)
    raise ValueError(f"cannot refit {model_name}")


# ---------------------------------------------------------------------------
# Generic bake-off: returns per-fold forecasts and leaderboard
# ---------------------------------------------------------------------------
def run_bakeoff(
    target_name: str,
    series: pd.Series,
    exog: pd.DataFrame,
    candidates: list[tuple[str, str]],
    *,
    log_to_kpi: bool = True,
    allow_negative: bool = False,
) -> dict:
    """Run rolling-origin bake-off across `candidates` on `series`.

    Returns dict with:
      - folds: list of (train_idx, test_idx)
      - per_candidate_forecasts: {name: [fold0_yhat, fold1_yhat, ...]}
      - per_candidate_actuals: [test0, test1, ...]
      - per_candidate_trains: [train0, train1, ...]
      - leaderboard: {name: {fold_mean_MASE, ...}}
      - per_candidate_meta: {name: [{fold, ...}]}
    """
    folds = cv_harness.rolling_origin_folds(
        series,
        start_train=START_TRAIN,
        horizon=HORIZON,
        step=STEP,
        max_folds=MAX_FOLDS,
    )
    print(f"\n[{target_name}] Folds: {len(folds)}  series: {series.index[0].date()} → "
          f"{series.index[-1].date()} (n={len(series)})")

    per_candidate_forecasts: dict[str, list[np.ndarray]] = {n: [] for n, _ in candidates}
    per_candidate_meta: dict[str, list[dict]] = {n: [] for n, _ in candidates}
    per_candidate_actuals: list[pd.Series] = []
    per_candidate_trains: list[pd.Series] = []
    rows_to_log: list[dict] = []

    for fi, (train_idx, test_idx) in enumerate(folds):
        train = series.loc[train_idx]
        test = series.loc[test_idx]
        per_candidate_trains.append(train)
        per_candidate_actuals.append(test)

        print(f"  Fold {fi}: train n={len(train)} test [{test.index[0].date()}..{test.index[-1].date()}]")
        for name, key in candidates:
            t0 = time.time()
            try:
                yhat, meta = run_candidate(name, key, train, exog)
            except Exception as e:
                print(f"    {name}: ERROR {e!r} — falling back to seasonal naive")
                yhat = revenue_bakeoff.fit_seasonal_naive(train, HORIZON)
                meta = {"error": str(e), "fallback": True}
            elapsed = time.time() - t0

            if not allow_negative:
                yhat = clip_nonneg(yhat)
            per_candidate_forecasts[name].append(yhat)
            per_candidate_meta[name].append({"fold": fi, "elapsed_s": elapsed, **meta})

            row = cv_harness.kpi_row(
                model_name=f"{name}__{target_name}",
                fold_idx=fi,
                metric=target_name,
                actuals=test,
                point_forecast=yhat,
                train_series=train,
            )
            rows_to_log.append(row)
            print(f"    {name:<22} MASE={row['MASE']:.3f}  sMAPE={row['sMAPE']:.2f}  "
                  f"RMSE={row['RMSE']:.2f} ({elapsed:.1f}s)")

    # Leaderboard
    leaderboard: dict[str, dict] = {}
    for name, _ in candidates:
        mase_per_fold = [
            cv_harness.mase(per_candidate_actuals[fi], per_candidate_forecasts[name][fi],
                            per_candidate_trains[fi])
            for fi in range(len(folds))
        ]
        smape_per_fold = [
            cv_harness.smape(per_candidate_actuals[fi], per_candidate_forecasts[name][fi])
            for fi in range(len(folds))
        ]
        rmse_per_fold = [
            cv_harness.rmse(per_candidate_actuals[fi], per_candidate_forecasts[name][fi])
            for fi in range(len(folds))
        ]
        leaderboard[name] = {
            "fold_mean_MASE": float(np.mean(mase_per_fold)),
            "fold_mean_sMAPE": float(np.mean(smape_per_fold)),
            "fold_mean_RMSE": float(np.mean(rmse_per_fold)),
            "per_fold_MASE": [float(x) for x in mase_per_fold],
        }

    if log_to_kpi:
        cv_harness.append_kpi_log(rows_to_log, path=str(KPI_LOG))

    return {
        "folds": folds,
        "per_candidate_forecasts": per_candidate_forecasts,
        "per_candidate_actuals": per_candidate_actuals,
        "per_candidate_trains": per_candidate_trains,
        "per_candidate_meta": per_candidate_meta,
        "leaderboard": leaderboard,
    }


# ---------------------------------------------------------------------------
# Seasonal shape sanity check
# ---------------------------------------------------------------------------
def is_degenerate_flat(forecast: np.ndarray, hist_series: pd.Series,
                       cov_threshold: float = 0.2) -> bool:
    """Returns True if forecast looks like a constant line vs historical CoV.

    Heuristic: if forecast CoV < 20% of historical CoV (over the last 24mo),
    treat as degenerate / no seasonal shape.
    """
    if len(forecast) < 2:
        return False
    fc_mean = float(np.mean(forecast))
    if fc_mean <= 1e-9:
        return False
    fc_cov = float(np.std(forecast) / fc_mean)
    hist = hist_series.iloc[-min(24, len(hist_series)):]
    hist_mean = float(hist.mean())
    if hist_mean <= 1e-9:
        return False
    hist_cov = float(hist.std() / hist_mean)
    return fc_cov < cov_threshold * hist_cov


# ---------------------------------------------------------------------------
# Section 1: Cost bake-off
# ---------------------------------------------------------------------------
def section1_cost_bakeoff(clean: pd.DataFrame, exog: pd.DataFrame) -> dict:
    print("\n" + "=" * 80)
    print("SECTION 1 — Cost bake-off (7-fold CV, target=cost)")
    print("=" * 80)

    cost_series = clean["cost"].astype(float)

    # Use the full FRED set for SARIMAX (LASSO-selected); the cost-specific
    # commodity-only set is enforced inside the LightGBM path via the
    # FRED_COLS module variable.
    result = run_bakeoff("cost", cost_series, exog, COST_CANDIDATES)

    leaderboard = result["leaderboard"]
    sorted_models = sorted(leaderboard, key=lambda m: leaderboard[m]["fold_mean_MASE"])

    print("\n=== Cost Leaderboard ===")
    print(f"{'model':<25} {'MASE':>8} {'sMAPE':>8} {'RMSE':>12}  beats {COST_BEAT_TARGET}?")
    print("-" * 70)
    for m in sorted_models:
        agg = leaderboard[m]
        beats = "YES" if agg["fold_mean_MASE"] <= COST_BEAT_TARGET else "no"
        print(f"{m:<25} {agg['fold_mean_MASE']:>8.3f} {agg['fold_mean_sMAPE']:>8.2f} "
              f"{agg['fold_mean_RMSE']:>12.0f}  {beats}")
    print("-" * 70)

    # Pick winner with seasonal-shape sanity check
    FINAL_HORIZON = 12
    chosen_name = None
    chosen_forecast = None
    chosen_reason = ""
    for candidate_name in sorted_models:
        fc = forecast_full(candidate_name, cost_series, exog, FINAL_HORIZON)
        if is_degenerate_flat(fc, cost_series):
            print(f"  {candidate_name}: forecast looks DEGENERATE FLAT — trying next")
            continue
        chosen_name = candidate_name
        chosen_forecast = clip_nonneg(fc)
        chosen_reason = "best MASE that preserves seasonal shape"
        break

    if chosen_name is None:
        # Fall back to lowest-MASE even if flat
        chosen_name = sorted_models[0]
        chosen_forecast = clip_nonneg(forecast_full(chosen_name, cost_series, exog, FINAL_HORIZON))
        chosen_reason = "lowest MASE (all candidates produced flat forecasts)"

    winner_mase = leaderboard[chosen_name]["fold_mean_MASE"]
    beats_floor = winner_mase <= COST_BEAT_TARGET

    print(f"\nCost winner: {chosen_name}  MASE={winner_mase:.3f}  ({chosen_reason})")
    print(f"  Beats target {COST_BEAT_TARGET}? {'YES' if beats_floor else 'no'}")

    # Save forecast parquet + winner JSON
    future_idx = pd.date_range(
        cost_series.index[-1] + pd.offsets.MonthBegin(1), periods=FINAL_HORIZON, freq="MS"
    )
    cost_df = pd.DataFrame({"month": future_idx, "cost_p50": chosen_forecast})
    cost_df.to_parquet(COST_FORECAST_PARQUET, index=False)

    sum_12mo = float(chosen_forecast.sum())
    print(f"\n12-month cost forecast sum: €{sum_12mo:,.0f}")
    for ts, val in zip(future_idx, chosen_forecast):
        print(f"  {ts.date()}  €{val:,.0f}")

    winner_cfg = {
        "name": chosen_name,
        "mase": winner_mase,
        "smape": leaderboard[chosen_name]["fold_mean_sMAPE"],
        "rmse": leaderboard[chosen_name]["fold_mean_RMSE"],
        "selection_reason": chosen_reason,
        "target": "cost",
        "beats_floor": beats_floor,
        "floor_mase": COST_FLOOR_MASE,
        "beat_target_mase": COST_BEAT_TARGET,
        "twelve_month_sum_eur": sum_12mo,
        "monthly_forecast": [
            {"month": str(ts.date()), "cost_p50": float(val)}
            for ts, val in zip(future_idx, chosen_forecast)
        ],
        "leaderboard": leaderboard,
    }
    COST_WINNER_JSON.write_text(json.dumps(winner_cfg, indent=2))

    return {
        "winner_name": chosen_name,
        "winner_mase": winner_mase,
        "cv_result": result,
        "twelve_month_forecast": chosen_forecast,
        "twelve_month_index": future_idx,
        "leaderboard": leaderboard,
    }


# ---------------------------------------------------------------------------
# Section 2: Margin via components vs direct
# ---------------------------------------------------------------------------
def section2_margin(
    clean: pd.DataFrame,
    exog: pd.DataFrame,
    cost_result: dict,
) -> dict:
    print("\n" + "=" * 80)
    print("SECTION 2 — Margin: components (rev/cost) vs direct (margin_ratio)")
    print("=" * 80)

    revenue_series = clean["revenue"].astype(float)
    cost_series = clean["cost"].astype(float)
    margin_series = clean["margin_ratio"].astype(float)

    # ---- A) Direct: run the same 6 candidates on margin_ratio
    print("\n--- Direct method: bake-off on margin_ratio ---")
    direct_result = run_bakeoff(
        "margin_ratio",
        margin_series,
        exog,
        COST_CANDIDATES,
        allow_negative=True,  # margin can be negative in principle
    )
    direct_leaderboard = direct_result["leaderboard"]
    direct_sorted = sorted(direct_leaderboard, key=lambda m: direct_leaderboard[m]["fold_mean_MASE"])
    direct_winner_name = direct_sorted[0]
    print(f"\nDirect-method best by MASE: {direct_winner_name} "
          f"(MASE={direct_leaderboard[direct_winner_name]['fold_mean_MASE']:.3f})")

    # ---- B) Components: bake-off on revenue (re-run; cheap) to get per-fold rev_hat
    # We can't reuse Phase 2's reconciled forecast at the per-fold level (it's
    # only saved as the final 12-month vector). So we re-run the candidate
    # bake-off for revenue here, pick that winner, and use it as rev_hat per
    # fold. For cost we have cost_result.cv_result already.
    print("\n--- Components method: bake-off on revenue (to get per-fold rev forecasts) ---")
    rev_result = run_bakeoff(
        "revenue_comp",
        revenue_series,
        exog,
        COST_CANDIDATES,
        log_to_kpi=False,  # Phase 2 already logged the official revenue rows
    )
    rev_leaderboard = rev_result["leaderboard"]
    rev_sorted = sorted(rev_leaderboard, key=lambda m: rev_leaderboard[m]["fold_mean_MASE"])
    rev_winner_name = rev_sorted[0]
    cost_winner_name = cost_result["winner_name"]
    print(f"  Component rev winner (per-fold proxy): {rev_winner_name}  "
          f"MASE={rev_leaderboard[rev_winner_name]['fold_mean_MASE']:.3f}")
    print(f"  Component cost winner: {cost_winner_name}  "
          f"MASE={cost_result['leaderboard'][cost_winner_name]['fold_mean_MASE']:.3f}")

    # ---- Per-fold OOS margin comparison (MAE in margin percentage points)
    folds = direct_result["folds"]  # same fold schedule across all bake-offs
    actuals_rev = rev_result["per_candidate_actuals"]
    actuals_cost = cost_result["cv_result"]["per_candidate_actuals"]
    actuals_margin = direct_result["per_candidate_actuals"]

    component_per_fold_pp_errors: list[list[float]] = []
    direct_per_fold_pp_errors: list[list[float]] = []
    actual_margin_per_fold: list[list[float]] = []
    component_margin_per_fold: list[list[float]] = []
    direct_margin_per_fold: list[list[float]] = []

    for fi in range(len(folds)):
        rev_actual = actuals_rev[fi].to_numpy(dtype=float)
        cost_actual = actuals_cost[fi].to_numpy(dtype=float)
        margin_actual_raw = actuals_margin[fi].to_numpy(dtype=float)
        # Build "true" margin from actual rev & cost (this is the authoritative
        # margin_ratio definition by construction — should match margin_actual_raw).
        true_margin = np.where(rev_actual > 0, (rev_actual - cost_actual) / rev_actual, np.nan)

        # Component forecast for this fold:
        rev_hat = rev_result["per_candidate_forecasts"][rev_winner_name][fi]
        cost_hat = cost_result["cv_result"]["per_candidate_forecasts"][cost_winner_name][fi]
        comp_margin_hat = np.where(rev_hat > 0, (rev_hat - cost_hat) / rev_hat, np.nan)

        # Direct forecast for this fold:
        direct_margin_hat = direct_result["per_candidate_forecasts"][direct_winner_name][fi]

        # MAE in pp = absolute error * 100
        comp_pp = (np.abs(comp_margin_hat - true_margin) * 100.0).tolist()
        direct_pp = (np.abs(direct_margin_hat - true_margin) * 100.0).tolist()

        component_per_fold_pp_errors.append(comp_pp)
        direct_per_fold_pp_errors.append(direct_pp)
        actual_margin_per_fold.append(true_margin.tolist())
        component_margin_per_fold.append(comp_margin_hat.tolist())
        direct_margin_per_fold.append(direct_margin_hat.tolist())

    # Flatten across folds for an overall MAE-pp
    comp_mae_pp = float(np.nanmean([e for fold in component_per_fold_pp_errors for e in fold]))
    direct_mae_pp = float(np.nanmean([e for fold in direct_per_fold_pp_errors for e in fold]))
    comp_mae_pp_per_fold = [float(np.nanmean(x)) for x in component_per_fold_pp_errors]
    direct_mae_pp_per_fold = [float(np.nanmean(x)) for x in direct_per_fold_pp_errors]

    print("\n=== Margin method comparison (OOS, 7-fold) ===")
    print(f"  Components ({rev_winner_name} + {cost_winner_name}):")
    print(f"    MAE = {comp_mae_pp:.3f} pp   per-fold = "
          f"{[round(x, 3) for x in comp_mae_pp_per_fold]}")
    print(f"  Direct ({direct_winner_name}):")
    print(f"    MAE = {direct_mae_pp:.3f} pp   per-fold = "
          f"{[round(x, 3) for x in direct_mae_pp_per_fold]}")

    if comp_mae_pp <= direct_mae_pp:
        chosen_method = "components"
        chosen_mae = comp_mae_pp
    else:
        chosen_method = "direct"
        chosen_mae = direct_mae_pp
    print(f"\n>>> Margin method winner: {chosen_method}  (MAE={chosen_mae:.3f} pp)")

    # ---- Build the final 12-month margin forecast
    FINAL_HORIZON = 12
    # Read reconciled revenue forecast (the source of truth from Phase 3)
    rev_df = pd.read_parquet(REVENUE_FORECAST_PARQUET).sort_values("month")
    rev_p50 = rev_df["revenue_p50"].to_numpy(dtype=float)
    cost_p50 = cost_result["twelve_month_forecast"]
    future_idx = cost_result["twelve_month_index"]

    if chosen_method == "components":
        margin_p50 = np.where(rev_p50 > 0, (rev_p50 - cost_p50) / rev_p50, np.nan)
    else:
        # Refit direct winner on full margin_ratio history
        direct_full = forecast_full(direct_winner_name, margin_series, exog, FINAL_HORIZON)
        margin_p50 = direct_full

    margin_df = pd.DataFrame({"month": future_idx, "margin_p50": margin_p50})
    margin_df.to_parquet(MARGIN_FORECAST_PARQUET, index=False)

    print(f"\n12-month margin_p50 forecast:")
    for ts, val in zip(future_idx, margin_p50):
        print(f"  {ts.date()}  {val:.4f}  ({val*100:.2f}%)")
    print(f"  avg = {float(np.mean(margin_p50)):.4f} ({float(np.mean(margin_p50))*100:.2f}%)")

    # ---- Save winner JSON
    winner_cfg = {
        "method": chosen_method,
        "mae_pp": chosen_mae,
        "details": {
            "components": {
                "revenue_model": rev_winner_name,
                "revenue_mase_cv": rev_leaderboard[rev_winner_name]["fold_mean_MASE"],
                "cost_model": cost_winner_name,
                "cost_mase_cv": cost_result["leaderboard"][cost_winner_name]["fold_mean_MASE"],
                "mae_pp_overall": comp_mae_pp,
                "mae_pp_per_fold": comp_mae_pp_per_fold,
                "note": (
                    "Per-fold rev forecast uses the bake-off winner refit on each "
                    "training window (NOT the reconciled MinTrace path). The final "
                    "12-month margin is built from the Phase 3 reconciled revenue "
                    "forecast + the cost winner forecast."
                ),
            },
            "direct": {
                "model": direct_winner_name,
                "margin_ratio_mase_cv": direct_leaderboard[direct_winner_name]["fold_mean_MASE"],
                "mae_pp_overall": direct_mae_pp,
                "mae_pp_per_fold": direct_mae_pp_per_fold,
            },
            "cv": {
                "folds": len(folds),
                "horizon": HORIZON,
                "start_train": START_TRAIN,
                "step": STEP,
            },
        },
        "monthly_forecast": [
            {"month": str(ts.date()), "margin_p50": float(val)}
            for ts, val in zip(future_idx, margin_p50)
        ],
        "definition_note": (
            "margin_ratio in clean_monthly is (revenue - material_cost) / revenue "
            "(~85%). The FE displays DB2 gross margin (~27%) which uses db2_total. "
            "Phase 8 must reconcile this definition mismatch."
        ),
    }
    MARGIN_WINNER_JSON.write_text(json.dumps(winner_cfg, indent=2))

    return {
        "method": chosen_method,
        "mae_pp": chosen_mae,
        "comp_mae_pp": comp_mae_pp,
        "direct_mae_pp": direct_mae_pp,
        "comp_mae_pp_per_fold": comp_mae_pp_per_fold,
        "direct_mae_pp_per_fold": direct_mae_pp_per_fold,
        "rev_winner_name": rev_winner_name,
        "direct_winner_name": direct_winner_name,
        "direct_leaderboard": direct_leaderboard,
        "rev_leaderboard": rev_leaderboard,
        "margin_p50": margin_p50,
        "future_idx": future_idx,
    }


# ---------------------------------------------------------------------------
# Margin method comparison .md
# ---------------------------------------------------------------------------
def write_comparison_md(
    clean: pd.DataFrame,
    cost_result: dict,
    margin_result: dict,
) -> None:
    margin_p50 = margin_result["margin_p50"]
    future_idx = margin_result["future_idx"]
    hist_margin = clean["margin_ratio"]

    lines = []
    lines.append("# Margin Method Comparison — Phase 4")
    lines.append("")
    lines.append("## Background")
    lines.append("")
    lines.append("Chen-Lewis-Yan (2020) recommend forecasting revenue and cost **separately**, ")
    lines.append("then deriving the margin ratio:")
    lines.append("")
    lines.append("> margin_t = (revenue_p50_t − cost_p50_t) / revenue_p50_t")
    lines.append("")
    lines.append("vs. forecasting the margin ratio directly as a single time-series target. ")
    lines.append("This is the bake-off: we ran both methods on the same 7-fold rolling-origin ")
    lines.append("split (start_train=24, horizon=6, step=3) and compared MAE in margin ")
    lines.append("percentage points (pp).")
    lines.append("")
    lines.append("## Cost bake-off (Section 1)")
    lines.append("")
    lines.append(f"Floor (SeasonalNaive MASE): {COST_FLOOR_MASE:.3f}. ")
    lines.append(f"Target: MASE ≤ {COST_BEAT_TARGET:.3f}.")
    lines.append("")
    lines.append("| Model | fold-mean MASE | fold-mean sMAPE | fold-mean RMSE |")
    lines.append("|---|---:|---:|---:|")
    leaderboard = cost_result["leaderboard"]
    for name in sorted(leaderboard, key=lambda m: leaderboard[m]["fold_mean_MASE"]):
        agg = leaderboard[name]
        lines.append(f"| {name} | {agg['fold_mean_MASE']:.3f} | "
                     f"{agg['fold_mean_sMAPE']:.2f} | {agg['fold_mean_RMSE']:.0f} |")
    lines.append("")
    lines.append(f"**Cost winner: {cost_result['winner_name']}** "
                 f"(MASE = {cost_result['winner_mase']:.3f}, "
                 f"12-month sum = €{float(cost_result['twelve_month_forecast'].sum()):,.0f})")
    lines.append("")
    lines.append("## Margin method bake-off (Section 2)")
    lines.append("")
    lines.append("**Components method** (rev/cost separately, then derived):")
    lines.append(f"- Revenue model (per-fold proxy): `{margin_result['rev_winner_name']}`")
    lines.append(f"- Cost model: `{cost_result['winner_name']}`")
    lines.append(f"- OOS MAE = **{margin_result['comp_mae_pp']:.3f} pp**")
    lines.append(f"- Per-fold MAE-pp = {[round(x, 3) for x in margin_result['comp_mae_pp_per_fold']]}")
    lines.append("")
    lines.append("**Direct method** (bake-off on `margin_ratio`):")
    lines.append(f"- Best model: `{margin_result['direct_winner_name']}` "
                 f"(MASE_cv = {margin_result['direct_leaderboard'][margin_result['direct_winner_name']]['fold_mean_MASE']:.3f})")
    lines.append(f"- OOS MAE = **{margin_result['direct_mae_pp']:.3f} pp**")
    lines.append(f"- Per-fold MAE-pp = {[round(x, 3) for x in margin_result['direct_mae_pp_per_fold']]}")
    lines.append("")
    lines.append(f"### Winner: **{margin_result['method']}** "
                 f"(MAE = {margin_result['mae_pp']:.3f} pp)")
    lines.append("")
    lines.append("### Final 12-month margin forecast")
    lines.append("")
    lines.append("Built from the **reconciled** Phase 3 revenue forecast + cost winner forecast ")
    lines.append("(if components) or the direct winner refit on the full margin_ratio history.")
    lines.append("")
    lines.append("| Month | margin_p50 | as % |")
    lines.append("|---|---:|---:|")
    for ts, val in zip(future_idx, margin_p50):
        lines.append(f"| {ts.date()} | {float(val):.4f} | {float(val)*100:.2f}% |")
    lines.append("")
    avg = float(np.mean(margin_p50))
    lines.append(f"Average: **{avg:.4f}** ({avg*100:.2f}%)")
    lines.append("")
    lines.append("## ⚠️ Margin definition discrepancy")
    lines.append("")
    lines.append(f"Historical `margin_ratio` in `clean_monthly.parquet` ranges from ")
    lines.append(f"**{hist_margin.min()*100:.2f}% to {hist_margin.max()*100:.2f}%** ")
    lines.append(f"(mean {hist_margin.mean()*100:.2f}%). This is the **material-only** ")
    lines.append(f"margin: `(revenue − material_cost) / revenue`, where material_cost is ")
    lines.append(f"`Σ material_per_unit × quantity`.")
    lines.append("")
    lines.append("The FE displays a **gross/DB2 margin of ~27%**, computed as ")
    lines.append("`SUM(invoices.db2_total) / SUM(invoices.revenue)` in ")
    lines.append("`backend/services/forecast/real_hero.py`. DB2 subtracts labor + overhead ")
    lines.append("from gross revenue and is a different definition.")
    lines.append("")
    lines.append("This forecast is for the material-margin column **as it exists in the ")
    lines.append("data**. Phase 8 (FE wiring) must decide:")
    lines.append("")
    lines.append("- **(a)** Adapt the FE to display the material-margin (~85%) transparently, OR")
    lines.append("- **(b)** Define an overhead-adjusted (DB2) margin column in clean_monthly ")
    lines.append("  and rerun this bake-off against that target, OR")
    lines.append("- **(c)** Apply a fixed labor+overhead haircut (~55 pp) to convert ")
    lines.append("  material-margin → DB2-margin at serve time.")
    lines.append("")
    lines.append(f"As-is, our 2026 forecast (avg = {avg*100:.2f}%) is in line with the ")
    lines.append(f"historical material-margin band, NOT the FE's gross-margin band.")
    lines.append("")
    MARGIN_COMP_MD.write_text("\n".join(lines))
    print(f"\nWrote {MARGIN_COMP_MD}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def run() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    clean = load_clean()
    exog = load_exog()
    t0 = time.time()

    # ---- Section 1: Cost bake-off
    #
    # For cost, the literal drivers are the commodity prices. We temporarily
    # restrict the FRED feature set inside revenue_bakeoff to {WPU101,
    # PCOPPUSDM, PALUMUSDM} so SARIMAX-LASSO and LightGBM see the right exog.
    saved_fred = revenue_bakeoff.FRED_COLS
    revenue_bakeoff.FRED_COLS = COST_FRED_COLS
    try:
        cost_result = section1_cost_bakeoff(clean, exog)
    finally:
        revenue_bakeoff.FRED_COLS = saved_fred

    # ---- Section 2: Margin bake-off
    # Revenue and direct margin use the full FRED set (same as Phase 2).
    margin_result = section2_margin(clean, exog, cost_result)

    # ---- Comparison .md
    write_comparison_md(clean, cost_result, margin_result)

    elapsed = time.time() - t0
    print(f"\n=== Phase 4 complete in {elapsed:.1f}s ===")
    print(f"  Cost winner JSON:        {COST_WINNER_JSON}")
    print(f"  Cost forecast parquet:   {COST_FORECAST_PARQUET}")
    print(f"  Margin winner JSON:      {MARGIN_WINNER_JSON}")
    print(f"  Margin forecast parquet: {MARGIN_FORECAST_PARQUET}")
    print(f"  Comparison MD:           {MARGIN_COMP_MD}")


if __name__ == "__main__":
    run()
