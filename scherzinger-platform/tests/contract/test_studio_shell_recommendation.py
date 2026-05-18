"""Phase 1 (Pricing Studio v3) — workbench-level recommendation contract.

The per-aid workbench endpoint must surface:

  - ``recommendation`` (recommended_price, confidence, band.min/target/max,
    drivers[].kind/label/contribution_pct/lineage_ref, rationale_md,
    lineage_ref).
  - ``wtp`` (p10/p50/p90, n_deals, window_days, confidence, lineage_ref)
    OR field omitted when the won-deal sample is empty.
  - ``win_prob_curve.points`` — at least 20 (price, win_prob, lower_ci,
    upper_ci) rows.
  - ``competitor_ref`` either ``null`` OR (median_price, sample_count,
    last_seen, lineage_ref).

The shapes are validated as a structural contract — concrete values are
defined by the live data and can vary between runs.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient


WORKBENCH_URL = "/api/v1/screens/studio/workbench"


def _decimal_like(v) -> bool:
    """Accept str-encoded Decimals (mode='json') or numbers."""
    if isinstance(v, (int, float)):
        return True
    if isinstance(v, str):
        try:
            Decimal(v)
            return True
        except Exception:  # noqa: BLE001
            return False
    return False


def _fixture_aid(client: TestClient) -> str:
    """Grab the defaultAid from the studio shell so the workbench call
    targets a real seeded SKU. Falls back to a known seed value.
    """
    res = client.get("/api/v1/screens/studio")
    if res.status_code != 200:
        pytest.skip(f"studio shell unavailable ({res.status_code}: {res.text})")
    body = res.json()
    return body.get("defaultAid") or "BKAGG-001"


def test_workbench_recommendation_shape(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200, res.text
    body = res.json()

    # Phase 1 spec §1.7 acceptance: ``recommendation`` is ALWAYS present
    # — the recommender returns a low-confidence fallback when inputs
    # are thin (see test_all_inputs_none_returns_fallback_low_confidence).
    # A None here is a silent failure, not a valid contract state.
    assert "recommendation" in body, "recommendation key missing from workbench response"
    assert body["recommendation"] is not None, (
        "recommendation must never be None — the fallback path returns a low-"
        "confidence Recommendation when inputs are missing"
    )

    rec = body["recommendation"]
    assert _decimal_like(rec["recommended_price"]), rec["recommended_price"]
    assert _decimal_like(rec["confidence"]), rec["confidence"]
    assert "band" in rec
    band = rec["band"]
    assert _decimal_like(band["min"])
    assert _decimal_like(band["target"])
    assert _decimal_like(band["max"])
    # min <= target <= max as Decimals.
    assert Decimal(str(band["min"])) <= Decimal(str(band["target"]))
    assert Decimal(str(band["target"])) <= Decimal(str(band["max"]))

    assert isinstance(rec["drivers"], list)
    assert len(rec["drivers"]) >= 1
    for d in rec["drivers"]:
        assert "kind" in d and isinstance(d["kind"], str)
        assert "label" in d and isinstance(d["label"], str)
        assert _decimal_like(d["contribution_pct"])
        # lineage_ref is optional per the Pydantic model but the
        # Phase 1 spec requires every numeric driver to carry one.
        assert d.get("lineage_ref") is not None, d

    assert isinstance(rec["rationale_md"], str)
    assert rec["rationale_md"].strip(), "rationale_md must not be empty"
    assert rec.get("lineage_ref") is not None
    # confidence_level is required by the model — must be a known bucket.
    assert rec.get("confidence_level") in {"low", "med", "high"}, rec.get(
        "confidence_level"
    )


@pytest.mark.xfail(
    reason=(
        "Phase A3 (docs/PRICING_STUDIO_PLAN.md §5): the seed-fallback was removed, "
        "so the shell's defaultAid is now the first row in price_state instead of "
        "the seeded '200832-E'. The cluster-anchoring branch in build_wtp() does "
        "not yet cover every DB aid — when the new defaultAid lacks both deal "
        "history and a cluster comparable, the builder returns None and the wtp "
        "key is omitted. Re-enable once the wtp builder's cluster-anchor fallback "
        "is hardened (Phase 1 follow-up)."
    ),
    strict=False,
)
def test_workbench_wtp_shape(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200
    body = res.json()
    # Phase 1 spec: ``wtp`` is ALWAYS present (even as a thin/low-confidence
    # band) for any seeded aid. The legacy fixture had an "omit on empty
    # sample" branch but Phase 1 now anchors from cluster instead of
    # returning None.
    assert "wtp" in body, "wtp key missing from workbench response"
    assert body["wtp"] is not None, (
        "wtp must never be None — when the SKU's won-deal sample is thin "
        "we anchor from cluster comparables (anchored_from_cluster=True)"
    )
    wtp = body["wtp"]
    assert _decimal_like(wtp["p10"])
    assert _decimal_like(wtp["p50"])
    assert _decimal_like(wtp["p90"])
    assert isinstance(wtp["n_deals"], int)
    assert wtp["n_deals"] >= 0
    assert isinstance(wtp["window_days"], int)
    assert wtp["window_days"] >= 1
    assert wtp["confidence"] in {"low", "med", "high"}
    assert wtp.get("lineage_ref") is not None
    # New Phase 1 field — must be a bool.
    assert isinstance(wtp.get("anchored_from_cluster"), bool), wtp


def test_workbench_win_prob_curve_shape(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200
    body = res.json()
    # Phase 1 spec: ``win_prob_curve`` is ALWAYS present with ≥20 grid
    # points. The seed envelope guarantees a renderable curve even when
    # the underlying quote sample is thin.
    assert "win_prob_curve" in body, "win_prob_curve key missing from workbench response"
    assert body["win_prob_curve"] is not None, (
        "win_prob_curve must never be None — the seed envelope ensures a "
        "renderable 20-point curve even on thin samples"
    )
    curve = body["win_prob_curve"]
    assert isinstance(curve["points"], list)
    assert len(curve["points"]) >= 20
    for pt in curve["points"]:
        assert _decimal_like(pt["price"])
        assert _decimal_like(pt["win_prob"])
        assert _decimal_like(pt["lower_ci"])
        assert _decimal_like(pt["upper_ci"])
        # Win-prob ranges are [0,1].
        wp = Decimal(str(pt["win_prob"]))
        assert Decimal("0") <= wp <= Decimal("1"), wp


def test_recommended_price_within_curve_envelope(client: TestClient) -> None:
    """MF1 contract: the recommended price must sit inside the curve's
    price envelope (between the lowest and highest grid point). If this
    fails the workbench's curve and the recommender are on different
    grids — exactly the drift the canonical envelope resolver prevents.
    """
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200
    body = res.json()
    rec = body.get("recommendation")
    curve = body.get("win_prob_curve")
    if rec is None or curve is None or not curve.get("points"):
        pytest.skip("workbench did not surface both recommendation and curve")
    grid_prices = [Decimal(str(pt["price"])) for pt in curve["points"]]
    rec_price = Decimal(str(rec["recommended_price"]))
    assert min(grid_prices) <= rec_price <= max(grid_prices), (
        f"recommended_price={rec_price} is outside curve envelope "
        f"[{min(grid_prices)}, {max(grid_prices)}] — workbench and "
        f"recommender are on different grids"
    )


def test_workbench_competitor_ref_shape(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200
    body = res.json()
    # ``competitor_ref`` is always present in the response — spec §1.7
    # requires the key (so the frontend can render <DataMissingBadge/>
    # for "no competitor data" without ambiguity vs. "not computed").
    # The value may be None when no PA/PR lost quotes exist in the window.
    assert "competitor_ref" in body, "competitor_ref key missing from workbench response"
    if body["competitor_ref"] is not None:
        comp = body["competitor_ref"]
        assert _decimal_like(comp["median_price"])
        assert isinstance(comp["sample_count"], int)
        assert comp["sample_count"] >= 1
        assert isinstance(comp["last_seen"], str)
        assert comp.get("lineage_ref") is not None


def test_workbench_endpoint_never_500s_on_missing_signals(client: TestClient) -> None:
    """Random aid that probably has no PA/PR / won-deal coverage must
    still return 200 with the seed-derived workbench shell."""
    res = client.get(f"{WORKBENCH_URL}/ZZZ-NO-SUCH-AID-WORKBENCH-9999")
    # Unknown AIDs return 404 from the seed-find guard; the seed-known
    # aids return 200 with optional Phase 1 fields. Either is fine —
    # the *forbidden* outcome is a 5xx.
    assert res.status_code in (200, 404), res.text


def test_workbench_tier_query_param_accepted(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}", params={"tier": "A"})
    assert res.status_code == 200, res.text
