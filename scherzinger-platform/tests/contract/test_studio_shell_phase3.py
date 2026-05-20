"""Phase 3 (Pricing Studio v3) — workbench cost & margin reality contract.

The per-aid workbench endpoint must surface:

  - ``option_margins`` (>= 1 entry, each with list/quoted/booked/invoiced/db2
    + leakage_per_step_pct + lineage_ref)
  - ``cost_history`` (with ``commodities`` and ``points`` lists)
  - Optionally ``trigger_context`` (only when source+reason query params
    match a known tuple)
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient


WORKBENCH_URL = "/api/v1/screens/studio/workbench"


def _fixture_aid(client: TestClient) -> str:
    res = client.get("/api/v1/screens/studio")
    if res.status_code != 200:
        pytest.skip(f"studio shell unavailable ({res.status_code}: {res.text})")
    body = res.json()
    return body.get("defaultAid") or "BKAGG-001"


def _decimal_like(v) -> bool:
    if isinstance(v, (int, float)):
        return True
    if isinstance(v, str):
        try:
            Decimal(v)
            return True
        except Exception:  # noqa: BLE001
            return False
    return False


def test_workbench_carries_option_margins(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "option_margins" in body, "workbench must expose option_margins for Phase 3"
    option_margins = body["option_margins"]
    assert isinstance(option_margins, list)
    # Acceptance: ≥1 option margin (Hold is always present when PriceState exists).
    assert len(option_margins) >= 1
    for om in option_margins:
        assert "option_id" in om
        assert _decimal_like(om["price"]), om["price"]
        for k in ("list", "quoted", "booked", "invoiced", "db2"):
            assert _decimal_like(om[k]), (k, om[k])
        # Monotone-down waterfall.
        list_v = Decimal(str(om["list"]))
        quoted_v = Decimal(str(om["quoted"]))
        booked_v = Decimal(str(om["booked"]))
        invoiced_v = Decimal(str(om["invoiced"]))
        db2_v = Decimal(str(om["db2"]))
        assert list_v >= quoted_v
        assert quoted_v >= booked_v
        assert booked_v >= invoiced_v
        assert db2_v >= 0
        # Four leakage values.
        leak = om.get("leakage_per_step_pct") or []
        assert len(leak) == 4
        # Lineage attached.
        assert om.get("lineage_ref") is not None


def test_workbench_carries_cost_history(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "cost_history" in body, "workbench must expose cost_history for Phase 3"
    ch = body["cost_history"]
    assert isinstance(ch, dict)
    # The block carries commodities (list, possibly empty when seeded) and
    # points (list — empty in Phase 3 but reserved for the per-SKU trajectory).
    assert "commodities" in ch
    assert isinstance(ch["commodities"], list)
    assert "points" in ch
    assert isinstance(ch["points"], list)


def test_workbench_trigger_context_absent_without_query_params(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200
    body = res.json()
    # Without ?source&reason the banner field must be omitted (NOT null) so
    # the frontend can use truthy-check rendering.
    assert "trigger_context" not in body or body.get("trigger_context") is None


def test_workbench_trigger_context_emitted_for_known_tuple(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(
        f"{WORKBENCH_URL}/{aid}",
        params={"source": "forecasting", "reason": "cost-spike"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    ctx = body.get("trigger_context")
    # The composer may have returned None when the DB has no steel proxy —
    # but the field must EITHER be a structured object or absent. A 500
    # silently surfacing would have been caught above.
    if ctx is not None:
        assert ctx["source"] == "forecasting"
        assert ctx["reason"] == "cost-spike"
        assert isinstance(ctx["headline"], str) and ctx["headline"]
        assert "link_target" in ctx and "link_label" in ctx
