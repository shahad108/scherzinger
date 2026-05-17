"""Pricing Studio v3 / Phase 10 — Lineage drawer endpoint.

GET /api/v1/lineage/{ref_id}

Returns the full ``lineage_refs`` row for the requested id, plus a small
(≤5 rows) preview of the source data when computable. The preview is
PII-scrubbed before serialisation — Phase 0 invariant: nothing that
reaches the audit/lineage trail can carry a raw literal.

A 30s in-process cache keys on ``ref_id`` so the drawer's hot path is
constant-time.
"""
from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.models.pricing.lineage import LineageRefRow
from backend.services.pricing.lineage import _sanitize_sql

router = APIRouter(prefix="/lineage", tags=["lineage"])

CACHE_TTL_SECONDS = 30
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


def invalidate_cache() -> None:
    _CACHE.clear()


def _scrub_preview(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Strip literal-shaped values from preview cells.

    The PII scrubber operates on SQL text. For tabular previews we
    redact any string cell that looks like an identifier-with-secret
    ("CUST-…", "SECRET", "INV-…") and quote-then-scrub other text so the
    audit trail never carries a raw literal.
    """
    safe: list[dict[str, Any]] = []
    for r in rows[:5]:
        row_safe: dict[str, Any] = {}
        for k, v in r.items():
            if v is None or isinstance(v, (int, float, bool)):
                row_safe[k] = v
                continue
            if isinstance(v, str):
                # Run the SQL scrubber on a quoted-literal wrapper so the
                # same regex blanks any literal/number-shaped substring.
                scrubbed = _sanitize_sql(f"'{v}'")
                row_safe[k] = scrubbed if scrubbed is not None else "?"
                continue
            # Anything else (datetimes, decimals) → string then scrub.
            row_safe[k] = "?"
        safe.append(row_safe)
    return safe


def _build_preview(row: LineageRefRow) -> list[dict[str, Any]]:
    """Return up to 5 sample rows describing the source.

    For v3 we surface a deterministic metadata-only preview so the
    drawer always renders. Future iterations can wire kind-specific
    samplers (invoice ledger top-5, competitor feed last-5, etc.)
    behind this seam.
    """
    return [
        {
            "field": "source_kind",
            "value": row.source_kind,
        },
        {
            "field": "source_id",
            "value": "?",  # scrubbed — source ids may carry customer keys
        },
        {
            "field": "computed_by",
            "value": row.computed_by,
        },
    ]


def _serialise(row: LineageRefRow) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": str(row.id),
        "source_kind": row.source_kind,
        "source_id": row.source_id,
        "sql": row.sql,  # already scrubbed at write-time
        "model": row.model,
        "computed_at": row.computed_at.isoformat() if row.computed_at else None,
        "computed_by": row.computed_by,
        "preview": _scrub_preview(_build_preview(row)),
    }
    return payload


@router.get("/{ref_id}", name="lineage_get")
def get_lineage_ref(
    ref_id: UUID,
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Fetch a single lineage_refs row by id.

    Returns ``{id, source_kind, source_id, sql, model, computed_at,
    computed_by, preview}`` — the SQL field is scrubbed at write-time so
    callers can trust this is PII-safe.
    """
    cache_key = str(ref_id)
    now = time.monotonic()
    cached = _CACHE.get(cache_key)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    row = db.get(LineageRefRow, ref_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "lineage_not_found", "ref_id": str(ref_id)},
        )

    payload = _serialise(row)
    _CACHE[cache_key] = (now, payload)
    return payload
