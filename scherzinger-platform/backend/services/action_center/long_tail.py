"""Long-tail coverage — Pareto bin of revenue concentration.

Computes the A/B/C tiers (top 10% / mid 40% / bottom 50%) of articles by
revenue and the trust-strip tiles:

  * Top-10 SKU concentration — share of revenue from the top 10 SKUs
  * SKUs below DB-II target — count of articles with avg db2_margin < 20%
  * New products (last 12mo) — articles whose first invoice is recent
  * C-tier price-frozen — C-tier articles with no cost movement in the
    last 9 months

The Top-10 SKU concentration and "new products" tiles delegate to
``backend.services.canonical_metrics`` so they cannot disagree with the
matching headlines elsewhere in the app (DATA-AUDIT-2026-05-17 defects
#9 and #10). The window is trailing 12 months anchored to the latest
real invoice date, STSEED-* synthetic rows excluded.

Falls back to seed on empty / failure.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from backend.database import SessionLocal
from backend.services.canonical_metrics import (
    WINDOW_LABEL,
    fetch_new_products_metrics,
    fetch_top10_concentration,
)

from ._seed import ActionCenterBlockError

DB2_TARGET = 0.20  # 20% — the canonical DB-II floor in the seed.


def _format_pct(value: float | int) -> str:
    return f"{int(round(value))}%"


def _format_int(value: int) -> str:
    return f"{value:,}".replace(",", ",")


def _live_payload(db) -> dict[str, Any] | None:
    """Single round of queries — short enough to keep in one helper."""
    # Per-article revenue + margin for the trailing year. STSEED-* rows are
    # excluded so the A/B/C bands + below-target count match the canonical
    # top-10 concentration computed by canonical_metrics.
    rows = (
        db.execute(
            text(
                """
                SELECT i.article_id,
                       SUM(i.revenue) AS revenue,
                       AVG(i.db2_margin) AS avg_margin
                  FROM invoices i
                 WHERE i.invoice_id NOT LIKE 'STSEED-%'
                   AND i.date >= (SELECT MAX(date) FROM invoices WHERE invoice_id NOT LIKE 'STSEED-%') - INTERVAL '12 months'
                   AND i.revenue IS NOT NULL
                 GROUP BY i.article_id
                """
            )
        )
        .mappings()
        .all()
    )
    if not rows:
        return None

    revs = sorted([float(r["revenue"] or 0) for r in rows], reverse=True)
    n = len(revs)
    total_rev = sum(revs)
    if total_rev == 0:
        return None

    # Canonical Top-10 concentration (DATA-AUDIT-2026-05-17 defect #9).
    # Pulled from the shared helper so Forecast + Action Center cannot
    # disagree. We still compute A/B/C bands locally because those use
    # the same per-article revenue list we already loaded.
    top10_metrics = fetch_top10_concentration(db)
    a_n = max(1, int(n * 0.10))
    b_n = max(1, int(n * 0.40))
    a_share = sum(revs[:a_n]) / total_rev
    b_share = sum(revs[a_n : a_n + b_n]) / total_rev
    c_share = max(0.0, 1 - a_share - b_share)

    below_target = sum(
        1 for r in rows if r["avg_margin"] is not None and float(r["avg_margin"]) < DB2_TARGET
    )

    # Canonical new-products metrics (DATA-AUDIT-2026-05-17 defect #10).
    np_metrics = fetch_new_products_metrics(db)

    # C-tier articles (bottom 50% by revenue) with no cost movement recently.
    c_articles = [r["article_id"] for r in rows[a_n + b_n :]]
    if c_articles:
        frozen = (
            db.execute(
                text(
                    """
                    SELECT COUNT(*) FROM products p
                     WHERE p.article_id = ANY(:ids)
                       AND p.article_id NOT IN (
                         SELECT article_id FROM product_cost_trends
                         WHERE period_start >= CURRENT_DATE - INTERVAL '9 months'
                       )
                    """
                ),
                {"ids": list(c_articles)},
            ).scalar()
            or 0
        )
    else:
        frozen = 0

    # Canonical new-products numbers — DENOMINATOR is the trailing-12-month
    # total from canonical_metrics, NOT the locally-loaded total_rev (which
    # can differ slightly when a few invoices have NULL revenue).
    new_p_n = int(np_metrics["n_new"])
    new_p_rev = float(np_metrics["new_revenue"])
    new_total = float(np_metrics["total_revenue"]) or 1.0
    new_pct = (new_p_rev / new_total * 100)

    tiles = [
        {
            "label": "Top-10 SKU concentration",
            "value": _format_pct(top10_metrics["share_pct"]),
            "caption": f"of revenue · {WINDOW_LABEL}",
        },
        {
            "label": "SKUs below DB-II target",
            "value": _format_int(below_target),
            "caption": f"target {int(DB2_TARGET * 100)}% · trailing 12 months",
        },
        {
            "label": "New products (last 12mo)",
            "value": _format_int(new_p_n),
            "caption": f"€{new_p_rev / 1_000_000:.1f}M revenue · {new_pct:.1f}% of total",
        },
        {
            "label": "C-tier price-frozen",
            "value": _format_int(int(frozen)),
            "caption": "no cost movement · last 9 months",
        },
    ]
    mix = [
        {
            "label": f"A · {int(round(a_share * 100))}%",
            "subtitle": "top 10% (well-covered)",
            "pct": int(round(a_share * 100)),
            "tone": "rose",
        },
        {
            "label": f"B · {int(round(b_share * 100))}%",
            "subtitle": "mid 40% (partial)",
            "pct": int(round(b_share * 100)),
            "tone": "amber",
        },
        {
            "label": f"C · {int(round(c_share * 100))}%",
            "subtitle": "bottom 50% (gap)",
            "pct": int(round(c_share * 100)),
            "tone": "muted",
        },
    ]
    return {
        "tiles": tiles,
        "mix": mix,
        "subhead": f"C-tier coverage gap — {int(frozen)} SKUs price-frozen >9 months.",
        "window": WINDOW_LABEL,
    }


async def build() -> dict[str, Any]:
    try:
        with SessionLocal() as db:
            payload = _live_payload(db)
        if payload is None:
            raise ActionCenterBlockError("longTail", "Long-tail coverage unavailable.")
        return payload
    except ActionCenterBlockError:
        raise
    except Exception:
        raise ActionCenterBlockError("longTail", "Long-tail coverage unavailable.")
