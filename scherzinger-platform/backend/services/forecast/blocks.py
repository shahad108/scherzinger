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

from sqlalchemy import text
from sqlalchemy.orm import Session

from ._seed import load_seed
from .real_input_cost import build_input_cost as _build_input_cost_live


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
    # Seed fallback assumes revenue/volume; margin uses the live path which
    # already preserves negative bands. Clamp non-negative monetary bands here.
    mode = (hero.get("mode") or "revenue").lower()
    non_negative = mode in ("revenue", "volume")

    for p in series:
        primary = float(p["primary"])
        low = float(p["low"])
        high = float(p["high"])
        if non_negative and low < 0:
            low = 0.0
        # Symmetric-around-primary widening for P95.
        half_p80 = (high - low) / 2.0
        half_p95 = half_p80 * _P95_MULTIPLIER
        p95_low = round(primary - half_p95, 4)
        p95_high = round(primary + half_p95, 4)
        if non_negative and p95_low < 0:
            p95_low = 0.0

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


def _hero_movers_live(db: Session) -> list[dict[str, Any]] | None:
    """Top-3 customer deltas (positive + negative) between last week and prior week.

    Excludes synthetic seed customers — IDs matching the `ABE-%` prefix come
    from the seed pipeline (e.g. ``ABE-FA8F05-CUST-003``) and must never leak
    into the user-facing 'Top movers' hero. DATA-AUDIT-2026-05-17 defect #7.
    """
    try:
        rows = db.execute(text("""
            WITH bounds AS (
                SELECT MAX(date) AS max_d FROM invoices
            ),
            last_week AS (
                SELECT customer_id, SUM(revenue) AS rev
                FROM invoices, bounds
                WHERE date > bounds.max_d - INTERVAL '7 days'
                  AND date <= bounds.max_d
                  AND customer_id NOT LIKE 'ABE-%'
                GROUP BY customer_id
            ),
            prior_week AS (
                SELECT customer_id, SUM(revenue) AS rev
                FROM invoices, bounds
                WHERE date > bounds.max_d - INTERVAL '14 days'
                  AND date <= bounds.max_d - INTERVAL '7 days'
                  AND customer_id NOT LIKE 'ABE-%'
                GROUP BY customer_id
            )
            SELECT COALESCE(lw.customer_id, pw.customer_id) AS cid,
                   COALESCE(lw.rev, 0) - COALESCE(pw.rev, 0) AS delta,
                   COALESCE(lw.rev, 0) AS last_rev
            FROM last_week lw
            FULL OUTER JOIN prior_week pw ON lw.customer_id = pw.customer_id
            WHERE COALESCE(lw.rev, 0) - COALESCE(pw.rev, 0) <> 0
              AND COALESCE(lw.customer_id, pw.customer_id) NOT LIKE 'ABE-%'
            ORDER BY ABS(COALESCE(lw.rev, 0) - COALESCE(pw.rev, 0)) DESC
            LIMIT 3
        """)).fetchall()
    except Exception:
        return None
    if not rows:
        return None
    movers: list[dict[str, Any]] = []
    for r in rows:
        cid = str(r[0])
        delta = float(r[1])
        sign = "+" if delta >= 0 else "−"
        tone = "green" if delta >= 0 else "red"
        movers.append({
            "label": f"Customer {cid}",
            "value": f"{sign}€{abs(delta) / 1000:.1f}K WoW",
            "tone": tone,
            "sub": f"vs prior week · last week €{float(r[2]) / 1000:.1f}K",
        })
    return movers


def _movable_locked_live(db: Session) -> dict[str, Any] | None:
    """Movable/locked split — UNIFIED with Action Center's definition.

    D9: Both Action Center and Forecast must use the SAME movable rule so
    the two screens don't contradict each other. The canonical rule (from
    services.action_center.movable_hero) is:

        movable = article has a cost movement in the latest period
                  OR is in a running A/B test
        locked  = everything else

    We re-execute that SQL here and aggregate by revenue (LTM) so the
    forecast page surfaces the same € value.
    """
    try:
        row = db.execute(text("""
            WITH movable_articles AS (
              SELECT DISTINCT article_id FROM (
                SELECT article_id FROM product_cost_trends
                 WHERE period_start = (SELECT MAX(period_start) FROM product_cost_trends)
                UNION
                SELECT aid AS article_id FROM ab_tests WHERE status = 'running'
              ) m
            ),
            classified AS (
              SELECT i.article_id,
                     i.year, i.month, i.revenue,
                     CASE WHEN ma.article_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_movable
                FROM invoices i
                LEFT JOIN movable_articles ma ON ma.article_id = i.article_id
               WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
            )
            SELECT
              COALESCE(SUM(revenue) FILTER (WHERE is_movable), 0) AS movable_rev,
              COALESCE(SUM(revenue), 0) AS total_rev
            FROM classified
        """)).fetchone()
    except Exception:
        return None
    if not row:
        return None
    movable = float(row[0] or 0)
    total = float(row[1] or 0)
    locked = total - movable
    if total <= 0:
        return None
    movable_pct = round(movable / total * 100)
    return {
        "label": "Movable / Locked",
        "value": f"{movable_pct}% / {100 - movable_pct}%",
        "movablePct": movable_pct,
        "sub": (
            f"€{movable / 1e6:.2f}M movable · €{locked / 1e6:.2f}M locked "
            "(movable = SKU had a cost movement in the latest period OR is in "
            "a running A/B test — same rule as Action Center)"
        ),
    }


def _why_band_moves_live(db: Session) -> dict[str, Any] | None:
    """Top 3 monthly seasonal index deviations from 100."""
    try:
        rows = db.execute(text("""
            SELECT month, AVG(seasonal_index) * 100 AS idx
            FROM seasonal_patterns
            WHERE entity_type = 'overall'
            GROUP BY month
            ORDER BY ABS(AVG(seasonal_index) * 100 - 100) DESC
            LIMIT 3
        """)).fetchall()
    except Exception:
        return None
    if not rows:
        return None
    month_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    band_rows = []
    for r in rows:
        m = int(r[0])
        idx = float(r[1])
        dev = idx - 100
        sign = "+" if dev >= 0 else "−"
        tone = "green" if dev >= 0 else "red"
        band_rows.append({
            "label": month_labels[m - 1],
            "value": f"{sign}{abs(dev):.1f}%",
            "tone": tone,
            "sub": (
                f"Seasonal index {idx:.1f} (anchor 100) · derived from 3-year "
                "monthly revenue pattern in seasonal_patterns."
            ),
        })
    return {
        "title": "Why the band moves",
        "sub": "seasonality annotations (live from seasonal_patterns)",
        "rows": band_rows,
    }


async def hero(
    *, horizon: int | None, db: Session | None = None, mode: str = "revenue"
) -> dict[str, Any]:
    block = dict(load_seed()["hero"])
    if horizon and isinstance(block.get("series"), dict):
        # Phase 7 carries the seed series; the param is wired so callers
        # stay forward-compatible with the live walk-forward.
        block["activeHorizon"] = horizon

    # Real-data overlays for the three sub-blocks
    block["moversSource"] = "synthetic"
    block["movableLockedSource"] = "synthetic"
    block["whyBandMovesSource"] = "synthetic"

    if db is not None:
        # Replace the seed series with a real per-mode walk-forward (Round 4 fix).
        # The seed shipped monthly values 10x too high (€5–8M/mo instead of ~€500K/mo).
        try:
            from .real_hero import build_hero as _build_hero_live  # noqa: WPS433

            live = _build_hero_live(db, mode=mode, horizon_months=horizon or 12)
            if live and live.get("series"):
                block["series"] = live["series"]
                block["caption"] = live["caption"]
                block["mode"] = live["mode"]
                block["unit"] = live["unit"]
                block["heroSeriesSource"] = "live"
                block["intervals"] = live.get("intervals")
                # D8: surface forecast-only 12mo sum so the FE KPI tile
                # matches the chart (forward-only months).
                if "forecast12moTotal" in live:
                    block["forecast12moTotal"] = live["forecast12moTotal"]
        except Exception:
            block["heroSeriesSource"] = "seed_fallback"

        movers = _hero_movers_live(db)
        if movers:
            block["movers"] = movers
            block["moversSource"] = "live"
        mlocked = _movable_locked_live(db)
        if mlocked:
            block["movableLockedSplit"] = mlocked
            block["movableLockedSource"] = "live"
        why = _why_band_moves_live(db)
        if why:
            block["whyBandMoves"] = why
            block["whyBandMovesSource"] = "live"

    # If we replaced the series with real data we already have proper
    # intervals from real_hero — skip the re-enrichment which would otherwise
    # overwrite them with the seed math.
    if block.get("heroSeriesSource") == "live":
        return block
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


async def input_cost(*, db: Session | None = None) -> Any:
    if db is None:
        seed = load_seed()["inputCost"]
        seed = dict(seed)
        seed["source"] = "synthetic"
        return seed
    try:
        return _build_input_cost_live(db)
    except Exception:
        seed = load_seed()["inputCost"]
        seed = dict(seed)
        seed["source"] = "synthetic"
        return seed


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
