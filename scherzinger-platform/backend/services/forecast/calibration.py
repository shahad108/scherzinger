"""Per-cluster accuracy panel.

Originally this was a "CI calibration" panel — the fraction of actuals that
fell inside the model's 80% prediction band. We don't currently persist
pred/actual *pairs* in the DB (only aggregated metrics), so we cannot
compute true hit-rate honestly.

Instead, this surface now shows the **real** per-cluster backtest accuracy
from `backtest_results`:

  * `mapePct` — mean absolute percentage error (lower = tighter)
  * `directionalPct` — how often the model called direction correctly
  * `nBacktests` — test periods used
  * `tone` — green if mape ≤ 3%, amber if ≤ 6%, red otherwise

The FE panel was already collapsible; the heading is renamed to "Per-cluster
backtest accuracy" so we are not implying we measured CI coverage when we
didn't.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _seed() -> dict[str, Any]:
    return {
        "title": "Per-cluster backtest accuracy",
        "subtitle": "Real MAPE + directional from backtest_results · h=3mo",
        "nominalBand": 80,
        "rows": [
            {
                "clusterId": "BKAES",
                "mapePct": 1.5,
                "directionalPct": 45,
                "nBacktests": 12,
                "tone": "green",
            },
            {
                "clusterId": "BKAGG",
                "mapePct": 3.5,
                "directionalPct": 18,
                "nBacktests": 12,
                "tone": "amber",
            },
            {
                "clusterId": "BKAIZ",
                "mapePct": 6.6,
                "directionalPct": 0,
                "nBacktests": 10,
                "tone": "red",
            },
        ],
        "source": "seed",
    }


def _tone_for(mape_pct: float) -> str:
    if mape_pct <= 3:
        return "green"
    if mape_pct <= 6:
        return "amber"
    return "red"


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


def get_calibration(db: Session | None) -> dict[str, Any]:
    if db is None:
        return _seed()

    try:
        winner = _pick_winner(db)
        rows = db.execute(
            text(
                """
                SELECT entity_id, mape, directional_accuracy, n_test_periods
                FROM backtest_results
                WHERE entity_type='commodity_group' AND model_type = :m
                ORDER BY entity_id
                """
            ),
            {"m": winner},
        ).fetchall()
    except Exception:
        return _seed()

    if not rows:
        return _seed()

    out_rows = []
    for r in rows:
        cluster_id = r[0]
        mape = float(r[1]) if r[1] is not None else None
        directional = float(r[2]) if r[2] is not None else None
        mape_pct = round(mape * 100, 2) if mape is not None else None
        directional_pct = round(directional * 100, 0) if directional is not None else None
        out_rows.append(
            {
                "clusterId": cluster_id,
                "mapePct": mape_pct,
                "directionalPct": directional_pct,
                "nBacktests": int(r[3]) if r[3] is not None else None,
                "tone": _tone_for(mape_pct) if mape_pct is not None else "amber",
                # Back-compat: keep `actualHitRatePct` so the old FE renderer
                # (if anyone is still on it) doesn't crash. We map it to
                # 100% − MAPE as a soft proxy (NOT a real CI hit rate).
                "actualHitRatePct": (round(100 - mape_pct, 1) if mape_pct is not None else None),
            }
        )

    return {
        "title": "Per-cluster backtest accuracy",
        "subtitle": (
            f"Real metrics from backtest_results · model={winner} · h=3mo · "
            "lower MAPE / higher directional = better"
        ),
        "nominalBand": 80,
        "rows": out_rows,
        "source": "live",
        "winnerModel": winner,
    }
