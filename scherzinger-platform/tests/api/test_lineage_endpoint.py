"""Pricing Studio v3 / Phase 10 — GET /api/v1/lineage/{ref_id}.

Lineage drawer fetches a single lineage_refs row by id. Every numeric
value the Studio surfaces carries a lineage_ref UUID; this endpoint
resolves it to the full source so the FE can show "source: invoices,
computed_by: composer.studio, sample preview" with PII stripped.
"""
from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from backend.database import SessionLocal
from backend.models.pricing.lineage import LineageSourceKind
from backend.services.pricing.lineage import create_lineage


URL = "/api/v1/lineage/{ref_id}"


@pytest.fixture
def seeded_ref() -> UUID:
    """Insert a lineage row and return its id. Persists for the test."""
    s = SessionLocal()
    try:
        row = create_lineage(
            source_kind=LineageSourceKind.INVOICE_LEDGER,
            source_id="INV-2026-00042",
            sql=(
                "SELECT aid, price FROM invoice_lines "
                "WHERE customer_id = 'CUST-SECRET-99' AND price > 4242.42"
            ),
            model=None,
            computed_by="composer.studio",
            session=s,
        )
        s.commit()
        return row.id
    finally:
        s.close()


def test_lineage_endpoint_returns_full_source(
    client: TestClient, seeded_ref: UUID
) -> None:
    res = client.get(URL.format(ref_id=str(seeded_ref)))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == str(seeded_ref)
    assert body["source_kind"] == "invoice_ledger"
    assert body["source_id"] == "INV-2026-00042"
    assert body["computed_by"] == "composer.studio"
    assert "computed_at" in body and body["computed_at"] is not None
    assert body["sql"] is not None
    # PII scrubber must have run at write-time.
    assert "CUST-SECRET-99" not in body["sql"]
    assert "4242.42" not in body["sql"]
    assert "?" in body["sql"]
    # Preview is always present (may be empty list).
    assert "preview" in body
    assert isinstance(body["preview"], list)
    assert len(body["preview"]) <= 5


def test_lineage_endpoint_returns_404_on_unknown(client: TestClient) -> None:
    res = client.get(URL.format(ref_id=str(uuid4())))
    assert res.status_code == 404


def test_lineage_endpoint_rejects_bad_uuid(client: TestClient) -> None:
    res = client.get(URL.format(ref_id="not-a-uuid"))
    # FastAPI's UUID coercion fails with 422; treat any 4xx as acceptable.
    assert 400 <= res.status_code < 500


def test_lineage_endpoint_requires_auth() -> None:
    """Auth gate: requesting without a session cookie 401s.

    Use a fresh TestClient — the session-scoped ``anon_client`` shares
    cookies with the authenticated ``client`` (see tests/api/conftest.py).
    """
    from backend.main import app

    fresh = TestClient(app)
    res = fresh.get(URL.format(ref_id=str(uuid4())))
    assert res.status_code in (401, 403)


def test_lineage_endpoint_preview_scrubbed_for_pii(
    client: TestClient, seeded_ref: UUID
) -> None:
    """Preview rows must never carry raw PII strings/numbers."""
    res = client.get(URL.format(ref_id=str(seeded_ref)))
    assert res.status_code == 200
    body = res.json()
    # Whatever the preview shape, the raw secret must not appear.
    blob = repr(body["preview"])
    assert "CUST-SECRET-99" not in blob
