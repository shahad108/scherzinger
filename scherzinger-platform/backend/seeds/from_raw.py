"""One-off helper: rewrite studio.json's per-AID price/margin/meta fields
from raw Scherzinger invoice data.

The studio.json screen seed was hand-written with FABRICATED prices that
disagreed with the raw ``invoices_clean.parquet`` data by up to 143×.
Worst case: AID 200832-E hard-coded at €4.20 vs raw 2025 median €599.

This script recomputes — for every AID listed in studio.json:

  * ``current_price``   = median(revenue_per_unit) over most-recent year (2025
                          preferred, fall back to 2024)
  * ``unit_cost``       = median(hkvoll_per_unit) over the same window
  * ``customer_count``  = nunique(customer_id) over last 24 months
  * ``annual_units``    = sum(quantity) over last 12 months
  * ``annual_revenue``  = sum(revenue) over last 12 months
  * ``cluster``         = mode(commodity_group) — only overrides the seed if
                          the seed cluster is None/unknown
  * ``last_repriced_q`` = quarter-of-MAX(date) per AID, formatted "YYYY-QN"
  * ``margin``          = (price - cost) / price * 100

…then writes the SKU's ``meta``, ``shortHero``, ``workbenchPatch`` fields
in place. Also patches the top-level ``workbench.hero`` block to match the
``defaultAid``.

AIDs absent from raw (e.g. 218812-K — "new SKU, no history") are left as
they are in the seed because those rows are meant to represent SKUs that
have no historical pricing yet.

Run with::

    .venv/bin/python -m backend.seeds.from_raw
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger("seeds.from_raw")
logging.basicConfig(level=logging.INFO, format="%(message)s")

REPO_ROOT = Path(__file__).resolve().parents[3]
INVOICES_PATH = REPO_ROOT / "Data" / "cleaned" / "invoices_clean.parquet"
STUDIO_JSON_PATH = (
    Path(__file__).resolve().parent / "screens" / "studio.json"
)


# ---------------------------------------------------------------------------
# Number / text formatting helpers
# ---------------------------------------------------------------------------


def _fmt_price(value: float) -> str:
    """Format a EUR price like the existing seed (€4.20 / €1,240)."""
    if value is None:
        return "—"
    v = float(value)
    if v >= 1000:
        return f"€{v:,.0f}"
    if v >= 100:
        return f"€{v:.0f}"
    return f"€{v:.2f}"


def _fmt_revenue(value: float) -> str:
    """Annual revenue like '€187K' or '€1.2M'."""
    if value is None:
        return "—"
    v = float(value)
    if v >= 1_000_000:
        return f"€{v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"€{v / 1_000:.0f}K"
    return f"€{v:.0f}"


def _fmt_units(value: int) -> str:
    """Compact unit count like '4,200' / '280'."""
    if value is None:
        return "—"
    return f"{int(value):,}"


def _fmt_margin(pct: float) -> str:
    """Format margin like '39.7%' or '−1.3%' (uses en-dash for negatives)."""
    if pct is None:
        return "—"
    if pct < 0:
        return f"−{abs(pct):.1f}%"
    return f"{pct:.1f}%"


def _margin_tone(pct: float) -> str:
    """marginTone uses lo / mid / hi vocabulary in the seed."""
    if pct is None:
        return "mid"
    if pct >= 45:
        return "hi"
    if pct >= 25:
        return "mid"
    return "lo"


def _current_margin_tone(pct: float) -> str:
    """currentMarginTone uses good / bad vocabulary (no amber/neutral in seed)."""
    if pct is None:
        return "bad"
    return "good" if pct >= 45 else "bad"


# ---------------------------------------------------------------------------
# Raw-data computations
# ---------------------------------------------------------------------------


def _quarter(month: int) -> int:
    return (int(month) - 1) // 3 + 1


def compute_aid_metrics(inv: pd.DataFrame, aid: str) -> dict[str, Any] | None:
    """Return raw-derived metrics for ``aid`` or None if there are no rows."""
    sub = inv[inv["article_id"] == aid]
    if sub.empty:
        return None

    # Pricing window: prefer 2025 rows; fall back to 2024 if none.
    recent = sub[sub["year"] == 2025]
    if recent.empty:
        recent = sub[sub["year"] == 2024]
    if recent.empty:
        recent = sub

    current_price = float(recent["revenue_per_unit"].median())
    unit_cost = float(recent["hkvoll_per_unit"].median())

    # 24-month window for customer count.
    max_date = sub["date"].max()
    cutoff_24m = max_date - pd.Timedelta(days=730)
    last24 = sub[sub["date"] >= cutoff_24m]
    customer_count = int(last24["customer_id"].nunique())

    # 12-month window for annual units / revenue.
    cutoff_12m = max_date - pd.Timedelta(days=365)
    last12 = sub[sub["date"] >= cutoff_12m]
    annual_units = int(last12["quantity"].sum())
    annual_revenue = float(last12["revenue"].sum())

    # Cluster — mode commodity_group.
    cg = sub["commodity_group"].dropna()
    cluster = str(cg.mode().iloc[0]) if not cg.empty else None

    # Last-repriced quarter from max(date).
    last_repriced = f"{max_date.year}-Q{_quarter(max_date.month)}"

    margin_pct = None
    if current_price and current_price > 0:
        margin_pct = (current_price - unit_cost) / current_price * 100

    return {
        "current_price": round(current_price, 2),
        "unit_cost": round(unit_cost, 2),
        "customer_count": customer_count,
        "annual_units": annual_units,
        "annual_revenue": annual_revenue,
        "cluster": cluster,
        "last_repriced_quarter": last_repriced,
        "margin_pct": margin_pct,
    }


# ---------------------------------------------------------------------------
# Apply metrics to a single SKU dict (mutates in place)
# ---------------------------------------------------------------------------


def _apply_to_sku(sku: dict, m: dict) -> None:
    aid = sku["aid"]
    price = m["current_price"]
    margin_str = _fmt_margin(m["margin_pct"])
    price_str = _fmt_price(price)

    # Top-level seed fields
    sku["margin"] = margin_str
    sku["marginTone"] = _margin_tone(m["margin_pct"])

    # Cluster: only override seed cluster if seed is None/empty/unknown.
    seed_cluster = (sku.get("cluster") or "").strip().upper()
    if not seed_cluster or seed_cluster in {"NONE", "UNKNOWN"}:
        if m["cluster"]:
            sku["cluster"] = m["cluster"]

    cluster = sku.get("cluster") or m["cluster"] or "BKAGG"

    # Refresh the short "meta" stripe.
    cust_n = m["customer_count"]
    sku["meta"] = f"{cluster} · {price_str} · {cust_n} customers"

    # shortHero — refresh only the numeric/derived fields that depend on
    # current price / margin / customer count.
    sh = sku.get("shortHero") or {}
    if sh:
        sh["currentPrice"] = price_str
        sh["currentMargin"] = f"{margin_str} margin"
        sh["currentMarginTone"] = _current_margin_tone(m["margin_pct"])
        # "sub" — rewrite the leading "Group **X** · N customers · U units/yr
        # · €R annual revenue" line, preserving any tail copy after the
        # 4th separator (rare in the seed but handled).
        rev_str = _fmt_revenue(m["annual_revenue"])
        units_str = _fmt_units(m["annual_units"])
        new_sub = (
            f"Group **{cluster}** · {cust_n} customers · "
            f"{units_str} units/yr · {rev_str} annual revenue"
        )
        sh["sub"] = new_sub
        sku["shortHero"] = sh

    # workbenchPatch — the operational source of truth for prices.
    wb = sku.get("workbenchPatch") or {}
    if wb:
        wb["currentPrice"] = price
        wb["unitCost"] = m["unit_cost"]
        wb["annualUnits"] = m["annual_units"]
        wb["customerCount"] = cust_n
        # currentMarginPct is sometimes referenced; keep it consistent.
        if "currentMarginPct" in wb:
            wb["currentMarginPct"] = round(m["margin_pct"], 1) if m["margin_pct"] is not None else None
        sku["workbenchPatch"] = wb


def _patch_workbench_hero(data: dict, default_metrics: dict, default_aid: str, default_cluster: str) -> None:
    """Refresh the top-level workbench.hero block from default-aid metrics."""
    hero = data.get("workbench", {}).get("hero")
    if hero is None:
        return
    m = default_metrics
    cust_n = m["customer_count"]
    rev_str = _fmt_revenue(m["annual_revenue"])
    units_str = _fmt_units(m["annual_units"])
    hero["currentPrice"] = _fmt_price(m["current_price"])
    hero["currentMargin"] = f"{_fmt_margin(m['margin_pct'])} margin"
    hero["currentMarginTone"] = _current_margin_tone(m["margin_pct"])
    hero["sub"] = (
        f"Group **{default_cluster}** · {cust_n} customers · "
        f"{units_str} units/yr · {rev_str} annual revenue"
    )
    hero["annualRevenue"] = rev_str


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def regenerate(invoices_path: Path = INVOICES_PATH, studio_path: Path = STUDIO_JSON_PATH) -> None:
    logger.info("Loading raw invoices from %s", invoices_path)
    inv = pd.read_parquet(invoices_path)
    logger.info("  → %d rows, %d distinct AIDs", len(inv), inv["article_id"].nunique())

    logger.info("Loading studio seed from %s", studio_path)
    data = json.loads(studio_path.read_text())

    default_aid = data.get("defaultAid")
    default_metrics: dict | None = None
    default_cluster: str | None = None

    rows: list[tuple[str, str, str, str]] = []  # (aid, before, after, margin)

    for sku in data.get("skus", []):
        aid = sku["aid"]
        wb_before = (sku.get("workbenchPatch") or {}).get("currentPrice")
        m = compute_aid_metrics(inv, aid)
        if m is None:
            rows.append((aid, str(wb_before), "—", "no raw rows (kept seed)"))
            continue
        _apply_to_sku(sku, m)
        if aid == default_aid:
            default_metrics = m
            default_cluster = sku.get("cluster")
        rows.append(
            (
                aid,
                str(wb_before),
                str(m["current_price"]),
                _fmt_margin(m["margin_pct"]),
            )
        )

    # Patch workbench.hero from defaultAid's real numbers.
    if default_metrics is not None:
        _patch_workbench_hero(data, default_metrics, default_aid, default_cluster or "BKAGG")

    # Pretty-print preserving the original 2-space indentation the seed uses.
    studio_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    logger.info("Wrote %s", studio_path)

    # Audit table.
    logger.info("")
    logger.info("%-12s  %-10s  %-10s  %s", "AID", "before", "after", "margin")
    logger.info("-" * 60)
    for aid, before, after, margin in rows:
        logger.info("%-12s  %-10s  %-10s  %s", aid, before, after, margin)


if __name__ == "__main__":
    regenerate()
