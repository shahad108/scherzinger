import pytest
from backend.services.forecast import pipeline_p50


def test_aggregates_by_month():
    out = pipeline_p50.build_pipeline_p50(open_quotes=[
        {"close_month": "2026-08", "value": 10000, "win_prob": 0.5, "tier": "A"},
        {"close_month": "2026-08", "value": 20000, "win_prob": 0.25, "tier": "C"},
        {"close_month": "2026-09", "value": 40000, "tier": "B"},  # uses default 0.45
    ])
    aug = next(p for p in out if p["month"] == "2026-08")
    assert aug["pipelineP50"] == pytest.approx(10000 * 0.5 + 20000 * 0.25)
    sep = next(p for p in out if p["month"] == "2026-09")
    assert sep["pipelineP50"] == pytest.approx(40000 * 0.45)


def test_default_when_no_tier_and_no_win_prob():
    out = pipeline_p50.build_pipeline_p50(open_quotes=[
        {"close_month": "2026-10", "value": 1000},
    ])
    assert out == [{"month": "2026-10", "pipelineP50": pytest.approx(1000 * 0.25)}]


def test_empty_input():
    assert pipeline_p50.build_pipeline_p50() == []
    assert pipeline_p50.build_pipeline_p50(open_quotes=[]) == []


def test_skips_invalid_values():
    out = pipeline_p50.build_pipeline_p50(open_quotes=[
        {"close_month": "2026-08", "value": "bad", "tier": "A"},
        {"close_month": "2026-08", "value": 100, "win_prob": 0.5},
        {"value": 50, "win_prob": 0.5},  # no close_month
    ])
    aug = next(p for p in out if p["month"] == "2026-08")
    assert aug["pipelineP50"] == pytest.approx(50)


def test_pipeline_p50_from_open_quote_payload(db):
    """v2.2 Phase A: the composer helper builds an open-quotes list from the
    same quote ledger ``quote_to_revenue`` reads. Verify the resulting
    payload yields at least one month with a positive pipeline value."""
    from backend.services.forecast.composer import _open_quotes_payload
    open_quotes = _open_quotes_payload(db, cluster=None)
    # Live dataset has 12 months of quotes — should yield ≥ 1 entry.
    assert isinstance(open_quotes, list)
    assert open_quotes, "expected at least one open quote from the live ledger"
    out = pipeline_p50.build_pipeline_p50(open_quotes=open_quotes)
    assert out
    assert any(p["pipelineP50"] > 0 for p in out)
