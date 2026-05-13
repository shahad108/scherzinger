"""Quote-to-Revenue bridge (Phase 6).

Open Quotes × Win Rate × Avg Margin = Expected Gross Profit from Pipeline,
over a configurable closing horizon (30 / 60 / 90 days).

Real path reads ``quotes`` (status='open') joined with rolling win rate
from ``quote_invoice_links``. Seed fallback uses realistic Scherzinger
values.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _seed_for_horizon(horizon_days: int) -> dict[str, Any]:
    if horizon_days == 30:
        open_quotes = 38
        avg_quote_value = 18400
        win_rate = 0.624
        avg_margin = 0.187
    elif horizon_days == 60:
        open_quotes = 71
        avg_quote_value = 17200
        win_rate = 0.604
        avg_margin = 0.183
    else:  # 90
        open_quotes = 104
        avg_quote_value = 16800
        win_rate = 0.591
        avg_margin = 0.179

    open_pipeline = open_quotes * avg_quote_value
    expected_revenue = open_pipeline * win_rate
    expected_gp = expected_revenue * avg_margin
    return {
        "horizonDays": horizon_days,
        "openQuotes": open_quotes,
        "openPipelineEur": round(open_pipeline, 0),
        "winRate": round(win_rate, 4),
        "avgMargin": round(avg_margin, 4),
        "expectedRevenue": round(expected_revenue, 0),
        "expectedGrossProfit": round(expected_gp, 0),
        "breakdown": {
            "byTier": [
                {"tier": "A", "share": 0.42, "expectedRevenue": round(expected_revenue * 0.42, 0)},
                {"tier": "B", "share": 0.34, "expectedRevenue": round(expected_revenue * 0.34, 0)},
                {"tier": "C", "share": 0.18, "expectedRevenue": round(expected_revenue * 0.18, 0)},
                {"tier": "D", "share": 0.06, "expectedRevenue": round(expected_revenue * 0.06, 0)},
            ],
        },
    }


def get_quote_to_revenue(db: Session | None) -> dict[str, Any]:
    """Returns the three horizons (30/60/90)."""
    if db is None:
        return {
            "horizons": [_seed_for_horizon(h) for h in (30, 60, 90)],
            "source": "seed",
        }
    horizons: list[dict[str, Any]] = []
    try:
        for h in (30, 60, 90):
            row = db.execute(text("""
                SELECT COUNT(*) AS open_q,
                       AVG(quoted_revenue) AS avg_val,
                       (SELECT AVG(CASE WHEN qil.invoice_id IS NOT NULL THEN 1.0 ELSE 0.0 END)
                          FROM quote_invoice_links qil
                          JOIN quotes q ON qil.quote_id = q.id
                         WHERE q.quoted_at >= NOW() - INTERVAL '90 days') AS win_rate,
                       (SELECT AVG(margin_pct) FROM invoices WHERE invoice_date >= NOW() - INTERVAL '90 days') AS avg_margin
                FROM quotes
                WHERE status = 'open'
                  AND expected_close_date <= NOW() + (:h || ' days')::interval
            """), {"h": h}).fetchone()
            if not row or row[0] is None:
                raise RuntimeError("no data")
            open_quotes = int(row[0])
            avg_value = float(row[1] or 0)
            win_rate = float(row[2] or 0.5)
            avg_margin = float(row[3] or 0.2)
            open_pipeline = open_quotes * avg_value
            expected_revenue = open_pipeline * win_rate
            expected_gp = expected_revenue * avg_margin
            horizons.append({
                "horizonDays": h,
                "openQuotes": open_quotes,
                "openPipelineEur": round(open_pipeline, 0),
                "winRate": round(win_rate, 4),
                "avgMargin": round(avg_margin, 4),
                "expectedRevenue": round(expected_revenue, 0),
                "expectedGrossProfit": round(expected_gp, 0),
                "breakdown": {"byTier": []},
            })
        return {"horizons": horizons, "source": "live"}
    except Exception:
        return {"horizons": [_seed_for_horizon(h) for h in (30, 60, 90)], "source": "seed"}
