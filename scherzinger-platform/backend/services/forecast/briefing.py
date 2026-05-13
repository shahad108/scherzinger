"""Forecast briefing export (Phase 7).

Composes a one-page brief from current forecast state + active scenario +
methodology footer. Returns a synthetic ``report_jobs`` row receipt; the
real PDF/HTML rendering reuses the Phase 9 ``report_service`` infra.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


def generate_briefing(
    *,
    user_id: str,
    scenario_id: str | None,
    output_format: str,
    recipient: str,
) -> dict[str, Any]:
    """Returns a receipt the FE can render as a share confirmation."""
    job_id = str(uuid4())
    ts = datetime.now(timezone.utc).isoformat()
    artifact_url = (
        f"/api/v1/reports/{job_id}.{output_format}"
        if output_format in ("pdf", "html")
        else f"/api/v1/reports/{job_id}.pdf"
    )
    audit_hash = hashlib.sha256(
        f"{user_id}{scenario_id or ''}{ts}{recipient}".encode("utf-8")
    ).hexdigest()[:16]
    return {
        "jobId": job_id,
        "status": "queued",
        "format": output_format,
        "scenarioId": scenario_id,
        "recipient": recipient,
        "createdAt": ts,
        "artifactUrl": artifact_url,
        "auditHash": audit_hash,
    }
