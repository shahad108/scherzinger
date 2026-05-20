"""Pipeline-implied P50 composer — open-quote book × win_prob aggregated by close month.

Returns a list of points the hero composer can merge into its series so the
HeroForecast chart can render a second line alongside the statistical P50.

For demo: input is `open_quotes` (a list of dicts the caller assembles from
the existing quote ledger). If `win_prob` is missing on a quote, fall back to
a tier-level default (A=0.65, B=0.45, C=0.25, D=0.10). When a quote has neither
win_prob nor tier we use 0.25 (matches tier C).
"""
from __future__ import annotations
from typing import Any

TIER_WIN_PROB_DEFAULT: dict[str, float] = {
    "A": 0.65,
    "B": 0.45,
    "C": 0.25,
    "D": 0.10,
}
DEFAULT_WIN_PROB = 0.25


def build_pipeline_p50(*, open_quotes: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Build a list of {month: 'YYYY-MM', pipelineP50: float}.

    Each open quote contributes ``value * win_prob`` to its close_month bucket.
    """
    open_quotes = open_quotes or []
    by_month: dict[str, float] = {}
    for q in open_quotes:
        month = q.get("close_month")
        if not month:
            continue
        try:
            value = float(q.get("value", 0))
        except (TypeError, ValueError):
            continue
        win_prob = q.get("win_prob")
        if win_prob is None:
            tier = q.get("tier")
            win_prob = TIER_WIN_PROB_DEFAULT.get(tier, DEFAULT_WIN_PROB) if tier else DEFAULT_WIN_PROB
        try:
            wp = float(win_prob)
        except (TypeError, ValueError):
            wp = DEFAULT_WIN_PROB
        by_month[month] = by_month.get(month, 0.0) + value * wp
    return [{"month": m, "pipelineP50": v} for m, v in sorted(by_month.items())]
