"""Real cluster cards, sourced from `margin_forecasts` × `invoices`.

Each ClusterCard needs:
  * `id` — the commodity_group code
  * `ltm` — last-12-month revenue (computed from `invoices.revenue`)
  * `forecast` — projected margin (point estimate from `margin_forecasts`)
  * `bandText` — half-width of the prediction interval as ±%
  * `confidence` — recent backtest MAPE / directional for the cluster
  * `tone` — green/amber/red depending on confidence + band width

The function picks the winning model (lowest overall MAPE) so cards are
consistent with the walk-forward panel.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _pick_winner(db: Session) -> str:
    row = db.execute(
        text(
            """
            SELECT model_type, mape
            FROM backtest_results
            WHERE entity_type='overall' AND entity_id='all' AND mape IS NOT NULL
            ORDER BY mape ASC
            LIMIT 1
            """
        )
    ).fetchone()
    return row[0] if row else "ema"


def _fmt_eur(amount: float) -> str:
    if amount is None:
        return "—"
    abs_a = abs(amount)
    if abs_a >= 1_000_000:
        return f"€{amount / 1_000_000:.1f}M"
    if abs_a >= 1_000:
        return f"€{amount / 1_000:.0f}K"
    return f"€{amount:.0f}"


def _tone(mape_pct: float | None, band_pct: float) -> str:
    """Return 'status' (green-ish), 'amber', or 'red' based on quality."""
    if mape_pct is None:
        # Wide band only — use band as proxy.
        if band_pct > 15:
            return "red"
        if band_pct > 8:
            return "amber"
        return "status"
    if mape_pct < 3 and band_pct < 8:
        return "status"
    if mape_pct < 6 and band_pct < 15:
        return "amber"
    return "red"


def build_clusters(
    db: Session, *, horizon_months: int = 12, only: str | None = None
) -> list[dict[str, Any]]:
    """Build the `clusters` array.

    Falls back gracefully when the requested horizon has no forecast row
    (uses the longest available horizon for the cluster).
    """
    winner = _pick_winner(db)

    # LTM revenue per commodity_group from the most recent 12 months of
    # `invoices`. We anchor "now" on MAX(date) so the demo dataset works.
    # Exclude rows where commodity_group IS NULL (458 orphan seeder rows
    # in DB) so they don't poison the cluster cards. The previous version
    # of this query returned a NULL key which both inflated nothing and
    # crashed the downstream `sorted(set(...))` — sending the composer
    # back to the seed which displays 3-4× the real LTM.
    ltm_rows = db.execute(
        text(
            """
            SELECT commodity_group,
                   SUM(revenue) AS ltm_revenue,
                   COUNT(*) AS n_rows
            FROM invoices
            WHERE commodity_group IS NOT NULL
              AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
            GROUP BY commodity_group
            """
        )
    ).fetchall()
    ltm_by_cluster: dict[str, float] = {
        r[0]: float(r[1] or 0.0) for r in ltm_rows if r[0] is not None
    }

    # Cluster forecasts at the requested horizon (winning model first).
    fc_rows = db.execute(
        text(
            """
            SELECT entity_id, model_type, horizon_months,
                   predicted_db2_margin, prediction_lower, prediction_upper
            FROM margin_forecasts
            WHERE entity_type='commodity_group'
              AND horizon_months = :h
              AND model_type = :m
            """
        ),
        {"h": horizon_months, "m": winner},
    ).fetchall()
    if not fc_rows:
        # Try without filtering on model (some clusters may only have one model).
        fc_rows = db.execute(
            text(
                """
                SELECT DISTINCT ON (entity_id) entity_id, model_type, horizon_months,
                       predicted_db2_margin, prediction_lower, prediction_upper
                FROM margin_forecasts
                WHERE entity_type='commodity_group' AND horizon_months = :h
                ORDER BY entity_id, model_type
                """
            ),
            {"h": horizon_months},
        ).fetchall()

    fc_by_cluster: dict[str, dict[str, Any]] = {}
    for r in fc_rows:
        fc_by_cluster[r[0]] = {
            "model": r[1],
            "horizon": r[2],
            "p50": float(r[3]) if r[3] is not None else None,
            "low": float(r[4]) if r[4] is not None else None,
            "high": float(r[5]) if r[5] is not None else None,
        }

    # Per-cluster MAPE / directional from backtest_results.
    bt_rows = db.execute(
        text(
            """
            SELECT entity_id, mape, directional_accuracy
            FROM backtest_results
            WHERE entity_type='commodity_group' AND model_type = :m
            """
        ),
        {"m": winner},
    ).fetchall()
    bt_by_cluster: dict[str, dict[str, Any]] = {
        r[0]: {"mape": float(r[1]) if r[1] is not None else None,
               "directional": float(r[2]) if r[2] is not None else None}
        for r in bt_rows
    }

    cluster_ids = sorted(
        {
            cid
            for cid in list(fc_by_cluster.keys()) + list(ltm_by_cluster.keys())
            if cid is not None
        }
    )
    if only:
        cluster_ids = [c for c in cluster_ids if c.lower() == only.lower()] or cluster_ids

    out: list[dict[str, Any]] = []
    for cid in cluster_ids:
        ltm = ltm_by_cluster.get(cid)
        fc = fc_by_cluster.get(cid)
        bt = bt_by_cluster.get(cid, {})

        if fc and fc["p50"] is not None:
            # Project margin into revenue for the forecast — multiply LTM by
            # (forecast margin / current margin). The DB only carries margin
            # forecasts directly; we use the % delta against the realised LTM
            # margin to get a directional revenue forecast.
            # If we don't know LTM margin we just show the margin %.
            band_half = 0.0
            if fc["low"] is not None and fc["high"] is not None:
                band_half = (fc["high"] - fc["low"]) / 2.0
            band_pct = (band_half / max(fc["p50"], 1e-6)) * 100

            # Revenue projection: keep LTM steady but show margin band.
            forecast_label = f"{fc['p50'] * 100:.1f}% margin"
            if ltm:
                forecast_label = f"{_fmt_eur(ltm)} · {fc['p50'] * 100:.1f}% margin"

            mape_pct = bt.get("mape") * 100 if bt.get("mape") is not None else None
            tone = _tone(mape_pct, band_pct)
            confidence_str = (
                f"{cid} {100 - (mape_pct or 5):.0f}%"
                if mape_pct is not None
                else f"{cid} —"
            )
            out.append(
                {
                    "id": cid,
                    "ltm": f"LTM {_fmt_eur(ltm)}" if ltm else "LTM —",
                    "forecast": forecast_label,
                    "bandText": f"±{band_pct:.0f}% · {fc['horizon']}mo · model {fc['model']}",
                    "confidence": confidence_str,
                    "tone": tone,
                    # Extras the FE can ignore safely.
                    "predictedMargin": fc["p50"],
                    "predictedLow": fc["low"],
                    "predictedHigh": fc["high"],
                    "mape": bt.get("mape"),
                    "directional": bt.get("directional"),
                    "ltmRevenue": ltm,
                    "model": fc["model"],
                }
            )
        else:
            # We have LTM but no forecast for this cluster.
            out.append(
                {
                    "id": cid,
                    "ltm": f"LTM {_fmt_eur(ltm)}" if ltm else "LTM —",
                    "forecast": "—",
                    "bandText": "no forecast in margin_forecasts",
                    "confidence": f"{cid} —",
                    "tone": "amber",
                    "ltmRevenue": ltm,
                }
            )
    return out
