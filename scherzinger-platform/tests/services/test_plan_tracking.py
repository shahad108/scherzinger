import json, tempfile
from pathlib import Path
import pytest
from backend.services.forecast import plan_tracking


@pytest.fixture
def tmp_plan(monkeypatch, tmp_path):
    p = tmp_path / "plan.json"
    p.write_text(json.dumps({
        "fiscal_year": 2026,
        "rows": [
            {"month": "2026-01", "mode": "revenue", "cluster": None, "value": 500, "reset_log": []},
            {"month": "2026-02", "mode": "revenue", "cluster": None, "value": 600, "reset_log": [{"at": "2026-01-15T00:00:00Z", "by": "M", "reason": "steel", "prior_value": 550}]},
            {"month": "2026-03", "mode": "revenue", "cluster": None, "value": 700, "reset_log": []},
        ],
    }))
    monkeypatch.setattr(plan_tracking, "PLAN_PATH", p)


def test_block_is_degraded_when_no_authoritative_plan_targets(tmp_plan):
    """DATA-AUDIT-2026-05-17 defect #4: plan values in plan.json are
    hand-crafted demo targets, not from a real plan_targets table. The
    builder degrades the block so the FE can render an honest "unavailable"
    affordance. Actuals + reset-log are preserved (those are real)."""
    actuals = {"2026-01": 480, "2026-02": 590}
    out = plan_tracking.build_plan_tracking(actuals_by_month=actuals)
    # Plan values nulled across the series
    assert all(p["plan"] is None for p in out["points"])
    # Actuals preserved for the months we have them
    assert out["points"][0]["actual"] == 480
    assert out["points"][2]["actual"] is None
    # Cumulative gap nulled — UI must render empty state
    assert out["cumulativeGapEur"] is None
    assert out["cumulativeGapPct"] is None
    # meta carries the degraded signal
    assert out["meta"]["status"] == "degraded"
    assert "plan targets" in out["meta"]["reason"].lower()
    # Reset log preserved (it's real)
    assert len(out["resetLog"]) == 1
    assert out["resetLog"][0]["by"] == "M"


def test_no_actuals(tmp_plan):
    out = plan_tracking.build_plan_tracking()
    assert out["cumulativeGapEur"] is None
    assert all(p["actual"] is None for p in out["points"])
    assert all(p["plan"] is None for p in out["points"])


def test_recent_month_attribution_populated(tmp_plan):
    """v2.2 Phase A: when the composer passes a PVM dict in, the plan-tracking
    payload echoes it as ``recentMonthAttribution`` for the FE chip strip.
    Attribution is independent of plan-tracking degradation."""
    actuals = {"2026-01": 480, "2026-02": 590}
    pvm = {"price": -10_000, "volume": -5_000, "mix": -2_000, "cost": 3_000}
    out = plan_tracking.build_plan_tracking(actuals_by_month=actuals, pvm_attribution=pvm)
    assert out["recentMonthAttribution"] == pvm
    # Gap remains null (no authoritative plan) but PVM still flows through.
    assert out["cumulativeGapEur"] is None
