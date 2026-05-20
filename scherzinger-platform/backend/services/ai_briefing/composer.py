"""AI Briefing composer."""
from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import HTTPException, status

from ._seed import load_seed
from .citations import annotate_paragraphs, extract as extract_citations
from .providers import draft_memo

CACHE_TTL_SECONDS = 60
_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}


def invalidate_cache() -> None:
    _CACHE.clear()


def _persona_gate(persona: str) -> None:
    if persona == "frank":
        return
    if persona == "till":
        # Till sees a different memo voice + no selfCorrection card; Phase 10
        # implements the variant. Until then, gate with a documented 404.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "till",
                "message": "Till AI Briefing (CFO voice, no selfCorrection card) coming in Phase 10.",
            },
        )
    if persona == "heiko":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "heiko",
                "message": "Heiko single-card briefing coming in Phase 11.",
            },
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown persona")


async def _header(*, week: str | None, lang: str | None) -> dict[str, Any]:
    seed_header = dict(load_seed(lang)["header"])
    if week:
        seed_header["week"] = week
    return seed_header


async def _memo(*, persona: str, lang: str | None) -> dict[str, Any]:
    return draft_memo(scope="monday_briefing", persona=persona, lang=lang)


async def _side_cards(*, persona: str, lang: str | None) -> Any:
    cards = list(load_seed(lang)["sideCards"])
    if persona == "till":
        # Till variant strips selfCorrection (Phase 10 spec); reachable only
        # if/when the persona gate is loosened.
        cards = [c for c in cards if c.get("kind") != "selfCorrection"]
    # Phase 10 — same citation extraction the memo uses, so any bullet or
    # body prose mentioning an Article/Customer/Cluster/Recommendation
    # carries deep-links the FE can render.
    out: list[dict[str, Any]] = []
    for c in cards:
        new_c = dict(c)
        if isinstance(new_c.get("bullets"), list):
            new_c["bullets"] = annotate_paragraphs(new_c["bullets"])
        if isinstance(new_c.get("body"), str) and new_c["body"]:
            body_cites = extract_citations(new_c["body"])
            if body_cites:
                new_c["citations"] = body_cites
        out.append(new_c)
    return out


async def _cross_links(*, lang: str | None) -> Any:
    return list(load_seed(lang)["crossLinks"])


async def build_ai_briefing(
    *,
    user_id: str,
    persona: str,
    week: str | None,
    lang: str | None,
) -> dict[str, Any]:
    _persona_gate(persona)
    key = (user_id, persona, week, lang)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    header, memo, side_cards, cross_links = await asyncio.gather(
        _header(week=week, lang=lang),
        _memo(persona=persona, lang=lang),
        _side_cards(persona=persona, lang=lang),
        _cross_links(lang=lang),
    )
    payload = {
        "header": header,
        "memo": memo,
        "sideCards": side_cards,
        "crossLinks": cross_links,
    }
    _CACHE[key] = (now, payload)
    return payload
