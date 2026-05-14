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


def test_cumulative_gap(tmp_plan):
    actuals = {"2026-01": 480, "2026-02": 590}
    out = plan_tracking.build_plan_tracking(actuals_by_month=actuals)
    assert out["points"][0]["plan"] == 500 and out["points"][0]["actual"] == 480
    assert out["points"][2]["actual"] is None
    # Cumulative: actual 480+590=1070, plan up to last actual 500+600=1100, gap = -30
    assert out["cumulativeGapEur"] == pytest.approx(-30)
    assert out["cumulativeGapPct"] == pytest.approx(-30 / 1100 * 100, abs=1e-6)
    assert len(out["resetLog"]) == 1
    assert out["resetLog"][0]["by"] == "M"


def test_no_actuals(tmp_plan):
    out = plan_tracking.build_plan_tracking()
    assert out["cumulativeGapEur"] == 0
    assert all(p["actual"] is None for p in out["points"])


def test_recent_month_attribution_populated(tmp_plan):
    """v2.2 Phase A: when the composer passes a PVM dict in, the plan-tracking
    payload echoes it as ``recentMonthAttribution`` for the FE chip strip."""
    actuals = {"2026-01": 480, "2026-02": 590}
    pvm = {"price": -10_000, "volume": -5_000, "mix": -2_000, "cost": 3_000}
    out = plan_tracking.build_plan_tracking(actuals_by_month=actuals, pvm_attribution=pvm)
    assert out["recentMonthAttribution"] == pvm
    # Cumulative gap should still match the seeded plan vs actuals map.
    assert out["cumulativeGapEur"] == pytest.approx(-30)
