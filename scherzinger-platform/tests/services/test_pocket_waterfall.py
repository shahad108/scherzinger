import pytest
from backend.services.forecast import pocket_waterfall


def test_steps_have_leakage():
    out = pocket_waterfall.build_pocket_waterfall()
    assert [s["name"] for s in out["steps"]] == ["list", "quoted", "booked", "invoiced", "db2"]
    # Leakage from list (100) to quoted (88) = 12%
    assert out["steps"][1]["leakagePct"] == pytest.approx(12.0)
    # First step has no leakage
    assert out["steps"][0]["leakagePct"] is None


def test_per_cluster_band():
    out = pocket_waterfall.build_pocket_waterfall(
        per_cluster_prices={"BKAES": [80, 82, 85, 88, 90, 95]},
    )
    assert len(out["perCluster"]) == 1
    band = out["perCluster"][0]
    assert band["cluster"] == "BKAES"
    assert band["p10"] <= band["median"] <= band["p90"]
    assert sum(h["count"] for h in band["histogram"]) == 6
