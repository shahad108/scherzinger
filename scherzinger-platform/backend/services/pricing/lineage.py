"""Lineage helpers — create + fetch lineage_refs rows.

Every numeric value the Studio surfaces should be born with a lineage ref
that pins it to the source (invoice ledger row, competitor feed snapshot,
model + run id, …). The `sql` field stores a *template* (no parameter
values) so we never leak PII into the audit/lineage trail.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.models.pricing.lineage import LineageRefRow, LineageSourceKind

logger = logging.getLogger(__name__)


# Conservative regex: strips every PostgreSQL-flavoured literal/comment
# shape we know about so a leaked literal can never survive the audit
# trail. Order matters — dollar-quoted and E'…' strings must precede the
# vanilla single-quoted alternative so their delimiters aren't eaten
# first. Block comments must precede line comments (a ``/* -- */`` block
# contains a literal ``--``).
#
# Tested cases (see tests/api/test_lineage.py::test_pii_scrubber_*):
#   - single-quoted string:        'CUST-42'
#   - double-quoted identifier:    "CUST-42"
#   - E-escape string:             E'foo\\n'
#   - dollar-quoted (named):       $tag$ raw $tag$
#   - dollar-quoted (anonymous):   $$ raw $$
#   - hex literal:                 x'deadbeef'
#   - SQL line comment:            -- secret\n
#   - SQL block comment:           /* secret */
#   - numeric literal:             1234.56
_LITERAL_RE = re.compile(
    r"""
      /\*[\s\S]*?\*/                              # block comment
    | --[^\n]*                                    # line comment
    | \$\$[\s\S]*?\$\$                            # anonymous dollar-quote
    | \$([A-Za-z_]\w*)\$[\s\S]*?\$\1\$            # named dollar-quote
    | [Ee]'(?:[^'\\]|\\.|'')*'                    # E-escape string
    | [xX]'[0-9a-fA-F]*'                          # hex literal
    | '(?:[^']|'')*'                              # single-quoted string
    | "(?:[^"]|"")*"                              # double-quoted identifier/string
    | \b\d+(?:\.\d+)?\b                           # numeric literal
    """,
    re.VERBOSE,
)


def _sanitize_sql(sql: Optional[str]) -> Optional[str]:
    if sql is None:
        return None
    return _LITERAL_RE.sub("?", sql)


def create_lineage(
    *,
    source_kind: LineageSourceKind | str,
    source_id: str,
    sql: Optional[str] = None,
    model: Optional[str] = None,
    computed_by: str,
    session: Session,
) -> LineageRefRow:
    """Insert a lineage row and return it.

    The caller commits — this helper does not commit so it can be composed
    inside a larger transaction (e.g. a price-set workflow).
    """
    kind = source_kind.value if isinstance(source_kind, LineageSourceKind) else str(source_kind)
    row = LineageRefRow(
        source_kind=kind,
        source_id=source_id,
        sql=_sanitize_sql(sql),
        model=model,
        computed_by=computed_by,
    )
    session.add(row)
    session.flush()  # populate row.id / computed_at without committing
    return row


def get_lineage(lineage_id: UUID, *, session: Session) -> Optional[LineageRefRow]:
    """Fetch by primary key. Returns None when missing."""
    return session.get(LineageRefRow, lineage_id)


# ---------------------------------------------------------------------------
# Phase E (E6) — list-by-aid endpoint.
#
# The lineage table doesn't have a dedicated lookup_payload column today —
# every pricing signal encodes the SKU id ("aid") inside ``source_id`` via
# patterns like::
#
#   rec:{aid}                                 → recommendation
#   wtp:{aid}:{tier}                          → wtp
#   cost_outlook:{aid}:{horizon_months}       → cost_outlook
#   option_margin:{aid}:{option_id}:{price}   → option_margin
#   quote_history:{aid}:{limit}               → quote_history
#   batch_preview:{batch_id}:{aid}            → fanout (batch preview)
#   trigger:{source}:{reason}:aid:{aid}       → trigger context
#
# We therefore filter via a small set of LIKE patterns. This keeps the
# helper resilient to future signal kinds — just extend ``_AID_PATTERNS``
# and ``_KIND_FROM_SOURCE_ID`` when a new shape lands.
# ---------------------------------------------------------------------------


# Map source_id prefixes → UI-friendly ``kind`` labels.
# Each entry is (prefix, kind). First match wins.
_KIND_FROM_SOURCE_ID: list[tuple[str, str]] = [
    ("rec:", "recommendation"),
    ("wtp:", "wtp"),
    ("curve:", "curve"),
    ("fanout:", "fanout"),
    ("batch_preview:", "fanout"),
    ("cost_outlook:", "cost_outlook"),
    ("quote_history:", "quote_history"),
    ("option_margin:", "option_margin"),
    ("trigger:", "trigger"),
]


def _kind_from_source_id(source_id: Optional[str]) -> Optional[str]:
    """Map a ``source_id`` to a UI-friendly ``kind`` label."""
    if not source_id:
        return None
    for prefix, kind in _KIND_FROM_SOURCE_ID:
        if source_id.startswith(prefix):
            return kind
    return None


def _aid_patterns(aid: str) -> list[str]:
    """Build LIKE patterns that match every source_id shape known to encode aid.

    All shapes either start with ``<prefix>:{aid}`` or contain
    ``:aid:{aid}`` (trigger context) or ``:{aid}`` at the tail (batch
    preview puts batch_id first). Matching ``:%:{aid}`` covers the latter.
    """
    escaped = aid.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return [
        f"%:{escaped}",          # ends with :{aid} (e.g. batch_preview:<id>:{aid})
        f"%:{escaped}:%",        # has :{aid}: somewhere
        f"{escaped}:%",          # legacy / future: aid as first segment
        f"%:aid:{escaped}",      # trigger context tail
        f"%:aid:{escaped}:%",    # trigger context middle (defensive)
    ]


def list_lineage_for_aid(db: Session, *, aid: str) -> dict[str, Any]:
    """List lineage rows whose source_id encodes ``aid``.

    Returns the wire shape documented in plan §5 row E6::

        {
            "status": "live" | "empty" | "degraded",
            "rows": [
                {
                    "id": str,           # uuid as string
                    "kind": str | None,  # ui-friendly category
                    "source_kind": str,  # raw enum/string
                    "model": str | None,
                    "model_version": str | None,
                    "computed_at": str,  # ISO-8601
                    "sql_preview": str | None,
                    "row_count": int | None,
                }, ...
            ]
        }

    Caps the result at 50 rows ordered by ``computed_at DESC``.
    """
    try:
        patterns = _aid_patterns(aid)
        like_clauses = [LineageRefRow.source_id.like(p, escape="\\") for p in patterns]
        rows = (
            db.query(LineageRefRow)
            .filter(or_(*like_clauses))
            .order_by(LineageRefRow.computed_at.desc())
            .limit(50)
            .all()
        )

        out_rows: list[dict[str, Any]] = []
        for row in rows:
            out_rows.append(
                {
                    "id": str(row.id),
                    "kind": _kind_from_source_id(row.source_id),
                    "source_kind": row.source_kind,
                    "model": row.model,
                    "model_version": row.model,  # no separate version column today
                    "computed_at": row.computed_at.isoformat() if row.computed_at else None,
                    "sql_preview": row.sql,
                    "row_count": None,
                }
            )

        if not out_rows:
            return {"status": "empty", "reason": "No lineage records for SKU", "rows": []}
        return {"status": "live", "reason": None, "rows": out_rows}
    except Exception:
        logger.exception("lineage.list_lineage_for_aid failed aid=%s", aid)
        try:
            db.rollback()
        except Exception:
            logger.exception(
                "lineage.list_lineage_for_aid: rollback failed aid=%s", aid
            )
        return {"status": "degraded", "reason": "Lineage query failed", "rows": []}


# ---------------------------------------------------------------------------
# Phase J3 — lineage_refs garbage collection
#
# Lineage rows accumulate fast (one row per recommendation/wtp/cost
# outlook/etc.). Once the FK references they back have been deleted or
# rotated out, the lineage_refs row is dead weight. The nightly GC
# deletes rows older than ``older_than_days`` that no longer appear in
# any FK column pointing at ``lineage_refs.id``.
#
# FK tables enumerated by grep ``lineage_ref_id`` in backend/models/.
# Update ``_LINEAGE_FK_TABLES`` when a new pricing table grows a
# ``lineage_ref_id`` column.
# ---------------------------------------------------------------------------


_LINEAGE_FK_TABLES: list[tuple[str, str]] = [
    ("pricing_audit", "lineage_ref_id"),
    ("price_state", "lineage_ref_id"),
    ("price_book", "lineage_ref_id"),
    ("cost_state", "lineage_ref_id"),
    ("customer_on_sku", "lineage_ref_id"),
    ("customer_on_sku_snapshot", "lineage_ref_id"),
    ("pricing_batches", "lineage_ref_id"),
]


_GC_CHUNK_SIZE = 1000

# Per-process cache of FK tables that actually exist in the live schema.
# Some models declare ``lineage_ref_id`` but the column was never migrated
# (e.g. ``pricing_batches`` in the current dev DB). We probe once and skip
# missing columns so the GC works on any schema state.
_LIVE_FK_TABLES_CACHE: list[tuple[str, str]] | None = None


def _live_fk_tables(db: Session) -> list[tuple[str, str]]:
    """Filter ``_LINEAGE_FK_TABLES`` down to columns present in the live DB."""
    global _LIVE_FK_TABLES_CACHE
    if _LIVE_FK_TABLES_CACHE is not None:
        return _LIVE_FK_TABLES_CACHE

    from sqlalchemy import text as _text

    live: list[tuple[str, str]] = []
    for tbl, col in _LINEAGE_FK_TABLES:
        try:
            exists = db.execute(
                _text(
                    """
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = :tbl
                      AND column_name = :col
                    LIMIT 1
                    """
                ),
                {"tbl": tbl, "col": col},
            ).scalar()
            if exists:
                live.append((tbl, col))
            else:
                logger.warning(
                    "lineage GC: skipping %s.%s — column not present in live DB",
                    tbl,
                    col,
                )
        except Exception:
            logger.exception(
                "lineage GC: failed to probe %s.%s — skipping", tbl, col
            )
            try:
                db.rollback()
            except Exception:  # pragma: no cover
                logger.exception("lineage GC: rollback after probe failure")
    _LIVE_FK_TABLES_CACHE = live
    return live


def gc_lineage_refs(db: Session, *, older_than_days: int = 365) -> int:
    """Delete orphaned ``lineage_refs`` older than ``older_than_days``.

    A row is "orphaned" when no FK column in ``_LINEAGE_FK_TABLES``
    references it. Rows newer than the cutoff are always preserved (a
    fresh signal may not yet have a downstream consumer).

    Deletes in chunks of ``_GC_CHUNK_SIZE`` so a single long transaction
    doesn't block the line. Returns the total count of rows deleted on
    this call.
    """
    from sqlalchemy import text as _text

    if older_than_days < 0:
        older_than_days = 0

    # Build the "is referenced anywhere?" predicate. Each table that
    # carries lineage_ref_id contributes one NOT EXISTS clause. We only
    # include columns that actually exist in the live DB so a half-
    # migrated schema doesn't crash the GC.
    live_tables = _live_fk_tables(db)
    not_exists_clauses = [
        f"NOT EXISTS (SELECT 1 FROM {tbl} WHERE {tbl}.{col} = lineage_refs.id)"
        for tbl, col in live_tables
    ]
    where_orphan = " AND ".join(not_exists_clauses) if not_exists_clauses else "TRUE"

    total_deleted = 0
    try:
        while True:
            sql = _text(
                f"""
                DELETE FROM lineage_refs
                WHERE id IN (
                    SELECT id FROM lineage_refs
                    WHERE computed_at < (NOW() - (:days || ' days')::interval)
                      AND {where_orphan}
                    LIMIT :chunk
                )
                """
            )
            result = db.execute(
                sql, {"days": str(older_than_days), "chunk": _GC_CHUNK_SIZE}
            )
            rowcount = result.rowcount or 0
            db.commit()
            total_deleted += rowcount
            if rowcount < _GC_CHUNK_SIZE:
                break
        return total_deleted
    except Exception:
        logger.exception(
            "lineage.gc_lineage_refs failed older_than_days=%s", older_than_days
        )
        try:
            db.rollback()
        except Exception:  # pragma: no cover - defensive
            logger.exception("lineage.gc_lineage_refs rollback failed")
        return total_deleted


# ---------------------------------------------------------------------------
# APScheduler integration — nightly 03:00 UTC
# ---------------------------------------------------------------------------


_GC_SCHEDULER = None  # type: ignore[var-annotated]
GC_JOB_ID = "lineage_gc"


def _gc_job() -> None:
    """Job APScheduler invokes nightly. Opens a session and runs GC."""
    from backend.database import SessionLocal

    session = SessionLocal()
    try:
        deleted = gc_lineage_refs(session)
        if deleted:
            logger.info("lineage_gc deleted %d orphaned row(s)", deleted)
    except Exception:  # pragma: no cover - defensive
        logger.exception("lineage_gc nightly tick crashed")
    finally:
        try:
            session.close()
        except Exception:  # pragma: no cover
            logger.exception("lineage_gc session close failed")


def start_scheduler():
    """Boot a ``BackgroundScheduler`` with the nightly GC job attached.

    Skipped under ``PYTEST_CURRENT_TEST``. Idempotent. Returns the
    scheduler so the shutdown hook can stop it cleanly.
    """
    global _GC_SCHEDULER
    if _GC_SCHEDULER is not None:
        return _GC_SCHEDULER

    import os as _os

    if _os.getenv("PYTEST_CURRENT_TEST"):
        return None

    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _gc_job,
        trigger=CronTrigger(hour=3, minute=0),
        id=GC_JOB_ID,
        coalesce=True,
        max_instances=1,
        replace_existing=True,
    )
    scheduler.start()
    _GC_SCHEDULER = scheduler
    logger.info("lineage_gc started (cron=03:00 UTC daily)")
    return scheduler


def stop_scheduler():
    """Gracefully stop the lineage GC scheduler if running."""
    global _GC_SCHEDULER
    if _GC_SCHEDULER is None:
        return
    try:
        _GC_SCHEDULER.shutdown(wait=False)
    except Exception:  # pragma: no cover - defensive
        logger.exception("lineage_gc shutdown failed")
    finally:
        _GC_SCHEDULER = None
