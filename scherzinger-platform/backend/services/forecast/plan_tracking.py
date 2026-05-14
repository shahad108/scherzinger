"""Plan-vs-actual tracking composer.

Reads plan from data/plan.json. Joins with realized monthly revenue from the
invoice service (same source as real_hero.py). Returns cumulative gap + variance
attribution from the existing PVM payload + plan-reset audit log.
"""
from __future__ import annotations
from pathlib import Path
from typing import Any
import json

PLAN_PATH = Path(__file__).resolve().parents[2] / "data" / "plan.json"


def _load_plan(mode: str, cluster: str | None) -> list[dict[str, Any]]:
    if not PLAN_PATH.exists():
        return []
    raw = json.loads(PLAN_PATH.read_text() or "{}")
    rows = raw.get("rows", [])
    return [r for r in rows if r.get("mode") == mode and (r.get("cluster") or None) == cluster]


def build_plan_tracking(
    *,
    mode: str = "revenue",
    cluster: str | None = None,
    actuals_by_month: dict[str, float] | None = None,
    pvm_attribution: dict[str, float] | None = None,
) -> dict[str, Any]:
    plan_rows = _load_plan(mode, cluster)
    actuals = actuals_by_month or {}
    points = []
    # Cumulative gap compares plan vs actual *only up to the last closed
    # month*, otherwise we'd compare an in-progress year against a full-year
    # plan and the gap would always look catastrophic.
    cum_plan_to_actual = 0.0
    cum_actual = 0.0
    last_actual_month: str | None = None
    for r in plan_rows:
        plan_v = float(r["value"])
        actual_v = actuals.get(r["month"])
        points.append({
            "month": r["month"],
            "plan": plan_v,
            "actual": actual_v,
        })
        if actual_v is not None:
            cum_plan_to_actual += plan_v
            cum_actual += actual_v
            last_actual_month = r["month"]
    gap_eur = cum_actual - cum_plan_to_actual if last_actual_month else 0.0
    gap_pct = (gap_eur / cum_plan_to_actual * 100) if cum_plan_to_actual else 0.0
    reset_log: list[dict[str, Any]] = []
    for r in plan_rows:
        for entry in r.get("reset_log", []):
            reset_log.append({
                "at": entry["at"],
                "by": entry["by"],
                "reason": entry["reason"],
                "priorValue": float(entry["prior_value"]),
            })
    return {
        "points": points,
        "cumulativeGapEur": gap_eur,
        "cumulativeGapPct": gap_pct,
        "recentMonthAttribution": pvm_attribution or None,
        "resetLog": reset_log,
    }
