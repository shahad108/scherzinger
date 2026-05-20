"""Phase 1 — willingness-to-pay (WTP) band tests.

The band is computed from won-deal samples on a SKU × tier slice. We
verify the confidence rule (n_deals + band width) and the fallback path
when the sample is empty/sparse.
"""
from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from backend.models.pricing.recommendation import ConfidenceLevel
from backend.services.pricing import wtp as wtp_mod


def _stub_session(samples: list[float]) -> MagicMock:
    """A SessionLocal-like stub returning the won-deal price list."""
    session = MagicMock()
    rows = [(Decimal(str(s)),) for s in samples]
    session.execute.return_value.fetchall.return_value = rows
    return session


def _stub_session_two_calls(
    sku_samples: list[float], cluster_samples: list[float]
) -> MagicMock:
    """A SessionLocal-like stub returning SKU samples on the first
    ``execute().fetchall()`` and cluster samples on the second.
    """
    session = MagicMock()
    sku_rows = [(Decimal(str(s)),) for s in sku_samples]
    cluster_rows = [(Decimal(str(s)),) for s in cluster_samples]
    call_sequence = [sku_rows, cluster_rows]

    def _execute(*_a, **_kw):
        result = MagicMock()
        # Pop the next batch on every execute().
        if call_sequence:
            rows = call_sequence.pop(0)
        else:
            rows = []
        result.fetchall.return_value = rows
        return result

    session.execute.side_effect = _execute
    return session


@pytest.fixture(autouse=True)
def _stub_lineage(monkeypatch):
    """Stub the lineage helper so unit tests don't need a real DB row."""

    def _fake_create_lineage(**kwargs):
        row = MagicMock()
        row.id = uuid4()
        row.source_kind = (
            kwargs["source_kind"].value
            if hasattr(kwargs["source_kind"], "value")
            else str(kwargs["source_kind"])
        )
        row.source_id = kwargs["source_id"]
        row.sql = kwargs.get("sql")
        row.model = kwargs.get("model")
        row.computed_at = datetime.now(timezone.utc)
        row.computed_by = kwargs["computed_by"]
        return row

    monkeypatch.setattr(wtp_mod, "create_lineage", _fake_create_lineage)
    yield


def test_n_deals_below_5_is_low_confidence() -> None:
    session = _stub_session([100.0, 110.0, 95.0])
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.n_deals == 3
    assert band.confidence == ConfidenceLevel.LOW


def test_n_deals_15_and_tight_band_is_high_confidence() -> None:
    # Tight band → (p90-p10)/p50 ≤ 0.5
    samples = [100.0 + i for i in range(20)]  # n=20, p10≈101.9, p90≈118.1, p50=109.5
    session = _stub_session(samples)
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.n_deals == 20
    assert band.confidence == ConfidenceLevel.HIGH


def test_wide_band_drops_confidence_to_low() -> None:
    # Wide spread: (p90-p10)/p50 > 0.5 even with many deals → "low".
    samples = [50.0] * 5 + [100.0] * 10 + [200.0] * 5
    session = _stub_session(samples)
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.confidence == ConfidenceLevel.LOW


def test_empty_sample_returns_none() -> None:
    session = _stub_session([])
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is None


def test_medium_sample_med_confidence() -> None:
    # 5 ≤ n < 15 with tight band → "med"
    samples = [100.0, 102.0, 104.0, 106.0, 108.0, 110.0, 112.0]  # n=7
    session = _stub_session(samples)
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.n_deals == 7
    assert band.confidence == ConfidenceLevel.MED


def test_thin_sku_sample_anchors_from_cluster() -> None:
    """n_deals<5 on the SKU + cluster has data → return cluster-anchored
    band with anchored_from_cluster=True and confidence=low."""
    sku_samples = [100.0, 105.0]  # n=2, below floor
    cluster_samples = [80.0 + i for i in range(20)]  # 20 samples in cluster
    session = _stub_session_two_calls(sku_samples, cluster_samples)
    band = wtp_mod.build_wtp(
        aid="X-1",
        tier="A",
        cluster="CL-42",
        window_days=540,
        db_session=session,
    )
    assert band is not None
    assert band.anchored_from_cluster is True
    # Confidence is forced LOW because the SKU itself has thin data.
    assert band.confidence == ConfidenceLevel.LOW
    # n_deals reflects the cluster anchor sample.
    assert band.n_deals == 20
    # The percentiles come from the cluster, NOT the SKU's [100,105].
    # p50 of [80..99] is ~89.5, comfortably under the SKU sample's median.
    assert band.p50 < Decimal("100")


def test_thin_sku_no_cluster_returns_thin_band() -> None:
    """n_deals<5 on the SKU + no cluster provided → keep the thin SKU
    band with confidence=low and anchored_from_cluster=False."""
    sku_samples = [100.0, 105.0, 110.0]  # n=3
    session = _stub_session(sku_samples)
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.confidence == ConfidenceLevel.LOW
    assert band.anchored_from_cluster is False


def test_thin_sku_empty_cluster_returns_thin_band() -> None:
    """n_deals<5 on the SKU + cluster also has no data → keep the thin
    SKU band, do not anchor."""
    sku_samples = [100.0, 105.0]  # n=2
    cluster_samples: list[float] = []  # cluster also empty
    session = _stub_session_two_calls(sku_samples, cluster_samples)
    band = wtp_mod.build_wtp(
        aid="X-1",
        tier="A",
        cluster="CL-42",
        window_days=540,
        db_session=session,
    )
    assert band is not None
    assert band.confidence == ConfidenceLevel.LOW
    assert band.anchored_from_cluster is False


def test_empty_sku_with_cluster_anchors_from_cluster() -> None:
    """SKU sample empty (n=0) but cluster has data → still anchor from
    cluster. n<5 is the documented threshold; n=0 is included."""
    sku_samples: list[float] = []
    cluster_samples = [80.0 + i for i in range(20)]
    session = _stub_session_two_calls(sku_samples, cluster_samples)
    band = wtp_mod.build_wtp(
        aid="X-1",
        tier="A",
        cluster="CL-42",
        window_days=540,
        db_session=session,
    )
    assert band is not None
    assert band.anchored_from_cluster is True
    assert band.confidence == ConfidenceLevel.LOW
    assert band.n_deals == 20
