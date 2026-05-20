"""Pricing Studio v3 / Phase 4 — per-user "last seen" view state.

Tracks the last time a given user looked at a given (surface, target) so
the "what changed since you last looked" diff strip on the Studio + the
inbox unread badges can render deterministically.

Composite PK (user_id, surface, target_id) lets a user have one row per
(surface, target). An upsert on conflict bumps ``last_seen_at`` to now()
without raising — see ``services.user_view_state.stamp_view``.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class UserViewSurface(str, Enum):
    STUDIO = "studio"
    FORECASTING = "forecasting"
    MARGIN = "margin"
    ACTION_CENTER = "action_center"


class UserViewState(Base):
    """One row per (user, surface, target). Idempotent on upsert.

    ``user_id`` is stored as a string so the same row format works for
    UUID-bearing personas (``str(uuid)``) and the legacy demo seeds that
    use opaque identifiers (e.g. ``"frank"``). The column width is
    generous; production user ids are UUIDs ≤ 36 chars.
    """

    __tablename__ = "user_view_state"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    surface: Mapped[str] = mapped_column(String(32), primary_key=True)
    target_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
