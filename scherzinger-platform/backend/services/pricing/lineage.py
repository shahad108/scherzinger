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
