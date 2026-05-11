"""Studio shell composer.

The shell endpoint returns: header, filters, toggles, defaultAid, skus[]
and (for backward compat with the existing frontend) the *default-aid*
workbench under the ``workbench`` key. Per-aid workbenches are fetched
on demand from /studio/workbench/{aid}.
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import HTTPException, status

from backend.database import SessionLocal
from backend.services import recommendation_service

from ._seed import load_seed

CACHE_TTL_SECONDS = 60
_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}


def invalidate_cache() -> None:
    _CACHE.clear()


def _persona_gate(persona: str) -> None:
    if persona == "frank":
        return
    if persona == "till":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "till",
                "message": "Till read-only Studio with override-approve coming in Phase 10.",
            },
        )
    if persona == "heiko":
        # Per §14.2 P8.T6 Heiko has no view.studio permission. The 404
        # body matches the other phases' shape so the frontend's persona
        # redirect can intercept consistently.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_no_access",
                "persona": "heiko",
                "message": "Heiko has no Studio access; redirect to /deal/inbox.",
            },
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown persona")


async def build_studio_shell(
    *,
    user_id: str,
    persona: str,
    aid: str | None,
    filter_value: str | None,
    hide_locked: bool,
    lang: str | None,
) -> dict[str, Any]:
    _persona_gate(persona)

    key = (user_id, persona, aid, filter_value, hide_locked, lang)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    seed = load_seed()
    skus = list(seed["skus"])
    if filter_value:
        skus = [
            s for s in skus
            if filter_value.lower() in str(s.get("flag", "")).lower()
            or filter_value.lower() in str(s.get("status", "")).lower()
        ] or skus
    if hide_locked:
        skus = [s for s in skus if not str(s.get("status", "")).lower().startswith("locked")]

    # Phase 3 — every SKU row carries the canonical per-SKU recommendation
    # contract under `recommendation`. Same shape as /action-center.skuTable[].
    try:
        with SessionLocal() as db:
            aids = [str(s.get("aid")) for s in skus if s.get("aid")]
            recs = recommendation_service.get_sku_recommendations_bulk(db, aids)
        for s in skus:
            s["recommendation"] = recs.get(str(s.get("aid")))
    except Exception:
        # Pilot-mode resilience: failing recommendation enrichment must
        # not block the seed-driven shell. Leave the field absent.
        for s in skus:
            s.setdefault("recommendation", None)

    payload = {
        "header": seed["header"],
        "filters": seed["filters"],
        "toggles": seed["toggles"],
        "defaultAid": aid or seed["defaultAid"],
        "skus": skus,
        # Backward-compat: existing frontend reads .workbench from the shell
        # for the default SKU. Per-aid workbenches use /studio/workbench/{aid}.
        "workbench": seed["workbench"],
        "comparable": seed["comparable"],
        "crossLinks": seed["crossLinks"],
        "footerNote": seed.get("footerNote", ""),
    }
    _CACHE[key] = (now, payload)
    return payload
