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
