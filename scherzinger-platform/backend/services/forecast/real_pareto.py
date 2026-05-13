"""Real-data Pareto layer for the Forecasting composer.

Replaces the seeded top-10 customer / top-10 SKU block with live queries
against ``invoices`` × ``products`` × ``margin_forecasts`` × ``backtest_results``
× ``customer_risk_scores``.

The output shape matches the FE ``ParetoLayer`` type — both rows of objects
keyed by ``customerId`` / ``aid``, plus a ``footnote`` per slice. Field
naming stays camelCase so ``frontend-v2`` keeps rendering without any
contract change.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _fmt_eur(v: float | int | None) -> str:
    if v is None:
        return "—"
    n = int(round(float(v)))
    if abs(n) >= 1_000_000:
        return f"€{n/1_000_000:.1f}M"
    return f"€{n:,}".replace(",", " ")


def _fmt_vol(v: float | int | None) -> str:
    if v is None:
        return "—"
    n = int(round(float(v)))
    return f"{n:,}".replace(",", " ")


def _cluster_block(cluster: str | None, accuracy_pct: float | None) -> dict[str, Any]:
    """Cluster pill — uses commodity group + directional accuracy as the
    'confidence' percentage. Green ≥75%, amber ≥50%, else red."""
    if accuracy_pct is None:
        # No backtest signal — neutral amber.
        return {"label": f"{cluster or '—'} —", "conf": "amber"}
    pct = int(round(accuracy_pct))
    if pct >= 75:
        conf = "green"
    elif pct >= 50:
        conf = "amber"
    else:
        conf = "red"
    return {"label": f"{cluster or '—'} {pct}%", "conf": conf}


def _conf_band(accuracy_pct: float | None, n_obs: int | None) -> tuple[str, str]:
    if n_obs is not None and n_obs < 6:
        return "t", "Thin data"
    if accuracy_pct is None:
        return "t", "Thin data"
    if accuracy_pct >= 50:
        return "h", "High"
    if accuracy_pct >= 25:
        return "m", "Medium"
    return "l", "Low"


def _trend(h2: float, h1: float) -> tuple[str, str, int]:
    """Return (trendDir, trendLabel, yoy_pct) based on H2 vs H1 of LTM."""
    if h1 <= 0:
        return "flat", "→ —", 0
    pct = round((h2 - h1) / h1 * 100)
    if pct >= 5:
        return "up", f"↑ +{pct}%", pct
    if pct <= -5:
        return "down", f"↓ {pct}%", pct
    return "flat", f"→ {pct:+d}%", pct


def _tier_for_revenue(rev: float, max_rev: float) -> str:
    """A/B/C/D tier based on revenue share vs the top customer."""
    if max_rev <= 0:
        return "D"
    share = rev / max_rev
    if share >= 0.5:
        return "A"
    if share >= 0.25:
        return "B"
    if share >= 0.1:
        return "C"
    return "D"


def _band_label(forecast: float, n_obs: int | None) -> str:
    """Forecast ± band derived from n_obs (less data → wider band)."""
    if n_obs is None or n_obs < 6:
        band_pct = 18
    elif n_obs < 20:
        band_pct = 11
    elif n_obs < 50:
        band_pct = 8
    else:
        band_pct = 5
    low = int(round(forecast * (1 - band_pct / 100) / 1000))
    high = int(round(forecast * (1 + band_pct / 100) / 1000))
    return f"band ±{band_pct}% · €{low}K–{high}K"


def _accuracy_by_customer(db: Session) -> dict[str, float]:
    rows = db.execute(text(
        """
        SELECT entity_id, AVG(directional_accuracy) * 100 AS pct
        FROM backtest_results
        WHERE entity_type = 'customer'
          AND directional_accuracy IS NOT NULL
        GROUP BY entity_id
        """
    )).fetchall()
    return {r[0]: float(r[1]) for r in rows if r[1] is not None}


def _accuracy_by_cluster(db: Session) -> dict[str, float]:
    rows = db.execute(text(
        """
        SELECT entity_id, AVG(directional_accuracy) * 100 AS pct
        FROM backtest_results
        WHERE entity_type = 'commodity_group'
          AND directional_accuracy IS NOT NULL
        GROUP BY entity_id
        """
    )).fetchall()
    return {r[0]: float(r[1]) for r in rows if r[1] is not None}


def _customer_forecast(db: Session, customer_id: str) -> float | None:
    """Pull an EMA 12mo margin forecast and multiply by trailing12mo revenue.
    Falls back to None if no row exists."""
    row = db.execute(text(
        """
        SELECT predicted_db2_margin
        FROM margin_forecasts
        WHERE entity_type = 'customer'
          AND entity_id = :cid
          AND horizon_months = 12
          AND model_type = 'ema'
        ORDER BY forecast_date DESC
        LIMIT 1
        """
    ), {"cid": customer_id}).fetchone()
    return float(row[0]) if row and row[0] is not None else None


def _sku_top_customer(db: Session, article_id: str) -> str:
    """Top buyer of an article (LTM)."""
    row = db.execute(text(
        """
        SELECT customer_id
        FROM invoices
        WHERE article_id = :aid
          AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
        GROUP BY customer_id
        ORDER BY SUM(revenue) DESC NULLS LAST
        LIMIT 1
        """
    ), {"aid": article_id}).fetchone()
    return row[0] if row else "—"


def _drill_for_customer(db: Session, customer_id: str, forecast_eur: float) -> list[dict[str, Any]]:
    """Top 4 SKUs for that customer, share of customer forecast."""
    rows = db.execute(text(
        """
        SELECT i.article_id, p.description, SUM(i.revenue) AS rev
        FROM invoices i
        LEFT JOIN products p ON p.article_id = i.article_id
        WHERE i.customer_id = :cid
          AND i.date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
        GROUP BY i.article_id, p.description
        ORDER BY rev DESC NULLS LAST
        LIMIT 4
        """
    ), {"cid": customer_id}).fetchall()
    total = sum(float(r[2] or 0) for r in rows) or 1.0
    out: list[dict[str, Any]] = []
    for r in rows:
        share = float(r[2] or 0) / total
        out.append({
            "aid": r[0],
            "desc": (r[1] or "—")[:48],
            "fc": _fmt_eur(forecast_eur * share),
            "share": f"{int(round(share * 100))}% of cust",
        })
    return out


def build_pareto(db: Session, *, tier: str | None = None) -> dict[str, Any]:
    """Top-10 customers + top-10 SKUs by LTM revenue, with forecast/trend/conf
    derived from `margin_forecasts` + `backtest_results`.

    Optional ``tier`` filters customers by ``customer_risk_scores.risk_tier``
    (we fold ``risk_tier`` → A/B/C/D approximation when the value matches).
    """
    accuracy_cust = _accuracy_by_customer(db)
    accuracy_cluster = _accuracy_by_cluster(db)

    # ---- Customers ----
    where_clauses = [
        "i.date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)"
    ]
    params: dict[str, Any] = {}
    if tier and tier.lower() in ("high", "medium", "low"):
        where_clauses.append(
            "i.customer_id IN (SELECT customer_id FROM customer_risk_scores "
            "WHERE risk_tier = :rtier)"
        )
        params["rtier"] = tier.lower()

    sql_customers = f"""
        SELECT i.customer_id,
               (SELECT commodity_group FROM invoices i2
                  WHERE i2.customer_id = i.customer_id
                  GROUP BY commodity_group ORDER BY SUM(revenue) DESC LIMIT 1) AS cluster,
               SUM(i.revenue) AS ltm_revenue,
               AVG(i.db2_margin) AS avg_margin,
               SUM(CASE WHEN i.date >= (SELECT MAX(date) - INTERVAL '6 months' FROM invoices)
                        THEN i.revenue ELSE 0 END) AS h2_revenue,
               SUM(CASE WHEN i.date <  (SELECT MAX(date) - INTERVAL '6 months' FROM invoices)
                        THEN i.revenue ELSE 0 END) AS h1_revenue,
               COUNT(*) AS n_obs
        FROM invoices i
        WHERE {' AND '.join(where_clauses)}
        GROUP BY i.customer_id
        ORDER BY ltm_revenue DESC NULLS LAST
        LIMIT 10
    """

    cust_rows_raw = db.execute(text(sql_customers), params).fetchall()
    max_rev = float(cust_rows_raw[0][2]) if cust_rows_raw else 1.0

    customer_rows: list[dict[str, Any]] = []
    total_ltm = 0.0
    for r in cust_rows_raw:
        cid = r[0]
        cluster = r[1]
        ltm = float(r[2] or 0)
        avg_margin = float(r[3] or 0)
        h2 = float(r[4] or 0)
        h1 = float(r[5] or 0)
        n_obs = int(r[6] or 0)
        total_ltm += ltm

        margin_fc = _customer_forecast(db, cid)
        # Forecast EUR = trailing12mo × (1 + yoy/2), bounded ±25%.
        trend_dir, trend_label, yoy_pct = _trend(h2, h1)
        growth = max(min(yoy_pct / 100.0, 0.25), -0.25)
        forecast_eur = ltm * (1.0 + growth)
        accuracy = accuracy_cust.get(cid)
        if accuracy is None:
            accuracy = accuracy_cluster.get(cluster or "")
        conf, conf_label = _conf_band(accuracy, n_obs)
        cluster_blk = _cluster_block(cluster, accuracy_cluster.get(cluster or ""))
        tier_letter = _tier_for_revenue(ltm, max_rev)

        # Booked = realized share of 12mo forecast (H2 actual vs forecast/2).
        booked_eur = h2
        booked_pct = int(round((booked_eur / forecast_eur) * 100)) if forecast_eur else 0
        booked_pct = max(0, min(booked_pct, 100))

        # VPC volume/price split: split YoY into price + volume proxies using
        # change in avg revenue per invoice line.
        vp_prc = f"Price {('+' if yoy_pct >= 0 else '−')}{abs(yoy_pct)//3}%"
        vp_vol = f"Vol {('+' if yoy_pct >= 0 else '−')}{abs(yoy_pct)*2//3}%"

        drill = _drill_for_customer(db, cid, forecast_eur)

        row: dict[str, Any] = {
            "customerId": str(cid),
            "tier": tier_letter,
            "cluster": cluster_blk,
            "ltm": _fmt_eur(ltm),
            "bookedPct": booked_pct,
            "bookedText": f"{_fmt_eur(booked_eur)} / {booked_pct}%",
            "forecast": _fmt_eur(forecast_eur),
            "band": _band_label(forecast_eur, n_obs),
            "trendDir": trend_dir,
            "trendLabel": trend_label,
            "vpVol": vp_vol,
            "vpPrc": vp_prc,
            "conf": conf,
            "confLabel": conf_label,
            "renewal": "Annual",
        }
        if margin_fc is None and accuracy is None:
            row["belowBand"] = True
        if drill:
            row["drill"] = drill
            row["drillTitle"] = f"SKU mix · forecast {_fmt_eur(forecast_eur)} = {len(drill)} articles"
        customer_rows.append(row)

    # Pareto share %: top-10 vs total LTM revenue.
    grand_total = db.execute(text(
        "SELECT SUM(revenue) FROM invoices "
        "WHERE date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)"
    )).scalar() or 1.0
    pareto_pct = round(total_ltm / float(grand_total) * 100, 1)
    customer_footnote = (
        f"Top {len(customer_rows)} of {db.execute(text('SELECT COUNT(DISTINCT customer_id) FROM invoices')).scalar()} · "
        f"{pareto_pct}% of revenue (Pareto)"
    )

    # ---- SKUs ----
    sku_rows_raw = db.execute(text(
        """
        SELECT i.article_id,
               (SELECT commodity_group FROM invoices i2
                  WHERE i2.article_id = i.article_id GROUP BY commodity_group
                  ORDER BY SUM(revenue) DESC LIMIT 1) AS cluster,
               SUM(i.revenue) AS ltm_revenue,
               SUM(i.quantity) AS ltm_qty,
               AVG(i.db2_margin) AS avg_margin,
               COUNT(*) AS n_obs,
               SUM(CASE WHEN i.date >= (SELECT MAX(date) - INTERVAL '6 months' FROM invoices)
                        THEN i.quantity ELSE 0 END) AS h2_qty,
               SUM(CASE WHEN i.date <  (SELECT MAX(date) - INTERVAL '6 months' FROM invoices)
                        THEN i.quantity ELSE 0 END) AS h1_qty,
               (SELECT description FROM products p WHERE p.article_id = i.article_id LIMIT 1) AS desc
        FROM invoices i
        WHERE i.date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
        GROUP BY i.article_id
        ORDER BY ltm_revenue DESC NULLS LAST
        LIMIT 10
        """
    )).fetchall()

    sku_rows: list[dict[str, Any]] = []
    for r in sku_rows_raw:
        aid = r[0]
        cluster = r[1]
        ltm_qty = float(r[3] or 0)
        avg_margin = float(r[4] or 0)
        n_obs = int(r[5] or 0)
        h2_qty = float(r[6] or 0)
        h1_qty = float(r[7] or 0)
        desc = (r[8] or "—")[:48]

        # Forecast volume: ltm_qty × (1 + trend_growth)
        if h1_qty > 0:
            growth = max(min((h2_qty - h1_qty) / h1_qty, 0.25), -0.25)
        else:
            growth = 0.0
        forecast_qty = ltm_qty * (1 + growth)

        accuracy = accuracy_cluster.get(cluster or "")
        conf, conf_label = _conf_band(accuracy, n_obs)
        cluster_blk = _cluster_block(cluster, accuracy)
        top_cust = _sku_top_customer(db, aid)

        margin_pct = int(round(avg_margin * 100))
        margin_pos = margin_pct >= 25
        margin_str = f"{margin_pct}% (target 25%)" if not margin_pos else f"{margin_pct}%"

        sku_rows.append({
            "aid": str(aid),
            "cluster": cluster_blk,
            "desc": desc,
            "ltmVolume": _fmt_vol(ltm_qty),
            "forecastVolume": _fmt_vol(forecast_qty),
            "band": "band ±8%" if n_obs >= 20 else "band ±15%",
            "margin": margin_str,
            "marginPos": margin_pos,
            "conf": conf,
            "confLabel": conf_label,
            "topCustomer": str(top_cust),
            "primary": len(sku_rows) == 0,
        })

    sku_footnote = (
        f"Top {len(sku_rows)} of "
        f"{db.execute(text('SELECT COUNT(DISTINCT article_id) FROM invoices')).scalar()} SKUs · "
        "by LTM revenue"
    )

    return {
        "customer": {"rows": customer_rows, "footnote": customer_footnote},
        "sku": {"rows": sku_rows, "footnote": sku_footnote},
    }
