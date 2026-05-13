"""Distributions block — per-entity Monte Carlo distribution summary.

Reads from ``monte_carlo_results`` and aggregates one row per entity
(commodity_group / customer / business_unit) for the active metric and
horizon. The FE renders these as a grid of distribution cards under the
tornado.

Falls back to the seed at ``backend/seeds/screens/forecast.json`` if the
table isn't populated yet, so the FE always has something to render.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from ._seed import load_seed


def _seed_rows(metric: str, horizon_months: int, entity_type: str) -> dict[str, Any]:
    seed = load_seed().get("distributions") or {}
    rows = list(seed.get("rows") or [])
    return {
        "computedAt": seed.get("computedAt") or datetime.now(timezone.utc).isoformat(),
        "metric": metric,
        "horizonMonths": horizon_months,
        "entityType": entity_type,
        "rows": rows,
        "source": "seed",
    }


def get_distributions(
    db: Session | None,
    *,
    entity_type: str = "commodity_group",
    metric: str = "margin",
    horizon_months: int = 12,
) -> dict[str, Any]:
    if db is None:
        return _seed_rows(metric, horizon_months, entity_type)

    try:
        rows = db.execute(text("""
            SELECT
                entity_id,
                COALESCE(MAX(parameters->>'entity_name'), entity_id) AS entity_name,
                COALESCE(MAX(parameters->>'last_actual')::float, 0) AS last_actual,
                AVG(median_margin) AS median,
                AVG(mean_margin) AS mean,
                AVG(p5_margin) AS p5,
                AVG(p25_margin) AS p25,
                AVG(p75_margin) AS p75,
                AVG(p95_margin) AS p95,
                AVG(prob_below_threshold) AS p_below_threshold,
                AVG(threshold_used) AS threshold_value,
                MAX(parameters->>'threshold_kind') AS threshold_kind,
                MAX(shock_mode) AS shock_mode,
                MAX(n_simulations) AS n_simulations
            FROM monte_carlo_results
            WHERE entity_type = :entity_type
              AND metric = :metric
              AND horizon_months = :horizon
            GROUP BY entity_id
            ORDER BY entity_id
        """), {
            "entity_type": entity_type,
            "metric": metric,
            "horizon": horizon_months,
        }).fetchall()
    except Exception:
        return _seed_rows(metric, horizon_months, entity_type)

    if not rows:
        return _seed_rows(metric, horizon_months, entity_type)

    out_rows: list[dict[str, Any]] = []
    for r in rows:
        out_rows.append({
            "entityId": r[0],
            "entityName": r[1],
            "lastActual": float(r[2]) if r[2] is not None else None,
            "median": float(r[3]) if r[3] is not None else None,
            "mean": float(r[4]) if r[4] is not None else None,
            "p5": float(r[5]) if r[5] is not None else None,
            "p25": float(r[6]) if r[6] is not None else None,
            "p75": float(r[7]) if r[7] is not None else None,
            "p95": float(r[8]) if r[8] is not None else None,
            "pBelowThreshold": float(r[9]) if r[9] is not None else None,
            "thresholdValue": float(r[10]) if r[10] is not None else None,
            "thresholdKind": r[11] or "fixed",
            "shockMode": r[12] or "bootstrap",
            "nSimulations": int(r[13]) if r[13] is not None else 1000,
        })

    return {
        "computedAt": datetime.now(timezone.utc).isoformat(),
        "metric": metric,
        "horizonMonths": horizon_months,
        "entityType": entity_type,
        "rows": out_rows,
        "source": "live",
    }
