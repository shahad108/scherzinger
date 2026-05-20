"""Threshold alerts (Phase 7).

In-memory implementation backed by a per-process dict. A follow-up commit
swaps this for a Postgres-backed ``forecast_alerts`` table + a nightly
job that evaluates each active alert.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


_ALERTS: dict[str, dict[str, Any]] = {}


def reset_for_tests() -> None:
    _ALERTS.clear()


def list_alerts(user_id: str) -> list[dict[str, Any]]:
    return [a for a in _ALERTS.values() if a["userId"] == user_id]


def create_alert(
    *,
    user_id: str,
    metric: str,
    entity_type: str,
    entity_id: str | None,
    threshold_kind: str,
    threshold_value: float,
    notify_via: str = "in_app",
) -> dict[str, Any]:
    aid = str(uuid4())
    alert = {
        "id": aid,
        "userId": user_id,
        "metric": metric,
        "entityType": entity_type,
        "entityId": entity_id,
        "thresholdKind": threshold_kind,
        "thresholdValue": threshold_value,
        "notifyVia": notify_via,
        "isActive": True,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "lastTriggeredAt": None,
    }
    _ALERTS[aid] = alert
    return alert


def delete_alert(alert_id: str, user_id: str) -> bool:
    a = _ALERTS.get(alert_id)
    if not a or a["userId"] != user_id:
        return False
    del _ALERTS[alert_id]
    return True


def test_alert(alert_id: str, user_id: str) -> dict[str, Any]:
    a = _ALERTS.get(alert_id)
    if not a or a["userId"] != user_id:
        return {"triggered": False, "reason": "not_found"}
    a["lastTriggeredAt"] = datetime.now(timezone.utc).isoformat()
    return {"triggered": True, "alertId": alert_id, "at": a["lastTriggeredAt"]}
