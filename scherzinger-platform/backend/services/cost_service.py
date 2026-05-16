from sqlalchemy.orm import Session
from sqlalchemy import text

# TODO(pricing-studio-v3/p1): when a real cost-ingest write path lands,
# call ``backend.services.pricing.recommendation.recompute(aid)`` for
# every article that moved so the Studio hero re-publishes
# ``pricing.recommendation_updated`` to SSE subscribers. Today this
# module is read-only; the hook lives in the recommendation service
# behind a unit-tested ``recompute(aid)`` entry point.


def get_cost_trends(db: Session, article_id: str = None, top: int = 20):
    if article_id:
        rows = db.execute(text("""
            SELECT article_id, period_start, period_end,
                avg_hkvoll_per_unit, avg_material_per_unit, avg_fek_per_unit, avg_fv_per_unit,
                cost_change_pct, record_count
            FROM product_cost_trends
            WHERE article_id = :aid
            ORDER BY period_start
        """), {"aid": article_id}).fetchall()
    else:
        rows = db.execute(text("""
            SELECT DISTINCT ON (article_id) article_id, period_start, period_end,
                avg_hkvoll_per_unit, avg_material_per_unit, avg_fek_per_unit, avg_fv_per_unit,
                cost_change_pct, record_count
            FROM product_cost_trends
            ORDER BY article_id, period_start DESC
            LIMIT :top
        """), {"top": top}).fetchall()

    return [
        {
            "article_id": r[0], "period_start": str(r[1]), "period_end": str(r[2]),
            "avg_hkvoll_per_unit": float(r[3]) if r[3] is not None else None,
            "avg_material_per_unit": float(r[4]) if r[4] is not None else None,
            "avg_fek_per_unit": float(r[5]) if r[5] is not None else None,
            "avg_fv_per_unit": float(r[6]) if r[6] is not None else None,
            "cost_change_pct": float(r[7]) if r[7] is not None else None,
            "record_count": r[8],
        }
        for r in rows
    ]


def get_cost_risers(db: Session, top: int = 20):
    rows = db.execute(text("""
        SELECT pct.article_id, pct.avg_hkvoll_per_unit, pct.cost_change_pct,
            pct.record_count, p.description, p.commodity_group
        FROM product_cost_trends pct
        JOIN products p ON pct.article_id = p.article_id
        WHERE pct.period_start = (SELECT MAX(period_start) FROM product_cost_trends)
            AND pct.cost_change_pct IS NOT NULL
        ORDER BY pct.cost_change_pct DESC
        LIMIT :top
    """), {"top": top}).fetchall()

    return [
        {
            "article_id": r[0],
            "avg_hkvoll_per_unit": float(r[1]) if r[1] is not None else None,
            "cost_change_pct": float(r[2]) if r[2] is not None else None,
            "record_count": r[3],
            "description": r[4], "commodity_group": r[5],
        }
        for r in rows
    ]


def get_seasonal_patterns(db: Session, entity_type: str = "overall", entity_id: str = None):
    if entity_id:
        rows = db.execute(text("""
            SELECT entity_type, entity_id, month, seasonal_index,
                avg_margin, avg_revenue, sample_count, years_included
            FROM seasonal_patterns
            WHERE entity_type = :etype AND entity_id = :eid
            ORDER BY month
        """), {"etype": entity_type, "eid": entity_id}).fetchall()
    else:
        rows = db.execute(text("""
            SELECT entity_type, entity_id, month, seasonal_index,
                avg_margin, avg_revenue, sample_count, years_included
            FROM seasonal_patterns
            WHERE entity_type = :etype AND entity_id IS NULL
            ORDER BY month
        """), {"etype": entity_type}).fetchall()

    return [
        {
            "entity_type": r[0], "entity_id": r[1], "month": r[2],
            "seasonal_index": float(r[3]),
            "avg_margin": float(r[4]) if r[4] is not None else None,
            "avg_revenue": float(r[5]) if r[5] is not None else None,
            "sample_count": r[6], "years_included": r[7],
        }
        for r in rows
    ]
