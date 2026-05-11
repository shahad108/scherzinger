"""Per-block helpers for the Quotes & Guardrails composer.

Each helper today returns the seed slice; later phases swap them for
real reads of:
    pipeline      → quote_service counters
    changed       → diff between two snapshots of v_quote_active (P6.T2)
    escalations   → top-N from v_quote_active with margin_breach >= 3pp (P6.T3)
    funnel/aging  → quote_service stage counts (P6.T4)
    guardrails    → guardrails table (P6.T5)
    active        → v_quote_active rows + RAG (P6.T6)
    analysis.*    → LTM rep/sku/cust breakdowns (P6.T7)
"""
from __future__ import annotations

from typing import Any

from backend.database import SessionLocal
from backend.services import quote_service

from ._seed import load_seed


async def header(*, week: str | None) -> dict[str, Any]:
    seed_header = dict(load_seed()["header"])
    if week:
        # Phase 6 carries the seed copy; the week filter shape is wired so
        # callers can pass through. Real impl recomputes counts.
        seed_header["week"] = week
    return seed_header


async def briefing(*, lang: str | None) -> dict[str, Any]:
    memo = dict(load_seed()["briefing"])
    if lang:
        memo["lang"] = lang
    return memo


async def pipeline() -> Any:
    return list(load_seed()["pipeline"])


async def changed() -> Any:
    return load_seed()["changed"]


async def escalations(*, rep: str | None) -> dict[str, Any]:
    block = dict(load_seed()["escalations"])
    if rep:
        cards = list(block.get("cards") or [])
        narrowed = [
            c for c in cards if str(c.get("rep", "")).lower() == rep.lower()
        ]
        if narrowed:
            block["cards"] = narrowed
    return block


async def funnel() -> Any:
    return load_seed()["funnel"]


async def guardrails(*, family: str | None) -> dict[str, Any]:
    block = dict(load_seed()["guardrails"])
    if family:
        cards = list(block.get("cards") or [])
        narrowed = [
            c for c in cards if str(c.get("family", "")).lower() == family.lower()
        ]
        if narrowed:
            block["cards"] = narrowed
    return block


async def active(
    *, rep: str | None, customer_id: str | None, family: str | None
) -> dict[str, Any]:
    block = dict(load_seed()["active"])
    rows = list(block.get("rows") or [])
    if rep:
        rows = [
            r for r in rows if str(r.get("rep", "")).lower() == rep.lower()
        ] or rows
    if customer_id:
        rows = [
            r
            for r in rows
            if str(r.get("customerId", r.get("customer", ""))).lower()
            == customer_id.lower()
        ] or rows
    if family:
        rows = [
            r for r in rows if str(r.get("family", "")).lower() == family.lower()
        ] or rows
    block["rows"] = rows
    return block


async def analysis(*, tier: str | None) -> dict[str, Any]:
    block = dict(load_seed()["analysis"])
    if tier and isinstance(block.get("cust"), dict):
        cust = dict(block["cust"])
        cust["activeTier"] = tier
        block["cust"] = cust
    return block


async def cross_links() -> Any:
    return list(load_seed()["crossLinks"])


# ---------------------------------------------------------------------------
# Phase 5 — quote-to-invoice gap card.
#
# Reads the linkage table populated by `scripts/link_quotes_invoices.py`
# (1,313 linked pairs out of 4,605 quotes — Frank's defensible demo
# signal). Shape mirrors what `/action-center.lostQuote.quoteInvoiceGap`
# already serves so the same client model works in both places.
# ---------------------------------------------------------------------------
_GAP_TONE_THRESHOLD_PP = 1.0  # median gap above this counts as material


def _gap_tone(median_pp: float | None) -> str:
    if median_pp is None:
        return "neutral"
    if median_pp >= _GAP_TONE_THRESHOLD_PP * 2:
        return "negative"
    if median_pp >= _GAP_TONE_THRESHOLD_PP:
        return "warning"
    return "neutral"


def _coverage_pct(linked_n: int | None) -> float | None:
    """Linked quote count / total quote count → coverage badge."""
    if not linked_n:
        return None
    # quotes table holds ~4,605 quote lines (per the demo dataset);
    # exposed via a count query for honesty.
    with SessionLocal() as db:
        from sqlalchemy import text
        total = db.execute(text("SELECT COUNT(*) FROM quotes")).scalar() or 0
    if not total:
        return None
    return round(100.0 * linked_n / float(total), 1)


async def gap() -> dict[str, Any]:
    """Quote→invoice margin gap block.

    Returns the same overall + byYear shape that Action Center's
    LostQuoteCard already understands, plus presentation copy so the
    /quotes page can render a standalone, defensible card.
    """
    with SessionLocal() as db:
        raw = quote_service.get_quote_to_invoice_gap(db)

    overall = raw.get("overall") or {}
    median_pp = overall.get("median_gap_pp") if overall else None
    mean_pp = overall.get("mean_gap_pp") if overall else None
    n = overall.get("n") if overall else None
    coverage_pct = _coverage_pct(n)

    return {
        "title": "Quote → invoice margin gap",
        "subtitle": (
            "What we promise on the quote vs what we book on the invoice. "
            "The gap is the leakage between handshake and ledger."
        ),
        "overall": overall or None,
        "byYear": raw.get("byYear") or [],
        "tone": _gap_tone(median_pp),
        "headline": {
            "median": f"{median_pp:.1f}pp" if median_pp is not None else "—",
            "mean": f"{mean_pp:.1f}pp" if mean_pp is not None else "—",
            "n": f"{n:,}" if n is not None else "—",
        },
        "coverage": {
            "linked": n,
            "pct": coverage_pct,
            "label": (
                f"{coverage_pct:.0f}% of quote lines linked to a booked invoice"
                if coverage_pct is not None else "Coverage unavailable"
            ),
            "tone": "positive" if (coverage_pct or 0) >= 20 else "warning",
        },
        "interpretation": (
            f"Median customer pays {median_pp:.1f}pp less margin than the quote promised. "
            "Pricing-policy issue, not a sales-rep issue — the quote book is honest, the "
            "invoice book is not. Different fix from the lost-quote differential above "
            "(which is qualification + negotiation)."
        ) if median_pp is not None else (
            "Linkage table empty — run scripts/link_quotes_invoices.py to populate."
        ),
        "source": {
            "table": "quote_invoice_links",
            "joinOn": "quote_id + quote_position (to avoid Cartesian inflation)",
            "buildScript": "scripts/link_quotes_invoices.py",
        },
        "heuristic": {
            "label": "Real signal",
            "rule": (
                "median / mean computed from quote_invoice_links.margin_gap "
                "where margin_gap IS NOT NULL. Aggregations server-side via "
                "AVG + percentile_cont(0.5)."
            ),
            "qualifier": "Same source feeds Action Center → Lost-Quote card.",
        },
    }
