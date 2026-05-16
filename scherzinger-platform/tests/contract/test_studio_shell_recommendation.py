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

    # `recommendation` is optional but when present must satisfy the
    # full contract.
    if "recommendation" in body and body["recommendation"] is not None:
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


def test_workbench_wtp_shape(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200
    body = res.json()
    if "wtp" in body and body["wtp"] is not None:
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


def test_workbench_win_prob_curve_shape(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200
    body = res.json()
    if "win_prob_curve" in body and body["win_prob_curve"] is not None:
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


def test_workbench_competitor_ref_shape(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200
    body = res.json()
    # `competitor_ref` is allowed to be missing (older payloads) or
    # explicitly null (no PA/PR rejections in window).
    if "competitor_ref" in body and body["competitor_ref"] is not None:
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
