"""Canonical SQL fragments for metrics that must agree across screens.

DATA-AUDIT-2026-05-17 defects #9 and #10 surfaced two-way and three-way
disagreements between the Action Center, the Forecast screen, and raw
parquet/DB because each builder had its own subtly-different SQL:

* "Top-10 SKU concentration" — varied because some builders included
  STSEED-* synthetic rows and used different time windows.
* "New products (last 12 months)" — Action Center said 284, Forecast
  said 209, raw parquet said 205. Three definitions, three numbers.

This module centralises the canonical SQL so that ANY screen that surfaces
these headlines pulls the SAME number. If you need to change a definition,
change it HERE and only here.
"""
from __future__ import annotations

from typing import Final

from sqlalchemy import text

# Exclude synthetic seed invoices from any user-facing aggregation.
# STSEED-* rows are inserted by the seed pipeline to keep the DB warm
# during demos but they pollute concentration/share/new-product counts.
WHERE_REAL_INVOICES: Final[str] = "invoice_id NOT LIKE 'STSEED-%'"


# --- "new products (last 12 months)" ----------------------------------
#
# Definition (canonical): an article whose FIRST appearance in the
# invoices table falls within 12 months of the latest real invoice date
# (i.e. MAX(date) with STSEED filtered out). This must be used by every
# block that surfaces a "new products" headline.
NEW_PRODUCTS_LAST_12MO_SQL: Final[str] = f"""
WITH real_invoices AS (
    SELECT article_id, date, revenue
      FROM invoices
     WHERE {WHERE_REAL_INVOICES}
),
bounds AS (
    SELECT MAX(date) AS max_d FROM real_invoices
),
first_seen AS (
    SELECT article_id, MIN(date) AS first_invoiced
      FROM real_invoices
     GROUP BY article_id
)
SELECT
    (SELECT COUNT(*) FROM first_seen, bounds
       WHERE first_invoiced >= bounds.max_d - INTERVAL '12 months') AS n_new,
    (SELECT COALESCE(SUM(ri.revenue), 0)
       FROM real_invoices ri
       JOIN first_seen fs ON fs.article_id = ri.article_id
      WHERE fs.first_invoiced >= (SELECT max_d FROM bounds) - INTERVAL '12 months'
        AND ri.date >= (SELECT max_d FROM bounds) - INTERVAL '12 months') AS new_revenue,
    (SELECT COALESCE(SUM(revenue), 0) FROM real_invoices
       WHERE date >= (SELECT max_d FROM bounds) - INTERVAL '12 months') AS total_revenue
"""


# --- "top-10 SKU concentration (trailing 12 months)" -------------------
#
# Definition (canonical): sum of revenue from the top-10 article_ids
# divided by the total revenue in the trailing 12-month window, with
# STSEED-* rows excluded. The window is anchored to MAX(real_date) so
# the metric reflects "what we just shipped" rather than a stale calendar
# year boundary.
TOP10_CONCENTRATION_SQL: Final[str] = f"""
WITH real_invoices AS (
    SELECT article_id, revenue, date
      FROM invoices
     WHERE {WHERE_REAL_INVOICES}
       AND revenue IS NOT NULL
),
bounds AS (
    SELECT MAX(date) AS max_d FROM real_invoices
),
window_rows AS (
    SELECT article_id, revenue
      FROM real_invoices, bounds
     WHERE date >= bounds.max_d - INTERVAL '12 months'
),
per_article AS (
    SELECT article_id, SUM(revenue) AS rev FROM window_rows GROUP BY article_id
),
top10 AS (
    SELECT rev FROM per_article ORDER BY rev DESC NULLS LAST LIMIT 10
)
SELECT
    (SELECT COALESCE(SUM(rev), 0) FROM top10) AS top10_rev,
    (SELECT COALESCE(SUM(rev), 0) FROM per_article) AS total_rev
"""


WINDOW_LABEL: Final[str] = "Trailing 12 months (real invoices only)"


def fetch_new_products_metrics(db) -> dict[str, float]:
    """Return ``{n_new, new_revenue, total_revenue}`` for the canonical
    new-product definition. Centralised so Action Center + Forecast can
    never disagree (DATA-AUDIT-2026-05-17 defect #10).
    """
    row = db.execute(text(NEW_PRODUCTS_LAST_12MO_SQL)).fetchone()
    if row is None:
        return {"n_new": 0, "new_revenue": 0.0, "total_revenue": 0.0}
    return {
        "n_new": int(row[0] or 0),
        "new_revenue": float(row[1] or 0.0),
        "total_revenue": float(row[2] or 0.0),
    }


def fetch_top10_concentration(db) -> dict[str, float]:
    """Return ``{top10_revenue, total_revenue, share_pct}`` for the
    canonical trailing-12-months top-10 SKU concentration. Both Action
    Center and Forecast must use this (DATA-AUDIT-2026-05-17 defect #9).
    """
    row = db.execute(text(TOP10_CONCENTRATION_SQL)).fetchone()
    if row is None:
        return {"top10_revenue": 0.0, "total_revenue": 0.0, "share_pct": 0.0}
    top10 = float(row[0] or 0.0)
    total = float(row[1] or 0.0)
    share = (top10 / total * 100) if total > 0 else 0.0
    return {"top10_revenue": top10, "total_revenue": total, "share_pct": share}
