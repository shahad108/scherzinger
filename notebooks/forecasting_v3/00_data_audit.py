# ---
# jupyter:
#   jupytext:
#     formats: py:percent
#     text_representation:
#       extension: .py
#       format_name: percent
#       format_version: '1.3'
#       jupytext_version: 1.19.3
# ---

# %% [markdown]
# # Phase 0 — Data audit & anomaly handling
#
# Builds a sanitized monthly aggregate from the `invoices` table for use by
# the forecasting rebuild (2026-05-17 plan). The 2026 partial year is a
# known billing artifact (Jan/Feb/Mar under-billed, April carries a
# 3-month catch-up dump of 492 invoices, May has 1 invoice). This script
# excludes 2026 entirely and clamps the clean window to 2022-01..2025-12.
#
# Outputs:
#   - notebooks/forecasting_v3/data/clean_monthly.parquet  (48 rows)
#   - notebooks/forecasting_v3/data/exog_aligned.parquet
#   - notebooks/forecasting_v3/data/anomaly_report.md

# %%
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent  # /Users/.../Scherzinger_new
PLATFORM = ROOT / "scherzinger-platform"
DATA_DIR = HERE / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Make backend.* importable regardless of cwd
if str(PLATFORM) not in sys.path:
    sys.path.insert(0, str(PLATFORM))

from backend.database import SessionLocal  # noqa: E402

MARKET_PARQUET = ROOT / "notebooks" / "output" / "market_series.parquet"
CLEAN_PARQUET = DATA_DIR / "clean_monthly.parquet"
EXOG_PARQUET = DATA_DIR / "exog_aligned.parquet"
ANOMALY_REPORT = DATA_DIR / "anomaly_report.md"

CLEAN_START = pd.Timestamp("2022-01-01")
CLEAN_END = pd.Timestamp("2025-12-01")  # month-start, inclusive

EXOG_SERIES = [
    "WPU101",
    "PCOPPUSDM",
    "PALUMUSDM",
    "DCOILBRENTEU",
    "DEXUSEU",
    "PNRGINDEXM",
    "IRLTLT01DEM156N",
    "INDPRO",
]


# %% [markdown]
# ## 1. Confirm schema & pull monthly aggregates

# %%
def load_monthly() -> pd.DataFrame:
    db = SessionLocal()
    try:
        # Defensive: confirm customer_id exists
        cols = {
            r[0]
            for r in db.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='invoices'"
                )
            ).fetchall()
        }
        assert "customer_id" in cols, "invoices.customer_id missing"
        assert {"revenue", "quantity", "material_per_unit", "date"} <= cols

        sql = text(
            """
            SELECT
              date_trunc('month', date)::date AS month,
              SUM(revenue)                                AS revenue,
              SUM(quantity)                               AS units,
              SUM(COALESCE(material_per_unit, 0) * quantity) AS cost,
              COUNT(*)                                    AS invoice_count,
              COUNT(DISTINCT customer_id)                 AS customers
            FROM invoices
            WHERE date IS NOT NULL
            GROUP BY 1
            ORDER BY 1
            """
        )
        rows = db.execute(sql).mappings().all()
    finally:
        db.close()

    df = pd.DataFrame(rows)
    df["month"] = pd.to_datetime(df["month"])
    for c in ("revenue", "units", "cost"):
        df[c] = df[c].astype(float)
    for c in ("invoice_count", "customers"):
        df[c] = df[c].astype(int)
    return df.sort_values("month").reset_index(drop=True)


monthly_all = load_monthly()
print(
    f"[Phase 0] pulled {len(monthly_all)} monthly rows from invoices "
    f"({monthly_all['month'].min().date()} → {monthly_all['month'].max().date()})"
)

# %% [markdown]
# ## 2. Anomaly detection
#
# Flag months where invoice_count is structurally implausible:
#   - |z-score(invoice_count)| > 2.5 across the full history, OR
#   - invoice_count <= 50, OR
#   - invoice_count > 300

# %%
ic = monthly_all["invoice_count"].astype(float)
z = (ic - ic.mean()) / ic.std(ddof=0)
monthly_all["ic_z"] = z

flag_low = monthly_all["invoice_count"] <= 50
flag_high = monthly_all["invoice_count"] > 300
flag_z = monthly_all["ic_z"].abs() > 2.5
monthly_all["anomaly"] = flag_low | flag_high | flag_z

anomalies = monthly_all.loc[monthly_all["anomaly"]].copy()
print(f"[Phase 0] anomalies flagged: {len(anomalies)}")
for _, r in anomalies.iterrows():
    reason = []
    if r["invoice_count"] <= 50:
        reason.append("count<=50")
    if r["invoice_count"] > 300:
        reason.append("count>300")
    if abs(r["ic_z"]) > 2.5:
        reason.append(f"|z|={abs(r['ic_z']):.2f}")
    print(
        f"  {r['month'].date()}  inv={r['invoice_count']:>4d}  "
        f"units={int(r['units']):>5d}  rev=€{r['revenue']:>12,.0f}  "
        f"z={r['ic_z']:+.2f}  → {', '.join(reason)}"
    )


# %% [markdown]
# ## 3. Build clean monthly window (2022-01..2025-12)

# %%
mask = (monthly_all["month"] >= CLEAN_START) & (monthly_all["month"] <= CLEAN_END)
clean = monthly_all.loc[mask].copy().reset_index(drop=True)

# Sanity: which excluded months would have been flagged by our anomaly rule?
kept_anomalies = clean.loc[clean["anomaly"]].copy()

clean["avg_price"] = np.where(clean["units"] > 0, clean["revenue"] / clean["units"], np.nan)
clean["margin_ratio"] = np.where(
    clean["revenue"] > 0, (clean["revenue"] - clean["cost"]) / clean["revenue"], np.nan
)

out_cols = ["month", "revenue", "units", "cost", "avg_price", "margin_ratio"]
clean_out = clean[out_cols].copy()

assert len(clean_out) == 48, f"expected 48 clean months, got {len(clean_out)}"
clean_out.to_parquet(CLEAN_PARQUET, index=False)
print(f"[Phase 0] wrote {CLEAN_PARQUET}  shape={clean_out.shape}")


# %% [markdown]
# ## 4. Align exogenous market series to month-start (FRED & others)

# %%
def build_exog() -> pd.DataFrame:
    raw = pd.read_parquet(MARKET_PARQUET)
    raw = raw[["series_id", "ts", "value"]].copy()
    raw["ts"] = pd.to_datetime(raw["ts"])

    months = pd.date_range(CLEAN_START, CLEAN_END, freq="MS")
    out = pd.DataFrame({"month": months})

    available = set(raw["series_id"].unique())
    for sid in EXOG_SERIES:
        if sid not in available:
            print(f"  ⚠ series {sid} not in market_series.parquet — dropping")
            continue
        s = (
            raw.loc[raw["series_id"] == sid, ["ts", "value"]]
            .dropna()
            .sort_values("ts")
            .set_index("ts")["value"]
        )
        # Resample to month-end (most FRED series ship as month-end), then
        # forward-fill, then convert to month-start aligned with `months`.
        # 'M' = month-end in this pandas version (newer pandas uses 'ME')
        s_m = s.resample("M").last().ffill()
        # Shift month-end stamps to month-start so we can join on `months`
        s_m.index = s_m.index.to_period("M").to_timestamp(how="start")
        joined = pd.Series(s_m, index=s_m.index).reindex(months, method="ffill")
        if joined.isna().all():
            print(f"  ⚠ series {sid} fully NaN in clean window — dropping")
            continue
        out[sid] = joined.values

    return out


exog = build_exog()
exog.to_parquet(EXOG_PARQUET, index=False)
print(f"[Phase 0] wrote {EXOG_PARQUET}  shape={exog.shape}  cols={list(exog.columns)}")


# %% [markdown]
# ## 5. Anomaly report markdown

# %%
def write_anomaly_report() -> None:
    lines: list[str] = []
    lines.append("# Phase 0 anomaly report")
    lines.append("")
    lines.append(f"Generated: {pd.Timestamp.utcnow().isoformat()}")
    lines.append("")
    lines.append("## Excluded months (outside 2022-01..2025-12 clean window)")
    lines.append("")
    lines.append(
        "Anomaly rule: `|z-score(invoice_count)| > 2.5` OR `invoice_count < 50` "
        "OR `invoice_count > 300`."
    )
    lines.append("")
    excluded = monthly_all.loc[
        (monthly_all["month"] < CLEAN_START) | (monthly_all["month"] > CLEAN_END)
    ].copy()
    if len(excluded):
        lines.append("| month | invoice_count | units | revenue (€) | z-score | flag |")
        lines.append("|---|---:|---:|---:|---:|---|")
        for _, r in excluded.iterrows():
            flags = []
            if r["invoice_count"] <= 50:
                flags.append("count<=50")
            if r["invoice_count"] > 300:
                flags.append("count>300")
            if abs(r["ic_z"]) > 2.5:
                flags.append(f"|z|={abs(r['ic_z']):.2f}>2.5")
            flag_txt = ", ".join(flags) if flags else "out-of-window"
            lines.append(
                f"| {r['month'].date()} | {int(r['invoice_count'])} | "
                f"{int(r['units'])} | {r['revenue']:,.0f} | "
                f"{r['ic_z']:+.2f} | {flag_txt} |"
            )
    else:
        lines.append("_None._")
    lines.append("")
    lines.append("### Rationale: the 2026 billing backlog")
    lines.append("")
    lines.append(
        "The four months 2026-01..2026-04 represent a single posting event: "
        "Q1 was severely under-billed (28 / 35 / 50 invoices vs the ~120 "
        "historical norm) while April absorbed a 3-month catch-up dump of "
        "**492 invoices on essentially one date**. May 2026 has only 1 "
        "invoice and is the current partial month. None of these months "
        "carry forecastable signal — they reflect AR posting cadence, not "
        "demand. The clean window therefore stops at 2025-12."
    )
    lines.append("")
    lines.append("## Suspicious months kept inside the clean window")
    lines.append("")
    if len(kept_anomalies):
        lines.append(
            "These months passed the calendar window but tripped the "
            "anomaly rule. They are **kept** (do not have a known data-"
            "quality story) but flagged for downstream review:"
        )
        lines.append("")
        lines.append("| month | invoice_count | units | revenue (€) | z-score | flag |")
        lines.append("|---|---:|---:|---:|---:|---|")
        for _, r in kept_anomalies.iterrows():
            flags = []
            if r["invoice_count"] <= 50:
                flags.append("count<=50")
            if r["invoice_count"] > 300:
                flags.append("count>300")
            if abs(r["ic_z"]) > 2.5:
                flags.append(f"|z|={abs(r['ic_z']):.2f}>2.5")
            lines.append(
                f"| {r['month'].date()} | {int(r['invoice_count'])} | "
                f"{int(r['units'])} | {r['revenue']:,.0f} | "
                f"{r['ic_z']:+.2f} | {', '.join(flags)} |"
            )
    else:
        lines.append("_None — all 48 months in the clean window pass the rule._")
    lines.append("")
    ANOMALY_REPORT.write_text("\n".join(lines))


write_anomaly_report()
print(f"[Phase 0] wrote {ANOMALY_REPORT}")


# %% [markdown]
# ## 6. KPI summary

# %%
rev = clean_out["revenue"]
ratio = rev.max() / rev.min() if rev.min() > 0 else float("nan")
print(
    f"[Phase 0] clean window N={len(clean_out)}, "
    f"revenue mean=€{rev.mean():.0f}, "
    f"revenue std=€{rev.std():.0f}, "
    f"ratio_max/min={ratio:.2f}"
)
