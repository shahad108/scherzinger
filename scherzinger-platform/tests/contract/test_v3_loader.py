"""Contract tests for the Phase 7 v3 forecaster loader.

These tests read the supervised parquet cache produced by
``notebooks/forecasting_v3`` and confirm the loader returns 12 monotone-bound
points that fall inside the expected business ranges.
"""

from __future__ import annotations

import pytest

from backend.services.forecast import v3_loader


def _require_cache(target: str) -> None:
    path = v3_loader._parquet_path(target)
    if not path.exists():
        pytest.skip(f"v3 parquet missing for {target}: {path}")


def test_revenue_v3_loader_returns_calibrated_12mo_total() -> None:
    _require_cache("revenue")
    rows = v3_loader.project_v3("revenue", n_periods=12)
    assert rows is not None, "v3 loader returned None for revenue"
    assert len(rows) == 12
    total = sum(r["p50"] for r in rows)
    assert 6_500_000 <= total <= 7_700_000, f"revenue 12mo total out of band: {total}"
    for r in rows:
        assert r["p80Low"] <= r["p50"] <= r["p80High"], (
            f"P50 outside P80 PI for revenue: {r}"
        )
        # 95% PI must contain the 80% PI.
        assert r["p95Low"] <= r["p80Low"], f"P95Low > P80Low for revenue: {r}"
        assert r["p95High"] >= r["p80High"], f"P95High < P80High for revenue: {r}"


def test_volume_v3_loader_returns_calibrated_12mo_total() -> None:
    _require_cache("volume")
    rows = v3_loader.project_v3("volume", n_periods=12)
    assert rows is not None, "v3 loader returned None for volume"
    assert len(rows) == 12
    total = sum(r["p50"] for r in rows)
    assert 6_000 <= total <= 8_500, f"volume 12mo total out of band: {total}"
    for r in rows:
        assert r["p80Low"] <= r["p50"] <= r["p80High"], (
            f"P50 outside P80 PI for volume: {r}"
        )
        assert r["p95Low"] <= r["p80Low"], f"P95Low > P80Low for volume: {r}"
        assert r["p95High"] >= r["p80High"], f"P95High < P80High for volume: {r}"


def test_margin_v3_loader_mean_in_business_range() -> None:
    _require_cache("margin")
    rows = v3_loader.project_v3("margin", n_periods=12)
    assert rows is not None, "v3 loader returned None for margin"
    assert len(rows) == 12
    mean = sum(r["p50"] for r in rows) / len(rows)
    assert 0.50 <= mean <= 0.70, f"margin mean out of band: {mean}"
    for r in rows:
        assert r["p80Low"] <= r["p50"] <= r["p80High"], (
            f"P50 outside P80 PI for margin: {r}"
        )
        assert r["p95Low"] <= r["p80Low"], f"P95Low > P80Low for margin: {r}"
        assert r["p95High"] >= r["p80High"], f"P95High < P80High for margin: {r}"


def test_is_enabled_respects_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FORECAST_V3", raising=False)
    assert v3_loader.is_enabled() is False
    monkeypatch.setenv("FORECAST_V3", "1")
    assert v3_loader.is_enabled() is True
    monkeypatch.setenv("FORECAST_V3", "0")
    assert v3_loader.is_enabled() is False


def test_metadata_returns_model_labels() -> None:
    _require_cache("revenue")
    md = v3_loader.metadata()
    assert "model_revenue" in md and md["model_revenue"]
    assert "model_volume" in md and md["model_volume"]
    assert "model_margin" in md and md["model_margin"]
    assert md["trained_on"].startswith("2022-01..2025-12")
