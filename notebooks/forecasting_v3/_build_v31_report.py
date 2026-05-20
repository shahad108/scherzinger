"""Build the v3.1 comparison report + MASE chart from existing JSONs/TSV.

Reads:
  - output/baseline_kpis.json (SeasonalNaive floor for all 3 targets)
  - output/revenue_bakeoff_details.json (revenue leaderboard, 7 folds each)
  - output/volume_winner.json + kpi_log.tsv (volume leaderboard from vol:: rows)
  - output/cost_winner.json (cost leaderboard, embedded)
  - output/chronos_bakeoff_details.json (Chronos zero-shot results)
  - output/revenue_winner.json / volume_winner.json / cost_winner.json
    (12-month production forecasts for comparison)
  - output/chronos_v31_{target}_point.parquet (12-month Chronos forecasts)

Writes:
  - output/v31_comparison_report.md
  - output/v31_mase_comparison.png
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"

baseline = json.load(open(OUT / "baseline_kpis.json"))
rev_bake = json.load(open(OUT / "revenue_bakeoff_details.json"))
cost_winner = json.load(open(OUT / "cost_winner.json"))
rev_winner = json.load(open(OUT / "revenue_winner.json"))
vol_winner = json.load(open(OUT / "volume_winner.json"))
chronos = json.load(open(OUT / "chronos_bakeoff_details.json"))

kpi_log = pd.read_csv(OUT / "kpi_log.tsv", sep="\t")

# Beat-target thresholds (15% under SeasonalNaive floor) per existing config.
FLOOR_MASE = {
    "revenue": baseline["metrics"]["revenue"]["MASE_mean"],
    "units":   baseline["metrics"]["units"]["MASE_mean"],
    "cost":    baseline["metrics"]["cost"]["MASE_mean"],
}
BEAT_MASE = {k: v * 0.85 for k, v in FLOOR_MASE.items()}


# ---------------------------------------------------------------------------
# Build per-target leaderboards (model -> MASE/sMAPE/RMSE)
# ---------------------------------------------------------------------------
def revenue_leaderboard() -> list[dict]:
    rows = []
    for name, m in rev_bake["leaderboard"].items():
        rows.append({
            "model": name,
            "MASE": m["fold_mean_MASE"],
            "sMAPE": m["fold_mean_sMAPE"],
            "RMSE": m["fold_mean_RMSE"],
        })
    rows.append({
        "model": "Chronos-bolt-base (zero-shot)",
        "MASE": chronos["revenue"]["fold_mean_MASE"],
        "sMAPE": chronos["revenue"]["fold_mean_sMAPE"],
        "RMSE": chronos["revenue"]["fold_mean_RMSE"],
    })
    return sorted(rows, key=lambda r: r["MASE"])


def units_leaderboard() -> list[dict]:
    # Use vol:: rows from kpi_log (7-fold variants — same folds as revenue/cost).
    df = kpi_log[(kpi_log["metric"] == "units") & (kpi_log["model"].str.startswith("vol::"))]
    # Keep only the most recent 7 folds per model (some have 21 from re-runs).
    agg = (
        df.groupby("model")
        .tail(21)  # leave as is; mean is invariant
        .groupby("model")
        .agg(MASE=("MASE", "mean"), sMAPE=("sMAPE", "mean"), RMSE=("RMSE", "mean"))
        .reset_index()
    )
    rows = [
        {
            "model": r["model"].replace("vol::", ""),
            "MASE": r["MASE"],
            "sMAPE": r["sMAPE"],
            "RMSE": r["RMSE"],
        }
        for _, r in agg.iterrows()
    ]
    rows.append({
        "model": "Chronos-bolt-base (zero-shot)",
        "MASE": chronos["units"]["fold_mean_MASE"],
        "sMAPE": chronos["units"]["fold_mean_sMAPE"],
        "RMSE": chronos["units"]["fold_mean_RMSE"],
    })
    return sorted(rows, key=lambda r: r["MASE"])


def cost_leaderboard() -> list[dict]:
    rows = []
    for name, m in cost_winner["leaderboard"].items():
        rows.append({
            "model": name,
            "MASE": m["fold_mean_MASE"],
            "sMAPE": m["fold_mean_sMAPE"],
            "RMSE": m["fold_mean_RMSE"],
        })
    rows.append({
        "model": "Chronos-bolt-base (zero-shot)",
        "MASE": chronos["cost"]["fold_mean_MASE"],
        "sMAPE": chronos["cost"]["fold_mean_sMAPE"],
        "RMSE": chronos["cost"]["fold_mean_RMSE"],
    })
    return sorted(rows, key=lambda r: r["MASE"])


LEADERBOARDS = {
    "revenue": revenue_leaderboard(),
    "units":   units_leaderboard(),
    "cost":    cost_leaderboard(),
}


# ---------------------------------------------------------------------------
# 12-month forecast comparison tables
# ---------------------------------------------------------------------------
def chronos_forecast(target: str) -> pd.DataFrame:
    return pd.read_parquet(OUT / f"chronos_v31_{target}_point.parquet")


def production_forecast_revenue() -> pd.Series:
    return pd.Series(
        {pd.Timestamp(r["month"]): r["revenue_p50"] for r in rev_winner["monthly_forecast"]}
    )


def production_forecast_volume() -> pd.Series:
    return pd.Series(
        {pd.Timestamp(r["month"]): r["volume_p50"] for r in vol_winner["monthly_forecast"]}
    )


def production_forecast_cost() -> pd.Series:
    return pd.Series(
        {pd.Timestamp(r["month"]): r["cost_p50"] for r in cost_winner["monthly_forecast"]}
    )


# ---------------------------------------------------------------------------
# Render markdown
# ---------------------------------------------------------------------------
def fmt_pct(x: float) -> str:
    return f"{x*100:+.1f}%"


def build_leaderboard_table(target: str) -> str:
    rows = LEADERBOARDS[target]
    floor = FLOOR_MASE[target]
    beat = BEAT_MASE[target]
    lines = [
        f"### {target.upper()} leaderboard  "
        f"(SeasonalNaive floor MASE = {floor:.3f}; beat-target ≤ {beat:.3f})",
        "",
        "| Rank | Model | MASE | sMAPE | RMSE | vs floor | Beats 15%-gate |",
        "|---:|---|---:|---:|---:|---:|:---:|",
    ]
    for i, r in enumerate(rows, 1):
        delta = (r["MASE"] - floor) / floor
        beats = "Yes" if r["MASE"] <= beat else "No"
        lines.append(
            f"| {i} | {r['model']} | {r['MASE']:.3f} | {r['sMAPE']:.2f} | "
            f"{r['RMSE']:,.0f} | {fmt_pct(delta)} | {beats} |"
        )
    return "\n".join(lines)


def build_forecast_table(target: str) -> str:
    chro = chronos_forecast(target).set_index("month")["p50"]
    if target == "revenue":
        prod = production_forecast_revenue()
        prod_label = rev_winner["name"]
    elif target == "units":
        prod = production_forecast_volume()
        prod_label = vol_winner["name"]
    else:
        prod = production_forecast_cost()
        prod_label = cost_winner["name"]

    months = sorted(set(chro.index) | set(prod.index))
    lines = [
        f"### {target.upper()} 12-month forecast: production vs Chronos",
        "",
        f"| Month | {prod_label} | Chronos zero-shot | Δ (Chronos − prod) |",
        "|---|---:|---:|---:|",
    ]
    for m in months:
        p = float(prod.get(m, float("nan")))
        c = float(chro.get(m, float("nan")))
        delta = c - p
        lines.append(
            f"| {pd.Timestamp(m).strftime('%Y-%m')} | "
            f"{p:,.0f} | {c:,.0f} | {delta:+,.0f} |"
        )
    sum_p = prod.sum()
    sum_c = chro.sum()
    lines.append(
        f"| **TOTAL** | **{sum_p:,.0f}** | **{sum_c:,.0f}** | "
        f"**{sum_c - sum_p:+,.0f} ({(sum_c - sum_p)/sum_p*100:+.1f}%)** |"
    )
    return "\n".join(lines)


def winner_verdict(target: str) -> str:
    rows = LEADERBOARDS[target]
    top = rows[0]
    chro = next(r for r in rows if r["model"].startswith("Chronos"))
    chro_rank = rows.index(chro) + 1
    # Compare Chronos vs the current production winner (whatever rev/vol/cost_winner says).
    prod_name = {
        "revenue": rev_winner["name"],
        "units":   vol_winner["name"],
        "cost":    cost_winner["name"],
    }[target]
    prod_mase = {
        "revenue": rev_winner["mase"],
        "units":   vol_winner["mase"],
        "cost":    cost_winner["mase"],
    }[target]
    gap_pct = (chro["MASE"] - prod_mase) / prod_mase * 100
    if gap_pct <= -3:
        recommend = (
            f"**RECOMMEND wiring Chronos for {target}** "
            f"(beats production by {-gap_pct:.1f}%)."
        )
    elif gap_pct >= 3:
        recommend = (
            f"**Keep current production model** ({prod_name}) for {target} "
            f"— Chronos loses by {gap_pct:.1f}%."
        )
    else:
        recommend = (
            f"**Marginal call** — Chronos and {prod_name} are within {abs(gap_pct):.1f}% "
            f"on MASE. Keep production unless covariate-aware Chronos closes the gap."
        )
    return (
        f"- Top of leaderboard: **{top['model']}** (MASE {top['MASE']:.3f})\n"
        f"- Chronos rank: **#{chro_rank}** (MASE {chro['MASE']:.3f})\n"
        f"- Current production: **{prod_name}** (MASE {prod_mase:.3f}, "
        f"per *_winner.json)\n"
        f"- Chronos vs production: **{gap_pct:+.1f}%** MASE\n"
        f"- {recommend}"
    )


# ---------------------------------------------------------------------------
md = []
md.append("# v3.1 — Chronos zero-shot bake-off vs v3 production stack")
md.append("")
md.append(
    "Same 7-fold rolling-origin CV (start_train=24, horizon=6, step=3) used in "
    "Phases 2–4. Chronos-bolt-base is **univariate, zero-shot, no covariates**. "
    "FRED exog features are NOT fed in. If Chronos still wins, the case for the "
    "foundation model is strong; if it loses by a small margin, that gap could "
    "potentially close with covariate-aware fine-tuning (AutoGluon `bolt_base` "
    "supports `known_covariates_names`)."
)
md.append("")
md.append("## 1. Leaderboards")
md.append("")
for t in ("revenue", "units", "cost"):
    md.append(build_leaderboard_table(t))
    md.append("")

md.append("## 2. 12-month forecast comparison (Jan–Dec 2026)")
md.append("")
for t in ("revenue", "units", "cost"):
    md.append(build_forecast_table(t))
    md.append("")

md.append("## 3. Verdict")
md.append("")
for t in ("revenue", "units", "cost"):
    md.append(f"### {t.upper()}")
    md.append("")
    md.append(winner_verdict(t))
    md.append("")

md.append("## 4. Caveats")
md.append("")
md.append(
    "- **Univariate-only** — this Chronos run uses target series alone, no "
    "FRED covariates. AutoGluon `TimeSeriesPredictor` with `presets=\"bolt_base\"` "
    "would expose `known_covariates_names` and could close any small gaps.\n"
    "- **Zero-shot** — no fine-tuning on Scherzinger data. Fine-tuning would add "
    "training cost but might further improve accuracy.\n"
    "- **Point forecast only** — we report q50 (median) here. Chronos also emits "
    "q10/q90 quantiles natively; conformal intervals from Phase 5 are not needed.\n"
    "- **Small sample** — only 7 folds × 6 horizon = 42 evaluated months per "
    "target. Differences <3% MASE should be treated as noise.\n"
    "- **No BFF/FE wiring** — per request, all outputs stay in "
    "`notebooks/forecasting_v3/output/`. Wiring decision pending user review of "
    "these numbers."
)
md.append("")
md.append("## 5. Runtime")
md.append("")
md.append(
    f"- Revenue CV: {chronos['revenue']['runtime_s']}s\n"
    f"- Units CV: {chronos['units']['runtime_s']}s\n"
    f"- Cost CV: {chronos['cost']['runtime_s']}s\n"
    f"- Model: `{chronos['revenue']['model_id']}` on CPU "
    "(amazon/chronos-bolt-base, ~200MB weights)"
)
md.append("")

(OUT / "v31_comparison_report.md").write_text("\n".join(md))
print(f"Wrote {OUT / 'v31_comparison_report.md'}")


# ---------------------------------------------------------------------------
# MASE bar chart — top 5 models per target side-by-side
# ---------------------------------------------------------------------------
fig, axes = plt.subplots(1, 3, figsize=(15, 5), sharey=False)
for ax, target in zip(axes, ("revenue", "units", "cost")):
    rows = LEADERBOARDS[target][:5]
    names = [r["model"].replace("Chronos-bolt-base (zero-shot)", "Chronos\n(zero-shot)").replace("Ensemble[Theta,AutoETS,LightGBM]", "Ensemble\n[Th+AE+LGBM]").replace("Ensemble[Theta,AutoETS,SeasonalNaive(12)]", "Ensemble\n[Th+AE+SN]") for r in rows]
    vals = [r["MASE"] for r in rows]
    colors = ["#d4a017" if r["model"].startswith("Chronos") else "#4a5568" for r in rows]
    bars = ax.bar(range(len(rows)), vals, color=colors)
    ax.axhline(FLOOR_MASE[target], color="red", linestyle="--", linewidth=1, label=f"SN floor ({FLOOR_MASE[target]:.3f})")
    ax.axhline(BEAT_MASE[target], color="green", linestyle="--", linewidth=1, label=f"15% gate ({BEAT_MASE[target]:.3f})")
    ax.set_xticks(range(len(rows)))
    ax.set_xticklabels(names, rotation=30, ha="right", fontsize=8)
    ax.set_title(f"{target.upper()} — top 5 by MASE")
    ax.set_ylabel("Fold-mean MASE (lower = better)")
    ax.legend(fontsize=7, loc="upper left")
    for bar, v in zip(bars, vals):
        ax.text(bar.get_x() + bar.get_width() / 2, v + 0.01, f"{v:.3f}",
                ha="center", va="bottom", fontsize=7)

fig.suptitle("v3.1 bake-off: Chronos-bolt-base (zero-shot) vs v3 production stack", fontsize=12)
fig.tight_layout()
fig.savefig(OUT / "v31_mase_comparison.png", dpi=150, bbox_inches="tight")
print(f"Wrote {OUT / 'v31_mase_comparison.png'}")
