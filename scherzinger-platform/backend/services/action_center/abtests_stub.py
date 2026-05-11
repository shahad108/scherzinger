"""A/B test tracker — live from the ab_tests table.

Reads every running test, joins the latest result row, and projects into
the {title, subtitle, status, preMargin, postMargin, lift, liftTone,
trend, trendTone} shape the frontend tile renders.

Falls back to the bundled seed when the table is empty (fresh DB / dev).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import desc

from backend.database import SessionLocal
from backend.models import AbTest, AbTestResult
from backend.services import ab_results_service, ab_simulation_service

from ._intents import ab_actions
from ._seed import ActionCenterBlockError

# Significance threshold for declaring "trending positive/negative" vs the
# neutral "too few samples" tone — same heuristic the seed uses.
_SIG_PV = 0.05


def _latest_result(db, test_id) -> AbTestResult | None:
    return (
        db.query(AbTestResult)
        .filter(AbTestResult.test_id == test_id)
        .order_by(desc(AbTestResult.id))
        .first()
    )


def _format_pct(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value * 100:.1f}%" if abs(value) <= 1 else f"{value:.1f}%"


def _format_lift_pp(pp: float | None) -> tuple[str, str]:
    if pp is None:
        return "—", "neutral"
    sign = "+" if pp > 0 else ""
    label = f"{sign}{pp:.1f}pp"
    if pp >= 0.5:
        return label, "positive"
    if pp <= -0.5:
        return label, "negative"
    return label, "neutral"


def _trend(p_value: float | None, lift_pp: float | None) -> tuple[str, str]:
    if p_value is None:
        return "too few samples", "warning"
    if p_value > _SIG_PV:
        return "no significant lift yet", "warning"
    if lift_pp is not None and lift_pp >= 0:
        return "trending positive", "positive"
    return "trending negative", "negative"


def _status_label(test: AbTest) -> str:
    """Render 'Day N / total' from start/end dates."""
    if not test.start_date:
        return test.status or "running"
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    elapsed = max(0, (now - test.start_date).days)
    if test.end_date:
        total = max(1, (test.end_date - test.start_date).days)
        return f"Day {min(elapsed, total)} / {total}"
    return f"Day {elapsed}"


def _row(idx: int, test: AbTest, result: AbTestResult | None) -> dict[str, Any]:
    pre = float(result.control_margin) if result and result.control_margin is not None else None
    post = float(result.treatment_margin) if result and result.treatment_margin is not None else None
    lift_pp = (post - pre) * (100 if pre is not None and abs(pre) <= 1 else 1) if pre is not None and post is not None else None
    if pre is not None and post is not None and abs(pre) <= 1:
        # Margins stored as fractions → percentage points.
        lift_pp = (post - pre) * 100
    elif pre is not None and post is not None:
        lift_pp = post - pre

    lift_label, lift_tone = _format_lift_pp(lift_pp)
    trend_label, trend_tone = _trend(
        float(result.p_value) if result and result.p_value is not None else None,
        lift_pp,
    )

    slice_pct = float(test.slice_pct) if test.slice_pct is not None else 0.0
    test_id = str(test.id)
    aid = str(test.aid)
    return {
        "id": test_id,
        "rank": chr(ord("A") + idx),
        "title": aid,
        "subtitle": f"slice {slice_pct:.0f}% · {_status_label(test).lower()}",
        "status": _status_label(test),
        "decisionState": test.decision_state or test.status,
        "preMargin": _format_pct(pre),
        "postMargin": _format_pct(post),
        "lift": lift_label,
        "liftTone": lift_tone,
        "trend": trend_label,
        "trendTone": trend_tone,
        "actions": ab_actions(test_id=test_id, aid=aid),
    }


def _decision_label(rec: str | None) -> tuple[str, str]:
    """Map simulation recommendation -> (label, tone) for the tracker chip."""
    return {
        "launch": ("safe to launch", "positive"),
        "continue": ("continue running", "positive"),
        "hold": ("hold — re-check inputs", "warning"),
        "promote": ("ready to promote", "positive"),
        "stop": ("stop — risk too high", "negative"),
    }.get(rec or "", ("simulation pending", "neutral"))


def _decision_row(idx: int, test: AbTest, db) -> dict[str, Any]:
    """Compose the operational row: status + observed + simulation + blockers."""
    snap = ab_results_service.latest(db, test.id)
    base = _row(idx, test, snap)

    # Pick the most-relevant simulation stage for this lifecycle state.
    stage_by_state = {
        "draft": ab_simulation_service.STAGE_PRE_LAUNCH,
        "ready_to_launch": ab_simulation_service.STAGE_PRE_LAUNCH,
        "running": ab_simulation_service.STAGE_IN_FLIGHT,
        "held": ab_simulation_service.STAGE_IN_FLIGHT,
        "completed": ab_simulation_service.STAGE_PROMOTION_GATE,
    }
    target_stage = stage_by_state.get(
        test.decision_state, ab_simulation_service.STAGE_IN_FLIGHT
    )
    sim = ab_simulation_service.latest_for_stage(db, test.id, stage=target_stage)
    if sim is None:
        sim = ab_simulation_service.latest(db, test.id)

    significance: str
    if snap is None or snap.p_value is None:
        significance = "no observed data yet"
    elif float(snap.p_value) <= 0.05:
        significance = f"significant (p={float(snap.p_value):.3f})"
    else:
        significance = f"not significant (p={float(snap.p_value):.3f})"

    rec_label, rec_tone = _decision_label(sim.recommendation if sim else None)
    return {
        **base,
        "simulation": {
            "stage": sim.stage if sim else None,
            "recommendation": sim.recommendation if sim else None,
            "label": rec_label,
            "tone": rec_tone,
            "expectedLift": sim.expected_lift if sim else None,
            "downsideProbability": sim.downside_probability if sim else None,
            "blockers": sim.blockers if sim else [],
            "warnings": sim.warnings if sim else [],
        },
        "significance": significance,
        "promotionEligible": bool(test.promotion_eligible),
        "promotionBlockers": (test.promotion_blockers or {}).get("blockers", []),
    }


async def build() -> list[dict[str, Any]]:
    try:
        with SessionLocal() as db:
            tests = (
                db.query(AbTest)
                .filter(
                    AbTest.decision_state.in_(
                        ("draft", "ready_to_launch", "running", "held", "completed")
                    )
                )
                .order_by(desc(AbTest.start_date))
                .limit(20)
                .all()
            )
            if not tests:
                return []
            rows: list[dict[str, Any]] = []
            for idx, t in enumerate(tests):
                try:
                    rows.append(_decision_row(idx, t, db))
                except Exception:
                    # Per-row degradation: keep the basic projection so the
                    # tracker still surfaces the test even if sim/results
                    # composition fails for one row.
                    rows.append(_row(idx, t, _latest_result(db, t.id)))
            return rows
    except Exception:
        raise ActionCenterBlockError("abTests", "A/B tracker unavailable.")


def _attach_seed_actions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Seed rows have a string ``id`` and a ``title`` that doubles as the aid;
    surface the same ``actions`` shape so the frontend never sees a row
    without typed intents."""
    out: list[dict[str, Any]] = []
    for r in rows:
        if "actions" in r:
            out.append(r)
            continue
        test_id = str(r.get("id") or r.get("title") or "")
        aid = str(r.get("title") or test_id)
        out.append({**r, "actions": ab_actions(test_id=test_id, aid=aid)})
    return out
