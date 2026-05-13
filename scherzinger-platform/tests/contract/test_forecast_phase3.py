"""Phase 3 contract — diagnostic blocks bundled in /screens/forecast."""
from __future__ import annotations

from fastapi.testclient import TestClient

URL = "/api/v1/screens/forecast"


def test_margin_trajectory_block_present(client: TestClient) -> None:
    body = client.get(URL).json()
    assert "marginTrajectory" in body
    mt = body["marginTrajectory"]
    assert {"historical", "projected", "floor", "crossesFloorAt", "methodologyNote"} <= set(mt.keys())
    assert mt["floor"] == 60.0
    assert len(mt["historical"]) >= 4
    assert len(mt["projected"]) >= 1


def test_cost_decomposition_block(client: TestClient) -> None:
    body = client.get(URL).json()
    cd = body["costDecomposition"]
    assert {"quarters", "layers"} <= set(cd.keys())
    assert len(cd["layers"]) == 3
    for layer in cd["layers"]:
        assert {"name", "values", "trendDirection", "insight"} <= set(layer.keys())
        assert layer["trendDirection"] in ("up", "down", "flat")
        # Insight must not be empty (data-driven generation).
        assert layer["insight"]


def test_seasonal_overlay_block(client: TestClient) -> None:
    body = client.get(URL).json()
    so = body["seasonalOverlay"]
    assert {"months", "indices", "currentMonthLabel", "deviationPct", "deviationTone"} <= set(so.keys())
    assert len(so["indices"]) == 12
    assert so["deviationTone"] in ("green", "amber", "red")


def test_commodity_trajectories_block(client: TestClient) -> None:
    body = client.get(URL).json()
    ct = body["commodityTrajectories"]
    assert {"quarters", "groups"} <= set(ct.keys())
    assert len(ct["groups"]) >= 4
    for g in ct["groups"]:
        assert {"id", "series", "slopePerYear"} <= set(g.keys())
