"""Per-block helpers for the Forecasting composer.

Each helper is the swap point for the real-data path:
    hero            → forecast_service.walk_forward(entity='global')
    clusters        → forecast_service.by_cluster + benchmark_service
    walkForward     → forecasts table monthly MAPE
    inputCost       → cost_service.get_cost_trends + simulation_service
    pareto.customer → forecast_service.by_customer top 80% revenue
    pareto.sku      → forecast_service.by_sku top 80% revenue
    priceFloor      → pricing_studio_service.floor_adherence
    newProduct      → forecast_service.new_product (cluster-anchor model)
"""
from __future__ import annotations

from typing import Any

from ._seed import load_seed


async def header(*, mode: str | None) -> dict[str, Any]:
    seed_header = dict(load_seed()["header"])
    if mode:
        seed_header["mode"] = mode
        # Real impl recomputes the modeLabel from a templated table.
        seed_header["modeLabel"] = mode.title()
    return seed_header


_P95_MULTIPLIER = 1.6  # widen P80 band by 60% to approximate P95


def _enrich_intervals(hero: dict[str, Any]) -> dict[str, Any]:
    """Phase 6 — make the hero forecast's prediction intervals honest.

    Each series point in the seed carries ``primary / low / high`` which
    are effectively P50 / P80-lower / P80-upper. This wrapper:
      * names them properly (p50, p80Low, p80High)
      * derives a wider P95 band (primary ± (band_half × 1.6))
      * computes a calibration line from the in-window actuals (how many
        of the past-window actuals fell inside each band)
      * adds an ``intervals`` disclosure block with band copy + heuristic
        so the FE chart can be labelled honestly.
    """
    series = list(hero.get("series") or [])
    if not series:
        return hero

    enriched_series: list[dict[str, Any]] = []
    p80_hits = 0
    p95_hits = 0
    actuals_n = 0

    for p in series:
        primary = float(p["primary"])
        low = float(p["low"])
        high = float(p["high"])
        # Symmetric-around-primary widening for P95.
        half_p80 = (high - low) / 2.0
        half_p95 = half_p80 * _P95_MULTIPLIER
        p95_low = round(primary - half_p95, 4)
        p95_high = round(primary + half_p95, 4)

        actual = p.get("actual")
        if actual is not None:
            actuals_n += 1
            if low <= float(actual) <= high:
                p80_hits += 1
            if p95_low <= float(actual) <= p95_high:
                p95_hits += 1

        enriched_series.append({
            **p,
            "p50": primary,
            "p80Low": low,
            "p80High": high,
            "p95Low": p95_low,
            "p95High": p95_high,
        })

    out = dict(hero)
    out["series"] = enriched_series

    p80_pct = round(100.0 * p80_hits / actuals_n, 0) if actuals_n else None
    p95_pct = round(100.0 * p95_hits / actuals_n, 0) if actuals_n else None

    out["intervals"] = {
        "title": "Prediction intervals — what the band actually means",
        "bands": [
            {
                "id": "p50",
                "name": "P50 · expected",
                "desc": "Median forecast. 50% chance the realised number is higher, 50% lower. Plan on this.",
                "calibration": None,
            },
            {
                "id": "p80",
                "name": "P80 · likely range",
                "desc": "80% of historical forecasts landed inside this band. Use as the planning range for sourcing + capacity.",
                "calibration": (
                    f"{p80_hits}/{actuals_n} in-window actuals landed inside P80 ({p80_pct:.0f}%)"
                    if actuals_n else None
                ),
            },
            {
                "id": "p95",
                "name": "P95 · plausible worst/best",
                "desc": "Stress band. Only used to size downside hedges (working capital, alt-supplier on-call) — not for the central plan.",
                "calibration": (
                    f"{p95_hits}/{actuals_n} in-window actuals landed inside P95 ({p95_pct:.0f}%)"
                    if actuals_n else None
                ),
            },
        ],
        "disclosure": (
            "Three bands, three jobs. P50 = the plan. P80 = the planning range "
            "(sourcing, capacity). P95 = the hedge band (working capital, "
            "alt-supplier readiness). Don't mix them."
        ),
        "calibration": {
            "windowMonths": actuals_n,
            "p80Hit": p80_hits,
            "p95Hit": p95_hits,
            "p80HitPct": p80_pct,
            "p95HitPct": p95_pct,
            "footnote": (
                f"In-window calibration on {actuals_n} months of actuals — "
                "small sample; broader holdout coverage shipped in Model "
                "Cards (Phase 8)."
            ) if actuals_n else "No in-window actuals available for calibration.",
        },
        "heuristic": {
            "label": "Pilot heuristic",
            "rule": (
                f"p50 = seed primary; p80 = seed low/high; "
                f"p95 = primary ± (p80_half × {_P95_MULTIPLIER}). Replaced "
                "by trained-quantile bands once the optimiser ships."
            ),
            "qualifier": "Calibration recomputes when actuals replace seed.",
        },
    }
    return out


async def hero(*, horizon: int | None) -> dict[str, Any]:
    block = dict(load_seed()["hero"])
    if horizon and isinstance(block.get("series"), dict):
        # Phase 7 carries the seed series; the param is wired so callers
        # stay forward-compatible with the live walk-forward.
        block["activeHorizon"] = horizon
    return _enrich_intervals(block)


async def clusters(*, cluster: str | None) -> Any:
    rows = list(load_seed()["clusters"])
    if cluster:
        narrowed = [
            r for r in rows if str(r.get("code", "")).lower() == cluster.lower()
        ]
        if narrowed:
            return narrowed
    return rows


async def walk_forward() -> Any:
    return load_seed()["walkForward"]


async def input_cost() -> Any:
    return load_seed()["inputCost"]


async def pareto(*, tier: str | None) -> dict[str, Any]:
    block = {k: v for k, v in load_seed()["pareto"].items()}
    if tier:
        cust = block.get("customer")
        if isinstance(cust, dict) and isinstance(cust.get("rows"), list):
            cust = dict(cust)
            cust["rows"] = [
                r for r in cust["rows"] if str(r.get("tier", "")).lower() == tier.lower()
            ] or cust["rows"]
            block["customer"] = cust
    return block


async def price_floor(*, family: str | None) -> Any:
    rows = list(load_seed()["priceFloor"])
    if family:
        rows = [
            r for r in rows if str(r.get("family", "")).lower() == family.lower()
        ] or rows
    return rows


async def price_floor_footnote() -> Any:
    return load_seed().get("priceFloorFootnote", "")


async def new_product() -> Any:
    return load_seed()["newProduct"]
