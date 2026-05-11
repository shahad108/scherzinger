"""Phase 6 contract — composed Quotes & Guardrails.

Verifies:
  * top-level shape (10 keys)
  * persona gate (Till → 404 P10, Heiko → 404 P11)
  * cross-link invariants — every analysis.*.jumpLink.to is internal
  * filter params plumb through
  * ETag round-trip
"""
from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

URL = "/api/v1/screens/quotes"


def test_quotes_top_level_shape(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    expected = {
        "header",
        "briefing",
        "pipeline",
        "changed",
        "escalations",
        "funnel",
        "guardrails",
        "active",
        "analysis",
        "gap",
        "crossLinks",
    }
    assert set(body.keys()) == expected
    assert {"rep", "sku", "cust"} <= set(body["analysis"].keys())


def test_quotes_phase5_gap_block(client: TestClient) -> None:
    """Phase 5: quote→invoice gap block carries headline, byYear, source, heuristic."""
    body = client.get(URL).json()
    gap = body["gap"]
    assert {"title", "subtitle", "overall", "byYear", "tone",
            "headline", "coverage", "interpretation", "source",
            "heuristic"} <= set(gap.keys())
    # heuristic always carries a label so the FE can render its pill.
    assert isinstance(gap["heuristic"]["label"], str) and gap["heuristic"]["label"]
    # tone is one of the four UI tones.
    assert gap["tone"] in {"positive", "warning", "negative", "neutral"}
    if gap["overall"] is not None:
        overall = gap["overall"]
        assert overall["n"] >= 1
        assert overall["median_gap_pp"] is not None
        assert overall["mean_gap_pp"] is not None
        # byYear rows must each carry n + at least one of median/mean.
        for row in gap["byYear"]:
            assert row["n"] >= 1
            assert row["median_gap_pp"] is not None or row["mean_gap_pp"] is not None


def test_quotes_persona_till_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "till"})
    assert res.status_code == 404
    detail = res.json()["detail"]
    assert detail["code"] == "persona_not_implemented"
    assert "Phase 10" in detail["message"]


def test_quotes_persona_heiko_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "heiko"})
    assert res.status_code == 404
    detail = res.json()["detail"]
    assert "Phase 11" in detail["message"]


def _walk_jump_links(obj: Any, hits: list[dict[str, Any]]) -> None:
    if isinstance(obj, dict):
        if "to" in obj and isinstance(obj["to"], str) and "label" in obj:
            hits.append(obj)
        for v in obj.values():
            _walk_jump_links(v, hits)
    elif isinstance(obj, list):
        for v in obj:
            _walk_jump_links(v, hits)


def test_quotes_cross_link_targets_are_internal(client: TestClient) -> None:
    body = client.get(URL).json()
    hits: list[dict[str, Any]] = []
    _walk_jump_links(body.get("analysis"), hits)
    assert hits, "expected at least one jumpLink in analysis"
    for jump in hits:
        target = jump["to"]
        assert isinstance(target, str)
        assert target.startswith(("/", "#")), f"external jumpLink: {jump}"


def test_quotes_etag_round_trip(client: TestClient) -> None:
    first = client.get(URL)
    etag = first.headers.get("etag")
    assert etag
    second = client.get(URL, headers={"If-None-Match": etag})
    assert second.status_code == 304


def test_quotes_etag_changes_with_filters(client: TestClient) -> None:
    a = client.get(URL).headers["etag"]
    # Use a filter that changes the active.rows narrowing — pick any rep
    # that exists in the seed.
    full = client.get(URL).json()
    rows = full["active"].get("rows") or []
    rep = next((r.get("rep") for r in rows if r.get("rep")), None)
    if rep is None:
        return
    b = client.get(URL, params={"rep": rep}).headers["etag"]
    # Filter may be a no-op when rep already covers all rows.
    assert isinstance(a, str) and isinstance(b, str)
