"""Pricing Studio v3 / Phase 10 — per-SKU briefing endpoint.

Surfaces persona-toggled rationale markdown for a single SKU. v3 keeps
the surface deliberately small: ``persona`` and ``lang`` query params
route into the existing recommendation rationale; full translations
land in a follow-up.

Reuses the Forecasting v2.2 Phase I persona convention so the FE can
share the same toggle component.
"""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.services.pricing import recommendation as recommendation_mod

router = APIRouter(prefix="/briefing", tags=["briefing"])

Persona = Literal["frank", "till", "manuel"]
Lang = Literal["en", "de"]

# Persona prefixes — deterministic ribbon at the top of the markdown so
# the FE can confirm which voice it's looking at without re-parsing.
# (Real translation hooks land post-v3.)
_PERSONA_PREFIX_EN: dict[str, str] = {
    "frank": "**Analyst memo — Frank**\n\n",
    "till":  "**CFO summary — Till**\n\n",
    "manuel": "**1-pager — Manuel**\n\n",
}
_PERSONA_PREFIX_DE: dict[str, str] = {
    "frank": "**Analyse — Frank**\n\n",
    "till":  "**CFO-Zusammenfassung — Till**\n\n",
    "manuel": "**Einseiter — Manuel**\n\n",
}


@router.get("/sku/{aid}")
def get_sku_briefing(
    aid: str,
    persona: Persona = Query(default="frank"),
    lang: Lang = Query(default="en"),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return persona-toggled rationale markdown for one SKU.

    The recommendation service already renders deterministic markdown.
    Phase 10 wraps it with a persona/lang ribbon so the FE briefing
    drawer can render the same surface for any persona without a
    separate fetch.
    """
    try:
        rec = recommendation_mod.build_recommendation(
            aid=aid,
            tier=None,
            cluster=None,
            db_session=db,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "recommendation_not_found", "aid": aid},
        )

    body_md = rec.rationale_md or ""
    prefix_table = _PERSONA_PREFIX_DE if lang == "de" else _PERSONA_PREFIX_EN
    prefix = prefix_table.get(persona, "")
    return {
        "aid": aid,
        "persona": persona,
        "lang": lang,
        "rationale_md": prefix + body_md,
    }
