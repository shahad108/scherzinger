"""Seed ``approval_routes`` from the JSON rules file.

Source of truth for v3 routing is still
``backend/data/pricing_approval_rules.json`` — the table exists so a
future admin UI can edit rules without redeploying. This seeder is the
bridge: it upserts JSON → table on each migration upgrade and on
app-startup so re-running against an existing DB picks up new rules
without manual intervention.

Upsert key is ``approval_routes.name`` (== rule id in the JSON). Each
row carries: condition (jsonlogic), route_to (list[str]), note, enabled.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from backend.models.pricing.approval import ApprovalRoute
from backend.services.pricing.approval_rules import DEFAULT_RULES_PATH

logger = logging.getLogger(__name__)


def _load_rules_payload(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        logger.warning("approval rules file missing: %s", path)
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    rules = raw.get("rules", [])
    if not isinstance(rules, list):
        raise ValueError(f"rules file {path} missing top-level `rules` list")
    return rules


def seed_approval_routes(
    session: Session,
    *,
    rules_path: Path | str = DEFAULT_RULES_PATH,
) -> int:
    """Upsert each rule from ``rules_path`` into ``approval_routes``.

    Returns the number of rows written (created + updated). Idempotent:
    safe to re-run. Commits are left to the caller so this composes
    cleanly inside the migration transaction and inside startup hooks.
    """
    rules = _load_rules_payload(Path(rules_path))
    written = 0
    for rule in rules:
        rule_id = rule.get("id")
        if not rule_id or not isinstance(rule_id, str):
            logger.warning("skipping approval rule with no id: %r", rule)
            continue
        condition = rule.get("condition")
        if not isinstance(condition, dict):
            logger.warning("skipping approval rule %s: missing/invalid condition", rule_id)
            continue
        route_to = rule.get("route_to") or []
        if not isinstance(route_to, list):
            route_to = []
        note = rule.get("note")
        if note is not None and not isinstance(note, str):
            note = str(note)
        # ``enabled`` defaults to True; JSON files may omit it.
        enabled = rule.get("enabled")
        enabled = True if enabled is None else bool(enabled)

        existing = (
            session.query(ApprovalRoute).filter(ApprovalRoute.name == rule_id).one_or_none()
        )
        if existing is None:
            session.add(
                ApprovalRoute(
                    name=rule_id,
                    condition=condition,
                    route_to=route_to,
                    note=note,
                    enabled=enabled,
                )
            )
        else:
            existing.condition = condition
            existing.route_to = route_to
            existing.note = note
            existing.enabled = enabled
        written += 1
    session.flush()
    return written


__all__ = ["seed_approval_routes"]
