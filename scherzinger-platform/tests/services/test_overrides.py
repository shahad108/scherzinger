import tempfile
from concurrent.futures import ThreadPoolExecutor
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


def test_create_and_list(tmp_store):
    created = overrides.create_override(
        {
            "month": "2026-08",
            "cluster": None,
            "mode": "revenue",
            "actual": 650000,
            "modelP50": 612000,
            "source": "manual",
            "confidence": "medium",
            "reason": "Q3 renegotiation closed early",
            "author": "Frank",
        }
    )
    assert created["id"]
    assert created["adjustmentPct"] == pytest.approx(
        (650000 - 612000) / 612000, abs=1e-6
    )
    all_ = overrides.list_overrides()
    assert len(all_) == 1 and all_[0]["id"] == created["id"]


def test_update(tmp_store):
    c = overrides.create_override(
        {
            "month": "2026-08",
            "cluster": None,
            "mode": "revenue",
            "actual": 100,
            "modelP50": 90,
            "source": "manual",
            "confidence": "low",
            "reason": "test reason 12345",
            "author": "Frank",
        }
    )
    u = overrides.update_override(
        c["id"], {"actual": 110, "reason": "revised reason 12345"}
    )
    assert u["actual"] == 110
    assert u["reason"] == "revised reason 12345"


def test_delete(tmp_store):
    c = overrides.create_override(
        {
            "month": "2026-08",
            "cluster": None,
            "mode": "revenue",
            "actual": 100,
            "modelP50": 90,
            "source": "manual",
            "confidence": "low",
            "reason": "test reason 12345",
            "author": "Frank",
        }
    )
    overrides.delete_override(c["id"])
    assert overrides.list_overrides() == []


def test_delete_unknown_raises(tmp_store):
    with pytest.raises(KeyError):
        overrides.delete_override("does-not-exist-id")


def test_concurrent_create_no_loss(tmp_store):
    """20 concurrent creates must all land — guards against race on _load/_save."""

    def _make(i: int):
        return overrides.create_override(
            {
                "month": "2026-08",
                "cluster": None,
                "mode": "revenue",
                "actual": 100 + i,
                "modelP50": 90,
                "source": "manual",
                "confidence": "low",
                "reason": f"concurrent reason {i:03d}",
                "author": "Frank",
            }
        )

    with ThreadPoolExecutor(max_workers=20) as ex:
        list(ex.map(_make, range(20)))

    assert len(overrides.list_overrides()) == 20


def test_reason_too_short_rejected(tmp_store):
    with pytest.raises(ValueError):
        overrides.create_override(
            {
                "month": "2026-08",
                "cluster": None,
                "mode": "revenue",
                "actual": 100,
                "modelP50": 90,
                "source": "manual",
                "confidence": "low",
                "reason": "short",
                "author": "Frank",
            }
        )
