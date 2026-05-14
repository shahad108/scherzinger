"""Forecasting composer."""
from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import blocks
from .real_backtest import build_walk_forward as _build_walk_forward_live
from .real_clusters import build_clusters as _build_clusters_live
from .real_pareto import build_pareto as _build_pareto_live
from .real_price_floor import build_price_floor as _build_price_floor_live
from .real_new_product import build_new_product as _build_new_product_live
from .calibration import get_calibration
from .commodity_trajectories import get_commodity_trajectories
from .market_direction import get_market_direction
from .cost_decomposition import get_cost_decomposition
from .customers import get_top_at_risk_customers
from .distributions import get_distributions
from .margin_trajectory import get_margin_trajectory
from .methodology import get_methodology
from .quote_to_revenue import get_quote_to_revenue
from .seasonal_overlay import get_seasonal_overlay
from .tornado import get_tornado
# v2.1 — plan-first, pocket-margin, prescriptive bridge.
from .plan_tracking import build_plan_tracking
from .pocket_waterfall import build_pocket_waterfall
from .bias import build_bias
from .next_moves import build_next_moves
from .pipeline_p50 import build_pipeline_p50
from .real_hero import fetch_actuals_by_month as _fetch_actuals_by_month
import datetime as _dt
import logging as _logging

from sqlalchemy import text as _sql_text

_log = _logging.getLogger(__name__)

CACHE_TTL_SECONDS = 60
_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}


def invalidate_cache() -> None:
    _CACHE.clear()


# === v2.2 Phase A helpers — real-data inputs for the v2.1 composer fields.
# Kept top-level so they're individually testable and so build_forecast stays
# linear and readable.


def _actuals_by_month(
    db: Session | None,
    *,
    mode: str,
    cluster: str | None,
) -> dict[str, float]:
    """Wrap real_hero.fetch_actuals_by_month with a guard for the
    seed/no-DB path. Returns ``{}`` if anything goes wrong so plan-tracking
    can still compose (plan rows alone)."""
    if db is None:
        return {}
    try:
        return _fetch_actuals_by_month(db, mode=mode, cluster=cluster, months=24)
    except Exception:  # pragma: no cover — safety net
        return {}


def _pvm_attribution(
    db: Session | None,
    *,
    cluster: str | None,
) -> dict[str, float] | None:
    """Build a Price/Volume/Mix/Cost attribution dict for the *most recent
    closed month* vs the same month prior year, sourced from invoices.

    Decomposition (Δrev = revenue_now − revenue_yoy):
      • Price   = (avg_price_now − avg_price_yoy) × volume_yoy
      • Volume  = (volume_now − volume_yoy) × avg_price_yoy
      • Mix     = Δrev − Price − Volume         (residual; captures
                  commodity-group share shifts)
      • Cost    = (cost_now − cost_yoy) × volume_now      (negative when
                  costs rose — shown as a margin headwind)
    """
    if db is None:
        return None
    try:
        params: dict[str, Any] = {}
        cluster_clause = ""
        if cluster:
            cluster_clause = "AND commodity_group = :cluster"
            params["cluster"] = cluster
        row = db.execute(
            _sql_text(
                f"""
                WITH bounds AS (
                  SELECT (DATE_TRUNC('month', MAX(date)))::date AS last_month
                  FROM invoices
                  WHERE 1=1 {cluster_clause}
                )
                SELECT
                  SUM(CASE WHEN date >= bounds.last_month
                           THEN revenue ELSE 0 END) AS rev_now,
                  SUM(CASE WHEN date >= bounds.last_month
                           THEN quantity ELSE 0 END) AS qty_now,
                  SUM(CASE WHEN date >= bounds.last_month
                           THEN COALESCE(material_per_unit, 0) * quantity ELSE 0 END) AS cost_now,
                  SUM(CASE WHEN date >= (bounds.last_month - INTERVAL '12 months')
                            AND date < (bounds.last_month - INTERVAL '11 months')
                           THEN revenue ELSE 0 END) AS rev_yoy,
                  SUM(CASE WHEN date >= (bounds.last_month - INTERVAL '12 months')
                            AND date < (bounds.last_month - INTERVAL '11 months')
                           THEN quantity ELSE 0 END) AS qty_yoy,
                  SUM(CASE WHEN date >= (bounds.last_month - INTERVAL '12 months')
                            AND date < (bounds.last_month - INTERVAL '11 months')
                           THEN COALESCE(material_per_unit, 0) * quantity ELSE 0 END) AS cost_yoy
                FROM invoices, bounds
                WHERE 1=1 {cluster_clause}
                """
            ),
            params,
        ).fetchone()
        if row is None:
            return None
        rev_now = float(row[0] or 0)
        qty_now = float(row[1] or 0)
        cost_now_total = float(row[2] or 0)
        rev_yoy = float(row[3] or 0)
        qty_yoy = float(row[4] or 0)
        cost_yoy_total = float(row[5] or 0)
        if qty_yoy <= 0 and qty_now <= 0:
            return None
        avg_price_now = (rev_now / qty_now) if qty_now > 0 else 0.0
        avg_price_yoy = (rev_yoy / qty_yoy) if qty_yoy > 0 else avg_price_now
        unit_cost_now = (cost_now_total / qty_now) if qty_now > 0 else 0.0
        unit_cost_yoy = (cost_yoy_total / qty_yoy) if qty_yoy > 0 else unit_cost_now
        delta_rev = rev_now - rev_yoy
        price = (avg_price_now - avg_price_yoy) * qty_yoy
        volume = (qty_now - qty_yoy) * avg_price_yoy
        mix = delta_rev - price - volume
        # Cost shown as a margin impact (negative when costs rose).
        cost = -(unit_cost_now - unit_cost_yoy) * qty_now
        return {
            "price": float(price),
            "volume": float(volume),
            "mix": float(mix),
            "cost": float(cost),
        }
    except Exception:  # pragma: no cover — safety net
        return None


def _per_cluster_signed_errors(walk_forward: dict[str, Any]) -> dict[str, list[float]]:
    """Pull per-cluster signed errors from the walk-forward block.

    ``real_backtest.build_walk_forward`` was extended in this phase to emit
    a ``signedErrorsByCluster`` field; for the seed/no-DB fallback shape it
    is absent, in which case we return ``{}``.
    """
    if not isinstance(walk_forward, dict):
        return {}
    sec = walk_forward.get("signedErrorsByCluster")
    if not isinstance(sec, dict):
        return {}
    out: dict[str, list[float]] = {}
    for k, v in sec.items():
        if isinstance(v, list):
            out[str(k)] = [float(x) for x in v if isinstance(x, (int, float))]
    return out


def _open_quotes_payload(
    db: Session | None,
    *,
    cluster: str | None,
) -> list[dict[str, Any]]:
    """Pull open-quote book (close_month / value / tier / win_prob) from the
    same source ``quote_to_revenue`` reads. The dataset has no
    ``status='open'`` quotes — we treat the trailing-12-months quote book as
    "the pipeline at this run" and aggregate by close month."""
    if db is None:
        return []
    try:
        params: dict[str, Any] = {}
        cluster_clause = ""
        if cluster:
            cluster_clause = "AND commodity_group = :cluster"
            params["cluster"] = cluster
        rows = db.execute(
            _sql_text(
                f"""
                SELECT
                  TO_CHAR(q.date, 'YYYY-MM') AS close_month,
                  q.revenue,
                  (SELECT crs.risk_tier
                     FROM customer_risk_scores crs
                     WHERE crs.customer_id = q.customer_id
                     ORDER BY crs.score_date DESC NULLS LAST
                     LIMIT 1) AS risk_tier
                FROM quotes q
                WHERE q.status NOT IN ('cancelled')
                  AND q.date >= (SELECT MAX(date) - INTERVAL '12 months' FROM quotes)
                  {cluster_clause}
                """
            ),
            params,
        ).fetchall()
        # Map risk_tier (high/medium/low) → quote tier (A/B/C). Loose mapping
        # for the demo: high → A (highest-value, hardest to displace), medium
        # → B, low → C. Anything else falls through to the pipeline_p50 default.
        risk_map = {"high": "A", "medium": "B", "low": "C"}
        out: list[dict[str, Any]] = []
        for r in rows:
            cm = r[0]
            v = r[1]
            rt = r[2]
            if not cm or v is None:
                continue
            entry: dict[str, Any] = {"close_month": cm, "value": float(v)}
            tier = risk_map.get(str(rt).strip().lower()) if rt else None
            if tier:
                entry["tier"] = tier
            out.append(entry)
        return out
    except Exception:  # pragma: no cover — safety net
        return []


def _next_move_signals(
    payload: dict[str, Any],
    db: Session | None,
    cluster: str | None,
) -> dict[str, dict[str, Any]]:
    """Mine already-composed payload blocks for cluster-level moves.

    Synthesises per-cluster ``{forecast_impact_eur, skus_below_floor,
    signal, intent_kind, intent_context}`` dicts that ``build_next_moves``
    consumes. Signal sources:
      • ``priceFloor`` rows — SKUs below floor + their revenue
      • ``costDecomposition`` — material % rising (cost crossing list)
      • ``pareto`` — concentration / decline
      • Action-center rejection codes — lost quotes per code
    """
    signals: dict[str, dict[str, Any]] = {}
    # Price-floor breaches per commodity group.
    pf_rows = payload.get("priceFloor") or []
    for r in pf_rows:
        if not isinstance(r, dict):
            continue
        if not r.get("belowFloor"):
            continue
        cl_blk = r.get("cluster") or {}
        cl_label = cl_blk.get("label") if isinstance(cl_blk, dict) else None
        cl_key = (cl_label or "?").split(" ")[0]
        article = r.get("article")
        bucket = signals.setdefault(cl_key, {
            "skus_below_floor": 0,
            "forecast_impact_eur": 0.0,
            "signal": "SKUs below floor",
            "intent_kind": "partial_accept",
            "intent_articles": [],
        })
        bucket["skus_below_floor"] = int(bucket.get("skus_below_floor", 0)) + 1
        # Use a conservative €30k-per-SKU annualised impact placeholder
        # when the row doesn't carry an explicit euro figure (the FE
        # already shows the per-row detail).
        bucket["forecast_impact_eur"] = float(bucket.get("forecast_impact_eur", 0)) + 30000.0
        if article and len(bucket["intent_articles"]) < 5:
            bucket["intent_articles"].append(article)

    # Pareto: top customers with declining trend → renewal-queue cluster.
    pareto = payload.get("pareto") or {}
    cust_rows = (pareto.get("customer") or {}).get("rows") or []
    for r in cust_rows:
        if not isinstance(r, dict):
            continue
        if r.get("trendDir") != "down":
            continue
        cl_blk = r.get("cluster") or {}
        cl_label = cl_blk.get("label") if isinstance(cl_blk, dict) else None
        cl_key = (cl_label or "?").split(" ")[0]
        bucket = signals.setdefault(cl_key, {
            "forecast_impact_eur": 0.0,
            "signal": "declining customer",
            "intent_kind": "queue_renewal",
        })
        # Pull the EUR forecast string back into a number when possible.
        # real_pareto formats as "€2.1M", "€420K" or "€420 000" (NBSP-style).
        fc_str = str(r.get("forecast") or "")
        eur = 0.0
        try:
            cleaned = fc_str.replace("€", "").replace(" ", "").replace(",", "").replace("\xa0", "")
            if cleaned.endswith("M"):
                eur = float(cleaned[:-1]) * 1_000_000
            elif cleaned.endswith("K") or cleaned.endswith("k"):
                eur = float(cleaned[:-1]) * 1_000
            else:
                eur = float(cleaned)
        except Exception:
            eur = 0.0
        # 5% downside on a declining account.
        bucket["forecast_impact_eur"] = float(bucket.get("forecast_impact_eur", 0)) + eur * 0.05
        # Don't overwrite a stronger intent (partial_accept beats queue_renewal).
        bucket.setdefault("intent_kind", "queue_renewal")

    # Cost-decomposition: material% rising → cost-crossing-list signal,
    # stamped on every cluster that already has a bucket.
    cd = payload.get("costDecomposition") or {}
    layers = cd.get("layers") or []
    mat_rising = any(
        isinstance(l, dict) and l.get("trendDirection") == "up"
        and (l.get("name") or "").lower().startswith("material")
        for l in layers
    )
    if mat_rising and signals:
        for bucket in signals.values():
            bucket["signal"] = "cost crossing list price"

    # Lost-quote rejection codes (PA = competitor cheaper, PR = price too
    # high). Mine quotes per commodity_group in a recent 90-day window —
    # when a cluster crosses a meaningful threshold we surface a
    # "Tighten quoting" partial-accept move so Phase B's drawer can open
    # straight into the right remediation.
    try:
        rejection_buckets = _rejection_signals_by_cluster(db, threshold=3)
        for cl_key, rej in rejection_buckets.items():
            bucket = signals.setdefault(cl_key, {
                "forecast_impact_eur": 0.0,
                "signal": "quotes lost on price",
                "intent_kind": "partial_accept",
            })
            # Prefer the partial-accept intent over a weaker queue_renewal.
            bucket["intent_kind"] = "partial_accept"
            # Revenue carried by the lost quotes is a direct forecast risk.
            bucket["forecast_impact_eur"] = float(
                bucket.get("forecast_impact_eur", 0)
            ) + float(rej["lost_revenue_eur"])
            # Keep the most specific signal label.
            bucket["signal"] = (
                f"Tighten quoting on cluster {cl_key} — "
                f"{rej['lost_count']} quotes lost to {rej['top_code']} in last 90d"
            )
            # Carry rejectionCode through to the intent_context so Phase B
            # can deep-link the drawer with the right rejection filter.
            bucket["_rejection_code"] = rej["top_code"]
            bucket["_rejection_count"] = int(rej["lost_count"])
    except Exception as exc:  # pragma: no cover — composer-wide safety net
        _log.warning("rejection-signal mining failed: %s", exc)

    # Decorate buckets with the intent_context the Phase B frontend will use.
    for cl_key, bucket in signals.items():
        articles = bucket.pop("intent_articles", []) or []
        rej_code = bucket.pop("_rejection_code", None)
        rej_count = bucket.pop("_rejection_count", None)
        # Drop the keyword arg to avoid the build_next_moves headline using it.
        ctx_obj: dict[str, Any] = {
            "cluster": cl_key,
            "sourceScreen": "forecasting",
            "sourceKind": "next-cycle-move",
        }
        if articles:
            ctx_obj["articleId"] = articles[0]
            ctx_obj["articles"] = articles
        if rej_code:
            ctx_obj["rejectionCode"] = rej_code
            if rej_count is not None:
                ctx_obj["rejectionCount"] = rej_count
        bucket["intent_context"] = ctx_obj
    return signals


def _rejection_signals_by_cluster(
    db: Session | None,
    *,
    threshold: int = 3,
    window_days: int = 90,
) -> dict[str, dict[str, Any]]:
    """Aggregate PA/PR rejections per commodity_group in a recent window.

    Returns ``{cluster_key: {top_code, lost_count, lost_revenue_eur}}`` for
    clusters where at least ``threshold`` quotes were lost to PA or PR in
    the last ``window_days`` days. The 90-day window is anchored to the
    most-recent quote date in the table so the signal still fires on
    historical demo data (the live ledger ends 2025).
    """
    if db is None:
        return {}
    out: dict[str, dict[str, Any]] = {}
    try:
        anchor_row = db.execute(_sql_text(
            "SELECT MAX(date) FROM quotes WHERE rejection_code IN ('PA', 'PR')"
        )).fetchone()
        anchor = anchor_row[0] if anchor_row else None
        if anchor is None:
            return {}
        cutoff = anchor - _dt.timedelta(days=window_days)
        rows = db.execute(_sql_text("""
            SELECT commodity_group,
                   rejection_code,
                   COUNT(*) AS n,
                   COALESCE(SUM(revenue), 0) AS rev
              FROM quotes
             WHERE NOT is_won
               AND rejection_code IN ('PA', 'PR')
               AND date >= :cutoff
               AND commodity_group IS NOT NULL
             GROUP BY commodity_group, rejection_code
        """), {"cutoff": cutoff}).fetchall()
    except Exception as exc:  # pragma: no cover — schema-mismatch safety net
        _log.warning("rejection cluster query failed: %s", exc)
        return {}

    # Roll up per-cluster: total count, total revenue, dominant code.
    by_cluster: dict[str, dict[str, Any]] = {}
    for cg, code, n, rev in rows:
        cl_key = (cg or "?").split(" ")[0]
        b = by_cluster.setdefault(cl_key, {
            "lost_count": 0,
            "lost_revenue_eur": 0.0,
            "_by_code": {},
        })
        b["lost_count"] = int(b["lost_count"]) + int(n or 0)
        b["lost_revenue_eur"] = float(b["lost_revenue_eur"]) + float(rev or 0)
        b["_by_code"][str(code)] = int(b["_by_code"].get(str(code), 0)) + int(n or 0)

    for cl_key, b in by_cluster.items():
        if b["lost_count"] < threshold:
            continue
        by_code: dict[str, int] = b.pop("_by_code")
        top_code = max(by_code.items(), key=lambda kv: kv[1])[0] if by_code else "PA"
        out[cl_key] = {
            "lost_count": b["lost_count"],
            "lost_revenue_eur": b["lost_revenue_eur"],
            "top_code": top_code,
        }
    return out


async def build_forecast(
    *,
    user_id: str,
    persona: str,
    mode: str | None,
    horizon: int | None,
    tier: str | None,
    family: str | None,
    cluster: str | None,
    lang: str | None,
    db: Session | None = None,
) -> dict[str, Any]:
    if persona == "frank":
        pass
    elif persona == "till":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "till",
                "message": "Till Forecasting (collapsed Pareto, new-product hidden) coming in Phase 10.",
            },
        )
    elif persona == "heiko":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "heiko",
                "message": "Heiko forecasting (own-customer Pareto + price floor) coming in Phase 11.",
            },
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unknown persona"
        )

    key = (user_id, persona, mode, horizon, tier, family, cluster, lang)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    (
        header,
        hero,
        input_cost,
        pareto,
        price_floor,
        footnote,
        new_product,
    ) = await asyncio.gather(
        blocks.header(mode=mode),
        blocks.hero(
            horizon=horizon, db=db,
            mode=(mode if mode in ("revenue", "margin", "volume") else "revenue"),
        ),
        blocks.input_cost(db=db),
        blocks.pareto(tier=tier),
        blocks.price_floor(family=family),
        blocks.price_floor_footnote(),
        blocks.new_product(),
    )

    # Real-data swaps (phase 45) — replace the Pareto, Price-floor, and
    # New-product seed payloads with live queries when a DB session is
    # available. Each swap is independently guarded so one broken block
    # doesn't cascade.
    if db is not None:
        try:
            pareto = _build_pareto_live(db, tier=tier)
        except Exception:  # pragma: no cover — safety net
            pass
        try:
            price_floor = _build_price_floor_live(db, family=family)
        except Exception:  # pragma: no cover — safety net
            pass
        try:
            new_product = _build_new_product_live(db)
        except Exception:  # pragma: no cover — safety net
            pass

    # Real walk-forward backtest sourced from `backtest_results` (Phase 8 wiring).
    # Falls back to the seed if no DB session is supplied (legacy callers).
    if db is not None:
        try:
            walk_forward = _build_walk_forward_live(db)
        except Exception:  # pragma: no cover — safety net
            walk_forward = await blocks.walk_forward()
            walk_forward["source"] = "seed_fallback"
    else:
        walk_forward = await blocks.walk_forward()
        walk_forward["source"] = "seed_no_db"

    # Real cluster cards from `margin_forecasts` × `invoices` LTM (Phase 8 wiring).
    if db is not None:
        try:
            clusters_block = _build_clusters_live(
                db,
                horizon_months=horizon if horizon in (1, 3, 6, 12) else 12,
                only=cluster,
            )
        except Exception:
            clusters_block = await blocks.clusters(cluster=cluster)
    else:
        clusters_block = await blocks.clusters(cluster=cluster)

    # Phase 1 — simulator surface (tornado + distributions + mode toggle).
    # ``mode`` and ``horizon`` from the query string drive which slice of
    # ``monte_carlo_results`` we serve. ``db`` is None inside the BFF path —
    # the helpers fall back to the bundled seed in that case.
    active_mode = mode if mode in ("revenue", "margin", "volume") else "revenue"
    # Frontend uses "volume" / backend uses "quantity". Translate one way so
    # downstream filters match the persisted ``metric`` column.
    backend_metric = "quantity" if active_mode == "volume" else active_mode
    horizon_months = horizon if horizon in (3, 6, 12) else 12

    tornado = get_tornado(
        db=db,
        entity_type="commodity_group",
        metric=backend_metric,
        horizon_months=horizon_months,
    )
    distributions = get_distributions(
        db=db,
        entity_type="commodity_group",
        metric=backend_metric,
        horizon_months=horizon_months,
    )

    methodology = get_methodology(db=db)
    margin_trajectory = get_margin_trajectory(db=db)
    cost_decomposition = get_cost_decomposition(db=db)
    seasonal_overlay = get_seasonal_overlay(db=db)
    commodity_trajectories = get_commodity_trajectories(db=db)
    customers = get_top_at_risk_customers(db=db, risk_filter="all")
    quote_to_revenue = get_quote_to_revenue(db=db)
    calibration = get_calibration(db=db)
    market_direction = get_market_direction(db=db)

    payload = {
        "header": header,
        "hero": hero,
        "clusters": clusters_block,
        "walkForward": walk_forward,
        "inputCost": input_cost,
        "pareto": pareto,
        "priceFloor": price_floor,
        "priceFloorFootnote": footnote,
        "newProduct": new_product,
        "mode": {
            "active": active_mode,
            "horizonMonths": horizon_months,
        },
        "tornado": tornado,
        "distributions": distributions,
        "methodology": methodology,
        # Phase 3 — diagnostic charts.
        "marginTrajectory": margin_trajectory,
        "costDecomposition": cost_decomposition,
        "seasonalOverlay": seasonal_overlay,
        "commodityTrajectories": commodity_trajectories,
        # Phase 4 — per-customer preview (top at risk).
        "customers": customers,
        # Phase 6 — Quote-to-Revenue bridge + per-cluster CI calibration.
        "quoteToRevenue": quote_to_revenue,
        "calibration": calibration,
        # Phase 7 — Market direction widget.
        "marketDirection": market_direction,
    }

    # === v2.1 additions — all optional, render only when supplied.
    # Each compose call is independently guarded so a failure in any single
    # field cannot break the response. Graceful degradation is the contract.
    try:
        payload["planTracking"] = build_plan_tracking(
            mode=active_mode,
            cluster=cluster,
            actuals_by_month=_actuals_by_month(db, mode=active_mode, cluster=cluster),
            pvm_attribution=_pvm_attribution(db, cluster=cluster),
        )
    except Exception as e:  # pragma: no cover - safety net
        _log.warning("plan_tracking compose failed: %s", e)

    try:
        from .pocket_waterfall import build_pocket_waterfall_from_db
        payload["pocketWaterfall"] = build_pocket_waterfall_from_db(db, cluster=cluster)
    except Exception as e:  # pragma: no cover - safety net
        _log.warning("pocket_waterfall compose failed: %s", e)

    try:
        payload["bias"] = build_bias(cluster_errors=_per_cluster_signed_errors(walk_forward))
    except Exception as e:  # pragma: no cover - safety net
        _log.warning("bias compose failed: %s", e)

    try:
        payload["nextMoves"] = build_next_moves(
            cluster_signals=_next_move_signals(payload, db, cluster)
        )
    except Exception as e:  # pragma: no cover - safety net
        _log.warning("next_moves compose failed: %s", e)

    try:
        open_quotes_payload = _open_quotes_payload(db, cluster=cluster)
        pp50 = build_pipeline_p50(open_quotes=open_quotes_payload)
        pp50_map = {p["month"]: p["pipelineP50"] for p in pp50}
        # Hero series uses short month labels ("Jan", "Feb", ...) but the
        # quote close_month keys are "YYYY-MM". Build a label→p50 map by
        # taking the *latest* YYYY-MM per short label so the projected
        # future hero points pick up the right pipeline value.
        from .real_hero import _MONTH_NAMES as _MN  # type: ignore
        latest_ym_per_label: dict[str, str] = {}
        for ym in pp50_map.keys():
            try:
                mo = int(ym.split("-")[1])
                lbl = _MN[mo - 1]
                if lbl not in latest_ym_per_label or ym > latest_ym_per_label[lbl]:
                    latest_ym_per_label[lbl] = ym
            except Exception:
                continue
        label_map: dict[str, float] = {
            lbl: pp50_map[ym] for lbl, ym in latest_ym_per_label.items()
        }
        series = payload.get("hero", {}).get("series") or []
        for point in series:
            if isinstance(point, dict):
                lbl = point.get("month")
                if lbl in label_map:
                    point["pipelineP50"] = label_map[lbl]
                elif lbl in pp50_map:
                    point["pipelineP50"] = pp50_map[lbl]
        # Methodology footnote for win_prob-from-tier fallback.
        defaulted = sum(
            1 for q in open_quotes_payload
            if q.get("win_prob") is None
        )
        if defaulted and isinstance(payload.get("methodology"), dict):
            assumps = payload["methodology"].setdefault("assumptions", [])
            assumps.append({
                "label": "Pipeline P50",
                "value": (
                    f"{defaulted}/{len(open_quotes_payload)} quotes used "
                    "tier-default win-prob (A=0.65, B=0.45, C=0.25, D=0.10)."
                ),
            })
    except Exception as e:  # pragma: no cover - safety net
        _log.warning("pipeline_p50 compose failed: %s", e)

    # Canonical freshness signal — prefer methodology's data-through value,
    # fall back to "now" so the freshness chip always has *something* to render.
    try:
        m_assumptions = (methodology or {}).get("assumptions") or []
        dt_value = next((a.get("value") for a in m_assumptions if a.get("label") == "Data-through"), None)
        payload["dataThrough"] = dt_value or _dt.datetime.utcnow().isoformat() + "Z"
    except Exception:  # pragma: no cover - safety net
        payload["dataThrough"] = _dt.datetime.utcnow().isoformat() + "Z"

    # Filter scope — lets cards display "(unfiltered)" badges when the active
    # filter cannot be honored by their data source.
    payload["filterScope"] = {
        "tier": tier,
        "family": family,
        "cluster": cluster,
        "scenarioId": None,  # scenario_id is not currently plumbed into this composer
    }

    _CACHE[key] = (now, payload)
    return payload
