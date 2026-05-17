"""Phase 2 (Pricing Studio v3) — SF1 cent-precision contract for proposals.

POST /api/v1/pricing/proposals must accept ``proposed_price`` as either a
JSON-decimal STRING (preferred — no float lossiness) or a JSON number,
and preserve canonical decimal text in the persisted JSONB ``payload``
column so cent precision survives every hop.
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from fastapi.testclient import TestClient


URL = "/api/v1/pricing/proposals"


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _spy_proposal():
    """Patch ``create_pricing_proposal`` to capture the JSON-safe body
    used for the JSONB ``payload`` column, then return a wrapping proxy
    that records the final values written to the SQLAlchemy ``Numeric``
    columns. The endpoint sets ``proposal.proposed_price`` /
    ``current_price`` after ``create_pricing_proposal`` returns, so we
    track each ``__setattr__`` to capture the Decimal that lands on the
    typed column.

    Returns a tuple ``(captured, ctx)``:
        captured["stored_payload"]  - dict written to the JSONB column
        captured["columns"]         - dict of {col: value-set-on-column}
    """
    captured: dict = {"columns": {}}
    from backend.api.v1 import pricing as pricing_module

    real = pricing_module.workflow_service.create_pricing_proposal

    _TYPED_COLS = {
        "current_price",
        "proposed_price",
        "delta_pp",
    }

    class _Spy:
        def __init__(self, proposal):
            object.__setattr__(self, "_proposal", proposal)

        def __setattr__(self, name, value):
            if name in _TYPED_COLS:
                captured["columns"][name] = value
            setattr(self._proposal, name, value)

        def __getattr__(self, name):
            return getattr(self._proposal, name)

    def _intercept(*args, **kwargs):
        captured["stored_payload"] = kwargs.get("body")
        proposal = real(*args, **kwargs)
        return _Spy(proposal)

    return captured, patch.object(
        pricing_module.workflow_service,
        "create_pricing_proposal",
        side_effect=_intercept,
    )


def test_create_proposal_accepts_decimal_string_and_preserves_precision(
    client: TestClient,
) -> None:
    """SF1: posting ``"5.10"`` as a decimal-as-string must reach the DB
    without ever passing through a JS float.

    - The SQLAlchemy-bound Numeric column receives the exact ``Decimal``.
    - The persisted JSONB payload carries the canonical ``"5.10"`` text
      (NOT a float ``5.1``) so cent precision survives a round-trip.
    """
    captured, ctx = _spy_proposal()
    with ctx:
        res = client.post(
            URL,
            json={
                "article_id": "X-SF1",
                "proposed_price": "5.10",
                "current_price": "4.95",
                "payload": {"source": "studio.drill_in"},
            },
            headers=_csrf(client),
        )

    assert res.status_code in (200, 201), res.text
    # The Numeric columns receive the exact Decimal (cent precision
    # survives the JS boundary because we sent strings).
    cols = captured["columns"]
    assert cols["proposed_price"] == Decimal("5.10")
    assert cols["current_price"] == Decimal("4.95")
    stored = captured["stored_payload"]
    assert stored is not None
    # The JSONB-persisted copy MUST be canonical strings — never JS-
    # floatable bare numbers — so cent precision survives every hop.
    assert stored["proposed_price"] == "5.10"
    assert stored["current_price"] == "4.95"


def test_create_proposal_still_accepts_numeric_json(client: TestClient) -> None:
    """Backwards compat: existing clients sending JSON numbers still work
    (Pydantic v2 coerces JSON numbers → Decimal). Cent-precise clients
    should always send strings (per the contract above).
    """
    captured, ctx = _spy_proposal()
    with ctx:
        res = client.post(
            URL,
            json={"article_id": "X-SF1-NUM", "proposed_price": 5.10},
            headers=_csrf(client),
        )
    assert res.status_code in (200, 201), res.text
    assert captured["columns"]["proposed_price"] is not None
    assert isinstance(captured["columns"]["proposed_price"], Decimal)
