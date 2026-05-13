"""Tornado block — input-sensitivity ranking for the forecast.

Composes from ``monte_carlo_results``: for each input variable that was
perturbed in the simulator, compares the perturbed median against the base
median (and p5/p95) and returns the bars sorted by ``|delta|`` descending.

The shape mirrors the FE ``TornadoBar`` type. Until the simulator emits
per-input deltas directly into ``monte_carlo_results.parameters``, this
helper falls back to the seed bars in
``backend/seeds/screens/forecast.json`` so the FE has something to render.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from ._seed import load_seed


def _seed_bars(metric: str, horizon_months: int) -> dict[str, Any]:
    """Return the seed tornado block, optionally filtered to a metric/horizon."""
    seed = load_seed().get("tornado") or {}
    bars = list(seed.get("bars") or [])
    return {
        "computedAt": seed.get("computedAt") or datetime.now(timezone.utc).isoformat(),
        "metric": metric,
        "horizonMonths": horizon_months,
        "entityType": seed.get("entityType", "commodity_group"),
        "n_simulations": seed.get("n_simulations", 1000),
        "shockMode": seed.get("shockMode", "bootstrap"),
        "bars": bars,
        "source": "seed",
    }


def get_tornado(
    db: Session | None,
    *,
    entity_type: str = "commodity_group",
    metric: str = "margin",
    horizon_months: int = 12,
) -> dict[str, Any]:
    """Public block helper used by both the BFF composer and the dedicated route."""
    if db is None:
        return _seed_bars(metric, horizon_months)

    # Attempt the real path: per-input deltas live in ``monte_carlo_results``
    # rows whose ``parameters->>input`` differs from ``parameters->>baseline``.
    # If the schema isn't there yet (early-pilot DBs), fall back to the seed
    # without raising — the FE still wants a non-empty payload.
    try:
        rows = db.execute(text("""
            SELECT
                parameters->>'input_name' AS input_name,
                parameters->>'unit' AS unit,
                parameters->>'perturbation_size' AS perturbation_size,
                AVG(CASE WHEN parameters->>'direction' = 'pos' THEN median_margin END)
                  - AVG(CASE WHEN parameters->>'direction' = 'base' THEN median_margin END) AS delta_pos,
                AVG(CASE WHEN parameters->>'direction' = 'neg' THEN median_margin END)
                  - AVG(CASE WHEN parameters->>'direction' = 'base' THEN median_margin END) AS delta_neg,
                AVG(p5_margin) AS p5,
                AVG(p95_margin) AS p95,
                MAX(parameters->>'cluster_breakdown') AS cluster_breakdown
            FROM monte_carlo_results
            WHERE entity_type = :entity_type
              AND metric = :metric
              AND horizon_months = :horizon
              AND parameters ? 'input_name'
            GROUP BY parameters->>'input_name', parameters->>'unit',
                     parameters->>'perturbation_size'
            ORDER BY ABS(
              COALESCE(AVG(CASE WHEN parameters->>'direction' = 'pos' THEN median_margin END)
                     - AVG(CASE WHEN parameters->>'direction' = 'base' THEN median_margin END), 0)
            ) DESC
            LIMIT 12
        """), {
            "entity_type": entity_type,
            "metric": metric,
            "horizon": horizon_months,
        }).fetchall()
    except Exception:
        return _seed_bars(metric, horizon_months)

    if not rows:
        return _seed_bars(metric, horizon_months)

    bars: list[dict[str, Any]] = []
    for r in rows:
        bars.append({
            "inputName": r[0],
            "unit": r[1] or "",
            "perturbationSize": float(r[2]) if r[2] is not None else None,
            "deltaPositive": float(r[3]) if r[3] is not None else 0.0,
            "deltaNegative": float(r[4]) if r[4] is not None else 0.0,
            "p5": float(r[5]) if r[5] is not None else None,
            "p95": float(r[6]) if r[6] is not None else None,
            "deltaUnit": metric,
            "clusterBreakdown": r[7],
        })

    return {
        "computedAt": datetime.now(timezone.utc).isoformat(),
        "metric": metric,
        "horizonMonths": horizon_months,
        "entityType": entity_type,
        "n_simulations": 1000,
        "shockMode": "bootstrap",
        "bars": bars,
        "source": "live",
    }
