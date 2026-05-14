import pytest
from backend.services.forecast import bias


def test_persistent_overforecast():
    out = bias.build_bias(cluster_errors={"BKAES": [3.0, 4.0, 5.0, 4.5, 3.8, 4.2]})
    row = next(r for r in out["rows"] if r["cluster"] == "BKAES")
    assert row["cmeOverMad"] > 0
    assert row["trailing6moDirection"] == "over"


def test_balanced_bias():
    out = bias.build_bias(cluster_errors={"MBDIV": [2.0, -2.0, 1.0, -1.0]})
    row = next(r for r in out["rows"] if r["cluster"] == "MBDIV")
    assert abs(row["cmeOverMad"]) < 0.5
    assert row["trailing6moDirection"] == "flat"


def test_hit_rate():
    out = bias.build_bias(cluster_errors={"X": [1.0, 2.0, 6.0, 7.0]})
    row = next(r for r in out["rows"] if r["cluster"] == "X")
    # 2 of 4 within ±5 → 50%
    assert row["hitRatePct"] == 50.0
