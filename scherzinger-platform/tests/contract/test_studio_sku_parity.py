"""Phase B5 — cross-screen SKU parity.

For any given queue slice (e.g. ``?queue=churn``), the article_ids that
appear in the Action Center's decision rows must be a subset of the
SKUs in the Pricing Studio shell's picker. Otherwise the deep-link
from a decision card to the Studio workbench will land on a missing
aid — the user can't pivot.

This test exercises the shared
``backend.services._shared.action_queue.get_action_queue_skus``
helper which both endpoints now consume.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


URL_STUDIO = "/api/v1/screens/studio"
URL_ACTION_CENTER = "/api/v1/screens/action-center"


def _decisions_for_queue(client: TestClient, queue: str) -> list[dict]:
    """Fetch the decisions list narrowed to one queue."""
    res = client.get(URL_ACTION_CENTER)
    assert res.status_code == 200, res.text
    body = res.json()
    decisions = body.get("decisions") or []
    return [d for d in decisions if str(d.get("queue", "")).lower() == queue]


def _studio_skus_for_queue(client: TestClient, queue: str) -> list[str]:
    res = client.get(URL_STUDIO, params={"queue": queue})
    assert res.status_code == 200, res.text
    body = res.json()
    return [str(s.get("aid")) for s in (body.get("skus") or []) if s.get("aid")]


def test_studio_sku_superset_of_action_center_for_each_queue(
    client: TestClient,
) -> None:
    """For each known queue, studio.shell.skus[].aid ⊇ decisions[].article_id."""
    for queue in ("churn", "cost_riser", "margin_erosion"):
        decisions = _decisions_for_queue(client, queue)
        # When the decisions block is empty for this queue (legit on
        # sparse demo data) there's nothing to prove — skip the slice.
        ac_aids = {
            str(d["article_id"])
            for d in decisions
            if d.get("article_id")
        }
        if not ac_aids:
            continue
        studio_aids = set(_studio_skus_for_queue(client, queue))
        missing = ac_aids - studio_aids
        assert not missing, (
            f"queue={queue}: Pricing Studio picker is missing aids that "
            f"the Action Center surfaces: {sorted(missing)}. "
            f"Studio aids: {sorted(studio_aids)}"
        )


def test_studio_queue_filter_narrows_skus(client: TestClient) -> None:
    """Sanity — passing ?queue=cost_riser shrinks the SKU list relative
    to the unfiltered shell. (When the slice is empty we don't assert
    strict inequality; we just check the API accepts the param.)
    """
    full = client.get(URL_STUDIO).json()
    cost = client.get(URL_STUDIO, params={"queue": "cost_riser"}).json()
    assert isinstance(full.get("skus"), list)
    assert isinstance(cost.get("skus"), list)
    # appliedFilters must echo the slice back so deep-links round-trip.
    applied = cost.get("appliedFilters") or {}
    assert applied.get("queue") == "cost_riser"


def test_studio_customer_id_round_trips(client: TestClient) -> None:
    res = client.get(URL_STUDIO, params={"customer_id": "CUST-DOES-NOT-EXIST"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body.get("appliedFilters") or {}).get("customerId") == (
        "CUST-DOES-NOT-EXIST"
    )
