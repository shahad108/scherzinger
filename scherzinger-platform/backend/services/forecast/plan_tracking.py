"""Plan-vs-actual tracking composer.

Reads plan from data/plan.json. Joins with realized monthly revenue from the
invoice service (same source as real_hero.py). Returns cumulative gap + variance
attribution from the existing PVM payload + plan-reset audit log.

# Data-honesty note (DATA-AUDIT-2026-05-17, defect #4)
# --------------------------------------------------
# The values in `plan.json` are hand-crafted demo targets, NOT extracted from
# any `plan_targets` table inside Scherzinger's ERP. Because the BFF cannot
# stand behind those numbers, the block is returned in a `degraded` state so
# the UI can render an "unavailable" affordance and avoid surfacing a
# fabricated cumulative-gap headline. Plan values + cumulativeGap are nulled
# out; actuals + reset-log are preserved (they ARE real).
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
    for r in plan_rows:
        actual_v = actuals.get(r["month"])
        # Plan target intentionally nulled — see module docstring. Demo plan
        # values exist in plan.json but are not authoritative; surfacing them
        # would create a misleading cumulative-gap headline.
        points.append({
            "month": r["month"],
            "plan": None,
            "actual": actual_v,
        })
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
        "cumulativeGapEur": None,
        "cumulativeGapPct": None,
        "recentMonthAttribution": pvm_attribution or None,
        "resetLog": reset_log,
        "meta": {
            "status": "degraded",
            "reason": "Plan targets not configured for this dataset",
        },
    }
