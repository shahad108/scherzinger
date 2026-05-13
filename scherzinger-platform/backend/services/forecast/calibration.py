"""Per-cluster CI calibration (Phase 6).

For each cluster, of the past N backtest steps, what fraction of actuals
fell inside the 80% band? Should be near 80% if calibrated.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _seed() -> dict[str, Any]:
    return {
        "nominalBand": 80,
        "rows": [
            {"clusterId": "BKAES", "actualHitRatePct": 81, "nBacktests": 18, "tone": "green"},
            {"clusterId": "BKAGG", "actualHitRatePct": 76, "nBacktests": 18, "tone": "amber"},
            {"clusterId": "BKAIZ", "actualHitRatePct": 72, "nBacktests": 18, "tone": "amber"},
            {"clusterId": "SOPU",  "actualHitRatePct": 58, "nBacktests": 12, "tone": "red"},
        ],
        "source": "seed",
    }


def _tone_for(hit: float, nominal: float = 80) -> str:
    diff = abs(hit - nominal)
    if diff <= 5:
        return "green"
    if diff <= 10:
        return "amber"
    return "red"


def get_calibration(db: Session | None) -> dict[str, Any]:
    if db is None:
        return _seed()
    try:
        rows = db.execute(text("""
            SELECT cluster_id,
                   AVG(CASE WHEN actual BETWEEN p10 AND p90 THEN 100.0 ELSE 0.0 END) AS hit_rate,
                   COUNT(*) AS n
            FROM backtest_results
            WHERE step_at >= NOW() - INTERVAL '18 months'
            GROUP BY cluster_id
            ORDER BY cluster_id
        """)).fetchall()
    except Exception:
        return _seed()
    if not rows:
        return _seed()
    out_rows = []
    for r in rows:
        hit = float(r[1]) if r[1] is not None else 0
        out_rows.append({
            "clusterId": r[0],
            "actualHitRatePct": round(hit, 1),
            "nBacktests": int(r[2]),
            "tone": _tone_for(hit),
        })
    return {"nominalBand": 80, "rows": out_rows, "source": "live"}
