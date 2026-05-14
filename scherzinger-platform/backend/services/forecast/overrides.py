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


def _score_fva(abs_adj_pct: float) -> int:
    """Heuristic stub for forecast-value-add delta (basis points).

    The real number will come from re-running the walk-forward backtest
    cycle with overrides applied — see the "Open follow-ups" section of
    docs/superpowers/specs/2026-05-14-frank-forecasting-redesign-design.md.
    Until that cycle is in place we score based on the absolute size of the
    adjustment, drawing on the Fildes/Goodwin "small-adjustments-hurt"
    finding:

      |adj| < 5%          → -25 bps (small overrides usually noise)
      5% <= |adj| < 10%   → 0 bps (neutral)
      10% <= |adj| < 20%  → +15 bps (informed adjustment likely helps)
      |adj| >= 20%        → +40 bps (large adjustment, likely material info)

    Sign of the adjustment is irrelevant — only magnitude matters.
    """
    a = abs(abs_adj_pct)
    if a < 0.05:
        return -25
    if a < 0.10:
        return 0
    if a < 0.20:
        return 15
    return 40


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
    adjustment_pct = (actual - model_p50) / model_p50 if model_p50 else 0.0
    row = {
        "id": str(uuid.uuid4()),
        "month": payload["month"],
        "cluster": payload.get("cluster"),
        "mode": payload["mode"],
        "actual": actual,
        "modelP50": model_p50,
        "adjustmentPct": adjustment_pct,
        "source": payload["source"],
        "confidence": payload["confidence"],
        "reason": payload["reason"].strip(),
        # Router stamps author from JWT; "unknown" is only a defensive fallback
        # for direct service callers (e.g. seed scripts / future batch jobs).
        "author": payload.get("author") or "unknown",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        # Heuristic stub until the walk-forward backtest ingests overrides
        # (see _score_fva docstring + spec follow-ups).
        "fvaDelta": _score_fva(adjustment_pct),
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
                    # Recompute heuristic fvaDelta when actual changes.
                    r["fvaDelta"] = _score_fva(r["adjustmentPct"])
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
