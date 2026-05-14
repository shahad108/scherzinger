import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

import backend.services.forecast.annotations as annotations


@pytest.fixture
def tmp_store(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "annotations.json"
        p.write_text("[]")
        monkeypatch.setattr(annotations, "STORE_PATH", p)
        yield p


def test_create_and_list_month(tmp_store):
    created = annotations.create_annotation(
        {
            "target": {"kind": "month", "value": "2026-08"},
            "body": "Q3 contract renegotiation closed early — bump expectations.",
            "author": "Frank",
        }
    )
    assert created["id"]
    assert created["target"]["kind"] == "month"
    assert created["target"]["value"] == "2026-08"
    assert created["author"] == "Frank"
    all_ = annotations.list_annotations()
    assert len(all_) == 1 and all_[0]["id"] == created["id"]


def test_create_cluster_annotation(tmp_store):
    row = annotations.create_annotation(
        {
            "target": {"kind": "cluster", "value": "CL-HIGH-MARGIN"},
            "body": "Watch this cluster — pricing approvals stuck.",
            "author": "Frank",
        }
    )
    assert row["target"] == {"kind": "cluster", "value": "CL-HIGH-MARGIN"}


def test_list_filter_by_target(tmp_store):
    annotations.create_annotation(
        {
            "target": {"kind": "month", "value": "2026-08"},
            "body": "August note",
            "author": "Frank",
        }
    )
    annotations.create_annotation(
        {
            "target": {"kind": "month", "value": "2026-09"},
            "body": "September note",
            "author": "Frank",
        }
    )
    annotations.create_annotation(
        {
            "target": {"kind": "cluster", "value": "CL-A"},
            "body": "Cluster A note",
            "author": "Frank",
        }
    )

    months = annotations.list_annotations(target_kind="month")
    assert len(months) == 2

    aug = annotations.list_annotations(target_kind="month", target_value="2026-08")
    assert len(aug) == 1 and aug[0]["body"] == "August note"

    clusters = annotations.list_annotations(target_kind="cluster")
    assert len(clusters) == 1 and clusters[0]["target"]["value"] == "CL-A"


def test_delete(tmp_store):
    row = annotations.create_annotation(
        {
            "target": {"kind": "month", "value": "2026-08"},
            "body": "to be deleted",
            "author": "Frank",
        }
    )
    annotations.delete_annotation(row["id"])
    assert annotations.list_annotations() == []


def test_delete_unknown_raises(tmp_store):
    with pytest.raises(KeyError):
        annotations.delete_annotation("does-not-exist-id")


def test_concurrent_create_no_loss(tmp_store):
    """20 concurrent creates must all land — guards against race on _load/_save."""

    def _make(i: int):
        return annotations.create_annotation(
            {
                "target": {"kind": "month", "value": "2026-08"},
                "body": f"concurrent note {i:03d}",
                "author": "Frank",
            }
        )

    with ThreadPoolExecutor(max_workers=20) as ex:
        list(ex.map(_make, range(20)))

    assert len(annotations.list_annotations()) == 20


def test_invalid_target_kind_rejected(tmp_store):
    with pytest.raises(ValueError):
        annotations.create_annotation(
            {
                "target": {"kind": "row", "value": "x"},
                "body": "body",
                "author": "Frank",
            }
        )


def test_empty_body_rejected(tmp_store):
    with pytest.raises(ValueError):
        annotations.create_annotation(
            {
                "target": {"kind": "month", "value": "2026-08"},
                "body": "   ",
                "author": "Frank",
            }
        )


def test_too_long_body_rejected(tmp_store):
    with pytest.raises(ValueError):
        annotations.create_annotation(
            {
                "target": {"kind": "month", "value": "2026-08"},
                "body": "x" * (annotations.MAX_BODY_LEN + 1),
                "author": "Frank",
            }
        )


def test_bad_month_format_rejected(tmp_store):
    with pytest.raises(ValueError):
        annotations.create_annotation(
            {
                "target": {"kind": "month", "value": "August 2026"},
                "body": "well-formed body",
                "author": "Frank",
            }
        )


def test_get_annotation_returns_none_when_missing(tmp_store):
    assert annotations.get_annotation("missing-id") is None
