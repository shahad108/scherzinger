"""Phase 18 — Model Registry read API.

Powers the Action Center Trust strip drawer and the Settings → Model Cards
page. Single source of truth for per-(model, cluster) accuracy, last
trained date, feature list, and notes.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.services import model_registry_service

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/cards")
def get_cards(
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Full registry shaped per-model with per-cluster metric breakdowns."""
    cards = model_registry_service.get_model_cards(db)
    return {"models": cards, "count": len(cards)}


@router.get("/trust-drawer")
def get_trust_drawer(
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Per-tile drilldown for the Action Center Trust strip.

    Each tile carries: headline value, source (model + cluster), and a
    top-5 cluster table the FE renders as the drawer body.
    """
    return model_registry_service.get_trust_drawer(db)
