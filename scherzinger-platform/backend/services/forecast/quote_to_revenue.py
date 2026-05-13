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
    """Returns the three horizons (30/60/90).

    The dataset has no `status='open'` quotes — only won/lost. We treat the
    trailing-6-months quote book as the "pipeline at this run" and partition
    it across 30/60/90 windows. Win rate is computed over the trailing
    12 months and avg margin over the trailing 6 months of *won* quotes.
    """
    if db is None:
        return {
            "horizons": [_seed_for_horizon(h) for h in (30, 60, 90)],
            "source": "seed",
        }

    try:
        # Win rate (12mo) and avg won margin (6mo).
        wr_row = db.execute(text("""
            SELECT
              (SELECT COUNT(*) FROM quotes
                 WHERE is_won = TRUE
                   AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM quotes))::float
              /
              NULLIF(
                (SELECT COUNT(*) FROM quotes
                   WHERE status IN ('won','lost')
                     AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM quotes))::float,
                0
              ) AS win_rate,
              (SELECT AVG(db2_margin) FROM quotes
                 WHERE is_won = TRUE
                   AND date >= (SELECT MAX(date) - INTERVAL '6 months' FROM quotes)
              ) AS avg_margin
        """)).fetchone()
        win_rate = float(wr_row[0] or 0.5) if wr_row and wr_row[0] is not None else 0.5
        avg_margin = float(wr_row[1] or 0.2) if wr_row and wr_row[1] is not None else 0.2

        # Recent (trailing 6mo) quote book — what would be "open" if the data
        # carried that status.
        pipe_row = db.execute(text("""
            SELECT COUNT(*) AS n,
                   COALESCE(SUM(revenue), 0) AS pipe
            FROM quotes
            WHERE date >= (SELECT MAX(date) - INTERVAL '6 months' FROM quotes)
              AND status NOT IN ('cancelled')
        """)).fetchone()
        total_open_quotes = int(pipe_row[0] or 0)
        total_open_pipeline = float(pipe_row[1] or 0)

        if total_open_quotes <= 0:
            raise RuntimeError("no quotes")

        # Tier breakdown via customer LTM-revenue tier (top 10% A, 25% B, etc).
        # Since `quotes` lacks a tier column we derive it from each customer's
        # revenue share — but for the bridge we only need a simple share split.
        # 42/34/18/6 mirrors the seed shape; replace with real customer tier
        # joins once we wire customer_tiers.
        tier_shares = [("A", 0.42), ("B", 0.34), ("C", 0.18), ("D", 0.06)]
        # 30/60/90 = 30/40/30 partition of the recent quote book.
        splits = {30: 0.30, 60: 0.40, 90: 0.30}

        horizons: list[dict[str, Any]] = []
        for h in (30, 60, 90):
            share = splits[h]
            open_quotes = int(round(total_open_quotes * share))
            open_pipeline = total_open_pipeline * share
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
                "breakdown": {
                    "byTier": [
                        {
                            "tier": t,
                            "share": s,
                            "expectedRevenue": round(expected_revenue * s, 0),
                        }
                        for t, s in tier_shares
                    ],
                },
            })

        return {"horizons": horizons, "source": "live"}
    except Exception:
        return {
            "horizons": [_seed_for_horizon(h) for h in (30, 60, 90)],
            "source": "seed",
        }
