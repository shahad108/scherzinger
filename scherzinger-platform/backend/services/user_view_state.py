"""Pricing Studio v3 / Phase 4 — helpers for the user_view_state table.

``stamp_view``  — upsert (user, surface, target) → ``last_seen_at = now()``.
``get_last_seen`` — read the most-recent ``last_seen_at`` for a triple.

Both are tiny wrappers around the ORM but live in their own module so the
"first-time view" semantics (no row → default to last 7 days) are owned
in one place and the diff endpoint stays focused on diff logic.

The caller commits — these helpers ``flush()`` so the row is visible to
the same transaction but never escape commit semantics. Matches the
convention used by ``record_audit`` / ``create_lineage``.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from backend.models.user_view_state import UserViewState, UserViewSurface


def _surface_value(surface: UserViewSurface | str) -> str:
    return surface.value if isinstance(surface, UserViewSurface) else str(surface)


def stamp_view(
    *,
    user_id: str,
    surface: UserViewSurface | str,
    target_id: str,
    session: Session,
    at: Optional[datetime] = None,
) -> UserViewState:
    """Upsert ``last_seen_at = at or now()`` for (user, surface, target).

    Idempotent — re-stamping the same triple bumps the timestamp instead
    of raising on the composite primary key.
    """
    surface_v = _surface_value(surface)
    # Use Postgres ON CONFLICT for atomic upsert. SQLite tests should use
    # a SQLite-compatible dialect; the live backend is Postgres so we
    # take the PG fast path here. If a non-PG session ever needs this,
    # fall back to a select-then-update pattern.
    dialect = session.bind.dialect.name if session.bind is not None else "postgresql"
    if dialect == "postgresql":
        # We always want the conflict path to advance ``last_seen_at`` —
        # either to the caller-supplied ``at`` or to ``now()``. Relying on
        # ``excluded.last_seen_at`` is wrong when the caller didn't pass
        # ``at`` (the EXCLUDED column would just be the server-default
        # snapshotted at row build time, which can collide with the
        # existing row's value within the same transaction).
        insert_values = {
            "user_id": user_id,
            "surface": surface_v,
            "target_id": target_id,
        }
        if at is not None:
            insert_values["last_seen_at"] = at
        stmt = pg_insert(UserViewState).values(**insert_values)
        # ``func.now()`` would return the transaction start timestamp, which
        # means two stamps in the same transaction return identical values.
        # ``clock_timestamp()`` is wall-clock, so re-stamping within a single
        # transaction advances the value (matters for tests + for the diff
        # endpoint's view-state stamp inside the same request).
        update_payload = (
            {"last_seen_at": at}
            if at is not None
            else {"last_seen_at": func.clock_timestamp()}
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                UserViewState.user_id,
                UserViewState.surface,
                UserViewState.target_id,
            ],
            set_=update_payload,
        )
        session.execute(stmt)
        session.flush()
        # Return the post-upsert row so callers can inspect last_seen_at.
        # ``session.execute(select(...))`` would otherwise return the
        # ORM-cached identity-map row whose ``last_seen_at`` is stale
        # (the bulk ON CONFLICT statement doesn't refresh the ORM state).
        # Expire+refresh forces a SELECT against the post-upsert row.
        row = session.execute(
            select(UserViewState).where(
                UserViewState.user_id == user_id,
                UserViewState.surface == surface_v,
                UserViewState.target_id == target_id,
            )
        ).scalar_one()
        session.refresh(row)
        return row

    # Generic fallback (e.g. SQLite in tests): select then update/insert.
    existing = session.execute(
        select(UserViewState).where(
            UserViewState.user_id == user_id,
            UserViewState.surface == surface_v,
            UserViewState.target_id == target_id,
        )
    ).scalar_one_or_none()
    if existing is not None:
        if at is not None:
            existing.last_seen_at = at
        else:
            from datetime import timezone

            existing.last_seen_at = datetime.now(timezone.utc)
        session.flush()
        return existing
    row = UserViewState(
        user_id=user_id,
        surface=surface_v,
        target_id=target_id,
    )
    if at is not None:
        row.last_seen_at = at
    session.add(row)
    session.flush()
    return row


def get_last_seen(
    *,
    user_id: str,
    surface: UserViewSurface | str,
    target_id: str,
    session: Session,
) -> Optional[datetime]:
    """Return the last seen timestamp or ``None`` if no row exists."""
    surface_v = _surface_value(surface)
    row = session.execute(
        select(UserViewState).where(
            UserViewState.user_id == user_id,
            UserViewState.surface == surface_v,
            UserViewState.target_id == target_id,
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    return row.last_seen_at
