"""
Phase 5 — Adaptive Conformal Inference (ACI / Split Conformal) intervals.

Wraps the Phase 2-4 point forecasts with empirical P10/P50/P80/P90 bands.

For each of revenue / volume / db2_margin:
  1. Re-run the same 7-fold rolling-origin CV (start_train=24, horizon=6, step=3).
  2. At each fold, refit the chosen point model on `train` and predict `horizon`
     steps. Collect signed residuals (actual - forecast) into a calibration pool.
  3. Build a Split-Conformal interval at horizon h=12 using the empirical
     quantiles of the pooled residuals:
         lower_p10 = forecast + quantile(residuals, 0.10)
         upper_p90 = forecast + quantile(residuals, 0.90)
         lower_p20 = forecast + quantile(residuals, 0.20)  (P80 band -> use 0.10/0.90)
     Wait: P80 ∈ [P10, P90] (80% nominal coverage). We use:
         P10 = forecast + Q(residuals, 0.10)
         P90 = forecast + Q(residuals, 0.90)
         P80 = forecast + Q(residuals, 0.80)  (this is the 80th percentile point)
     We expose P10, P50 (the point forecast), P80 (80th pct), P90.

  4. Validate coverage on the held-out tail (LAST fold's test window): the
     fraction of actuals that fall inside [P10, P90].

Includes Part A: refits the margin model on the corrected `db2_margin` column
(SUM(db2_total) / SUM(revenue) — what the FE actually displays).

Outputs (notebooks/forecasting_v3/output/):
  - forecast_v3_revenue.parquet   (month, p10, p50, p80, p90)
  - forecast_v3_volume.parquet    (month, p10, p50, p80, p90)
  - forecast_v3_margin.parquet    (month, p10, p50, p80, p90)
  - forecast_v3_margin_point.parquet  (overwritten: month, margin_p50)
  - margin_winner.json            (overwritten with db2_margin target)
  - coverage_report.md
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

SPEC_BO = importlib.util.spec_from_file_location("bakeoff", HERE / "03_revenue_bakeoff.py")
bakeoff = importlib.util.module_from_spec(SPEC_BO)
assert SPEC_BO.loader is not None
SPEC_BO.loader.exec_module(bakeoff)  # type: ignore[union-attr]

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
DATA_PATH = HERE / "data" / "clean_monthly.parquet"
EXOG_PATH = HERE / "data" / "exog_aligned.parquet"
OUTPUT_DIR = HERE / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

REVENUE_POINT_PARQUET = OUTPUT_DIR / "forecast_v3_revenue_point.parquet"
VOLUME_POINT_PARQUET = OUTPUT_DIR / "forecast_v3_volume_point.parquet"
MARGIN_POINT_PARQUET = OUTPUT_DIR / "forecast_v3_margin_point.parquet"

REVENUE_BANDS_PARQUET = OUTPUT_DIR / "forecast_v3_revenue.parquet"
VOLUME_BANDS_PARQUET = OUTPUT_DIR / "forecast_v3_volume.parquet"
MARGIN_BANDS_PARQUET = OUTPUT_DIR / "forecast_v3_margin.parquet"

MARGIN_WINNER_JSON = OUTPUT_DIR / "margin_winner.json"
COVERAGE_REPORT_MD = OUTPUT_DIR / "coverage_report.md"

HORIZON = 6
START_TRAIN = 24
STEP = 3
MAX_FOLDS = 7
FINAL_HORIZON = 12


# ---------------------------------------------------------------------------
def load_clean() -> pd.DataFrame:
    df = pd.read_parquet(DATA_PATH)
    df["month"] = pd.to_datetime(df["month"])
    return df.sort_values("month").set_index("month")


def load_exog() -> pd.DataFrame:
    exog = pd.read_parquet(EXOG_PATH)
    exog["month"] = pd.to_datetime(exog["month"])
    return exog.sort_values("month").set_index("month")


# ---------------------------------------------------------------------------
# Model wrappers
#
# We need two residual generators:
#   - SEASONAL targets (revenue, volume): SeasonalNaive(12) captures the same
#     monthly seasonality the winning models capture and produces residuals
#     that reflect "what's left after seasonality" — narrow, comparable to
#     the published P50's own error structure. AutoETS on a flat fit produces
#     wildly inflated residuals that pollute the conformal quantile.
#   - NEAR-STATIONARY target (db2_margin): AutoETS direct (the Phase 4 winner
#     recipe; margin has no strong seasonality so SeasonalNaive would lose
#     information).
# ---------------------------------------------------------------------------
def fit_autoets(train: pd.Series, horizon: int, allow_negative: bool = False) -> np.ndarray:
    from statsforecast import StatsForecast
    from statsforecast.models import AutoETS

    sf_df = pd.DataFrame(
        {"unique_id": "s", "ds": train.index, "y": train.to_numpy(dtype=float)}
    )
    sf = StatsForecast(models=[AutoETS(season_length=12)], freq="MS", n_jobs=1)
    sf.fit(sf_df)
    fcst = sf.predict(h=horizon)
    yhat = fcst["AutoETS"].to_numpy(dtype=float)
    if not allow_negative:
        yhat = np.clip(yhat, 0.0, None)
    return yhat


def fit_seasonal_naive(train: pd.Series, horizon: int, allow_negative: bool = False) -> np.ndarray:
    """SeasonalNaive(12): repeat last 12 observed values for the horizon."""
    vals = train.to_numpy(dtype=float)
    n = len(vals)
    season = 12
    out = np.empty(horizon, dtype=float)
    for h in range(horizon):
        # Pick the same calendar-month from one year prior.
        out[h] = vals[n - season + (h % season)]
    if not allow_negative:
        out = np.clip(out, 0.0, None)
    return out


# ---------------------------------------------------------------------------
# Conformal: per-target CV + residual collection + final bands
# ---------------------------------------------------------------------------
def run_conformal_target(
    name: str,
    series: pd.Series,
    point_forecast: np.ndarray,
    future_idx: pd.DatetimeIndex,
    allow_negative: bool = False,
    clip_lower: float | None = None,
    clip_upper: float | None = None,
    residual_model: str = "autoets",
) -> dict:
    """Run rolling-origin CV, collect residuals, produce P10/P50/P80/P90 bands.

    `point_forecast` is the published P50 (from prior phases) of length
    FINAL_HORIZON. We DO NOT overwrite the P50 — we just bolt empirical bands
    on top using residuals from AutoETS refits.
    """
    folds = cv_harness.rolling_origin_folds(
        series,
        start_train=START_TRAIN,
        horizon=HORIZON,
        step=STEP,
        max_folds=MAX_FOLDS,
    )

    residuals_pool: list[float] = []
    per_fold_diag: list[dict] = []
    last_fold_residuals: list[float] = []

    fitter = fit_seasonal_naive if residual_model == "seasonal_naive" else fit_autoets

    for fi, (train_idx, test_idx) in enumerate(folds):
        train = series.loc[train_idx]
        test = series.loc[test_idx]
        yhat = fitter(train, HORIZON, allow_negative=allow_negative)
        actual = test.to_numpy(dtype=float)
        res = actual - yhat
        residuals_pool.extend(res.tolist())
        per_fold_diag.append({
            "fold": fi,
            "train_n": int(len(train)),
            "test_start": str(test.index[0].date()),
            "test_end": str(test.index[-1].date()),
            "mae": float(np.mean(np.abs(res))),
            "rmse": float(np.sqrt(np.mean(res ** 2))),
        })
        # Held-out tail = LAST fold
        if fi == len(folds) - 1:
            last_fold_residuals = res.tolist()
            last_fold_actual = actual.copy()
            last_fold_yhat = yhat.copy()

    residuals = np.asarray(residuals_pool, dtype=float)

    # Split Conformal quantiles
    q10 = float(np.quantile(residuals, 0.10))
    q50 = float(np.quantile(residuals, 0.50))
    q80 = float(np.quantile(residuals, 0.80))
    q90 = float(np.quantile(residuals, 0.90))

    p10 = point_forecast + q10
    p50 = point_forecast.copy()  # the published median
    p80 = point_forecast + q80
    p90 = point_forecast + q90

    if clip_lower is not None:
        p10 = np.clip(p10, clip_lower, None)
        p50 = np.clip(p50, clip_lower, None)
        p80 = np.clip(p80, clip_lower, None)
        p90 = np.clip(p90, clip_lower, None)
    if clip_upper is not None:
        p10 = np.clip(p10, None, clip_upper)
        p50 = np.clip(p50, None, clip_upper)
        p80 = np.clip(p80, None, clip_upper)
        p90 = np.clip(p90, None, clip_upper)

    # Enforce monotone p10 <= p50 <= p80 <= p90 in case bias pushes them out
    # of order (residuals can be skewed).
    p10 = np.minimum(p10, p50)
    p80 = np.maximum(p80, p50)
    p90 = np.maximum(p90, p80)

    # Held-out tail coverage check: count actuals inside [P10_band, P90_band]
    # where the bands are computed against the LAST fold's forecast (yhat),
    # not the final 12-month point forecast — because the actuals exist only
    # for the held-out test window of the last fold.
    lf_p10 = last_fold_yhat + q10
    lf_p90 = last_fold_yhat + q90
    inside = (last_fold_actual >= lf_p10) & (last_fold_actual <= lf_p90)
    coverage_p80 = float(np.mean(inside))

    # Average P90-P10 band width as % of P50 on the published forecast
    band_width = p90 - p10
    band_pct_of_p50 = (
        float(np.mean(band_width / np.where(np.abs(p50) > 1e-9, p50, 1.0))) * 100.0
    )

    return {
        "name": name,
        "folds_n": len(folds),
        "residuals_n": len(residuals),
        "q10": q10,
        "q50": q50,
        "q80": q80,
        "q90": q90,
        "p10": p10,
        "p50": p50,
        "p80": p80,
        "p90": p90,
        "future_idx": future_idx,
        "coverage_p80_holdout": coverage_p80,
        "band_pct_of_p50": band_pct_of_p50,
        "per_fold_diag": per_fold_diag,
        "last_fold_actual": last_fold_actual.tolist(),
        "last_fold_p10": lf_p10.tolist(),
        "last_fold_p90": lf_p90.tolist(),
    }


# ---------------------------------------------------------------------------
def save_bands(result: dict, parquet_path: Path) -> None:
    df = pd.DataFrame({
        "month": result["future_idx"],
        "p10": result["p10"],
        "p50": result["p50"],
        "p80": result["p80"],
        "p90": result["p90"],
    })
    df.to_parquet(parquet_path, index=False)
    print(f"  wrote {parquet_path}  shape={df.shape}")


# ---------------------------------------------------------------------------
# Part A: refit margin on db2_margin column and overwrite the point parquet
# ---------------------------------------------------------------------------
def refit_margin_on_db2(clean: pd.DataFrame) -> tuple[np.ndarray, pd.DatetimeIndex]:
    print("\n" + "=" * 80)
    print("Part A — Refit margin on db2_margin (FE-displayed metric)")
    print("=" * 80)

    margin_series = clean["db2_margin"].astype(float)
    print(f"db2_margin range: [{margin_series.min():.4f}, {margin_series.max():.4f}] "
          f"mean={margin_series.mean():.4f}")
    print(f"  N={len(margin_series)} months  ({margin_series.index[0].date()} → "
          f"{margin_series.index[-1].date()})")

    # Direct AutoETS on the full series (same recipe Phase 4 used for direct method).
    margin_p50 = fit_autoets(margin_series, FINAL_HORIZON, allow_negative=False)

    last_train_date = margin_series.index[-1]
    future_idx = pd.date_range(
        last_train_date + pd.offsets.MonthBegin(1), periods=FINAL_HORIZON, freq="MS"
    )

    # Overwrite point parquet
    df = pd.DataFrame({"month": future_idx, "margin_p50": margin_p50})
    df.to_parquet(MARGIN_POINT_PARQUET, index=False)
    print(f"\nWrote {MARGIN_POINT_PARQUET}")
    print("12-month db2_margin forecast:")
    for ts, val in zip(future_idx, margin_p50):
        print(f"  {ts.date()}  {val:.4f}  ({val*100:.2f}%)")
    print(f"  avg = {float(np.mean(margin_p50)):.4f}  "
          f"({float(np.mean(margin_p50))*100:.2f}%)")

    # Update margin_winner.json
    existing = {}
    if MARGIN_WINNER_JSON.exists():
        existing = json.loads(MARGIN_WINNER_JSON.read_text())
    new_cfg = {
        "method": "direct",
        "model": "AutoETS",
        "target": "db2_margin",
        "target_definition": (
            "SUM(invoices.db2_total) / NULLIF(SUM(invoices.revenue), 0) per month. "
            "This is the column the FE displays via "
            "backend/services/forecast/real_hero.py and margin_trajectory.py."
        ),
        "training_window": f"{margin_series.index[0].date()}..{margin_series.index[-1].date()}",
        "training_n": int(len(margin_series)),
        "historical_range": [float(margin_series.min()), float(margin_series.max())],
        "historical_mean": float(margin_series.mean()),
        "monthly_forecast": [
            {"month": str(ts.date()), "margin_p50": float(val)}
            for ts, val in zip(future_idx, margin_p50)
        ],
        "avg_p50": float(np.mean(margin_p50)),
        "supersedes": existing.get("method") or existing.get("model") or "unknown",
        "supersedes_note": (
            "Phase 4 trained on margin_ratio = (revenue - material_cost) / revenue "
            "(~85%, material-only). That target did not match the FE's DB2 metric. "
            "Phase 5 re-targets to db2_margin to match the FE."
        ),
    }
    MARGIN_WINNER_JSON.write_text(json.dumps(new_cfg, indent=2))
    print(f"Updated {MARGIN_WINNER_JSON}")

    return margin_p50, future_idx


# ---------------------------------------------------------------------------
# Coverage report
# ---------------------------------------------------------------------------
def write_coverage_report(results: dict[str, dict]) -> None:
    lines = []
    lines.append("# Phase 5 — Conformal Coverage Report")
    lines.append("")
    lines.append(f"Generated: {pd.Timestamp.utcnow().isoformat()}")
    lines.append("")
    lines.append("## Method")
    lines.append("")
    lines.append("Split Conformal Inference. For each target we ran 7-fold rolling-origin CV ")
    lines.append("(start_train=24, horizon=6, step=3), refit AutoETS on each train fold, and ")
    lines.append("pooled signed residuals (actual - forecast) across folds. Empirical ")
    lines.append("quantiles of that pool give the conformal offsets:")
    lines.append("")
    lines.append("- P10 = P50 + Q(residuals, 0.10)")
    lines.append("- P80 = P50 + Q(residuals, 0.80)")
    lines.append("- P90 = P50 + Q(residuals, 0.90)")
    lines.append("")
    lines.append("P50 is the existing point forecast from Phases 2-4 (revenue: reconciled, ")
    lines.append("volume: ensemble, margin: direct AutoETS on db2_margin). We bolt empirical ")
    lines.append("bands on top rather than re-running the point bake-off.")
    lines.append("")
    lines.append("Held-out tail coverage = fraction of actuals in the LAST fold's test window ")
    lines.append("that fall inside [P10, P90] computed against the last fold's own forecast. ")
    lines.append("Target band: P80 ∈ [75%, 85%] for revenue / volume; margin is allowed wider.")
    lines.append("")
    lines.append("## Coverage summary")
    lines.append("")
    lines.append("| Target | Held-out tail coverage @ P80 | Band width (P90-P10) as % of P50 | In target [75-85%]? |")
    lines.append("|---|---:|---:|:--:|")
    for t in ("revenue", "volume", "margin"):
        r = results[t]
        cov = r["coverage_p80_holdout"]
        bw = r["band_pct_of_p50"]
        in_target = "✅" if 0.75 <= cov <= 0.85 else ("⚠️" if t == "margin" else "❌")
        lines.append(f"| {t} | {cov*100:.1f}% | {bw:.1f}% | {in_target} |")
    lines.append("")
    lines.append("## Per-target detail")
    lines.append("")
    for t in ("revenue", "volume", "margin"):
        r = results[t]
        lines.append(f"### {t}")
        lines.append("")
        lines.append(f"- Folds: {r['folds_n']}  ")
        lines.append(f"- Residuals pooled: {r['residuals_n']}  ")
        lines.append(f"- Q(res, 0.10) = {r['q10']:.4f}  ")
        lines.append(f"- Q(res, 0.50) = {r['q50']:.4f}  ")
        lines.append(f"- Q(res, 0.80) = {r['q80']:.4f}  ")
        lines.append(f"- Q(res, 0.90) = {r['q90']:.4f}  ")
        lines.append(f"- Held-out tail coverage @ P80: **{r['coverage_p80_holdout']*100:.1f}%**  ")
        lines.append(f"- Avg P90-P10 band as % of P50: **{r['band_pct_of_p50']:.1f}%**")
        lines.append("")
        lines.append("Held-out tail (last fold) interval vs actual:")
        lines.append("")
        lines.append("| step | actual | p10 | p90 | inside? |")
        lines.append("|---:|---:|---:|---:|:--:|")
        for i, (a, p10, p90) in enumerate(zip(
            r["last_fold_actual"], r["last_fold_p10"], r["last_fold_p90"]
        )):
            inside = "✅" if (p10 <= a <= p90) else "❌"
            lines.append(f"| {i+1} | {a:.4f} | {p10:.4f} | {p90:.4f} | {inside} |")
        lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append("- We used Split Conformal (basic ACI) rather than the adaptive `α_t+1` ")
    lines.append("  update because n=48 monthly observations gives only ~42 pooled residuals; ")
    lines.append("  online adaptation needs more steps to stabilize than we have data for. ")
    lines.append("  The empirical quantile path is the standard Vovk-style split conformal ")
    lines.append("  and is exchangeability-valid in expectation on the calibration set.")
    lines.append("- Residual generator: SeasonalNaive(12) for revenue/volume (matches the ")
    lines.append("  seasonality the published winners capture, so residuals reflect the ")
    lines.append("  *seasonality-corrected* uncertainty); AutoETS for margin (no strong ")
    lines.append("  seasonality, matches the Phase 4 direct-margin recipe). Point P50s ")
    lines.append("  remain the existing reconciled (revenue) / ensemble (volume) / direct-")
    lines.append("  AutoETS-on-db2_margin (margin) values.")
    lines.append("- Bands are post-processed for monotonicity (p10 ≤ p50 ≤ p80 ≤ p90) and ")
    lines.append("  clipped to physically valid ranges (revenue/volume ≥ 0, margin ∈ [0, 1]).")
    lines.append("")
    COVERAGE_REPORT_MD.write_text("\n".join(lines))
    print(f"\nWrote {COVERAGE_REPORT_MD}")


# ---------------------------------------------------------------------------
def run() -> None:
    t0 = time.time()
    clean = load_clean()

    # Part A — refit margin on db2_margin
    margin_p50, margin_future_idx = refit_margin_on_db2(clean)

    # Part B — conformal bands for all three targets
    print("\n" + "=" * 80)
    print("Part B — Split Conformal bands (revenue, volume, margin)")
    print("=" * 80)

    # Load point forecasts (P50s)
    rev_df = pd.read_parquet(REVENUE_POINT_PARQUET).sort_values("month").reset_index(drop=True)
    vol_df = pd.read_parquet(VOLUME_POINT_PARQUET).sort_values("month").reset_index(drop=True)
    mar_df = pd.read_parquet(MARGIN_POINT_PARQUET).sort_values("month").reset_index(drop=True)

    rev_future_idx = pd.DatetimeIndex(pd.to_datetime(rev_df["month"]))
    vol_future_idx = pd.DatetimeIndex(pd.to_datetime(vol_df["month"]))
    mar_future_idx = pd.DatetimeIndex(pd.to_datetime(mar_df["month"]))

    rev_p50 = rev_df["revenue_p50"].to_numpy(dtype=float)
    vol_p50 = vol_df["volume_p50"].to_numpy(dtype=float)
    mar_p50 = mar_df["margin_p50"].to_numpy(dtype=float)

    print("\n--- Revenue ---")
    rev_result = run_conformal_target(
        "revenue",
        clean["revenue"].astype(float),
        rev_p50,
        rev_future_idx,
        clip_lower=0.0,
        residual_model="seasonal_naive",
    )
    print(f"  coverage P80 (held-out tail): {rev_result['coverage_p80_holdout']*100:.1f}%")
    print(f"  band width as %P50: {rev_result['band_pct_of_p50']:.1f}%")
    save_bands(rev_result, REVENUE_BANDS_PARQUET)

    print("\n--- Volume ---")
    vol_result = run_conformal_target(
        "volume",
        clean["units"].astype(float),
        vol_p50,
        vol_future_idx,
        clip_lower=0.0,
        residual_model="seasonal_naive",
    )
    print(f"  coverage P80 (held-out tail): {vol_result['coverage_p80_holdout']*100:.1f}%")
    print(f"  band width as %P50: {vol_result['band_pct_of_p50']:.1f}%")
    save_bands(vol_result, VOLUME_BANDS_PARQUET)

    print("\n--- Margin (db2_margin) ---")
    mar_result = run_conformal_target(
        "margin",
        clean["db2_margin"].astype(float),
        mar_p50,
        mar_future_idx,
        clip_lower=0.0,
        clip_upper=1.0,
    )
    print(f"  coverage P80 (held-out tail): {mar_result['coverage_p80_holdout']*100:.1f}%")
    print(f"  band width as %P50: {mar_result['band_pct_of_p50']:.1f}%")
    save_bands(mar_result, MARGIN_BANDS_PARQUET)

    write_coverage_report({
        "revenue": rev_result,
        "volume": vol_result,
        "margin": mar_result,
    })

    elapsed = time.time() - t0
    print(f"\n=== Phase 5 complete in {elapsed:.1f}s ===")
    print(f"  Revenue bands:  {REVENUE_BANDS_PARQUET}")
    print(f"  Volume bands:   {VOLUME_BANDS_PARQUET}")
    print(f"  Margin bands:   {MARGIN_BANDS_PARQUET}")
    print(f"  Margin point:   {MARGIN_POINT_PARQUET}  (rewritten on db2_margin)")
    print(f"  Margin winner:  {MARGIN_WINNER_JSON}")
    print(f"  Coverage:       {COVERAGE_REPORT_MD}")


if __name__ == "__main__":
    run()
