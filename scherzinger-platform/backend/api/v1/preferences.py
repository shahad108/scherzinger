"""Phase 14 P14.T2 — user preferences (singleton row per user)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models import User, UserPreferences

router = APIRouter(tags=["me"])

ALLOWED_LANGS = {"de", "en"}
ALLOWED_DENSITY = {"comfortable", "compact"}
ALLOWED_PERSONA = {"frank", "till", "heiko"}
ALLOWED_CADENCE = {"daily", "weekly", "off"}


class PreferencesPatch(BaseModel):
    language: str | None = None
    density: str | None = None
    default_persona: str | None = None
    briefing_email_cadence: str | None = None
    notify_quotes: bool | None = None
    notify_margin: bool | None = None
    notify_pro: bool | None = None


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, max_length=120)


class LanguagePatch(BaseModel):
    """Pricing Studio v3 / Phase 10 — dedicated payload for /users/me/language.

    Lightweight read/write pair for the German toggle in the header; backs
    onto the same UserPreferences.language column as /me/preferences.
    """

    lang: str = Field(..., min_length=2, max_length=8)


def _serialize(p: UserPreferences) -> dict[str, Any]:
    return {
        "language": p.language,
        "density": p.density,
        "default_persona": p.default_persona,
        "briefing_email_cadence": p.briefing_email_cadence,
        "notify_quotes": p.notify_quotes,
        "notify_margin": p.notify_margin,
        "notify_pro": p.notify_pro,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _get_or_create(db: Session, user_id) -> UserPreferences:
    p = db.query(UserPreferences).filter_by(user_id=user_id).one_or_none()
    if p is None:
        p = UserPreferences(user_id=user_id)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


@router.get("/me/preferences")
def get_preferences(
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return _serialize(_get_or_create(db, ctx.user_id))


@router.patch("/me/preferences")
def update_preferences(
    body: PreferencesPatch,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    p = _get_or_create(db, ctx.user_id)
    if body.language is not None:
        if body.language not in ALLOWED_LANGS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"language must be one of {sorted(ALLOWED_LANGS)}")
        p.language = body.language
    if body.density is not None:
        if body.density not in ALLOWED_DENSITY:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"density must be one of {sorted(ALLOWED_DENSITY)}")
        p.density = body.density
    if body.default_persona is not None:
        if body.default_persona not in ALLOWED_PERSONA:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"default_persona must be one of {sorted(ALLOWED_PERSONA)}")
        p.default_persona = body.default_persona
    if body.briefing_email_cadence is not None:
        if body.briefing_email_cadence not in ALLOWED_CADENCE:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"briefing_email_cadence must be one of {sorted(ALLOWED_CADENCE)}")
        p.briefing_email_cadence = body.briefing_email_cadence
    if body.notify_quotes is not None:
        p.notify_quotes = body.notify_quotes
    if body.notify_margin is not None:
        p.notify_margin = body.notify_margin
    if body.notify_pro is not None:
        p.notify_pro = body.notify_pro
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return _serialize(p)


@router.get("/users/me/language")
def get_language(
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Pricing Studio v3 / Phase 10 — read current language preference.

    Defaults to the UserPreferences default (``de`` at the column level
    today; the German toggle in the FE header treats either ``en`` or
    ``de`` as valid).
    """
    p = _get_or_create(db, ctx.user_id)
    return {"lang": p.language}


@router.put("/users/me/language")
def set_language(
    body: LanguagePatch,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Pricing Studio v3 / Phase 10 — write language preference.

    Validates against ``ALLOWED_LANGS`` (currently ``{en, de}``). Future
    translations can extend the set; the FE persists this on toggle.
    """
    if body.lang not in ALLOWED_LANGS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"lang must be one of {sorted(ALLOWED_LANGS)}",
        )
    p = _get_or_create(db, ctx.user_id)
    p.language = body.lang
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(p)
    return {"lang": p.language}


@router.patch("/me")
def update_profile(
    body: ProfilePatch,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    user = db.get(User, ctx.user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    if body.name is not None:
        user.name = body.name
    db.commit()
    return {"id": str(user.id), "name": user.name, "email": user.email}
