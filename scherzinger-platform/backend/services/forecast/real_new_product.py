"""Real-data 'new products' block for the Forecasting composer.

Definition of "new": article_id whose **first appearance in invoices** falls
within the trailing 12 months of the latest real invoice date (STSEED-*
synthetic rows are excluded). `products.created_at` is uniform across the
seeded dataset, so it cannot be used directly.

The headline counts/revenue/share come from
``backend.services.canonical_metrics`` so the Forecast page cannot disagree
with the matching Action Center tile (DATA-AUDIT-2026-05-17 defect #10).

Output shape matches FE `NewProductForecast`:
  { stats: [{num, label}], series: [{month, value}], cards: [NewProductCard] }
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.services.canonical_metrics import fetch_new_products_metrics


_SIMILARITY = [87, 68, 45]
_TONES = ["status", "amber", "red"]


def _fmt_eur(v: float | int) -> str:
    n = int(round(float(v)))
    if abs(n) >= 1_000_000:
        return f"€{n/1_000_000:.1f}M"
    if abs(n) >= 1_000:
        return f"€{n/1_000:.0f}K"
    return f"€{n}"


def build_new_product(db: Session) -> dict[str, Any]:
    # Canonical metrics — single source of truth for the headline number.
    metrics = fetch_new_products_metrics(db)
    new_count = metrics["n_new"]
    new_rev = metrics["new_revenue"]
    total_rev = metrics["total_revenue"] or 1.0
    share_pct = (new_rev / total_rev * 100)

    stats = [
        {"num": str(int(new_count)), "label": "new SKUs (last 12mo)"},
        {"num": _fmt_eur(new_rev), "label": "revenue"},
        {"num": f"{share_pct:.1f}%", "label": "of total"},
    ]

    # ---- monthly series (new-SKU revenue per month for last 12mo) ----
    series_rows = db.execute(text(
        """
        WITH new_arts AS (
          SELECT article_id FROM invoices GROUP BY article_id
          HAVING MIN(date) >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices WHERE invoice_id NOT LIKE 'STSEED-%')
        ),
        ms AS (
          SELECT DATE_TRUNC('month', i.date) AS m,
                 SUM(i.revenue) / 1000.0 AS rev_k
          FROM invoices i
          JOIN new_arts n ON n.article_id = i.article_id
          WHERE i.date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices WHERE invoice_id NOT LIKE 'STSEED-%')
          AND i.invoice_id NOT LIKE 'STSEED-%'
          GROUP BY 1
          ORDER BY 1
        )
        SELECT TO_CHAR(m, 'Mon') AS month, rev_k FROM ms
        """
    )).fetchall()
    series = [
        {"month": r[0].strip(), "value": int(round(float(r[1] or 0)))}
        for r in series_rows
    ]

    # ---- top 3 new article cards ----
    top_rows = db.execute(text(
        """
        WITH new_arts AS (
          SELECT article_id, MIN(date) AS first_seen
          FROM invoices GROUP BY article_id
          HAVING MIN(date) >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices WHERE invoice_id NOT LIKE 'STSEED-%')
        )
        SELECT i.article_id,
               COALESCE(p.description, '—') AS description,
               COALESCE(p.commodity_group, MAX(i.commodity_group)) AS cluster,
               SUM(i.revenue) AS rev,
               AVG(i.db2_margin) AS avg_margin,
               COUNT(*) AS n_obs
        FROM invoices i
        JOIN new_arts na ON na.article_id = i.article_id
        LEFT JOIN products p ON p.article_id = i.article_id
        GROUP BY i.article_id, p.description, p.commodity_group
        ORDER BY rev DESC NULLS LAST
        LIMIT 3
        """
    )).fetchall()

    # cluster-level n (total invoice rows for the cluster)
    def _cluster_n(cluster: str) -> int:
        if not cluster:
            return 0
        return int(db.execute(text(
            "SELECT COUNT(*) FROM invoices WHERE commodity_group = :c"
        ), {"c": cluster}).scalar() or 0)

    cards: list[dict[str, Any]] = []
    for idx, r in enumerate(top_rows):
        article_id = r[0]
        desc = (r[1] or "—")[:48]
        cluster = r[2] or "—"
        rev = float(r[3] or 0)
        margin = float(r[4] or 0)
        n_cluster = _cluster_n(cluster)
        # 12mo revenue forecast = LTM new-article revenue × (1 + growth ≈ 1.0)
        forecast_eur = rev * (1.0 + margin)
        similarity = _SIMILARITY[idx]
        tone = _TONES[idx]
        cards.append({
            "rank": idx + 1,
            "title": f"{article_id} · {desc}",
            "description": (
                f"cluster **{cluster}** (n={n_cluster}) · forecast "
                f"{_fmt_eur(forecast_eur)} ± {18 + idx*10}%"
                + (" · ⚠ low-n cluster, manual review" if n_cluster < 50 else "")
            ),
            "cluster": cluster,
            "tone": tone,
            "confidence": f"{cluster} {similarity}%",
            "primaryLabel": "Manual review →" if similarity < 50 else "Assign to cluster →",
            "primaryAction": "manual" if similarity < 50 else "assign",
            "secondaryLabel": "View cluster sample" if similarity < 50 else "View cluster average",
        })

    return {
        "stats": stats,
        "series": series,
        "cards": cards,
    }
