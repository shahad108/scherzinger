"""Phase 4 contract — composed Action Center.

Verifies the composer:
  * matches the seed's top-level shape (12 keys)
  * personalises the greeting from the authenticated user
  * gates non-Frank personas with a documented 404
  * honours hide_locked + cluster filters
  * respects ETag/If-None-Match
"""
from __future__ import annotations

from fastapi.testclient import TestClient


URL = "/api/v1/screens/action-center"


def test_action_center_top_level_shape(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    expected_keys = {
        "meta",
        "header",
        "movableHero",
        "buckets",
        "decisions",
        "trust",
        "lostQuote",
        "skuTable",
        "longTail",
        "negotiation",
        "rejections",
        "audit",
        "abTests",
        "summary",
    }
    assert set(body.keys()) == expected_keys


def test_action_center_meta_exposes_trace_and_block_statuses(client: TestClient) -> None:
    body = client.get(URL).json()
    meta = body["meta"]
    assert meta["generatedAt"]
    assert meta["traceId"]
    assert set(meta["blocks"].keys()) == {
        "header",
        "movableHero",
        "buckets",
        "decisions",
        "trust",
        "lostQuote",
        "skuTable",
        "longTail",
        "negotiation",
        "rejections",
        "audit",
        "abTests",
        "summary",
    }
    # Plan §0 iron rule 6 — block status enum is fixed.
    assert all(
        block["status"] in {"live", "empty", "degraded", "locked"}
        for block in meta["blocks"].values()
    )


def test_action_center_personalises_greeting(client: TestClient) -> None:
    res = client.get(URL)
    body = res.json()
    # Frank is logged in by the conftest client fixture.
    assert "Frank" in body["header"]["greeting"]


def test_action_center_persona_till_returns_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "till"})
    assert res.status_code == 404
    body = res.json()
    assert body["detail"]["code"] == "persona_not_implemented"
    assert body["detail"]["persona"] == "till"
    assert "Phase 10" in body["detail"]["message"]


def test_action_center_persona_heiko_returns_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "heiko"})
    assert res.status_code == 404
    body = res.json()
    assert body["detail"]["persona"] == "heiko"
    assert "Phase 11" in body["detail"]["message"]


def test_action_center_hide_locked_filters_sku_table(client: TestClient) -> None:
    full = client.get(URL).json()
    filtered = client.get(URL, params={"hide_locked": "true"}).json()
    if full["meta"]["blocks"]["skuTable"]["status"] == "live":
        assert len(filtered["skuTable"]) <= len(full["skuTable"])
    assert all("locked" not in r["status"].lower() for r in filtered["skuTable"])


def test_action_center_hide_locked_filters_buckets(client: TestClient) -> None:
    filtered = client.get(URL, params={"hide_locked": "true"}).json()
    bucket_ids = {b["id"] for b in filtered["buckets"]}
    assert "locked" not in bucket_ids


def test_action_center_etag_round_trip(client: TestClient) -> None:
    first = client.get(URL)
    etag = first.headers.get("etag")
    assert etag, "missing ETag"
    second = client.get(URL, headers={"If-None-Match": etag})
    assert second.status_code == 304


def test_action_center_etag_changes_with_filters(client: TestClient) -> None:
    a = client.get(URL).headers["etag"]
    b = client.get(URL, params={"hide_locked": "true"}).headers["etag"]
    assert a != b


def test_summary_block_shape(client: TestClient) -> None:
    """Plan §2.3 contract — TodaySummaryStrip ships exactly 5 fixed-id tiles.

    The composer guarantees this shape (status live | empty | degraded)
    so the React component never has to defend against missing keys.
    """
    body = client.get(URL).json()
    summary = body["summary"]
    tiles = summary["tiles"]

    assert len(tiles) == 5
    assert [t["id"] for t in tiles] == [
        "movable_revenue",
        "open_actions",
        "recoverable_margin",
        "blocked_quotes",
        "model_trust",
    ]

    required_keys = {
        "id",
        "label",
        "value",
        "delta",
        "deltaDirection",
        "tone",
        "sourceBlockId",
        "action",
        "locked",
    }
    for tile in tiles:
        assert required_keys.issubset(tile.keys()), tile
        # Every tile must carry a typed action — no nullable fallbacks.
        assert tile["action"] is not None, tile["id"]
        assert isinstance(tile["action"], dict), tile["id"]

    assert body["meta"]["blocks"]["summary"]["status"] in {
        "live",
        "empty",
        "degraded",
        "locked",
    }


def test_summary_block_scroll_intents(client: TestClient) -> None:
    """movable_revenue, open_actions, recoverable_margin tiles emit
    scroll intents (anchor-only, no full-page navigation)."""
    body = client.get(URL).json()
    tiles = {t["id"]: t for t in body["summary"]["tiles"]}
    assert tiles["movable_revenue"]["action"].get("scroll") == "#sec-movable"
    assert tiles["open_actions"]["action"].get("scroll") == "#sec-decisions"
    assert tiles["recoverable_margin"]["action"].get("scroll") == "#sec-decisions"
    assert (tiles["recoverable_margin"]["action"].get("query") or {}).get(
        "queue"
    ) == "margin"
    # Blocked quotes is a full-page nav.
    blocked = tiles["blocked_quotes"]["action"]
    assert blocked.get("route") == "/quotes"
    assert (blocked.get("query") or {}).get("status") == "blocked"
    # Model trust opens a drawer (reuses TrustDrawer).
    assert tiles["model_trust"]["action"].get("drawer") is not None


def test_decisions_carry_financial_impact_shape(client: TestClient) -> None:
    """Every decision row exposes ``financialImpact.recoverableMargin``.

    Value is either ``null`` (when no recoverable margin can be derived)
    or a ``{value, currency}`` object — never a bare number.
    """
    body = client.get(URL).json()
    if body["meta"]["blocks"]["decisions"]["status"] != "live":
        return
    for d in body["decisions"]:
        assert "financialImpact" in d, d.get("title")
        fi = d["financialImpact"]
        assert isinstance(fi, dict)
        rm = fi.get("recoverableMargin")
        if rm is None:
            continue
        assert isinstance(rm, dict)
        assert set(rm.keys()) >= {"value", "currency"}
        assert rm["currency"] == "EUR"
        assert isinstance(rm["value"], (int, float))


def test_summary_block_empty_status_when_all_tiles_null(monkeypatch) -> None:
    """Plan §2.3 — when every tile value is None the composer classifies
    the strip as ``empty`` (not ``live``). Drives the frontend's empty-
    state copy. Verified directly off ``_resolve_summary`` so the
    classifier logic doesn't depend on real DB state.

    We simulate the worst case: every upstream block is unavailable.
    ``decisions_status="degraded"`` forces ``open_actions`` and
    ``recoverable_margin`` to lock (rather than render ``"0"`` for a
    legitimately clear queue), the blocked-quotes SQL is stubbed to
    ``None``, and ``movable_hero`` / ``trust`` are empty.
    """
    import asyncio

    from backend.services.action_center import summary as summary_block
    from backend.services.action_center.composer import _resolve_summary

    # Stub the only tile builder that does its own SQL (``blocked_quotes``)
    # so this test exercises the classifier logic, not the dev DB.
    monkeypatch.setattr(summary_block, "_blocked_quotes_count", lambda: None)

    payload, meta = asyncio.run(
        _resolve_summary(
            decisions=[],
            movable_hero={},
            trust=[],
            decisions_status="degraded",
        )
    )
    # Composer always returns 5 tiles regardless of status so the React
    # layout never shifts.
    assert len(payload.get("tiles") or []) == 5
    assert meta["status"] == "empty"
    # When the decisions upstream is degraded, open_actions must lock —
    # value=None + locked=True — distinguishing "data unavailable" from
    # "queue cleared" (the latter would emit value="0", locked=False).
    open_actions = next(
        t for t in payload["tiles"] if t["id"] == "open_actions"
    )
    assert open_actions["value"] is None
    assert open_actions["locked"] is True


def test_summary_open_actions_zero_is_live_not_locked() -> None:
    """Plan §0 iron rule — ``locked`` means data source not yet connected.
    A cleared decisions queue is a legitimate live signal: emit ``"0"``
    with a neutral tone, NOT a lock chip.
    """
    import asyncio

    from backend.services.action_center.composer import _resolve_summary

    payload, meta = asyncio.run(
        _resolve_summary(
            decisions=[],
            movable_hero={},
            trust=[],
            decisions_status="empty",
        )
    )
    open_actions = next(
        t for t in payload["tiles"] if t["id"] == "open_actions"
    )
    assert open_actions["value"] == "0"
    assert open_actions["locked"] is False
    assert open_actions["tone"] == "neutral"


def test_action_blocks_always_carry_typed_action_intents(client: TestClient) -> None:
    """Plan §4 / iron rule 7 — backend MUST attach a typed action intent
    to every clickable block; the frontend no longer carries fallback
    intents. Whenever a block is ``live``, the corresponding payload
    field must carry a non-null ``action`` (or per-row action). ``empty``
    / ``degraded`` blocks may omit the field because the frontend never
    renders the CTA.
    """
    body = client.get(URL).json()
    blocks = body["meta"]["blocks"]

    if blocks["movableHero"]["status"] == "live":
        assert body["movableHero"].get("action"), "movableHero missing typed action"
        assert isinstance(body["movableHero"]["action"], dict)

    if blocks["lostQuote"]["status"] == "live":
        assert body["lostQuote"].get("action"), "lostQuote missing typed action"
        assert isinstance(body["lostQuote"]["action"], dict)

    if blocks["skuTable"]["status"] == "live":
        for row in body["skuTable"]:
            assert row.get("action") is not None, f"SKU {row.get('article')} missing typed action"
            assert isinstance(row["action"], dict)

    if blocks["buckets"]["status"] == "live":
        for bucket in body["buckets"]:
            assert bucket.get("action") is not None, (
                f"Bucket {bucket.get('id')} missing typed action"
            )
            assert isinstance(bucket["action"], dict)


def test_decisions_carry_typed_action_intents(client: TestClient) -> None:
    """Plan §4 / iron rule 7 — every decision row must carry the full set
    of typed action intents (``primaryAction``, ``secondaryAction``,
    ``partialAction``, ``snoozeAction``, ``sliceAbAction``) so the frontend
    never has to fabricate a fallback intent. Guarded on ``live`` status —
    ``empty`` / ``degraded`` blocks emit no rows.
    """
    body = client.get(URL).json()
    blocks = body["meta"]["blocks"]
    if blocks["decisions"]["status"] != "live":
        return
    required = (
        "primaryAction",
        "secondaryAction",
        "partialAction",
        "snoozeAction",
        "sliceAbAction",
    )
    for row in body["decisions"]:
        for key in required:
            assert row.get(key) is not None, (
                f"decision {row.get('recommendationId') or row.get('title')!r} missing {key}"
            )
            assert isinstance(row[key], dict), (
                f"decision {row.get('recommendationId') or row.get('title')!r} {key} must be a typed action dict"
            )


def test_header_exposes_workspace_scope_and_export_context(client: TestClient) -> None:
    """Plan §4 / §2.1 F2 — the header block carries ``workspaceScope`` and
    ``exportContext`` drawer-item arrays. Both are empty today and unlock
    in Phase 2; the frontend reads these directly instead of fabricating
    items locally.
    """
    body = client.get(URL).json()
    header = body["header"]
    # Even when the header is degraded the composer's fallback should
    # surface both keys so the drawer dispatcher doesn't crash on a
    # missing field.
    assert "workspaceScope" in header, "header missing workspaceScope"
    assert "exportContext" in header, "header missing exportContext"
    assert isinstance(header["workspaceScope"], list)
    assert isinstance(header["exportContext"], list)


def test_action_center_decisions_respect_limit(client: TestClient) -> None:
    """Phase-4 cap was hard-coded to 3. Commit-4 swapped that for the
    ``limit`` query param (default 5, max 200). Default response carries at
    most ``limit`` decisions; an explicit limit lets the frontend's
    "Show all" expander pull the full ranked list.
    """
    body = client.get(URL).json()
    assert isinstance(body["decisions"], list)
    assert len(body["decisions"]) <= 5

    big = client.get(URL, params={"limit": 50}).json()
    # Wider limit can never return fewer rows than the default.
    assert len(big["decisions"]) >= len(body["decisions"])
