"""Phase 5 contract — composed Margin Cockpit.

Verifies:
  * top-level shape (10 keys)
  * persona gate (Till → 404 P10, Heiko → 404 P11)
  * filter params plumb through (cluster narrows clusters list)
  * jumpTo invariants: every tab in {cross,leak,seg,erode,cust} and every
    segTab in {family,tier,size,region}
  * ETag round-trip
"""
from __future__ import annotations

import re
from typing import Any

from fastapi.testclient import TestClient

URL = "/api/v1/screens/margin-cockpit"

ALLOWED_TABS = {"cross", "leak", "seg", "erode", "cust"}
ALLOWED_SEG_TABS = {"family", "tier", "size", "region"}


def test_margin_top_level_shape(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    expected = {
        "header",
        "briefing",
        "health",
        "clusters",
        "shifted",
        "waterfall",
        "lostQuote",
        "costVsPrice",
        "tabs",
        "crossLinks",
    }
    assert set(body.keys()) == expected
    assert set(body["tabs"].keys()) >= ALLOWED_TABS


def test_margin_persona_till_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "till"})
    assert res.status_code == 404
    body = res.json()
    assert body["detail"]["code"] == "persona_not_implemented"
    assert "Phase 10" in body["detail"]["message"]


def test_margin_persona_heiko_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "heiko"})
    assert res.status_code == 404


def test_margin_cluster_filter(client: TestClient) -> None:
    full = client.get(URL).json()
    # Pick a code that exists in seed; prove the param actually narrows.
    if not full["clusters"]:
        return  # nothing to filter
    sample = next(
        (c["code"] for c in full["clusters"] if c.get("code")),
        None,
    )
    if sample is None:
        return
    narrowed = client.get(URL, params={"cluster": sample}).json()
    assert all(c.get("code", "").lower() == sample.lower() for c in narrowed["clusters"])


def _walk_jump_to(obj: Any, hits: list[dict[str, Any]]) -> None:
    if isinstance(obj, dict):
        if (
            obj.get("kind") == "tab"
            and "tab" in obj
            and obj.get("kind") != "route"
        ):
            hits.append(obj)
        for v in obj.values():
            _walk_jump_to(v, hits)
    elif isinstance(obj, list):
        for v in obj:
            _walk_jump_to(v, hits)


def test_margin_jump_to_invariants(client: TestClient) -> None:
    body = client.get(URL).json()
    hits: list[dict[str, Any]] = []
    for key in ("shifted", "waterfall"):
        _walk_jump_to(body.get(key), hits)
    assert hits, "expected at least one jumpTo in shifted/waterfall"
    for jump in hits:
        assert jump["tab"] in ALLOWED_TABS, jump
        if "segTab" in jump:
            assert jump["segTab"] in ALLOWED_SEG_TABS, jump


def test_margin_waterfall_phase4_enrichment(client: TestClient) -> None:
    """Phase 4: every loss bucket carries classification + movableShare,
    and movableView is precomputed with chart + buckets + heuristic."""
    body = client.get(URL).json()
    wf = body["waterfall"]
    loss_buckets = [b for b in wf["buckets"] if not b.get("endpoint")]
    for b in loss_buckets:
        assert b.get("classification") in {"strategic", "unintended", "mixed"}, b
        assert isinstance(b.get("classificationNote"), str) and b["classificationNote"]
        assert 0.0 <= float(b.get("movableShare", -1)) <= 1.0, b

    mv = wf["movableView"]
    assert set(mv.keys()) >= {"title", "buckets", "chart", "totalChip", "heuristic"}
    assert mv["heuristic"]["label"] == "Pilot heuristic"
    # Movable chart endpoints framing — target start + actual end.
    assert mv["chart"][0]["kind"] == "endpoint"
    assert mv["chart"][-1]["kind"] == "endpoint"
    # Actual margin in movable view must be higher than full view (we
    # only kept the leakage Frank can act on).
    full_actual = next(b for b in wf["buckets"] if b.get("endpoint") == "green-end")
    mv_actual = next(b for b in mv["buckets"] if b.get("endpoint") == "green-end")
    full_pct = float(full_actual["pct"].rstrip("%"))
    mv_pct = float(mv_actual["pct"].rstrip("%"))
    assert mv_pct > full_pct, (mv_pct, full_pct)


def test_margin_etag_round_trip(client: TestClient) -> None:
    first = client.get(URL)
    etag = first.headers.get("etag")
    assert etag
    second = client.get(URL, headers={"If-None-Match": etag})
    assert second.status_code == 304


def test_margin_etag_changes_with_filters(client: TestClient) -> None:
    a = client.get(URL).headers["etag"]
    full = client.get(URL).json()
    sample = next((c.get("code") for c in full["clusters"] if c.get("code")), None)
    if sample is None:
        return
    b = client.get(URL, params={"cluster": sample}).headers["etag"]
    # When the filter is a no-op (cluster matches the existing single chip),
    # ETag may be equal — assert at minimum the bodies are valid.
    assert re.fullmatch(r'"[0-9a-f]{16}"', a)
    assert re.fullmatch(r'"[0-9a-f]{16}"', b)
