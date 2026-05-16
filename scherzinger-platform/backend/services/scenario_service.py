"""Phase 5 — scenario_service.

CRUD + share for the ``scenarios`` table. Falls back to an in-memory store
when the table doesn't exist yet (early-pilot DBs / unit tests). Three
system scenarios are always available regardless of DB state:

  - Base case (no perturbation)
  - Steel shock +10% (single-input)
  - Multi-input shock (steel +10% / FX -3% / demand -5%)
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.models import Scenario

SYSTEM_OWNER_ID = "00000000-0000-0000-0000-000000000000"


SYSTEM_SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "00000000-0000-0000-0000-000000000001",
        "name": "Base case",
        "description": "Baseline — no perturbation; current run of the simulator.",
        "inputs": [],
        "visibility": "team",
        "ownerUserId": None,
        "derivedFromScenarioId": None,
        "isSystem": True,
    },
    {
        "id": "00000000-0000-0000-0000-000000000002",
        "name": "Steel shock +10%",
        "description": "Headline tornado scenario: single-input steel HRC +10%.",
        "inputs": [
            {
                "name": "Steel S355",
                "kind": "market_series",
                "unit": "€/t",
                "perturbation": {"type": "pct", "value": 10.0},
            }
        ],
        "visibility": "team",
        "ownerUserId": None,
        "derivedFromScenarioId": None,
        "isSystem": True,
    },
    {
        "id": "00000000-0000-0000-0000-000000000003",
        "name": "Multi-input shock",
        "description": "Steel +10%, EUR/USD −3%, demand −5%, pass-through fixed at 60%.",
        "inputs": [
            {"name": "Steel S355", "kind": "market_series", "unit": "€/t",
             "perturbation": {"type": "pct", "value": 10.0}},
            {"name": "EUR/USD", "kind": "market_series", "unit": "FX",
             "perturbation": {"type": "pct", "value": -3.0}},
            {"name": "Demand growth", "kind": "internal_lever", "unit": "%",
             "perturbation": {"type": "pct", "value": -5.0}},
            {"name": "Pass-through %", "kind": "internal_lever", "unit": "%",
             "perturbation": {"type": "absolute", "value": 60.0}},
        ],
        "visibility": "team",
        "ownerUserId": None,
        "derivedFromScenarioId": None,
        "isSystem": True,
    },
]


# ----- Preset scenarios (FE `SCENARIO_PRESETS` mirror) -----------------
# The FE's ScenarioLibrary writes ?scenario_id=preset:<key> on chip click.
# Mirror those five presets here so the BFF can resolve them into
# perturbation inputs the same way it resolves system / saved scenarios.
# Input names must match keys in scenario_runner._INPUT_PASS_THROUGH so the
# tornado-bar calibration can apply.
PRESET_SCENARIOS: dict[str, dict[str, Any]] = {
    "preset:steel-spike": {
        "id": "preset:steel-spike",
        "name": "Steel S355 +20%",
        "description": "Commodity stress — steel S355 +20%, pass-through fixed at 60%.",
        "inputs": [
            {"name": "Steel S355", "kind": "market_series", "unit": "€/t",
             "perturbation": {"type": "pct", "value": 20.0}},
            {"name": "Pass-through %", "kind": "internal_lever", "unit": "%",
             "perturbation": {"type": "absolute", "value": 60.0}},
        ],
        "visibility": "team",
        "ownerUserId": None,
        "derivedFromScenarioId": None,
        "isSystem": True,
        "isPreset": True,
    },
    "preset:list-uplift": {
        "id": "preset:list-uplift",
        "name": "+3% list price",
        "description": "Price action — +3% list-price uplift, 50% capture.",
        "inputs": [
            {"name": "List-price uplift", "kind": "internal_lever", "unit": "%",
             "perturbation": {"type": "absolute", "value": 3.0}},
        ],
        "visibility": "team",
        "ownerUserId": None,
        "derivedFromScenarioId": None,
        "isSystem": True,
        "isPreset": True,
    },
    "preset:bkagg-churn": {
        "id": "preset:bkagg-churn",
        "name": "Lose top-3 BKAGG",
        "description": "Concentration risk — top-3 BKAGG customers churn (modelled as −5% demand).",
        "inputs": [
            {"name": "Demand growth", "kind": "internal_lever", "unit": "%",
             "perturbation": {"type": "pct", "value": -5.0}},
        ],
        "visibility": "team",
        "ownerUserId": None,
        "derivedFromScenarioId": None,
        "isSystem": True,
        "isPreset": True,
    },
    "preset:recapture-pa": {
        "id": "preset:recapture-pa",
        "name": "Win +5pp PA quotes",
        "description": "Recapture action — +5pp price-action capture (modelled as +2% list uplift).",
        "inputs": [
            {"name": "List-price uplift", "kind": "internal_lever", "unit": "%",
             "perturbation": {"type": "absolute", "value": 2.0}},
        ],
        "visibility": "team",
        "ownerUserId": None,
        "derivedFromScenarioId": None,
        "isSystem": True,
        "isPreset": True,
    },
    "preset:macro-recession": {
        "id": "preset:macro-recession",
        "name": "−10% volume",
        "description": "Industrial recession — demand −10%.",
        "inputs": [
            {"name": "Demand growth", "kind": "internal_lever", "unit": "%",
             "perturbation": {"type": "pct", "value": -10.0}},
        ],
        "visibility": "team",
        "ownerUserId": None,
        "derivedFromScenarioId": None,
        "isSystem": True,
        "isPreset": True,
    },
}


# ----- Module-level in-memory fallback ---------------------------------
_MEMORY_STORE: dict[str, dict[str, Any]] = {}


def _serialize(row: Scenario | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description or "",
        "inputs": list(row.inputs_json.get("inputs", [])) if isinstance(row.inputs_json, dict) else [],
        "visibility": row.visibility,
        "ownerUserId": str(row.owner_user_id) if row.owner_user_id else None,
        "derivedFromScenarioId": str(row.derived_from_scenario_id) if row.derived_from_scenario_id else None,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        "lastUsedAt": row.last_used_at.isoformat() if row.last_used_at else None,
        "isSystem": False,
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_scenarios(db: Session | None, user_id: UUID | str | None) -> dict[str, Any]:
    """Return system + my-scenarios + team-shared in a single payload."""
    uid_str = str(user_id) if user_id else None
    saved: list[dict[str, Any]] = []
    team_shared: list[dict[str, Any]] = []

    if db is not None:
        try:
            for row in db.execute(select(Scenario)).scalars().all():
                payload = _serialize(row)
                if payload is None:
                    continue
                if payload["ownerUserId"] == uid_str:
                    saved.append(payload)
                elif payload["visibility"] == "team":
                    team_shared.append(payload)
        except SQLAlchemyError:
            saved = []
            team_shared = []

    # Layer the in-memory fallback so tests that don't migrate work.
    for scenario in _MEMORY_STORE.values():
        if scenario["ownerUserId"] == uid_str:
            saved.append(scenario)
        elif scenario["visibility"] == "team":
            team_shared.append(scenario)

    return {
        "system": [deepcopy(s) for s in SYSTEM_SCENARIOS],
        "saved": saved,
        "teamShared": team_shared,
    }


def get_scenario(db: Session | None, scenario_id: str) -> dict[str, Any] | None:
    # Preset chips (FE writes ?scenario_id=preset:<key>) resolve first so
    # they never fall through to the UUID-only DB lookup (which would raise
    # ValueError on the colon and silently return None).
    if scenario_id.startswith("preset:"):
        preset = PRESET_SCENARIOS.get(scenario_id)
        return deepcopy(preset) if preset is not None else None
    for s in SYSTEM_SCENARIOS:
        if s["id"] == scenario_id:
            return deepcopy(s)
    if scenario_id in _MEMORY_STORE:
        return deepcopy(_MEMORY_STORE[scenario_id])
    if db is not None:
        try:
            row = db.execute(
                select(Scenario).where(Scenario.id == UUID(scenario_id))
            ).scalar_one_or_none()
            return _serialize(row)
        except (SQLAlchemyError, ValueError):
            return None
    return None


def save_scenario(
    db: Session | None,
    user_id: UUID | str,
    *,
    name: str,
    description: str | None,
    inputs: list[dict[str, Any]],
    visibility: str,
    derived_from_scenario_id: str | None = None,
) -> dict[str, Any]:
    """Create a new scenario row."""
    new_id = str(uuid4())
    payload = {
        "id": new_id,
        "name": name,
        "description": description or "",
        "inputs": inputs,
        "visibility": visibility,
        "ownerUserId": str(user_id),
        "derivedFromScenarioId": derived_from_scenario_id,
        "createdAt": _now(),
        "updatedAt": _now(),
        "lastUsedAt": _now(),
        "isSystem": False,
    }
    if db is not None:
        try:
            row = Scenario(
                id=UUID(new_id),
                owner_user_id=UUID(str(user_id)),
                name=name,
                description=description,
                inputs_json={"inputs": inputs},
                visibility=visibility,
                derived_from_scenario_id=UUID(derived_from_scenario_id) if derived_from_scenario_id else None,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            return _serialize(row) or payload
        except SQLAlchemyError:
            db.rollback()
    _MEMORY_STORE[new_id] = payload
    return payload


def update_scenario(
    db: Session | None,
    scenario_id: str,
    user_id: UUID | str,
    *,
    name: str | None = None,
    description: str | None = None,
    inputs: list[dict[str, Any]] | None = None,
    visibility: str | None = None,
) -> dict[str, Any] | None:
    if scenario_id in _MEMORY_STORE:
        s = _MEMORY_STORE[scenario_id]
        if name is not None:
            s["name"] = name
        if description is not None:
            s["description"] = description
        if inputs is not None:
            s["inputs"] = inputs
        if visibility is not None:
            s["visibility"] = visibility
        s["updatedAt"] = _now()
        return deepcopy(s)
    if db is None:
        return None
    try:
        row = db.execute(
            select(Scenario).where(Scenario.id == UUID(scenario_id))
        ).scalar_one_or_none()
    except (SQLAlchemyError, ValueError):
        return None
    if row is None:
        return None
    if name is not None:
        row.name = name
    if description is not None:
        row.description = description
    if inputs is not None:
        row.inputs_json = {"inputs": inputs}
    if visibility is not None:
        row.visibility = visibility
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize(row)


def delete_scenario(db: Session | None, scenario_id: str, user_id: UUID | str) -> bool:
    if scenario_id in _MEMORY_STORE:
        del _MEMORY_STORE[scenario_id]
        return True
    if db is None:
        return False
    try:
        row = db.execute(
            select(Scenario).where(Scenario.id == UUID(scenario_id))
        ).scalar_one_or_none()
    except (SQLAlchemyError, ValueError):
        return False
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def share_scenario(
    db: Session | None, scenario_id: str, recipient: str
) -> dict[str, Any]:
    """Stamp the scenario visibility to 'team' and return the share receipt.

    Real impl writes a Notification + Note row keyed to ``recipient`` (Till /
    Heiko). For now the visibility flip alone makes the scenario reachable
    via ``list_scenarios`` for the recipient.
    """
    if scenario_id in _MEMORY_STORE:
        _MEMORY_STORE[scenario_id]["visibility"] = "team"
        _MEMORY_STORE[scenario_id]["updatedAt"] = _now()
    return {"scenarioId": scenario_id, "recipient": recipient, "sharedAt": _now()}


def reset_memory_store_for_tests() -> None:
    """Test-only hook to clear the in-memory fallback between cases."""
    _MEMORY_STORE.clear()
