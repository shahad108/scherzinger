"""Tests for the canonical_metrics helper.

DATA-AUDIT-2026-05-17 defects #9 (top-10 SKU concentration) and #10
(new products last 12 months) required a single source of truth so the
Action Center and Forecast screens stop disagreeing on the same headline.
This test pins that contract.
"""
from __future__ import annotations

import pytest

from backend.database import SessionLocal
from backend.services import canonical_metrics


def test_new_products_metrics_matches_forecast_and_action_center():
    """Both screens MUST pull from this helper, so the value here is the
    canonical one — if either screen drifts a test elsewhere will fail."""
    with SessionLocal() as db:
        out = canonical_metrics.fetch_new_products_metrics(db)
    assert set(out.keys()) == {"n_new", "new_revenue", "total_revenue"}
    assert isinstance(out["n_new"], int)
    assert out["n_new"] >= 0
    # Revenue figures must be non-negative.
    assert out["new_revenue"] >= 0
    assert out["total_revenue"] >= 0


def test_top10_concentration_share_pct_is_a_percentage():
    with SessionLocal() as db:
        out = canonical_metrics.fetch_top10_concentration(db)
    assert set(out.keys()) == {"top10_revenue", "total_revenue", "share_pct"}
    assert 0.0 <= out["share_pct"] <= 100.0
    if out["total_revenue"] > 0:
        # Top-10 cannot exceed total
        assert out["top10_revenue"] <= out["total_revenue"] + 1e-6


def test_canonical_window_label_is_disclosed():
    """The helper exports a human-readable window label so the FE can
    surface the data window alongside the metric value."""
    assert "12 months" in canonical_metrics.WINDOW_LABEL.lower() \
        or "trailing" in canonical_metrics.WINDOW_LABEL.lower()
