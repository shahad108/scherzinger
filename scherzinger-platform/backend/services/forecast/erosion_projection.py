"""List-price erosion projection composer — v2.2 Phase E.

For each cluster (commodity_group) we project the trailing list-price
trajectory and the trailing cost trajectory forward `horizon_months`
months and find the month each cluster's projected list price crosses
its projected cost floor.

Reuses the cluster-level shape from `commodity_trajectories` for the
list of clusters to project and the slope helpers, but reads invoice
prices/costs directly (we need *euro-per-unit* absolutes, not the
margin-percentage series those helpers expose).

Cadence: distinct realized list-price levels per cluster ÷ total
months covered → updates-every-N-months. When no signal is available
(no DB, schema mismatch, single price point) we emit ``None`` and the
frontend falls back to a "cadence unknown" chip.

Output shape (camelCase to match FE contract):

    {
      "horizonMonths": 12,
      "rows": [{
        "cluster": "BKAES",
        "currentListPrice": 12.40,
        "currentFloor": 9.10,
        "monthlyListSlope": -0.02,
        "monthlyCostSlope": 0.05,
        "projection": [
          {"month": "2026-06", "listPrice": 12.38, "floor": 9.15},
          ...
        ],
        "crossoverMonth": "2027-02" | None,
        "cadence": {"updatesEveryMonths": 9, "benchmarkMonths": 1},
      }]
    }
"""
from __future__ import annotations

import datetime as _dt
import logging as _logging
from typing import Any

from sqlalchemy import text as _sql_text
from sqlalchemy.orm import Session

_log = _logging.getLogger(__name__)

# The four clusters mirrored from commodity_trajectories.py. Keep aligned.
_INCLUDE_GROUPS = ("BKAES", "BKAGG", "BKAIZ", "MBDIV")


def _cluster_key(commodity_group: str | None) -> str:
    """Mirror the composer's cluster key derivation."""
    return (commodity_group or "?").split(" ")[0]


def _add_months(d: _dt.date, n: int) -> _dt.date:
    """Add ``n`` whole months to a first-of-month date."""
    y = d.year
    m = d.month + n
    while m > 12:
        m -= 12
        y += 1
    while m <= 0:
        m += 12
        y -= 1
    return _dt.date(y, m, 1)


def _month_key(d: _dt.date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _linreg_slope(y: list[float]) -> float:
    """Slope of y against [0,1,...,n-1]."""
    n = len(y)
    if n < 2:
        return 0.0
    mean_x = (n - 1) / 2.0
    mean_y = sum(y) / n
    num = 0.0
    den = 0.0
    for i, v in enumerate(y):
        dx = i - mean_x
        num += dx * (v - mean_y)
        den += dx * dx
    if den == 0:
        return 0.0
    return num / den


def _resolve_anchor(db: Session) -> _dt.date | None:
    row = db.execute(_sql_text("SELECT MAX(date) FROM invoices")).fetchone()
    anchor = row[0] if row else None
    if anchor is None:
        return None
    if isinstance(anchor, str):
        try:
            anchor = _dt.date.fromisoformat(anchor[:10])
        except Exception:
            return None
    return anchor


def _fetch_monthly_series(
    db: Session,
    *,
    months: int = 24,
) -> dict[str, list[tuple[str, float, float]]]:
    """Per cluster, last ``months`` monthly tuples of
    (month_key, avg_list_price_per_unit, avg_cost_per_unit).

    list price ≈ revenue / quantity (realised unit price)
    cost      ≈ COALESCE(hkvoll_per_unit, material_per_unit+fek_per_unit+fv_per_unit)
    """
    rows = db.execute(
        _sql_text(
            f"""
            SELECT commodity_group,
                   year,
                   month,
                   SUM(revenue) / NULLIF(SUM(quantity), 0) AS list_price,
                   SUM(
                     COALESCE(
                       hkvoll_per_unit,
                       COALESCE(material_per_unit, 0)
                       + COALESCE(fek_per_unit, 0)
                       + COALESCE(fv_per_unit, 0)
                     ) * quantity
                   ) / NULLIF(SUM(quantity), 0) AS cost_per_unit
              FROM invoices
             WHERE commodity_group IS NOT NULL
               AND quantity > 0
               AND date >= (SELECT MAX(date) - (:months * INTERVAL '1 month') FROM invoices)
             GROUP BY commodity_group, year, month
             ORDER BY commodity_group, year, month
            """
        ),
        {"months": months},
    ).fetchall()

    out: dict[str, list[tuple[str, float, float]]] = {}
    for r in rows:
        cg = _cluster_key(r[0])
        y = int(r[1]) if r[1] is not None else None
        m = int(r[2]) if r[2] is not None else None
        if y is None or m is None:
            continue
        lp = float(r[3]) if r[3] is not None else None
        cp = float(r[4]) if r[4] is not None else None
        if lp is None or cp is None or lp <= 0:
            continue
        out.setdefault(cg, []).append((f"{y:04d}-{m:02d}", lp, cp))
    return out


def _fetch_price_update_history(db: Session) -> dict[str, dict[str, Any]]:
    """Per cluster, count distinct realized list-price levels and the
    span (in months) they cover. Used to derive update cadence.

    ``updates_every_months`` = total_months / max(distinct_levels - 1, 1).
    When distinct_levels <= 1 (no observed change) we return None for that
    cluster so the frontend can show "cadence unknown".
    """
    rows = db.execute(
        _sql_text(
            """
            WITH per_month AS (
              SELECT commodity_group,
                     year,
                     month,
                     ROUND(
                       (SUM(revenue)::numeric / NULLIF(SUM(quantity), 0))::numeric,
                       2
                     ) AS lp
                FROM invoices
               WHERE commodity_group IS NOT NULL
                 AND quantity > 0
                 AND date >= (SELECT MAX(date) - INTERVAL '36 months' FROM invoices)
               GROUP BY commodity_group, year, month
            )
            SELECT commodity_group,
                   COUNT(DISTINCT lp) AS levels,
                   COUNT(*) AS months_covered
              FROM per_month
             WHERE lp IS NOT NULL
             GROUP BY commodity_group
            """
        )
    ).fetchall()

    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        cg = _cluster_key(r[0])
        levels = int(r[1] or 0)
        months_covered = int(r[2] or 0)
        if levels <= 1 or months_covered <= 0:
            out[cg] = {"updatesEveryMonths": None}
            continue
        # +1 not needed: levels=N means N-1 transitions over months_covered.
        every = max(1, round(months_covered / max(levels - 1, 1)))
        out[cg] = {"updatesEveryMonths": int(every)}
    return out


def _project_row(
    *,
    cluster: str,
    series: list[tuple[str, float, float]],
    anchor: _dt.date,
    horizon_months: int,
    cadence_block: dict[str, Any] | None,
) -> dict[str, Any]:
    """Compute one row's projection given a list of (month, lp, cost)
    tuples and the anchor date (last invoice date) we project forward
    from."""
    list_prices = [t[1] for t in series]
    costs = [t[2] for t in series]
    current_list = list_prices[-1]
    current_cost = costs[-1]
    monthly_list_slope = _linreg_slope(list_prices) if len(list_prices) >= 2 else 0.0
    monthly_cost_slope = _linreg_slope(costs) if len(costs) >= 2 else 0.0

    # Anchor projection start at the month *after* the anchor month.
    start = _add_months(anchor.replace(day=1), 1)
    projection: list[dict[str, Any]] = []
    crossover: str | None = None
    for i in range(1, horizon_months + 1):
        month = _add_months(start, i - 1)
        lp = current_list + monthly_list_slope * i
        fl = current_cost + monthly_cost_slope * i
        projection.append({
            "month": _month_key(month),
            "listPrice": round(lp, 4),
            "floor": round(fl, 4),
        })
        if crossover is None and lp <= fl:
            crossover = _month_key(month)

    cadence = {
        "updatesEveryMonths": cadence_block.get("updatesEveryMonths") if cadence_block else None,
        "benchmarkMonths": 1,
    }

    return {
        "cluster": cluster,
        "currentListPrice": round(current_list, 4),
        "currentFloor": round(current_cost, 4),
        "monthlyListSlope": round(monthly_list_slope, 6),
        "monthlyCostSlope": round(monthly_cost_slope, 6),
        "projection": projection,
        "crossoverMonth": crossover,
        "cadence": cadence,
    }


def build_erosion_projection(
    db: Session | None,
    *,
    cluster: str | None = None,
    horizon_months: int = 12,
) -> dict[str, Any]:
    """Build the list-price erosion projection panel.

    See module docstring for the output contract. Returns an empty
    ``rows`` list whenever data is unavailable — the frontend then
    renders nothing (graceful degradation).
    """
    empty: dict[str, Any] = {"horizonMonths": horizon_months, "rows": []}
    if db is None:
        return empty

    try:
        anchor = _resolve_anchor(db)
        if anchor is None:
            return empty

        series_by_cluster = _fetch_monthly_series(db)
        cadence_by_cluster = _fetch_price_update_history(db)

        rows: list[dict[str, Any]] = []
        # Stable cluster ordering: the same _INCLUDE_GROUPS the
        # commodity-trajectory composer uses, then any extras.
        ordered_clusters: list[str] = list(_INCLUDE_GROUPS)
        for cg in series_by_cluster.keys():
            if cg not in ordered_clusters:
                ordered_clusters.append(cg)
        for cg in ordered_clusters:
            if cluster and cg != cluster:
                continue
            series = series_by_cluster.get(cg)
            if not series:
                continue
            cadence_blk = cadence_by_cluster.get(cg)
            rows.append(_project_row(
                cluster=cg,
                series=series,
                anchor=anchor,
                horizon_months=horizon_months,
                cadence_block=cadence_blk,
            ))

        return {"horizonMonths": horizon_months, "rows": rows}
    except Exception as exc:  # pragma: no cover - schema-mismatch safety net
        _log.warning("erosion_projection compose failed: %s", exc)
        return empty
