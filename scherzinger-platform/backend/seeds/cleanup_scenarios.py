"""Idempotent dedupe for the ``scenarios`` table.

Keeps the most-recent row per ``(owner_user_id, name)`` and deletes the rest.
Safe to re-run: a clean table produces zero deletions.

Run with::

    .venv/bin/python -m backend.seeds.cleanup_scenarios
"""
from __future__ import annotations

from sqlalchemy import text

from backend.database import SessionLocal


_DEDUP_SQL = text(
    """
    DELETE FROM scenarios s
    USING (
        SELECT id FROM (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(owner_user_id::text, ''), name
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                ) AS rn
            FROM scenarios
        ) ranked
        WHERE ranked.rn > 1
    ) dups
    WHERE s.id = dups.id
    """
)


def cleanup() -> dict[str, int]:
    """Delete duplicate scenarios. Returns counts before/after."""
    with SessionLocal() as db:
        before = db.execute(text("SELECT COUNT(*) FROM scenarios")).scalar() or 0
        result = db.execute(_DEDUP_SQL)
        deleted = result.rowcount or 0
        db.commit()
        after = db.execute(text("SELECT COUNT(*) FROM scenarios")).scalar() or 0
    return {"before": int(before), "deleted": int(deleted), "after": int(after)}


def main() -> None:
    counts = cleanup()
    print(
        f"scenarios cleanup: before={counts['before']} "
        f"deleted={counts['deleted']} after={counts['after']}"
    )


if __name__ == "__main__":
    main()
