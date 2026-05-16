"""Lineage helpers — create + fetch lineage_refs rows.

Every numeric value the Studio surfaces should be born with a lineage ref
that pins it to the source (invoice ledger row, competitor feed snapshot,
model + run id, …). The `sql` field stores a *template* (no parameter
values) so we never leak PII into the audit/lineage trail.
"""
from __future__ import annotations

import re
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models.pricing.lineage import LineageRefRow, LineageSourceKind


# Conservative regex: replaces both $1-style numbered params and ?-style
# placeholders' surrounding literals. We use it to strip embedded literals
# (numbers, quoted strings) when callers forget to pre-template their SQL.
_LITERAL_RE = re.compile(
    r"""
    '(?:[^']|'')*'      # single-quoted string literal
    | \b\d+(\.\d+)?\b   # numeric literal
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
