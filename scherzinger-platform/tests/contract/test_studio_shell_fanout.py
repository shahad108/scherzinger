"""Phase 2 (Pricing Studio v3) — Studio workbench customer-fanout contract.

The per-aid workbench must surface ``customer_fanout`` with the row shape:

    {
      "customer_id": str,
      "aid": str,
      "tier": "A"|"B"|"C"|"D",
      "wallet_share_pct": str (Decimal) | null,
      "paid_band": {"p10","p50","p90"} | null,
      "risk_if_moved": str (Decimal) | null,
      "tone": "alert"|"warn"|"plain",
      "churn_p": str (Decimal) | null,
      "ltm_eur": str (Decimal) | null,
      "lineage_ref_id": str (uuid) | null,
      "proposal_queued": bool,
    }

Tone must be present on EVERY row — it's BFF-computed truth, the
frontend never re-derives it.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient


WORKBENCH_URL = "/api/v1/screens/studio/workbench"


_REQUIRED_KEYS = {
    "customer_id",
    "aid",
    "tier",
    "wallet_share_pct",
    "paid_band",
    "risk_if_moved",
    "tone",
    "churn_p",
    "ltm_eur",
    "lineage_ref_id",
    "proposal_queued",
}

_VALID_TONES = {"alert", "warn", "plain"}


def _fixture_aid(client: TestClient) -> str:
    res = client.get("/api/v1/screens/studio")
    if res.status_code != 200:
        pytest.skip(f"studio shell unavailable ({res.status_code}: {res.text})")
    return res.json().get("defaultAid") or "BKAGG-001"


def test_workbench_customer_fanout_present(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "customer_fanout" in body, "customer_fanout missing from workbench"
    payload = body["customer_fanout"]
    # Top-level shape
    assert "aid" in payload
    assert "rows" in payload
    assert "lineage_ref" in payload
    assert isinstance(payload["rows"], list)


def test_workbench_customer_fanout_row_keys(client: TestClient) -> None:
    aid = _fixture_aid(client)
    res = client.get(f"{WORKBENCH_URL}/{aid}")
    assert res.status_code == 200, res.text
    rows = res.json().get("customer_fanout", {}).get("rows", [])
    # Empty rows is acceptable in seed mode (no invoice data) — but if
    # there are any rows, they MUST carry every Phase 2 extended field.
    for row in rows:
        missing = _REQUIRED_KEYS - row.keys()
        assert not missing, f"row missing keys: {missing}"
        # Tone is BFF truth.
        assert row["tone"] in _VALID_TONES
        # proposal_queued is always a bool, never null.
        assert isinstance(row["proposal_queued"], bool)
