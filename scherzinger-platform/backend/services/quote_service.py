from sqlalchemy.orm import Session
from sqlalchemy import text
from scipy import stats
import numpy as np


def get_quote_summary(db: Session, year: int = None):
    where = "1=1"
    params = {}
    if year:
        where = "year = :year"
        params["year"] = year

    row = db.execute(text(f"""
        SELECT
            COUNT(*),
            SUM(CASE WHEN is_won THEN 1 ELSE 0 END),
            SUM(CASE WHEN NOT is_won THEN 1 ELSE 0 END),
            COALESCE(SUM(revenue), 0),
            COALESCE(SUM(CASE WHEN is_won THEN revenue ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN NOT is_won THEN revenue ELSE 0 END), 0)
        FROM quotes WHERE {where}
    """), params).fetchone()

    total = row[0]
    won = row[1]
    return {
        "total_quotes": total,
        "won_count": won,
        "lost_count": row[2],
        "win_rate": won / total if total > 0 else 0,
        "total_quoted_revenue": float(row[3]),
        "won_revenue": float(row[4]),
        "lost_revenue": float(row[5]),
    }


def get_win_rate_by_year(db: Session):
    rows = db.execute(text("""
        SELECT year,
            COUNT(*),
            SUM(CASE WHEN is_won THEN 1 ELSE 0 END),
            SUM(CASE WHEN NOT is_won THEN 1 ELSE 0 END),
            COALESCE(SUM(CASE WHEN is_won THEN revenue ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN NOT is_won THEN revenue ELSE 0 END), 0)
        FROM quotes GROUP BY year ORDER BY year
    """)).fetchall()

    return [
        {
            "year": r[0], "total": r[1], "won": r[2], "lost": r[3],
            "win_rate": r[2] / r[1] if r[1] > 0 else 0,
            "won_revenue": float(r[4]), "lost_revenue": float(r[5]),
        }
        for r in rows
    ]


def get_win_rate_by_deal_size(db: Session):
    rows = db.execute(text("""
        SELECT
            CASE
                WHEN revenue < 1000 THEN '<€1K'
                WHEN revenue < 5000 THEN '€1-5K'
                WHEN revenue < 10000 THEN '€5-10K'
                WHEN revenue < 50000 THEN '€10-50K'
                ELSE '>€50K'
            END as band,
            COUNT(*),
            SUM(CASE WHEN is_won THEN 1 ELSE 0 END),
            SUM(CASE WHEN NOT is_won THEN 1 ELSE 0 END),
            SUM(revenue),
            CASE
                WHEN revenue < 1000 THEN 1
                WHEN revenue < 5000 THEN 2
                WHEN revenue < 10000 THEN 3
                WHEN revenue < 50000 THEN 4
                ELSE 5
            END as sort_order
        FROM quotes
        GROUP BY band, sort_order
        ORDER BY sort_order
    """)).fetchall()

    return [
        {
            "band_label": r[0], "count": r[1], "won": r[2], "lost": r[3],
            "win_rate": r[2] / r[1] if r[1] > 0 else 0,
            "total_revenue": float(r[4]),
        }
        for r in rows
    ]


def get_win_rate_by_customer(db: Session, top: int = 20):
    rows = db.execute(text("""
        SELECT customer_id,
            COUNT(*),
            SUM(CASE WHEN is_won THEN 1 ELSE 0 END),
            SUM(CASE WHEN NOT is_won THEN 1 ELSE 0 END),
            SUM(revenue)
        FROM quotes
        GROUP BY customer_id
        ORDER BY COUNT(*) DESC
        LIMIT :top
    """), {"top": top}).fetchall()

    return [
        {
            "customer_id": r[0], "total_quotes": r[1], "won": r[2], "lost": r[3],
            "win_rate": r[2] / r[1] if r[1] > 0 else 0,
            "total_revenue": float(r[4]) if r[4] else 0,
        }
        for r in rows
    ]


def get_rejection_codes(db: Session, year: int = 2025):
    warning = None
    if year < 2025:
        warning = "Rejection codes unreliable before 2025"

    # Total lost for the year — count + revenue, single round-trip.
    totals = db.execute(text("""
        SELECT COUNT(*), COALESCE(SUM(revenue), 0) FROM quotes
         WHERE NOT is_won AND year = :year AND rejection_code IS NOT NULL
    """), {"year": year}).fetchone()
    total_lost = int(totals[0] or 0)
    total_lost_revenue = float(totals[1] or 0)

    rows = db.execute(text("""
        SELECT q.rejection_code,
            rc.description_de, rc.description_en, rc.interpretation, rc.use_for_pricing,
            COUNT(*), COALESCE(SUM(q.revenue), 0)
        FROM quotes q
        LEFT JOIN rejection_codes rc ON q.rejection_code = rc.code
        WHERE NOT q.is_won AND q.year = :year AND q.rejection_code IS NOT NULL
        GROUP BY q.rejection_code, rc.description_de, rc.description_en, rc.interpretation, rc.use_for_pricing
        ORDER BY SUM(q.revenue) DESC NULLS LAST
    """), {"year": year}).fetchall()

    return [
        {
            "code": r[0], "description_de": r[1], "description_en": r[2],
            "interpretation": r[3], "use_for_pricing": r[4],
            "count": r[5], "revenue": float(r[6]),
            "pct_of_lost": r[5] / total_lost if total_lost > 0 else 0,
            "pct_of_lost_revenue": (
                float(r[6]) / total_lost_revenue if total_lost_revenue > 0 else 0
            ),
            "total_lost_count": total_lost,
            "total_lost_revenue": total_lost_revenue,
            "warning": warning,
        }
        for r in rows
    ]


def get_price_sensitivity(db: Session, year: int = 2025):
    # Won quotes
    won = db.execute(text("""
        SELECT db2_margin, revenue FROM quotes
        WHERE is_won AND year = :year AND db2_margin IS NOT NULL AND NOT dq_100pct_margin
    """), {"year": year}).fetchall()

    # Price-lost (PA, PR)
    price_lost = db.execute(text("""
        SELECT db2_margin, revenue FROM quotes
        WHERE NOT is_won AND year = :year AND rejection_code IN ('PA', 'PR')
            AND db2_margin IS NOT NULL AND NOT dq_100pct_margin
    """), {"year": year}).fetchall()

    # Non-price-lost
    other_lost = db.execute(text("""
        SELECT db2_margin, revenue FROM quotes
        WHERE NOT is_won AND year = :year
            AND (rejection_code IS NULL OR rejection_code NOT IN ('PA', 'PR'))
            AND db2_margin IS NOT NULL AND NOT dq_100pct_margin
    """), {"year": year}).fetchall()

    def group_stats(rows, name):
        if not rows:
            return {"group": name, "avg_margin": None, "median_margin": None, "count": 0, "revenue": 0}
        margins = [r[0] for r in rows]
        revenues = [r[1] for r in rows if r[1]]
        return {
            "group": name,
            "avg_margin": float(np.mean(margins)),
            "median_margin": float(np.median(margins)),
            "count": len(rows),
            "revenue": float(sum(revenues)),
        }

    groups = [
        group_stats(won, "won"),
        group_stats(price_lost, "price_lost"),
        group_stats(other_lost, "non_price_lost"),
    ]

    # T-test: won vs price-lost
    p_value = None
    if won and price_lost:
        won_margins = [r[0] for r in won]
        pl_margins = [r[0] for r in price_lost]
        _, p_value = stats.ttest_ind(won_margins, pl_margins)
        p_value = float(p_value)

    return {"groups": groups, "p_value": p_value}


def get_quote_to_invoice_gap(db: Session) -> dict:
    """Phase D / Batch 5 — quote-to-invoice margin leakage from quote_invoice_links.

    Mirrors scripts/link_quotes_invoices.py's gap-by-year breakdown
    (joining on quote_id + quote_position to avoid Cartesian inflation).
    This is the demo's headline pilot signal: median 1.9pp / mean 5.4pp.
    """
    overall = db.execute(text("""
        SELECT COUNT(*)                                              AS n,
               AVG(margin_gap)                                       AS mean_gap,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY margin_gap) AS median_gap,
               STDDEV_SAMP(margin_gap)                               AS std_gap
          FROM quote_invoice_links
         WHERE margin_gap IS NOT NULL
    """)).mappings().one_or_none()

    if not overall or not overall["n"]:
        return {"overall": None, "byYear": []}

    by_year_rows = db.execute(text("""
        SELECT EXTRACT(YEAR FROM q.date)::int                                    AS year,
               COUNT(*)                                                          AS n,
               AVG(l.margin_gap)                                                 AS mean_gap,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY l.margin_gap)         AS median_gap
          FROM quote_invoice_links l
          JOIN quotes q
            ON q.quote_id = l.quote_id AND q.position = l.quote_position
         WHERE l.margin_gap IS NOT NULL
         GROUP BY 1
         ORDER BY 1
    """)).mappings().all()

    def _pp(value):
        return None if value is None else round(float(value) * 100, 2)

    return {
        "overall": {
            "n": int(overall["n"]),
            "mean_gap_pp": _pp(overall["mean_gap"]),
            "median_gap_pp": _pp(overall["median_gap"]),
            "std_gap_pp": _pp(overall["std_gap"]),
        },
        "byYear": [
            {
                "year": int(r["year"]),
                "n": int(r["n"]),
                "mean_gap_pp": _pp(r["mean_gap"]),
                "median_gap_pp": _pp(r["median_gap"]),
            }
            for r in by_year_rows
        ],
    }


def get_conversion_timing(db: Session):
    row = db.execute(text("""
        SELECT
            AVG(days_to_invoice),
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_invoice),
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY days_to_invoice),
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_to_invoice),
            MIN(days_to_invoice),
            MAX(days_to_invoice)
        FROM quote_invoice_links
        WHERE days_to_invoice IS NOT NULL
    """)).fetchone()

    return {
        "mean": float(row[0]) if row[0] else 0,
        "median": float(row[1]) if row[1] else 0,
        "p25": float(row[2]) if row[2] else 0,
        "p75": float(row[3]) if row[3] else 0,
        "min_days": int(row[4]) if row[4] else 0,
        "max_days": int(row[5]) if row[5] else 0,
    }
