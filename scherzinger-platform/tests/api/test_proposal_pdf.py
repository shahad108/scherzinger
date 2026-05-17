"""Phase 7 — GET /api/v1/pricing/proposals/{id}/pdf.

Skips when psycopg2 isn't available or the DB is unreachable. The
endpoint may return either ``application/pdf`` (when reportlab /
weasyprint is installed) or ``text/html`` as a fallback. We assert on
the broader contract: 200 OK, non-empty body, expected content type
family.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient


pytest.importorskip("psycopg2")


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _seed_proposal_via_api(client: TestClient) -> str:
    aid = f"PDF-{uuid4().hex[:6].upper()}"
    res = client.post(
        "/api/v1/pricing/proposals",
        json={
            "article_id": aid,
            "current_price": "100.00",
            "proposed_price": "112.50",
            "delta_pp": "12.50",
            "payload": {
                "rationale": "Cost pressure + competitor undercut signal",
                "drivers": [
                    {
                        "kind": "cost_trajectory",
                        "label": "Cost +8%",
                        "contribution_pct": "0.55",
                    }
                ],
                "customer_fanout": [
                    {"customer_id": "C-1", "tier": "A", "current_price": "100.00",
                     "at_proposed_price": "112.50", "win_prob": "0.62"},
                ],
                "notify": {"sales": True, "customers": ["sales@example.com"]},
            },
        },
        headers=_csrf(client),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_pdf_endpoint_returns_200_and_body(client: TestClient) -> None:
    proposal_id = _seed_proposal_via_api(client)
    res = client.get(f"/api/v1/pricing/proposals/{proposal_id}/pdf")
    assert res.status_code == 200, res.text
    ctype = res.headers.get("content-type", "")
    assert ctype.startswith("application/pdf") or ctype.startswith("text/html"), ctype
    body = res.content
    assert len(body) > 200
    # If HTML, body must contain the proposal id; if PDF, it'll start with %PDF.
    if ctype.startswith("text/html"):
        assert proposal_id.encode() in body or b"Pricing proposal" in body
    else:
        assert body[:4] == b"%PDF"


def test_pdf_endpoint_404_for_unknown_proposal(client: TestClient) -> None:
    fake_id = uuid4()
    res = client.get(f"/api/v1/pricing/proposals/{fake_id}/pdf")
    assert res.status_code == 404, res.text


def test_pdf_export_writes_audit_row(client: TestClient) -> None:
    from backend.database import SessionLocal
    from backend.models.pricing.audit import PricingAuditEntry

    proposal_id = _seed_proposal_via_api(client)
    # Look up the aid for this proposal.
    from backend.models import PricingProposal

    with SessionLocal() as s:
        proposal = s.get(PricingProposal, UUID(proposal_id))
        aid = proposal.article_id

    res = client.get(f"/api/v1/pricing/proposals/{proposal_id}/pdf")
    assert res.status_code == 200

    with SessionLocal() as s:
        rows = (
            s.query(PricingAuditEntry)
            .filter(PricingAuditEntry.target_id == aid)
            .filter(PricingAuditEntry.action == "push_to_quoting")
            .all()
        )
        assert len(rows) >= 1
