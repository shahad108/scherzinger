"""JSON-backed forecast annotations store.

Parallels :mod:`backend.services.forecast.overrides`: a flat-file CRUD
backed by ``data/forecast-annotations.json``. A future PR will migrate this
to a proper table on the analytics warehouse; only this file changes when
that happens.

Annotation record shape::

    {
        "id": str (uuid4),
        "target": {
            "kind": "month" | "cluster",
            "value": str,            # YYYY-MM for month, cluster code for cluster
        },
        "body": str,
        "author": str,
        "createdAt": ISO-8601 UTC,
    }

Concurrency note: writes are guarded by a module-level RLock — same approach
as the overrides store. Multi-worker deployments would need a real file lock
(fcntl/portalocker); tracked as a follow-up.
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

STORE_PATH = Path(__file__).resolve().parents[2] / "data" / "forecast-annotations.json"
MIN_BODY_LEN = 1
MAX_BODY_LEN = 2000

_VALID_TARGET_KINDS = {"month", "cluster"}

# Re-entrant so helpers can safely call locked helpers without deadlocking.
_LOCK = threading.RLock()


def _load() -> list[dict[str, Any]]:
    if not STORE_PATH.exists():
        return []
    return json.loads(STORE_PATH.read_text() or "[]")


def _save(rows: Iterable[dict[str, Any]]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(list(rows), indent=2))


def _validate_target(target: Any) -> None:
    if not isinstance(target, dict):
        raise ValueError("target must be an object")
    kind = target.get("kind")
    value = target.get("value")
    if kind not in _VALID_TARGET_KINDS:
        raise ValueError("target.kind must be 'month' or 'cluster'")
    if not isinstance(value, str) or not value.strip():
        raise ValueError("target.value must be a non-empty string")
    if kind == "month":
        # Lightweight YYYY-MM check; the pydantic schema enforces the regex
        # for HTTP callers — this catches direct service callers.
        if len(value) != 7 or value[4] != "-":
            raise ValueError("target.value for month must be YYYY-MM")


def _validate_body(body: Any) -> str:
    if not isinstance(body, str):
        raise ValueError("body must be a string")
    body = body.strip()
    if len(body) < MIN_BODY_LEN:
        raise ValueError(f"body must be at least {MIN_BODY_LEN} char")
    if len(body) > MAX_BODY_LEN:
        raise ValueError(f"body must be at most {MAX_BODY_LEN} chars")
    return body


def list_annotations(
    target_kind: str | None = None, target_value: str | None = None
) -> list[dict[str, Any]]:
    rows = _load()
    if target_kind:
        rows = [r for r in rows if r["target"]["kind"] == target_kind]
    if target_value:
        rows = [r for r in rows if r["target"]["value"] == target_value]
    return rows


def get_annotation(annotation_id: str) -> dict[str, Any] | None:
    return next((r for r in _load() if r["id"] == annotation_id), None)


def create_annotation(payload: dict[str, Any]) -> dict[str, Any]:
    target = payload.get("target")
    _validate_target(target)
    body = _validate_body(payload.get("body"))
    row = {
        "id": str(uuid.uuid4()),
        "target": {
            "kind": target["kind"],
            "value": target["value"],
        },
        "body": body,
        # Router stamps author from JWT; "unknown" is only a defensive fallback
        # for direct service callers (e.g. seed scripts).
        "author": payload.get("author") or "unknown",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        rows = _load()
        rows.append(row)
        _save(rows)
    return row


def delete_annotation(annotation_id: str) -> None:
    with _LOCK:
        rows = _load()
        filtered = [r for r in rows if r["id"] != annotation_id]
        if len(filtered) == len(rows):
            raise KeyError(annotation_id)
        _save(filtered)
