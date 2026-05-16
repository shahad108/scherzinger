"""Phase 21 — Studio shell v3 deep-link contract.

The Studio URL must round-trip the deep-link filter quartet
(tier/family/cluster/scenario_id) so refresh + share preserve the
exact slice the user landed on.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

URL = "/api/v1/screens/studio"


def test_applied_filters_echo_back(client: TestClient) -> None:
    """The shell returns ``appliedFilters`` matching the query string."""
    res = client.get(
        URL,
        params={
            "aid": "BKAGG-001",
            "tier": "A",
            "family": "BKAGG",
            "cluster": "Aluminum",
            "scenario_id": "scn-42",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "appliedFilters" in body
    af = body["appliedFilters"]
    assert af["tier"] == "A"
    assert af["family"] == "BKAGG"
    assert af["cluster"] == "Aluminum"
    assert af["scenarioId"] == "scn-42"


def test_applied_filters_default_to_none(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200
    body = res.json()
    af = body["appliedFilters"]
    assert af["tier"] is None
    assert af["family"] is None
    assert af["cluster"] is None
    assert af["scenarioId"] is None


def test_tier_filter_narrows_picker_softly(client: TestClient) -> None:
    """Bogus tier value still returns a usable picker (soft-narrow rule)."""
    res = client.get(URL, params={"tier": "ZZZ"})
    assert res.status_code == 200
    body = res.json()
    # When no SKUs match the soft-narrow leaves the prior list intact.
    assert len(body["skus"]) > 0


def test_deep_link_with_aid_round_trips(client: TestClient) -> None:
    """`?aid=…&tier=A&family=BKAGG` flows through screens.py unmodified."""
    res = client.get(
        URL,
        params={"aid": "BKAGG-001", "tier": "A", "family": "BKAGG"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["defaultAid"] == "BKAGG-001"
    assert body["appliedFilters"]["tier"] == "A"
    assert body["appliedFilters"]["family"] == "BKAGG"
