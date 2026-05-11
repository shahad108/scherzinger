"""Movable revenue hero — live from invoices × product_cost_trends.

The "movable" classification uses a transparent heuristic on what the
data actually exposes:

  movable = article has a cost movement in the latest period
            OR is in a running A/B test
  locked  = everything else

Once a real ``is_movable`` flag (or a contracts table) lands, swap the
classification CTE without changing the public shape.

The 14-week sparkline aggregates total movable revenue per ISO-week.
Falls back to seed on empty / failure so dev mode keeps rendering.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from backend.database import SessionLocal

from ._intents import movable_hero_action
from ._seed import ActionCenterBlockError


_BASE_SQL = """
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
"""


def _hero_kpis(db) -> dict[str, Any] | None:
    """Headline movable / locked totals + SKU counts."""
    row = (
        db.execute(
            text(
                _BASE_SQL
                + """
                SELECT
                  COALESCE(SUM(revenue) FILTER (WHERE is_movable), 0) AS movable_rev,
                  COALESCE(SUM(revenue), 0) AS total_rev,
                  COUNT(DISTINCT article_id) FILTER (WHERE is_movable) AS movable_skus,
                  COUNT(DISTINCT article_id) AS total_skus
                FROM classified
                """
            )
        )
        .mappings()
        .one_or_none()
    )
    if not row or float(row["total_rev"] or 0) == 0:
        return None
    movable = float(row["movable_rev"])
    total = float(row["total_rev"])
    movable_pct = round(movable / total * 100) if total else 0
    return {
        "movable": movable,
        "total": total,
        "locked": total - movable,
        "movable_pct": movable_pct,
        "locked_pct": 100 - movable_pct,
        "movable_skus": int(row["movable_skus"] or 0),
        "total_skus": int(row["total_skus"] or 0),
    }


def _spark(db) -> list[float]:
    """Per-month movable revenue (€M) for the last 14 months."""
    rows = (
        db.execute(
            text(
                _BASE_SQL
                + """
                SELECT
                  year, month,
                  COALESCE(SUM(revenue) FILTER (WHERE is_movable), 0) AS movable
                FROM classified
                GROUP BY year, month
                ORDER BY year, month
                """
            )
        )
        .mappings()
        .all()
    )
    series = [float(r["movable"]) / 1_000_000 for r in rows]
    return series[-14:] if series else []


def _format_eur_m(value: float) -> str:
    if value >= 1_000_000:
        return f"€{value / 1_000_000:.2f}M"
    if value >= 1_000:
        return f"€{value / 1_000:.0f}k"
    return f"€{value:,.0f}"


def _delta_label(spark: list[float]) -> tuple[str, str]:
    """+/-X% vs the previous period from the sparkline tail."""
    if len(spark) < 2:
        return "—", "flat"
    last = spark[-1]
    prev = spark[-2]
    if prev == 0:
        return "—", "flat"
    pct = (last - prev) / prev * 100
    if abs(pct) < 0.5:
        return f"{pct:+.1f}% vs prev", "flat"
    direction = "up" if pct > 0 else "down"
    return f"{pct:+.1f}% vs prev", direction


def _with_action(hero: dict[str, Any]) -> dict[str, Any]:
    if "action" not in hero:
        hero["action"] = movable_hero_action()
    return hero


async def build(*, week: str | None, cluster: str | None) -> dict[str, Any]:
    try:
        with SessionLocal() as db:
            kpis = _hero_kpis(db)
            spark = _spark(db) if kpis else []
        if not kpis:
            raise ActionCenterBlockError(
                "movableHero", "Movable revenue signal unavailable."
            )

        delta_label, delta_dir = _delta_label(spark)

        return _with_action({
            "value": _format_eur_m(kpis["movable"]),
            "delta": delta_label,
            "deltaDirection": delta_dir,
            "totalRevenue": _format_eur_m(kpis["total"]),
            "movablePct": kpis["movable_pct"],
            "skusInScope": kpis["movable_skus"],
            "skusTotal": kpis["total_skus"],
            "lockedValue": _format_eur_m(kpis["locked"]),
            "lockedPct": kpis["locked_pct"],
            "spark": spark,
            "heuristic": {
                "label": "Pilot heuristic",
                "rule": (
                    "Movable = SKU had a cost movement in the latest period "
                    "OR is in a running A/B test. Everything else counts as locked."
                ),
                "qualifier": "Refined once contract data lands.",
            },
        })
    except ActionCenterBlockError:
        raise
    except Exception:
        raise ActionCenterBlockError(
            "movableHero", "Movable revenue signal unavailable."
        )
