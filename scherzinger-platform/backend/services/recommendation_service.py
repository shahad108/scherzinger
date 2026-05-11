"""Per-SKU recommendation contract — single source of truth.

Phase 3 of the vision doc (§3.5, §4.2). One service computes a
``PerSkuRecommendation`` for any article_id; both ``/studio.skus[]`` and
``/action-center.skuTable[]`` carry the same shape under a
``recommendation`` field. Field names match the vision doc's canonical
list:

    recommended_price, floor, ceiling,
    cluster_id, cluster_confidence, top_drivers[3], movable_share,
    is_movable

The pricing logic is a transparent heuristic (cost-pass-through with
guardrails) for the pilot — the recommendation block carries a
``heuristic`` annotation so the UI can render an honest "pilot
heuristic, refined once optimiser lands" pill identical to the
movable-hero pattern.
"""
from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session


PASS_THROUGH_RATIO = 0.5      # 50% of cost movement passes through to price
FLOOR_GUARDRAIL = 0.97        # never recommend below 3% under current
CEILING_GUARDRAIL = 1.10      # never recommend above 10% over current
MOVABLE_THRESHOLD_PP = 0.05   # cost moves <5pp don't trigger a re-price


_BULK_SQL = text("""
WITH movable_articles AS (
  SELECT DISTINCT article_id FROM (
    SELECT article_id FROM product_cost_trends
     WHERE period_start = (SELECT MAX(period_start) FROM product_cost_trends)
    UNION
    SELECT aid AS article_id FROM ab_tests WHERE status = 'running'
  ) m
),
sku_revenue AS (
  SELECT i.article_id,
         SUM(i.revenue) AS revenue,
         AVG(i.revenue_per_unit) FILTER (WHERE i.revenue_per_unit IS NOT NULL) AS avg_unit_price,
         AVG(i.db2_margin) FILTER (WHERE i.db2_margin IS NOT NULL) AS avg_db2_margin
    FROM invoices i
   WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
   GROUP BY i.article_id
),
total_movable AS (
  SELECT SUM(sr.revenue) AS rev
    FROM sku_revenue sr
    JOIN movable_articles ma ON ma.article_id = sr.article_id
),
latest_cost AS (
  SELECT pct.article_id,
         pct.cost_change_pct,
         pct.avg_hkvoll_per_unit AS unit_cost
    FROM product_cost_trends pct
   WHERE pct.period_start = (SELECT MAX(period_start) FROM product_cost_trends)
)
SELECT p.article_id,
       p.commodity_group,
       sr.revenue,
       sr.avg_unit_price,
       sr.avg_db2_margin,
       lc.cost_change_pct,
       lc.unit_cost,
       CASE WHEN ma.article_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_movable,
       (SELECT rev FROM total_movable) AS total_movable_rev
  FROM products p
  LEFT JOIN sku_revenue sr ON sr.article_id = p.article_id
  LEFT JOIN latest_cost lc ON lc.article_id = p.article_id
  LEFT JOIN movable_articles ma ON ma.article_id = p.article_id
 WHERE p.article_id = ANY(:aids)
""")


_CLUSTER_CONFIDENCE_SQL = text("""
SELECT entity_id, MAX(metric_value) AS confidence
  FROM model_registry
 WHERE metric_name = 'directional_accuracy'
   AND entity_type = 'commodity_group'
   AND entity_id = ANY(:groups)
   AND metric_value IS NOT NULL
   AND COALESCE(n_observations, 0) >= 3
 GROUP BY entity_id
""")


def _round(value: Any, ndigits: int = 4) -> float | None:
    if value is None:
        return None
    return round(float(value), ndigits)


def _build_drivers(*, cost_change: float | None, is_movable: bool,
                   cluster_confidence: float | None) -> list[dict[str, Any]]:
    drivers: list[dict[str, Any]] = []

    if cost_change is not None:
        direction = "up" if cost_change >= 0 else "down"
        drivers.append({
            "code": "cost_change",
            "label": f"Unit cost {direction} {abs(cost_change) * 100:.1f}%",
            "weight": min(1.0, abs(cost_change) * 4),
            "tone": "negative" if cost_change >= 0 else "positive",
        })
    else:
        drivers.append({
            "code": "cost_change",
            "label": "No recent cost movement",
            "weight": 0.1,
            "tone": "neutral",
        })

    drivers.append({
        "code": "contract_status",
        "label": "Movable (pilot heuristic)" if is_movable else "Locked (pilot heuristic)",
        "weight": 0.9 if is_movable else 0.2,
        "tone": "positive" if is_movable else "neutral",
    })

    if cluster_confidence is not None:
        drivers.append({
            "code": "cluster_confidence",
            "label": f"Cluster pattern accuracy {cluster_confidence * 100:.0f}%",
            "weight": float(cluster_confidence),
            "tone": "positive" if cluster_confidence >= 0.6 else "neutral",
        })
    else:
        drivers.append({
            "code": "cluster_confidence",
            "label": "Cluster confidence unavailable",
            "weight": 0.1,
            "tone": "neutral",
        })

    return drivers[:3]


def get_sku_recommendations_bulk(
    db: Session, article_ids: Iterable[str]
) -> dict[str, dict[str, Any]]:
    """Compute PerSkuRecommendation for many article_ids in one round-trip.

    Returns ``{article_id: recommendation_dict}``. Article ids with no
    invoices or cost-trend data are still returned with the heuristic
    set to ``no_signal`` so the UI can render a neutral row.
    """
    aids = list({a for a in article_ids if a})
    if not aids:
        return {}

    rows = db.execute(_BULK_SQL, {"aids": aids}).mappings().all()

    commodity_groups = sorted({
        r["commodity_group"] for r in rows if r["commodity_group"]
    })
    confidence_by_group: dict[str, float] = {}
    if commodity_groups:
        for c in db.execute(
            _CLUSTER_CONFIDENCE_SQL, {"groups": commodity_groups}
        ).mappings().all():
            confidence_by_group[c["entity_id"]] = float(c["confidence"])

    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        aid = r["article_id"]
        current = float(r["avg_unit_price"]) if r["avg_unit_price"] else None
        cost_change = float(r["cost_change_pct"]) if r["cost_change_pct"] is not None else None
        is_movable = bool(r["is_movable"])
        revenue = float(r["revenue"]) if r["revenue"] else 0.0
        total_movable_rev = float(r["total_movable_rev"]) if r["total_movable_rev"] else 0.0
        commodity = r["commodity_group"]
        cluster_confidence = confidence_by_group.get(commodity) if commodity else None

        recommended = None
        floor = None
        ceiling = None
        recommended_was_clamped = False
        if current is not None:
            floor = current * FLOOR_GUARDRAIL
            ceiling = current * CEILING_GUARDRAIL
            if (
                cost_change is not None
                and abs(cost_change) >= MOVABLE_THRESHOLD_PP
                and is_movable
            ):
                raw = current * (1 + cost_change * PASS_THROUGH_RATIO)
                # Guardrails clamp — large cost moves don't escape the band.
                recommended = max(floor, min(ceiling, raw))
                if recommended != raw:
                    recommended_was_clamped = True
            else:
                recommended = current

        movable_share = (revenue / total_movable_rev) if (is_movable and total_movable_rev) else 0.0

        out[aid] = {
            "article_id": aid,
            "current_price": _round(current, 4),
            "recommended_price": _round(recommended, 4),
            "floor": _round(floor, 4),
            "ceiling": _round(ceiling, 4),
            "cluster_id": commodity,
            "cluster_confidence": _round(cluster_confidence, 4),
            "movable_share": _round(movable_share, 6),
            "is_movable": is_movable,
            "top_drivers": _build_drivers(
                cost_change=cost_change,
                is_movable=is_movable,
                cluster_confidence=cluster_confidence,
            ),
            "guardrail_clamped": recommended_was_clamped,
            "heuristic": {
                "label": "Pilot heuristic",
                "rule": (
                    f"recommended = current_price × (1 + cost_change × {PASS_THROUGH_RATIO}) "
                    f"when |cost_change| ≥ {MOVABLE_THRESHOLD_PP * 100:.0f}pp AND article is movable; "
                    f"otherwise recommended = current_price. floor = current × {FLOOR_GUARDRAIL}, "
                    f"ceiling = current × {CEILING_GUARDRAIL}."
                ),
                "qualifier": "Replaced by the trained optimiser once recommended-price model lands.",
            },
        }

    return out


def get_sku_recommendation(db: Session, article_id: str) -> dict[str, Any] | None:
    result = get_sku_recommendations_bulk(db, [article_id])
    return result.get(article_id)
