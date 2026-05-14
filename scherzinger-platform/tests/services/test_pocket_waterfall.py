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


def test_from_db_monotonic_steps(db):
    """v2.2 Phase A: the live composer pulls from the same invoice + quote
    ledgers other forecast blocks use. Steps must remain non-increasing
    (each downstream value ≤ the upstream one) and we expect at least one
    per-cluster price band."""
    out = pocket_waterfall.build_pocket_waterfall_from_db(db)
    assert isinstance(out, dict)
    steps = out["steps"]
    assert [s["name"] for s in steps] == ["list", "quoted", "booked", "invoiced", "db2"]
    values = [s["value"] for s in steps]
    # Either the live path returned monotonic values, or the safety net
    # returned the seeded defaults (which are also monotonic).
    for prev, nxt in zip(values, values[1:]):
        assert nxt <= prev + 1e-6, f"step values not monotonic: {values}"
    # At least one per-cluster band — the live invoice ledger has multiple
    # commodity groups; v2.2 Phase A requires real per-cluster price bands
    # so the FE Pocket Waterfall card has something to render below the
    # main waterfall steps.
    assert isinstance(out["perCluster"], list)
    assert len(out["perCluster"]) >= 1, "expected ≥1 per-cluster band from live DB"
