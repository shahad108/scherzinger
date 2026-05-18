"""Phase 8 contract — composed Pricing Studio.

Phase A5 additions append below the legacy Phase 8 cases and lock in the
hardening guarantees that landed in A1–A4:

  * ``meta.blocks`` per-block status metadata on shell + workbench.
  * Every monetary field surfaced through the workbench is a JSON
    *string* (Pydantic Decimal serialised with ``mode="json"``).
  * No seed fallback — when the underlying source is unavailable, the
    block reports ``empty`` / ``locked`` / ``degraded`` instead of a
    fake ``live`` payload.
  * Cluster-confidence shape on the recommendation block.
  * Cross-screen SKU parity smoke (Phase B5 placeholder).
"""
from __future__ import annotations

import re

from fastapi.testclient import TestClient

SHELL = "/api/v1/screens/studio"
URL_STUDIO = "/api/v1/screens/studio"
URL_WORKBENCH = "/api/v1/screens/studio/workbench/{aid}"
URL_ACTION_CENTER = "/api/v1/screens/action-center"

ALLOWED_BLOCK_STATUSES = {"live", "empty", "degraded", "locked"}
ALLOWED_CONFIDENCE_LEVELS = {"low", "med", "high"}
EXPECTED_WORKBENCH_BLOCK_IDS = {
    "recommendation",
    "wtp",
    "win_prob_curve",
    "competitor_ref",
    "customer_fanout",
    "cost_history",
    "option_margins",
    "comparable",
    "trigger_context",
    "active_ab_test",
    "decision",
    "memo",
}
# Loose lineage shape — UUID-ish or any non-empty string. Empty / null
# lineage refs are allowed for non-live blocks.
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _default_aid(client: TestClient) -> str:
    shell = client.get(URL_STUDIO)
    assert shell.status_code == 200, shell.text
    body = shell.json()
    aid = body.get("defaultAid")
    assert aid, "studio shell has no defaultAid — cannot exercise workbench"
    return aid


def _fetch_workbench(client: TestClient, aid: str | None = None) -> dict:
    aid = aid or _default_aid(client)
    res = client.get(URL_WORKBENCH.format(aid=aid))
    assert res.status_code == 200, res.text
    return res.json()


def _is_string_decimal(value) -> bool:
    """A monetary value must be a JSON string (post-``mode='json'``).

    ``None`` is acceptable for empty / locked blocks; bare ``int`` /
    ``float`` is NOT acceptable because it loses precision and breaks
    the decimal-as-string discipline.
    """
    if value is None:
        return True
    return isinstance(value, str)


def test_studio_shell_top_level_shape(client: TestClient) -> None:
    res = client.get(SHELL)
    assert res.status_code == 200, res.text
    body = res.json()
    expected = {
        "header",
        "filters",
        "toggles",
        "defaultAid",
        "skus",
        "workbench",
        "comparable",
        "crossLinks",
        "footerNote",
    }
    assert expected <= set(body.keys())
    assert body["defaultAid"]


def test_studio_persona_till_404(client: TestClient) -> None:
    res = client.get(SHELL, params={"persona": "till"})
    assert res.status_code == 404
    assert "Phase 10" in res.json()["detail"]["message"]


def test_studio_persona_heiko_blocked(client: TestClient) -> None:
    res = client.get(SHELL, params={"persona": "heiko"})
    assert res.status_code == 404
    detail = res.json()["detail"]
    assert detail["code"] == "persona_no_access"


def test_studio_workbench_endpoint(client: TestClient) -> None:
    shell = client.get(SHELL).json()
    aid = shell["defaultAid"]
    res = client.get(f"{SHELL}/workbench/{aid}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["aid"] == aid
    assert "hero" in body
    assert {"options", "fanout", "cost", "history", "decision", "memo"} <= set(body.keys())


def test_studio_workbench_unknown_aid_404(client: TestClient) -> None:
    res = client.get(f"{SHELL}/workbench/does-not-exist-aid")
    assert res.status_code == 404


def test_studio_comparable_endpoint(client: TestClient) -> None:
    shell = client.get(SHELL).json()
    aid = shell["defaultAid"]
    res = client.get(f"{SHELL}/comparable/{aid}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["aid"] == aid
    assert "isNew" in body


def test_studio_hide_locked_filters_skus(client: TestClient) -> None:
    full = client.get(SHELL).json()
    locked = [s for s in full["skus"] if str(s.get("status", "")).lower().startswith("locked")]
    if not locked:
        return
    filtered = client.get(SHELL, params={"hide_locked": "true"}).json()
    assert all(
        not str(s.get("status", "")).lower().startswith("locked") for s in filtered["skus"]
    )


def test_studio_etag_round_trip(client: TestClient) -> None:
    first = client.get(SHELL)
    etag = first.headers.get("etag")
    assert etag
    second = client.get(SHELL, headers={"If-None-Match": etag})
    assert second.status_code == 304


# ---------------------------------------------------------------------------
# Phase A5 — contract tests for the A1–A4 hardening guarantees.
# ---------------------------------------------------------------------------


def test_studio_shell_meta_blocks_exposed(client: TestClient) -> None:
    """A2 — the studio shell carries a ``meta.blocks`` map (mirrors the
    action-center shape) where every entry exposes a ``status`` field
    inside the canonical enum and an optional ``reason`` / ``lineage_ref_id``.
    """
    body = client.get(URL_STUDIO).json()
    assert "meta" in body, "studio shell missing meta envelope"
    blocks = body["meta"]["blocks"]
    assert isinstance(blocks, dict) and blocks, "meta.blocks must be a non-empty dict"
    for block_id, block in blocks.items():
        assert isinstance(block, dict), f"meta.blocks.{block_id} not a dict"
        assert block["status"] in ALLOWED_BLOCK_STATUSES, (
            f"meta.blocks.{block_id}.status={block['status']!r} not in "
            f"{ALLOWED_BLOCK_STATUSES}"
        )
        if "reason" in block and block["reason"] is not None:
            assert isinstance(block["reason"], str), (
                f"meta.blocks.{block_id}.reason must be str when present"
            )
        if "lineage_ref_id" in block and block["lineage_ref_id"] is not None:
            assert isinstance(block["lineage_ref_id"], str)


def test_workbench_meta_blocks_cover_all_expected_block_ids(
    client: TestClient,
) -> None:
    """A2 — the workbench response carries ``meta.blocks`` and the map
    contains every block ID the studio screen knows how to render.
    Status of each entry is allowed to vary (live / empty / degraded /
    locked) but the *key* must be present so the frontend never has to
    defend against a missing entry.
    """
    wb = _fetch_workbench(client)
    assert "meta" in wb, "workbench missing meta envelope"
    blocks = wb["meta"]["blocks"]
    assert isinstance(blocks, dict)
    missing = EXPECTED_WORKBENCH_BLOCK_IDS - set(blocks.keys())
    assert not missing, (
        f"workbench meta.blocks missing required block IDs: {sorted(missing)}"
    )


def test_workbench_meta_blocks_status_enum_is_strict(client: TestClient) -> None:
    """A2 / iron rule — every workbench ``meta.blocks[k].status`` value
    must be in ``{live, empty, degraded, locked}`` with no exceptions.
    """
    wb = _fetch_workbench(client)
    blocks = wb["meta"]["blocks"]
    for k, block in blocks.items():
        assert isinstance(block, dict), f"meta.blocks.{k} must be a dict"
        assert block["status"] in ALLOWED_BLOCK_STATUSES, (
            f"meta.blocks.{k}.status={block['status']!r} not in "
            f"{ALLOWED_BLOCK_STATUSES}"
        )


def test_workbench_no_seed_fallback_for_competitor(client: TestClient) -> None:
    """A3 — the seed fallback is gone. ``competitor_ref`` has no
    connected data source in the test env, so its block status MUST be
    ``locked`` / ``empty`` / ``degraded`` — never ``live``. A ``live``
    status here would mean the seed JSON re-appeared.
    """
    wb = _fetch_workbench(client)
    blocks = wb["meta"]["blocks"]
    competitor = blocks.get("competitor_ref")
    assert competitor is not None, "meta.blocks.competitor_ref missing"
    assert competitor["status"] != "live", (
        f"competitor_ref status leaked back to 'live' — seed fallback "
        f"may have returned. block={competitor!r}"
    )
    # And the underlying payload must not be a seeded dict — either
    # missing entirely or explicitly ``None``.
    payload = wb.get("competitor_ref")
    assert payload is None or payload == {} or payload == [], (
        f"competitor_ref payload must be empty when locked/empty, "
        f"got {payload!r}"
    )


def test_workbench_recommendation_decimal_as_string(client: TestClient) -> None:
    """A1/A4 — Pydantic Decimal fields are serialised to JSON strings
    via ``model_dump(mode='json')``. Verify every monetary slot on the
    recommendation block is either ``None`` (block empty/locked) or a
    string — never a bare number.
    """
    wb = _fetch_workbench(client)
    rec_status = wb["meta"]["blocks"]["recommendation"]["status"]
    rec = wb.get("recommendation")
    if rec_status != "live":
        # Empty / locked recommendation: payload must be absent or ``None``.
        assert rec is None or rec == {} or rec == [], (
            f"non-live recommendation must not carry a payload, got {rec!r}"
        )
        return
    assert isinstance(rec, dict), "live recommendation must be a dict"
    assert _is_string_decimal(rec.get("recommended_price")), (
        f"recommended_price must be string, got "
        f"{type(rec.get('recommended_price')).__name__}: "
        f"{rec.get('recommended_price')!r}"
    )
    band = rec.get("band")
    assert isinstance(band, dict), "recommendation.band must be a dict"
    for k in ("min", "target", "max"):
        assert _is_string_decimal(band.get(k)), (
            f"recommendation.band.{k} must be string, got "
            f"{type(band.get(k)).__name__}: {band.get(k)!r}"
        )


def test_workbench_customer_fanout_paid_band_decimal_as_string(
    client: TestClient,
) -> None:
    """A1/A4 — every ``customer_fanout.rows[].paid_band.{p10,p50,p90}``
    value is a JSON string (or ``None`` when the row has no paid band).
    """
    wb = _fetch_workbench(client)
    fanout_status = wb["meta"]["blocks"]["customer_fanout"]["status"]
    fanout = wb.get("customer_fanout") or {}
    rows = (fanout or {}).get("rows") or []
    if fanout_status != "live":
        # Empty / degraded fanout: rows may be empty; nothing to assert.
        return
    assert rows, "live customer_fanout must emit at least one row"
    for row in rows:
        paid_band = row.get("paid_band")
        if paid_band is None:
            continue
        assert isinstance(paid_band, dict), "paid_band must be a dict or None"
        for k in ("p10", "p50", "p90"):
            assert _is_string_decimal(paid_band.get(k)), (
                f"customer_fanout.rows[].paid_band.{k} must be string, "
                f"got {type(paid_band.get(k)).__name__}: "
                f"{paid_band.get(k)!r}"
            )


def test_workbench_recommendation_confidence_shape(client: TestClient) -> None:
    """A1 — when the recommendation block is ``live`` its confidence
    fields obey the documented enum and range: ``confidence_level`` ∈
    ``{low, med, high}`` and ``confidence`` is a numeric in ``[0, 1]``.
    """
    wb = _fetch_workbench(client)
    if wb["meta"]["blocks"]["recommendation"]["status"] != "live":
        return
    rec = wb["recommendation"]
    assert rec.get("confidence_level") in ALLOWED_CONFIDENCE_LEVELS, (
        f"confidence_level={rec.get('confidence_level')!r} not in "
        f"{ALLOWED_CONFIDENCE_LEVELS}"
    )
    confidence_raw = rec.get("confidence")
    # ``confidence`` is a Decimal serialised to string via ``mode='json'``.
    # Accept either a string-decimal OR a float for forward-compat, but
    # never reject a None — if the field is missing this assertion
    # fails loudly so the contract regression is visible.
    assert confidence_raw is not None, "live recommendation must carry confidence"
    confidence_val = float(confidence_raw)
    assert 0.0 <= confidence_val <= 1.0, (
        f"recommendation.confidence={confidence_val!r} outside [0,1]"
    )


def test_workbench_lineage_ref_id_shape_when_present(client: TestClient) -> None:
    """A2 — ``lineage_ref_id`` is optional. When a block is non-live the
    field may be absent or null — that's fine. When present it must be
    a non-empty string (UUID-shaped or otherwise opaque).
    """
    wb = _fetch_workbench(client)
    for block_id, block in wb["meta"]["blocks"].items():
        lref = block.get("lineage_ref_id")
        if lref is None:
            continue
        assert isinstance(lref, str), (
            f"meta.blocks.{block_id}.lineage_ref_id must be string, "
            f"got {type(lref).__name__}"
        )
        assert lref, (
            f"meta.blocks.{block_id}.lineage_ref_id must be non-empty when present"
        )
        # UUID shape is the expected canonical form. Allow non-UUID
        # opaque tokens (e.g. ``"rec:<aid>:<ts>"``) — log via assertion
        # message only.
        if not _UUID_RE.match(lref):
            # Soft assertion: at least it's a reasonable identifier
            # (no whitespace, > 4 chars).
            assert " " not in lref and len(lref) >= 4, (
                f"meta.blocks.{block_id}.lineage_ref_id={lref!r} is "
                f"neither UUID-shaped nor a sane opaque token"
            )


def test_workbench_blocks_with_live_status_have_payload(client: TestClient) -> None:
    """A2 / A3 — when a block is ``live`` the workbench MUST carry a
    truthy payload at the corresponding root key. The inverse direction
    (``empty``/``locked`` → no fake payload) is covered by the no-seed
    test. This direction guarantees the status flag matches reality.
    """
    wb = _fetch_workbench(client)
    blocks = wb["meta"]["blocks"]
    # Map block_id → workbench-root key (most are 1:1).
    payload_keys = {
        "recommendation": "recommendation",
        "wtp": "wtp",
        "win_prob_curve": "win_prob_curve",
        "competitor_ref": "competitor_ref",
        "customer_fanout": "customer_fanout",
        "cost_history": "cost_history",
        "option_margins": "option_margins",
    }
    for block_id, root_key in payload_keys.items():
        block = blocks.get(block_id)
        if block is None or block.get("status") != "live":
            continue
        payload = wb.get(root_key)
        assert payload not in (None, {}, []), (
            f"meta.blocks.{block_id}.status=live but workbench.{root_key} "
            f"is empty/missing: {payload!r}"
        )


def test_cross_screen_sku_parity_placeholder(client: TestClient) -> None:
    """B5 placeholder — once cross-screen parity ships, every decision
    in ``action-center.decisions[].article_id`` must appear in
    ``studio.shell.skus[].aid``. For now we lock in the structural
    contract (both endpoints serve lists of dicts with the right keys)
    so the test exists ready to be promoted to a real superset check.
    """
    shell = client.get(URL_STUDIO).json()
    skus = shell.get("skus")
    assert isinstance(skus, list), "studio.shell.skus must be a list"
    for sku in skus:
        assert isinstance(sku, dict), "every studio.shell.skus entry must be a dict"
        assert "aid" in sku, f"studio.shell.skus entry missing 'aid': {sku!r}"

    ac = client.get(URL_ACTION_CENTER).json()
    decisions = ac.get("decisions")
    assert isinstance(decisions, list), "action-center.decisions must be a list"
    if ac["meta"]["blocks"]["decisions"]["status"] == "live":
        for decision in decisions:
            assert isinstance(decision, dict), (
                "every action-center.decisions entry must be a dict"
            )
            # Decisions reference SKUs through ``article_id`` (Phase B5
            # will lock this onto the parity check). Today the field may
            # not yet exist on every row — guard so the placeholder
            # passes until B5 lands.
            assert "article_id" in decision or "recommendationId" in decision, (
                f"decision row missing both article_id and recommendationId: "
                f"{decision!r}"
            )

    # Phase B5 will replace the placeholder below with:
    #
    #     sku_aids = {s["aid"] for s in skus}
    #     ac_aids = {d["article_id"] for d in decisions if d.get("article_id")}
    #     assert ac_aids <= sku_aids, ac_aids - sku_aids
    #
    # For now, just lock in the structural shape so this test stays
    # green until then.
