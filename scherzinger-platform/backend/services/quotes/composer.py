"""Quotes & Guardrails composer."""
from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import HTTPException, status

from . import blocks

CACHE_TTL_SECONDS = 60
_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}


def invalidate_cache() -> None:
    _CACHE.clear()


async def _safe_gap() -> dict[str, Any]:
    """Pilot-mode resilience: a DB hiccup in the gap query must not kill
    the whole /quotes shell — the rest of the page is seed-backed."""
    try:
        return await blocks.gap()
    except Exception as exc:  # noqa: BLE001
        return {
            "title": "Quote → invoice margin gap",
            "subtitle": "Linkage data unavailable.",
            "overall": None,
            "byYear": [],
            "tone": "neutral",
            "headline": {"median": "—", "mean": "—", "n": "—"},
            "coverage": {"linked": None, "pct": None, "label": "Coverage unavailable", "tone": "warning"},
            "interpretation": f"Linkage query failed: {exc.__class__.__name__}.",
            "source": {"table": "quote_invoice_links", "buildScript": "scripts/link_quotes_invoices.py"},
            "heuristic": {"label": "Pilot fallback", "rule": "Linkage table empty or query failed.", "qualifier": None},
        }


async def build_quotes(
    *,
    user_id: str,
    persona: str,
    week: str | None,
    rep: str | None,
    customer_id: str | None,
    family: str | None,
    tier: str | None,
    lang: str | None,
) -> dict[str, Any]:
    if persona == "frank":
        pass
    elif persona == "till":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "till",
                "message": "Till Quotes view (override-approve, read-only) coming in Phase 10.",
            },
        )
    elif persona == "heiko":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "heiko",
                "message": "Heiko deal calculator coming in Phase 11.",
            },
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unknown persona"
        )

    key = (user_id, persona, week, rep, customer_id, family, tier, lang)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    (
        header,
        briefing,
        pipeline,
        changed,
        escalations,
        funnel,
        guardrails,
        active,
        analysis,
        gap,
        cross_links,
    ) = await asyncio.gather(
        blocks.header(week=week),
        blocks.briefing(lang=lang),
        blocks.pipeline(),
        blocks.changed(),
        blocks.escalations(rep=rep),
        blocks.funnel(),
        blocks.guardrails(family=family),
        blocks.active(rep=rep, customer_id=customer_id, family=family),
        blocks.analysis(tier=tier),
        _safe_gap(),
        blocks.cross_links(),
    )

    payload = {
        "header": header,
        "briefing": briefing,
        "pipeline": pipeline,
        "changed": changed,
        "escalations": escalations,
        "funnel": funnel,
        "guardrails": guardrails,
        "active": active,
        "analysis": analysis,
        "gap": gap,
        "crossLinks": cross_links,
    }
    _CACHE[key] = (now, payload)
    return payload
