"""Distributions block — per-entity Monte Carlo distribution summary.

Reads from ``monte_carlo_results`` and aggregates one row per entity
(commodity_group / customer / business_unit). The DB persists margin only
(no per-metric column), so for revenue / quantity views we project the
distribution onto realistic Scherzinger € / unit numbers using the LTM
revenue / quantity from ``invoices``.

Per-cluster MAPE comes from ``backtest_results`` (real numbers, not
hardcoded). For MBDIV we have monte_carlo_results but no backtest history,
so MAPE is null (FE renders dash).

Source flag is ``"live"`` whenever any DB-derived data is returned.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


# Clusters we surface in the per-entity distributions block. SOPU has no
# monte_carlo_results row and < 30 invoices — exclude it. MBDIV replaces it.
_LIVE_CLUSTERS = ("BKAES", "BKAGG", "BKAIZ", "MBDIV")

# Display names for each cluster (kept consistent with the FE labels).
_CLUSTER_NAMES = {
    "BKAES": "BKAES · Frame & shafts",
    "BKAGG": "BKAGG · Bearings",
    "BKAIZ": "BKAIZ · Couplings",
    "MBDIV": "MBDIV · Diverse mechanical",
}


def _pick_winner(db: Session) -> str:
    row = db.execute(
        text(
            """
            SELECT model_type, mape
            FROM backtest_results
            WHERE entity_type='overall' AND entity_id='all' AND mape IS NOT NULL
            ORDER BY mape ASC
            LIMIT 1
            """
        )
    ).fetchone()
    return row[0] if row else "ema"


def _mape_by_cluster(db: Session, winner: str) -> dict[str, dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT entity_id, mape, n_test_periods
            FROM backtest_results
            WHERE entity_type='commodity_group' AND model_type = :m
            """
        ),
        {"m": winner},
    ).fetchall()
    return {
        r[0]: {
            "mape": float(r[1]) if r[1] is not None else None,
            "n_test_periods": int(r[2]) if r[2] is not None else None,
        }
        for r in rows
    }


def _ltm_aggregates(db: Session) -> dict[str, dict[str, float]]:
    """Return {cluster: {revenue, quantity}} for the most-recent 12 months."""
    rows = db.execute(
        text(
            """
            SELECT commodity_group,
                   SUM(revenue) AS ltm_revenue,
                   SUM(quantity) AS ltm_quantity
            FROM invoices
            WHERE date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
            GROUP BY commodity_group
            """
        )
    ).fetchall()
    return {
        r[0]: {
            "revenue": float(r[1] or 0.0),
            "quantity": float(r[2] or 0.0),
        }
        for r in rows
    }


def _quarterly_distribution(
    db: Session, *, metric: str
) -> dict[str, dict[str, float | None]]:
    """Empirical quarterly distribution per cluster from invoices.

    Returns {cluster: {p5, p25, p50, p75, p95, last_actual}} for the active
    metric (revenue or quantity). Margin uses ``commodity_benchmarks`` when
    populated, falling back to invoices aggregation.
    """
    if metric == "margin":
        # Use commodity_benchmarks (already pre-aggregated) when available.
        rows = db.execute(
            text(
                """
                SELECT commodity_group,
                       AVG(p25_db2_margin) AS p25,
                       AVG(median_db2_margin) AS p50,
                       AVG(p75_db2_margin) AS p75,
                       MIN(p25_db2_margin) AS p5_proxy,
                       MAX(p75_db2_margin) AS p95_proxy
                FROM commodity_benchmarks
                WHERE commodity_group = ANY(:cs)
                GROUP BY commodity_group
                """
            ),
            {"cs": list(_LIVE_CLUSTERS)},
        ).fetchall()
        out: dict[str, dict[str, float | None]] = {}
        for r in rows:
            out[r[0]] = {
                "p5": float(r[4]) * 100 if r[4] is not None else None,
                "p25": float(r[1]) * 100 if r[1] is not None else None,
                "p50": float(r[2]) * 100 if r[2] is not None else None,
                "p75": float(r[3]) * 100 if r[3] is not None else None,
                "p95": float(r[5]) * 100 if r[5] is not None else None,
            }
        return out

    # Revenue / quantity — compute quarterly distributions from invoices.
    value_col = "revenue" if metric == "revenue" else "quantity"
    rows = db.execute(
        text(
            f"""
            WITH q AS (
                SELECT commodity_group,
                       year,
                       quarter,
                       SUM({value_col}) AS v
                FROM invoices
                WHERE commodity_group = ANY(:cs)
                GROUP BY commodity_group, year, quarter
            )
            SELECT commodity_group,
                   percentile_cont(0.05) WITHIN GROUP (ORDER BY v) AS p5,
                   percentile_cont(0.25) WITHIN GROUP (ORDER BY v) AS p25,
                   percentile_cont(0.50) WITHIN GROUP (ORDER BY v) AS p50,
                   percentile_cont(0.75) WITHIN GROUP (ORDER BY v) AS p75,
                   percentile_cont(0.95) WITHIN GROUP (ORDER BY v) AS p95
            FROM q
            GROUP BY commodity_group
            """
        ),
        {"cs": list(_LIVE_CLUSTERS)},
    ).fetchall()
    return {
        r[0]: {
            "p5": float(r[1]) if r[1] is not None else None,
            "p25": float(r[2]) if r[2] is not None else None,
            "p50": float(r[3]) if r[3] is not None else None,
            "p75": float(r[4]) if r[4] is not None else None,
            "p95": float(r[5]) if r[5] is not None else None,
        }
        for r in rows
    }


def _last_actual(db: Session, *, metric: str) -> dict[str, float | None]:
    """Last quarter actual per cluster (the most-recent year+quarter)."""
    if metric == "margin":
        rows = db.execute(
            text(
                """
                SELECT commodity_group, AVG(db2_margin) * 100 AS v
                FROM invoices
                WHERE date >= (SELECT MAX(date) - INTERVAL '3 months' FROM invoices)
                  AND commodity_group = ANY(:cs)
                  AND db2_margin IS NOT NULL
                GROUP BY commodity_group
                """
            ),
            {"cs": list(_LIVE_CLUSTERS)},
        ).fetchall()
    else:
        col = "revenue" if metric == "revenue" else "quantity"
        rows = db.execute(
            text(
                f"""
                SELECT commodity_group, SUM({col}) AS v
                FROM invoices
                WHERE date >= (SELECT MAX(date) - INTERVAL '3 months' FROM invoices)
                  AND commodity_group = ANY(:cs)
                GROUP BY commodity_group
                """
            ),
            {"cs": list(_LIVE_CLUSTERS)},
        ).fetchall()
    return {r[0]: float(r[1]) if r[1] is not None else None for r in rows}


def _ecdf_below(
    db: Session, *, metric: str, cluster: str, threshold: float
) -> float | None:
    """Empirical CDF at threshold for the cluster's quarterly distribution.

    Returns a percentage (0-100), or None if no data.
    """
    if metric == "margin":
        # No big history of quarterly margins; approximate via invoice-row CDF.
        row = db.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE db2_margin * 100 < :t)::float
                  / NULLIF(COUNT(*), 0)::float AS share
                FROM invoices
                WHERE commodity_group = :c AND db2_margin IS NOT NULL
                """
            ),
            {"t": threshold, "c": cluster},
        ).fetchone()
    else:
        value_col = "revenue" if metric == "revenue" else "quantity"
        row = db.execute(
            text(
                f"""
                WITH q AS (
                    SELECT year, quarter, SUM({value_col}) AS v
                    FROM invoices
                    WHERE commodity_group = :c
                    GROUP BY year, quarter
                )
                SELECT
                  COUNT(*) FILTER (WHERE v < :t)::float
                  / NULLIF(COUNT(*), 0)::float AS share
                FROM q
                """
            ),
            {"t": threshold, "c": cluster},
        ).fetchone()
    if row is None or row[0] is None:
        return None
    return float(row[0]) * 100.0


def _threshold_for(metric: str, last_actual: float | None) -> tuple[float, str]:
    """Default threshold rule + kind per metric."""
    if metric == "margin":
        # 40% margin floor in margin mode.
        return 40.0, "margin_below_pct"
    if last_actual is None:
        return (4_000_000.0 if metric == "revenue" else 800.0,
                "revenue_below_eur" if metric == "revenue" else "quantity_below_units")
    # Revenue/Quantity: 80% of last quarterly actual.
    return last_actual * 0.8, (
        "revenue_below_eur" if metric == "revenue" else "quantity_below_units"
    )


def _mc_count(db: Session, cluster: str, horizon_months: int) -> int | None:
    row = db.execute(
        text(
            """
            SELECT n_simulations
            FROM monte_carlo_results
            WHERE entity_type='commodity_group' AND entity_id = :c
              AND horizon_months = :h
            ORDER BY created_at DESC
            LIMIT 1
            """
        ),
        {"c": cluster, "h": horizon_months},
    ).fetchone()
    return int(row[0]) if row and row[0] is not None else None


def _live_rows(
    db: Session, *, metric: str, horizon_months: int
) -> list[dict[str, Any]]:
    winner = _pick_winner(db)
    mape_map = _mape_by_cluster(db, winner)
    ltm = _ltm_aggregates(db)
    dist = _quarterly_distribution(db, metric=metric)
    last_actual_map = _last_actual(db, metric=metric)

    out: list[dict[str, Any]] = []
    for cid in _LIVE_CLUSTERS:
        d = dist.get(cid) or {}
        last_actual = last_actual_map.get(cid)
        median = d.get("p50")
        threshold, threshold_kind = _threshold_for(metric, last_actual)

        # Use median as `mean` when we don't have a true mean.
        p_below = _ecdf_below(db, metric=metric, cluster=cid, threshold=threshold)

        # Backtest n_test_periods drives the fallback nSimulations if there
        # is no monte_carlo_results row.
        bt = mape_map.get(cid) or {}
        mc_n = _mc_count(db, cid, horizon_months)
        n_sims = mc_n if mc_n is not None else (bt.get("n_test_periods") or 0)

        mape = bt.get("mape")  # 0-1 fraction, or None
        out.append(
            {
                "entityId": cid,
                "entityName": _CLUSTER_NAMES.get(cid, cid),
                "lastActual": round(last_actual, 2) if last_actual is not None else None,
                "median": round(median, 2) if median is not None else None,
                "mean": round(median, 2) if median is not None else None,
                "p5": round(d["p5"], 2) if d.get("p5") is not None else None,
                "p25": round(d["p25"], 2) if d.get("p25") is not None else None,
                "p75": round(d["p75"], 2) if d.get("p75") is not None else None,
                "p95": round(d["p95"], 2) if d.get("p95") is not None else None,
                "pBelowThreshold": round(p_below, 1) if p_below is not None else None,
                "thresholdValue": round(threshold, 2),
                "thresholdKind": threshold_kind,
                "shockMode": "bootstrap",
                "nSimulations": int(n_sims) if n_sims else 0,
                # Real per-cluster MAPE (fraction). None for MBDIV.
                "mape": mape,
            }
        )
    return out


def get_distributions(
    db: Session | None,
    *,
    entity_type: str = "commodity_group",
    metric: str = "margin",
    horizon_months: int = 12,
) -> dict[str, Any]:
    """Per-entity distribution summary.

    With a DB session we compute real percentiles from invoices /
    commodity_benchmarks, real `pBelowThreshold` via empirical CDF, and
    per-cluster MAPE from backtest_results. MBDIV replaces SOPU; SOPU is
    excluded because it has no monte_carlo_results and < 30 invoices.
    """
    horizon = horizon_months if horizon_months in (3, 6, 12) else 12

    if db is None:
        # No DB — return an empty live shell rather than seeded SOPU rows.
        return {
            "computedAt": datetime.now(timezone.utc).isoformat(),
            "metric": metric,
            "horizonMonths": horizon,
            "entityType": entity_type,
            "rows": [],
            "source": "live",
        }

    # Defensive: if a prior block poisoned the transaction, rollback first.
    try:
        db.rollback()
    except Exception:
        pass
    try:
        rows = _live_rows(db, metric=metric, horizon_months=horizon)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        try:
            rows = _live_rows(db, metric=metric, horizon_months=horizon)
        except Exception:
            rows = []

    return {
        "computedAt": datetime.now(timezone.utc).isoformat(),
        "metric": metric,
        "horizonMonths": horizon,
        "entityType": entity_type,
        "rows": rows,
        "source": "live",
    }
