"""SKU pricing engine table.

Live join: ``products`` × ``invoices`` (current vs prior year margin) ×
``product_cost_trends`` (latest cost movement). Each row is shaped to
match the frontend's ``{article, description, commodity, clusterConf,
clusterTone, marginDelta, marginTone, status, statusLabel, actionLabel}``
contract so the table component is unchanged.

Sort order: largest margin drop first (negative-tone rows surface at the
top), then by cluster confidence. Honours ?cluster= and ?hide_locked=.
Paginated by ``limit`` (default 50, max 200).
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from backend.database import SessionLocal
from backend.services import recommendation_service

from ._intents import sku_action
from ._seed import ActionCenterBlockError
from .decisions import _active_model_card


def _tone(value: float) -> str:
    if value <= -0.05:
        return "negative"
    if value >= 0.02:
        return "positive"
    return "neutral"


def _cluster_tone(conf: int) -> str:
    if conf >= 80:
        return "high"
    if conf >= 60:
        return "medium"
    return "low"


def _conf_tone_std(score: int) -> str:
    """Map confidence score to the standardised {high, mid, low} tone used
    by decision rows and the new SkuTable confidence chip. Aligned with
    ``decisions._conf_tone`` so both blocks share a vocabulary.
    """
    if score >= 75:
        return "high"
    if score >= 50:
        return "mid"
    return "low"


def _price_bounds_for(db, aids: list[str]) -> dict[str, dict[str, float | None]]:
    """Pull ``price_state.floor`` / ``ceiling`` for the given article ids.

    Returns ``{aid: {floor, ceiling}}``. Missing rows are absent from the
    map; callers default both fields to ``None``. Schema check, plan §2.9
    B20: the column is ``aid`` (not ``article_id``) — see
    ``backend/models/pricing/pricing_state.py``.
    """
    if not aids:
        return {}
    try:
        rows = (
            db.execute(
                text(
                    """
                    SELECT aid, floor, ceiling
                      FROM price_state
                     WHERE aid = ANY(:aids)
                    """
                ),
                {"aids": list(aids)},
            )
            .mappings()
            .all()
        )
    except Exception:
        return {}
    out: dict[str, dict[str, float | None]] = {}
    for r in rows:
        aid = str(r["aid"])
        floor = r["floor"]
        ceil = r["ceiling"]
        out[aid] = {
            "floor": float(floor) if floor is not None else None,
            "ceiling": float(ceil) if ceil is not None else None,
        }
    return out


def _last_move_days_for(db, aids: list[str]) -> dict[str, int]:
    """Days since last ``price_set``-class event in ``pricing_audit``.

    The audit table is the canonical source for "when did this SKU's
    published price last change" — ``price_state.last_set_at`` follows it
    one-to-one but the audit log is what surfaces in the Studio history
    strip, so we read the same row here. Plan §2.9 B21.

    Missing audit rows → entry omitted; callers treat as ``None`` rather
    than ``0`` (which would lie about freshness).
    """
    if not aids:
        return {}
    try:
        rows = (
            db.execute(
                text(
                    """
                    SELECT target_id, MAX(at) AS last_at
                      FROM pricing_audit
                     WHERE target_kind = 'sku'
                       AND target_id = ANY(:aids)
                     GROUP BY target_id
                    """
                ),
                {"aids": list(aids)},
            )
            .mappings()
            .all()
        )
    except Exception:
        return {}
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    out: dict[str, int] = {}
    for r in rows:
        last_at = r["last_at"]
        if last_at is None:
            continue
        try:
            if last_at.tzinfo is None:
                last_at = last_at.replace(tzinfo=timezone.utc)
            delta = (now - last_at).days
            out[str(r["target_id"])] = max(0, int(delta))
        except Exception:
            continue
    return out


def _sample_sizes_for(db, aids: list[str]) -> dict[str, int]:
    """Quote-invoice link count per article — drives the cluster
    confidence chip's ``sampleSize``. Plan §2.9 B22.
    """
    if not aids:
        return {}
    try:
        rows = (
            db.execute(
                text(
                    """
                    SELECT article_id, COUNT(*) AS n
                      FROM quote_invoice_links
                     WHERE article_id = ANY(:aids)
                     GROUP BY article_id
                    """
                ),
                {"aids": list(aids)},
            )
            .mappings()
            .all()
        )
    except Exception:
        return {}
    return {str(r["article_id"]): int(r["n"] or 0) for r in rows}


def _live_rows(db, *, cluster: str | None, hide_locked: bool, limit: int) -> list[dict[str, Any]]:
    """Build SKU pricing engine rows directly from invoices + products.

    Uses a single SQL pass that:
      - aggregates invoice db2_margin by article × year
      - pulls the latest cost movement from product_cost_trends
      - infers contract status from cost_change pattern (movable when
        cost has risen recently AND no recent quote update; locked when
        the article has an active long-term contract; abtest when the
        article appears in ab_tests with status='running').
    """
    where_cluster = "AND p.commodity_group = :cluster" if cluster else ""
    rows = (
        db.execute(
            text(
                f"""
                WITH yearly AS (
                  SELECT i.article_id,
                         i.year,
                         AVG(i.db2_margin) AS avg_margin,
                         COUNT(*) AS records
                    FROM invoices i
                   WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
                     AND i.db2_margin IS NOT NULL
                  GROUP BY i.article_id, i.year
                ),
                pivoted AS (
                  SELECT article_id,
                         MAX(avg_margin) FILTER (WHERE year = (SELECT MAX(year) FROM yearly))      AS this_year,
                         MAX(avg_margin) FILTER (WHERE year = (SELECT MAX(year) FROM yearly) - 1)  AS last_year,
                         SUM(records)                                                              AS total_records
                    FROM yearly
                  GROUP BY article_id
                ),
                latest_cost AS (
                  SELECT article_id, cost_change_pct
                    FROM product_cost_trends
                   WHERE period_start = (SELECT MAX(period_start) FROM product_cost_trends)
                ),
                running_ab AS (
                  SELECT DISTINCT aid AS article_id FROM ab_tests WHERE status = 'running'
                )
                SELECT p.article_id,
                       p.description,
                       p.commodity_group,
                       pv.this_year,
                       pv.last_year,
                       pv.total_records,
                       lc.cost_change_pct,
                       (ra.article_id IS NOT NULL) AS in_ab
                  FROM pivoted pv
                  JOIN products p ON p.article_id = pv.article_id
             LEFT JOIN latest_cost lc ON lc.article_id = pv.article_id
             LEFT JOIN running_ab ra ON ra.article_id = pv.article_id
                 WHERE pv.this_year IS NOT NULL
                   {where_cluster}
                ORDER BY (COALESCE(pv.last_year, 0) - pv.this_year) DESC NULLS LAST,
                         pv.total_records DESC
                LIMIT :limit
                """
            ),
            {"cluster": cluster, "limit": max(1, min(limit, 200))},
        )
        .mappings()
        .all()
    )

    out: list[dict[str, Any]] = []
    for r in rows:
        article = str(r["article_id"])
        description = str(r["description"]) if r["description"] else "—"
        commodity = str(r["commodity_group"]) if r["commodity_group"] else "—"
        this_y = float(r["this_year"]) if r["this_year"] is not None else None
        last_y = float(r["last_year"]) if r["last_year"] is not None else None
        in_ab = bool(r["in_ab"])
        cost_change = float(r["cost_change_pct"]) if r["cost_change_pct"] is not None else 0.0
        records = int(r["total_records"] or 0)

        # Outlier guard: margins outside [-100%, 100%] are almost always
        # data-quality artefacts (zero-revenue rows, sign-flipped costs).
        # Surface "n/a" rather than €−261% so analysts don't chase noise.
        def _safe(v: float | None) -> float | None:
            if v is None:
                return None
            return v if -1.0 <= v <= 1.0 else None

        sane_this = _safe(this_y)
        sane_last = _safe(last_y)

        if sane_this is None or sane_last is None:
            margin_delta = "n/a"
            margin_tone = "neutral"
            drop_pp = 0.0
            outlier = True
        else:
            margin_delta = f"{sane_last * 100:.1f}% → {sane_this * 100:.1f}%"
            drop_pp = (sane_this - sane_last) * 100
            margin_tone = _tone(sane_this - sane_last)
            outlier = False

        # Contract status inference.
        if outlier:
            status, status_label = "outlier", "Data check"
        elif in_ab:
            status, status_label = "abtest", "A/B"
        elif cost_change >= 0.10 and drop_pp <= -2:
            status, status_label = "movable", "Movable"
        elif drop_pp >= -1:
            status, status_label = "locked", "Locked"
        else:
            status, status_label = "movable", "Movable"

        if hide_locked and status == "locked":
            continue

        # Cluster confidence: real proxy from invoice sample size.
        # log10(records+1) * 30 saturates at ~95% by ~3000 records, ~70% at
        # 100, ~50% at 10. n<3 returns 'low' confidence rather than the old
        # 40% floor that was identical for every SKU.
        import math
        if records >= 3:
            conf = max(45, min(95, int(math.log10(records + 1) * 30 + 35)))
        else:
            conf = max(20, records * 8)  # 0..24 for n<3

        out.append({
            "article": article,
            "description": description,
            "commodity": commodity,
            "clusterConf": conf,
            "clusterTone": _cluster_tone(conf),
            # Standardised confidence block (plan §2.9 B22) — same shape
            # decision rows carry (``_active_model_card``-backed). The
            # composer below fills sampleSize + model after the bulk
            # queries fire so we don't round-trip per row.
            "confidence": {
                "score": conf,
                "sampleSize": None,
                "tone": _conf_tone_std(conf),
                "model": {"id": None, "version": None, "trainedAt": None},
            },
            "marginDelta": margin_delta,
            "marginTone": margin_tone,
            "status": status,
            "statusLabel": status_label,
            "actionLabel": "Open in Studio" if status != "locked" else "View renewal",
            "action": sku_action(article_id=article, status=status),
            # Plan §2.9 B20/B21 — defaults are ``None``; populated in
            # ``build()`` once the bulk lookups complete.
            "priceBookFloor": None,
            "priceBookCeiling": None,
            "lastMoveDays": None,
        })
    return out


async def build(*, cluster: str | None, hide_locked: bool, limit: int = 50) -> list[dict[str, Any]]:
    capped = max(1, min(limit, 200))
    try:
        with SessionLocal() as db:
            rows = _live_rows(db, cluster=cluster, hide_locked=hide_locked, limit=capped)
            # Phase 3 — every SKU row carries the canonical per-SKU
            # recommendation contract under `recommendation`. Same shape
            # served by /studio.skus[] so one component reads both pages.
            aids = [r["article"] for r in rows]
            recs = recommendation_service.get_sku_recommendations_bulk(db, aids)
            # Plan §2.9 B20/B21/B22 — bulk-load the new per-row fields.
            bounds = _price_bounds_for(db, aids)
            stale = _last_move_days_for(db, aids)
            samples = _sample_sizes_for(db, aids)
            model_card = _active_model_card(db)
            for r in rows:
                aid = r["article"]
                r["recommendation"] = recs.get(aid)
                b = bounds.get(aid)
                if b is not None:
                    r["priceBookFloor"] = b["floor"]
                    r["priceBookCeiling"] = b["ceiling"]
                if aid in stale:
                    r["lastMoveDays"] = stale[aid]
                # Promote confidence to standardised shape — share the
                # ``_active_model_card`` row decision cards use.
                sample = samples.get(aid)
                conf = r["confidence"]
                conf["sampleSize"] = int(sample) if sample is not None else None
                conf["model"] = dict(model_card)
        return rows
    except Exception:
        raise ActionCenterBlockError("skuTable", "SKU pricing table unavailable.")
