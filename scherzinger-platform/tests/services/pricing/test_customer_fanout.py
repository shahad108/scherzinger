"""Phase 2 (Pricing Studio v3) — customer-fanout composer tests.

Verifies:
  - tone is BFF-computed for each row from risk_if_moved
  - re-scoring with a different proposed_price changes tone
  - proposal_queued flag set when a draft proposal exists
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from backend.models.pricing.customer_on_sku import CustomerOnSku, CustomerTier, PaidBand
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing import customer_fanout as cf


def _lineage() -> LineageRef:
    return LineageRef(
        id=uuid4(),
        source_kind=LineageSourceKind.INVOICE_LEDGER,
        source_id="t",
        sql=None,
        model=None,
        computed_at=datetime.now(timezone.utc),
        computed_by="test",
    )


def _cos(
    cid: str,
    *,
    last_paid: Decimal = Decimal("5.00"),
    risk: Decimal | None = None,
    churn: Decimal | None = Decimal("0.10"),
    wallet: Decimal = Decimal("0.10"),
) -> CustomerOnSku:
    return CustomerOnSku(
        aid="X-1",
        customer_id=cid,
        last_paid=last_paid,
        last_paid_at=datetime.now(timezone.utc),
        ltm_units=1000,
        ltm_eur=Decimal("5000.00"),
        churn_p=churn,
        decline_p=churn,
        risk_if_moved=risk,
        wallet_share_pct=wallet,
        paid_band=PaidBand(
            p10=Decimal("4.50"),
            p50=Decimal("5.00"),
            p90=Decimal("5.50"),
        ),
        tier=CustomerTier.A,
        lineage_ref=_lineage(),
    )


@pytest.fixture(autouse=True)
def _clear_cache():
    cf.invalidate_cache()
    yield
    cf.invalidate_cache()


def test_tone_alert_when_high_risk() -> None:
    """risk_if_moved > 0.30 → tone=alert (BFF-computed)."""
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.45"))):
        payload = cf.build_customer_fanout(
            aid="X-1",
            proposed_price=Decimal("6.00"),
            db_session=session,
        )
    assert len(payload["rows"]) == 1
    assert payload["rows"][0]["tone"] == "alert"
    assert payload["rows"][0]["risk_if_moved"] == "0.45"


def test_tone_warn_when_mid_risk() -> None:
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.20"))):
        payload = cf.build_customer_fanout(
            aid="X-1",
            proposed_price=Decimal("5.50"),
            db_session=session,
        )
    assert payload["rows"][0]["tone"] == "warn"


def test_tone_plain_when_low_risk_or_none() -> None:
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1", "C-2"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      side_effect=[
                          _cos("C-1", risk=Decimal("0.05")),
                          _cos("C-2", risk=None),
                      ]):
        payload = cf.build_customer_fanout(
            aid="X-1",
            proposed_price=Decimal("5.00"),
            db_session=session,
        )
    assert payload["rows"][0]["tone"] == "plain"
    assert payload["rows"][1]["tone"] == "plain"
    assert payload["rows"][1]["risk_if_moved"] is None


def test_re_scoring_changes_tone() -> None:
    session = MagicMock()
    # Same customer, two prices → different risk → different tone.
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.05"))):
        a = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
    # Cache lives per (aid, price), so a new price hits a fresh build.
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.40"))):
        b = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("6.50"), db_session=session
        )
    assert a["rows"][0]["tone"] == "plain"
    assert b["rows"][0]["tone"] == "alert"


def test_proposal_queued_flag_set_when_draft_exists() -> None:
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1", "C-2"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value={"C-1"}), \
         patch.object(cf, "build_customer_on_sku",
                      side_effect=[_cos("C-1"), _cos("C-2")]):
        payload = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
    rows_by_id = {r["customer_id"]: r for r in payload["rows"]}
    assert rows_by_id["C-1"]["proposal_queued"] is True
    assert rows_by_id["C-2"]["proposal_queued"] is False


def test_row_carries_extended_fields() -> None:
    """Every fanout row must surface the Phase 2 extended fields."""
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.20"))):
        payload = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
    row = payload["rows"][0]
    for key in (
        "wallet_share_pct", "paid_band", "risk_if_moved", "tone",
        "churn_p", "lineage_ref_id", "proposal_queued", "ltm_eur",
    ):
        assert key in row, f"missing {key} from fanout row"
    assert row["paid_band"] is not None
    assert "p10" in row["paid_band"]


def test_idempotent_within_cache_ttl() -> None:
    """Same (aid, proposed_price) returns the cached payload."""
    session = MagicMock()
    call_count = {"n": 0}

    def _build(*args, **kwargs):
        call_count["n"] += 1
        return _cos("C-1", risk=Decimal("0.05"))

    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku", side_effect=_build):
        a = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
        b = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
    assert a is b
    assert call_count["n"] == 1


def test_bulk_loaders_replace_per_customer_n_plus_one() -> None:
    """SF2: fanout with N visible customers MUST run ≤ 4 bulk loaders + the
    aid + active proposals queries — not 4×N per-customer queries.

    Constraint: the per-customer ``build_customer_on_sku`` loop receives
    ``prefetched`` and runs zero new SELECTs.
    """
    from backend.services.pricing import customer_on_sku as cos_mod

    session = MagicMock()
    # Stub the bulk loaders so they don't touch the DB; spy on
    # build_customer_on_sku to assert prefetched is non-empty per call.
    per_customer_prefetched_seen: list[dict] = []

    def _spy_build(*, aid, customer_id, proposed_price, db_session, prefetched=None):
        per_customer_prefetched_seen.append(prefetched or {})
        return _cos(customer_id, risk=Decimal("0.05"))

    with patch.object(cf, "_load_customer_ids_for_aid",
                      return_value=["C-1", "C-2", "C-3", "C-4", "C-5"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "_bulk_load_history_on_aid",
                      return_value={cid: [] for cid in
                                    ["C-1", "C-2", "C-3", "C-4", "C-5"]}), \
         patch.object(cf, "_bulk_load_master",
                      return_value={cid: {"name": cid, "tier": "A"} for cid in
                                    ["C-1", "C-2", "C-3", "C-4", "C-5"]}), \
         patch.object(cf, "_bulk_load_risk_scores",
                      return_value={cid: {"churn_p": None, "decline_p": None}
                                    for cid in ["C-1", "C-2", "C-3", "C-4", "C-5"]}), \
         patch.object(cf, "_bulk_load_customer_ltm_eur",
                      return_value={cid: Decimal("0") for cid in
                                    ["C-1", "C-2", "C-3", "C-4", "C-5"]}), \
         patch.object(cf, "build_customer_on_sku", side_effect=_spy_build):
        payload = cf.build_customer_fanout(
            aid="X-1",
            proposed_price=Decimal("5.00"),
            db_session=session,
            top_n=5,
        )

    # 5 customers → 5 calls to build_customer_on_sku, each with prefetched.
    assert len(payload["rows"]) == 5
    assert len(per_customer_prefetched_seen) == 5
    for pf in per_customer_prefetched_seen:
        assert "history" in pf
        assert "master" in pf
        assert "risk_scores" in pf
        assert "customer_total_ltm" in pf


def test_build_customer_on_sku_skips_loaders_when_prefetched() -> None:
    """SF2: when prefetched supplies every key, the loader stubs MUST NOT
    be called — verifies the per-customer fast path.
    """
    from backend.services.pricing import customer_on_sku as cos_mod

    session = MagicMock()
    invoice_calls = {"n": 0}
    master_calls = {"n": 0}
    risk_calls = {"n": 0}
    ltm_calls = {"n": 0}

    def _invoice(**_):
        invoice_calls["n"] += 1
        return []

    def _master(**_):
        master_calls["n"] += 1
        return None

    def _risk(**_):
        risk_calls["n"] += 1
        return {"churn_p": None, "decline_p": None}

    def _ltm(**_):
        ltm_calls["n"] += 1
        return Decimal("0")

    with patch.object(cos_mod, "_load_invoice_history", side_effect=_invoice), \
         patch.object(cos_mod, "_load_customer_master", side_effect=_master), \
         patch.object(cos_mod, "_load_customer_risk_scores", side_effect=_risk), \
         patch.object(cos_mod, "_load_customer_ltm_eur", side_effect=_ltm), \
         patch.object(cos_mod, "_persist_lineage", return_value=_lineage()):
        cos_mod.build_customer_on_sku(
            aid="X-1",
            customer_id="C-1",
            proposed_price=None,
            db_session=session,
            prefetched={
                "history": [],
                "master": {"name": "Acme", "tier": "A"},
                "risk_scores": {"churn_p": None, "decline_p": None},
                "customer_total_ltm": Decimal("0"),
            },
        )
    # All four loaders MUST be skipped when prefetched fills the slot.
    assert invoice_calls["n"] == 0
    assert master_calls["n"] == 0
    assert risk_calls["n"] == 0
    assert ltm_calls["n"] == 0


@pytest.mark.parametrize(
    "price",
    [Decimal("127"), Decimal("127.0"), Decimal("127.00"), Decimal("127.0000")],
)
def test_cache_key_canonical_for_equivalent_decimals(price: Decimal) -> None:
    """``Decimal("127.00")`` and ``Decimal("127.0")`` MUST hit the same cache.

    Without canonicalization the raw ``str()`` text differs and equivalent
    prices would thrash the per-price cache.
    """
    session = MagicMock()
    call_count = {"n": 0}

    def _build(*args, **kwargs):
        call_count["n"] += 1
        return _cos("C-1", risk=Decimal("0.05"))

    # Seed the cache at 127.00, then re-query with the parametrized variant.
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku", side_effect=_build):
        cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("127.00"), db_session=session
        )
        cf.build_customer_fanout(
            aid="X-1", proposed_price=price, db_session=session
        )
    # Second call MUST be a cache hit → build_customer_on_sku invoked once.
    assert call_count["n"] == 1
