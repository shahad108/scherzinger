"""Live Action Center contract checks.

Critical blocks now expose explicit degraded-state metadata instead of
silently falling back to seeded placeholder content.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def _payload(client: TestClient) -> dict:
    res = client.get("/api/v1/screens/action-center")
    assert res.status_code == 200, res.text
    return res.json()


def test_trust_strip_has_4_tiles_each_with_label_value_caption(client: TestClient) -> None:
    body = _payload(client)
    trust_meta = body["meta"]["blocks"]["trust"]
    trust = body["trust"]
    if trust_meta["status"] == "live":
        assert isinstance(trust, list) and len(trust) == 4
        for tile in trust:
            assert {"label", "value", "caption"} <= set(tile.keys())
    else:
        assert trust_meta["status"] == "degraded"
        assert isinstance(trust, list) and trust == []
        assert trust_meta["reason"]


def test_lost_quote_carries_all_required_fields(client: TestClient) -> None:
    body = _payload(client)
    lq = body["lostQuote"]
    assert {"wonAvg", "lostAvg", "differential", "pValue", "implication"} <= set(lq.keys())


def test_rejections_default_capped_at_5(client: TestClient) -> None:
    body = _payload(client)
    assert len(body["rejections"]) <= 5
    for r in body["rejections"]:
        assert {"rank", "code", "subtitle", "lostRevenue", "share", "owner"} <= set(r.keys())


def test_rejections_limit_param_extends_listing(client: TestClient) -> None:
    """The ?limit= param widens the rejections list. With seed data it caps
    at the seed length; with live data it caps at the requested limit.
    """
    smaller = client.get("/api/v1/screens/action-center", params={"limit": 1}).json()
    bigger = client.get("/api/v1/screens/action-center", params={"limit": 50}).json()
    assert len(smaller["rejections"]) <= len(bigger["rejections"])
    assert len(bigger["rejections"]) <= 200


def test_negotiation_carries_commodity_tiles(client: TestClient) -> None:
    body = _payload(client)
    neg = body["negotiation"]
    assert "commodities" in neg and isinstance(neg["commodities"], list)
    assert "discountGap" in neg and "discountGapDelta" in neg
    assert "summary" in neg and isinstance(neg["summary"], list)


def test_abtests_reflects_live_running_test(client: TestClient) -> None:
    """Starting an A/B test via /actions/start_ab_test must surface in the
    Action Center A/B tracker on the next render.
    """
    csrf = client.cookies.get("pryzm_csrf")
    assert csrf
    res = client.post(
        "/api/v1/actions/start_ab_test",
        headers={"x-csrf": csrf, "x-pryzm-idempotency-key": "ac-ab-feed-test"},
        json={
            "aid": "TEST-AID-001",
            "slice_pct": 12,
            "control_price": 4.10,
            "treatment_price": 4.38,
        },
    )
    assert res.status_code == 200, res.text

    body = _payload(client)
    titles = [t.get("title") for t in body["abTests"]]
    assert any("TEST-AID-001" in (t or "") for t in titles), titles


def test_trust_strip_reports_degraded_state_without_seed_fallback(
    client: TestClient, monkeypatch
) -> None:
    async def boom():
        raise RuntimeError("trust source unavailable")

    monkeypatch.setattr(
        "backend.services.action_center.composer.trust_block.build", boom
    )
    # The action-center composer caches payloads for 60s. Earlier tests in
    # the suite warm the cache with a live payload; without this invalidate
    # the monkeypatched ``boom`` never runs and the test sees the cached
    # success body. Always invalidate before exercising the degraded path.
    from backend.services.action_center.composer import invalidate_cache
    invalidate_cache()

    body = _payload(client)
    meta = body["meta"]["blocks"]["trust"]
    assert meta["status"] == "degraded"
    assert "unavailable" in meta["reason"].lower()
    assert body["trust"] == []
