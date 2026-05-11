"""Phase 9 contract — composed AI Briefing."""
from __future__ import annotations

import os

from fastapi.testclient import TestClient

URL = "/api/v1/screens/ai"


def test_ai_top_level_shape(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body.keys()) == {"header", "memo", "sideCards", "crossLinks"}
    assert isinstance(body["sideCards"], list) and body["sideCards"]


def test_ai_persona_till_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "till"})
    assert res.status_code == 404
    assert "Phase 10" in res.json()["detail"]["message"]


def test_ai_persona_heiko_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "heiko"})
    assert res.status_code == 404
    assert "Phase 11" in res.json()["detail"]["message"]


def test_ai_memo_carries_persona(client: TestClient) -> None:
    body = client.get(URL).json()
    assert body["memo"].get("persona") == "frank"
    assert body["memo"].get("scope") == "monday_briefing"


def test_ai_template_provider_is_deterministic(client: TestClient) -> None:
    from backend.services.ai_briefing.providers import draft_memo

    a = draft_memo(scope="monday_briefing", persona="frank", lang=None)
    b = draft_memo(scope="monday_briefing", persona="frank", lang=None)
    assert a == b


def test_ai_llm_provider_falls_back_when_key_missing(monkeypatch) -> None:
    """Phase 13: LLM provider degrades gracefully without ANTHROPIC_API_KEY."""
    from backend.services.ai_briefing.providers import draft_memo

    monkeypatch.setenv("BRIEFING_PROVIDER", "llm")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    memo = draft_memo(scope="monday_briefing", persona="frank", lang=None)
    # Falls back to template — no provider stamp, deterministic body.
    assert memo.get("provider") != "llm"
    assert memo["scope"] == "monday_briefing"
    assert memo["persona"] == "frank"


def test_ai_etag_round_trip(client: TestClient) -> None:
    first = client.get(URL)
    etag = first.headers.get("etag")
    assert etag
    second = client.get(URL, headers={"If-None-Match": etag})
    assert second.status_code == 304


def test_ai_lang_en_returns_en_seed(client: TestClient) -> None:
    """Phase 13: ?lang=en swaps the provider's seed file."""
    de = client.get(URL).json()
    en = client.get(URL, params={"lang": "en"}).json()
    # The signatures differ by the (EN) marker injected into the en seed.
    assert "(EN)" in en["memo"]["signature"]
    assert "(EN)" not in de["memo"]["signature"]
    assert en["memo"]["lang"] == "en"


def test_ai_phase10_memo_paragraphs_carry_citations(client: TestClient) -> None:
    """Phase 10: every memo paragraph mentioning Article/Customer/Cluster
    carries a citations[] array with deep-link jumpTo paths."""
    body = client.get(URL).json()
    paragraphs = body["memo"]["paragraphs"]
    with_cites = [p for p in paragraphs if p.get("citations")]
    assert with_cites, "expected at least one paragraph with citations"
    all_cites = [c for p in paragraphs for c in p.get("citations", [])]
    kinds = {c["kind"] for c in all_cites}
    assert "article" in kinds
    assert "customer" in kinds
    assert "cluster" in kinds
    for c in all_cites:
        assert {"kind", "target_id", "anchor", "label", "jumpTo"} <= set(c.keys())
        assert c["jumpTo"].startswith("/"), c
        assert c["target_id"], c
    # Side cards mirror the same shape on bullets / body.
    bullet_cites = [c for sc in body["sideCards"] for b in (sc.get("bullets") or []) for c in (b.get("citations") or [])]
    body_cites = [c for sc in body["sideCards"] for c in (sc.get("citations") or [])]
    assert bullet_cites or body_cites, "expected at least one side-card citation"


def test_sanitize_html_strips_scripts_and_attributes() -> None:
    """Phase 13: bleach-style allow-list keeps <b>/<p>, drops <script>+ attrs."""
    from backend.services.ai_briefing.providers import sanitize_html

    out = sanitize_html('<p onclick="x">hi <b class="x">there</b><script>bad()</script></p>')
    assert "<script>" not in out
    assert "onclick" not in out
    # The allow-listed tags survive.
    assert "<b>" in out and "</b>" in out
    assert "there" in out
