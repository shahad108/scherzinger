"""JSON-backed forecast overrides store.

This is intentionally a flat-file backend (data/forecast-overrides.json).
A future PR will migrate this to a proper table on the analytics warehouse,
at which point only this file changes — callers see the same API.

Concurrency note: writes are guarded by a module-level RLock so concurrent
POST/PATCH/DELETE requests inside a single Uvicorn worker can't clobber each
other's _load → mutate → _save sequence. Multi-worker deployments would need
a real file lock (e.g. fcntl/portalocker); tracked as a follow-up.
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

STORE_PATH = Path(__file__).resolve().parents[2] / "data" / "forecast-overrides.json"
MIN_REASON_LEN = 10

# Guards _load → mutate → _save sequences so concurrent writers in a single
# Uvicorn worker don't lose updates. Re-entrant so helpers can safely call
# locked helpers without deadlocking.
_LOCK = threading.RLock()


def _load() -> list[dict[str, Any]]:
    if not STORE_PATH.exists():
        return []
    return json.loads(STORE_PATH.read_text() or "[]")


def _save(rows: Iterable[dict[str, Any]]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(list(rows), indent=2))


def _validate_payload(payload: dict[str, Any]) -> None:
    reason = (payload.get("reason") or "").strip()
    if len(reason) < MIN_REASON_LEN:
        raise ValueError(f"reason must be at least {MIN_REASON_LEN} chars")
    if payload.get("source") not in {"erp", "manual", "contracted", "other"}:
        raise ValueError("invalid source")
    if payload.get("confidence") not in {"low", "medium", "high"}:
        raise ValueError("invalid confidence")
    if payload.get("mode") not in {"revenue", "margin", "volume"}:
        raise ValueError("invalid mode")


def list_overrides(
    month: str | None = None, cluster: str | None = None
) -> list[dict[str, Any]]:
    rows = _load()
    if month:
        rows = [r for r in rows if r["month"] == month]
    if cluster:
        rows = [r for r in rows if r["cluster"] == cluster]
    return rows


def get_override(override_id: str) -> dict[str, Any] | None:
    return next((r for r in _load() if r["id"] == override_id), None)


def create_override(payload: dict[str, Any]) -> dict[str, Any]:
    _validate_payload(payload)
    model_p50 = float(payload["modelP50"])
    actual = float(payload["actual"])
    row = {
        "id": str(uuid.uuid4()),
        "month": payload["month"],
        "cluster": payload.get("cluster"),
        "mode": payload["mode"],
        "actual": actual,
        "modelP50": model_p50,
        "adjustmentPct": (actual - model_p50) / model_p50 if model_p50 else 0.0,
        "source": payload["source"],
        "confidence": payload["confidence"],
        "reason": payload["reason"].strip(),
        "author": payload.get("author") or "Frank",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "fvaDelta": None,
    }
    with _LOCK:
        rows = _load()
        rows.append(row)
        _save(rows)
    return row


def update_override(override_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        rows = _load()
        for r in rows:
            if r["id"] == override_id:
                r.update(
                    {
                        k: v
                        for k, v in patch.items()
                        if k in {"actual", "source", "confidence", "reason"}
                    }
                )
                if "actual" in patch and r["modelP50"]:
                    r["adjustmentPct"] = (float(r["actual"]) - r["modelP50"]) / r["modelP50"]
                _validate_payload({**r, **patch})
                _save(rows)
                return r
        raise KeyError(override_id)


def delete_override(override_id: str) -> None:
    with _LOCK:
        rows = _load()
        filtered = [r for r in rows if r["id"] != override_id]
        if len(filtered) == len(rows):
            raise KeyError(override_id)
        _save(filtered)
