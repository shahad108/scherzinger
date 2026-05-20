"""Phase 12 — Till + Heiko persona overview contract tests."""
from __future__ import annotations

from fastapi.testclient import TestClient


def test_md_overview_shape(client: TestClient) -> None:
    res = client.get("/api/v1/screens/md-overview")
    assert res.status_code == 200, res.text
    body = res.json()
    expected = {"header", "kpis", "approvalQueue", "shares", "recentAudit", "crossLinks", "heuristic"}
    assert expected <= set(body.keys())
    # 4 KPI tiles with the canonical keys.
    keys = {k["key"] for k in body["kpis"]}
    assert {"pending_approval", "drafts", "ab_running", "shares"} <= keys
    for k in body["kpis"]:
        assert {"key", "label", "value", "sub", "tone"} <= set(k.keys())
        assert k["tone"] in {"positive", "warning", "info", "neutral"}
    # Approval queue rows shape (may be empty in a fresh test DB).
    assert isinstance(body["approvalQueue"]["rows"], list)
    # Cross-links present.
    assert body["crossLinks"]
    for cl in body["crossLinks"]:
        assert cl["jumpTo"].startswith("/")


def test_md_overview_etag_round_trip(client: TestClient) -> None:
    first = client.get("/api/v1/screens/md-overview")
    etag = first.headers.get("etag")
    assert etag
    second = client.get("/api/v1/screens/md-overview", headers={"If-None-Match": etag})
    assert second.status_code == 304


def test_deal_inbox_shape(client: TestClient) -> None:
    res = client.get("/api/v1/screens/deal-inbox")
    assert res.status_code == 200, res.text
    body = res.json()
    expected = {"header", "kpis", "shares", "lostQuote", "recentRecs", "crossLinks", "heuristic"}
    assert expected <= set(body.keys())
    # 3 KPI tiles with the canonical keys.
    keys = {k["key"] for k in body["kpis"]}
    assert {"shares", "quote_invoice_gap", "ab_running"} <= keys
    # lostQuote always carries overall + byYear keys (may be None / empty).
    assert "overall" in body["lostQuote"]
    assert isinstance(body["lostQuote"]["byYear"], list)


def test_deal_inbox_etag_round_trip(client: TestClient) -> None:
    first = client.get("/api/v1/screens/deal-inbox")
    etag = first.headers.get("etag")
    assert etag
    second = client.get("/api/v1/screens/deal-inbox", headers={"If-None-Match": etag})
    assert second.status_code == 304
