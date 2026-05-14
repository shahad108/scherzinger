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


def test_walk_forward_emits_signed_errors_by_cluster(db):
    """v2.2 Phase A: real_backtest must surface per-cluster signed errors so
    the bias composer can read them. We accept either an empty dict (when
    seed data has no overlap window) or a populated one — but the key must
    always exist as part of the shape contract."""
    from backend.services.forecast.real_backtest import build_walk_forward
    wf = build_walk_forward(db)
    assert "signedErrorsByCluster" in wf
    sec = wf["signedErrorsByCluster"]
    assert isinstance(sec, dict)
    # For the live Scherzinger seed the fallback "monthly margin vs trailing
    # mean" path should fire (margin_forecasts.forecast_date is in the future
    # vs invoices.date), giving ≥ 1 cluster series with multiple points.
    if sec:
        for cluster, errs in sec.items():
            assert isinstance(cluster, str)
            assert all(isinstance(e, (int, float)) for e in errs)
