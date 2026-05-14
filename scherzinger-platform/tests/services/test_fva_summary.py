"""Tests for overrides.summarize_fva — v2.2 Phase G drill-down aggregate."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from backend.services.forecast import overrides


@pytest.fixture
def tmp_store(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "overrides.json"
        p.write_text("[]")
        monkeypatch.setattr(overrides, "STORE_PATH", p)
        yield p


def _write_rows(p: Path, rows: list[dict]) -> None:
    p.write_text(json.dumps(rows))


def test_summarize_fva_buckets_by_sign(tmp_store):
    """fvaDelta > 0 → improved, < 0 → worsened, == 0 → neutral."""
    _write_rows(
        tmp_store,
        [
            # Q2 2026 = months 04, 05, 06.
            {"id": "a", "month": "2026-04", "fvaDelta": 40},   # improved
            {"id": "b", "month": "2026-05", "fvaDelta": 15},   # improved
            {"id": "c", "month": "2026-06", "fvaDelta": -25},  # worsened
            {"id": "d", "month": "2026-04", "fvaDelta": 0},    # neutral
        ],
    )
    out = overrides.summarize_fva(period="2026Q2")
    assert out["entered"] == 4
    assert out["improved"] == 2
    assert out["worsened"] == 1
    assert out["neutral"] == 1


def test_summarize_fva_net_is_algebraic_sum(tmp_store):
    """netFvaDeltaPp is the algebraic sum (in pp), not the absolute total."""
    _write_rows(
        tmp_store,
        [
            {"id": "a", "month": "2026-04", "fvaDelta": 40},   # +40 bps
            {"id": "b", "month": "2026-05", "fvaDelta": 15},   # +15 bps
            {"id": "c", "month": "2026-06", "fvaDelta": -25},  # -25 bps
            {"id": "d", "month": "2026-04", "fvaDelta": 0},    # 0
        ],
    )
    out = overrides.summarize_fva(period="2026Q2")
    # 40 + 15 - 25 + 0 = 30 bps → 0.3pp
    assert out["netFvaDeltaPp"] == 0.3


def test_summarize_fva_period_filter_excludes_other_quarters(tmp_store):
    _write_rows(
        tmp_store,
        [
            {"id": "a", "month": "2026-04", "fvaDelta": 40},   # Q2 ✓
            {"id": "b", "month": "2026-01", "fvaDelta": 15},   # Q1 — excluded
            {"id": "c", "month": "2026-07", "fvaDelta": 40},   # Q3 — excluded
            {"id": "d", "month": "2025-05", "fvaDelta": 40},   # prior year — excluded
        ],
    )
    out = overrides.summarize_fva(period="2026Q2")
    assert out["entered"] == 1
    assert out["improved"] == 1
    assert out["netFvaDeltaPp"] == 0.4
    assert out["period"] == "2026Q2"


def test_summarize_fva_empty_period_returns_zeros(tmp_store):
    _write_rows(tmp_store, [])
    out = overrides.summarize_fva(period="2027Q1")
    assert out == {
        "period": "2027Q1",
        "entered": 0,
        "improved": 0,
        "worsened": 0,
        "neutral": 0,
        "netFvaDeltaPp": 0.0,
    }


def test_summarize_fva_defaults_to_current_quarter(tmp_store, monkeypatch):
    """No period arg → uses today's UTC quarter (from datetime.now)."""
    # Pin "now" to a Q2 2026 date so the test is deterministic.
    import datetime as _dt

    class _FrozenDateTime(_dt.datetime):
        @classmethod
        def now(cls, tz=None):  # type: ignore[override]
            return _dt.datetime(2026, 5, 15, tzinfo=tz or _dt.timezone.utc)

    monkeypatch.setattr(overrides, "datetime", _FrozenDateTime)
    _write_rows(
        tmp_store,
        [
            {"id": "a", "month": "2026-05", "fvaDelta": 40},   # in current quarter
            {"id": "b", "month": "2026-01", "fvaDelta": 40},   # not in current quarter
        ],
    )
    out = overrides.summarize_fva()  # no period — defaults to current quarter
    assert out["period"] == "2026Q2"
    assert out["entered"] == 1


def test_summarize_fva_handles_missing_or_invalid_delta(tmp_store):
    """fvaDelta == None or unparseable → bucketed as neutral, not in net."""
    _write_rows(
        tmp_store,
        [
            {"id": "a", "month": "2026-04", "fvaDelta": None},     # neutral
            {"id": "b", "month": "2026-05", "fvaDelta": "junk"},   # neutral
            {"id": "c", "month": "2026-06", "fvaDelta": 40},       # improved
        ],
    )
    out = overrides.summarize_fva(period="2026Q2")
    assert out["entered"] == 3
    assert out["improved"] == 1
    assert out["neutral"] == 2
    assert out["worsened"] == 0
    assert out["netFvaDeltaPp"] == 0.4
