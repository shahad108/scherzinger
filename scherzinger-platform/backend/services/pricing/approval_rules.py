"""Approval-rules engine for Pricing Studio v3 proposals.

Loads JSON-logic-style rules from ``backend/data/pricing_approval_rules.json``
and evaluates them against a Proposal context to produce an
``ApprovalDecision``.

We ship a minimal in-house JSON-logic evaluator covering only the operators
the seed rules actually use (``>``, ``<``, ``>=``, ``<=``, ``==``, ``and``,
``or``, ``var``) so the engine has no third-party dependency. The shape
matches the upstream JsonLogic spec so we can swap in ``json-logic-py``
later by deleting ``_eval`` and importing ``jsonLogic`` instead.

Decision semantics:
  - Any rule with ``block: true`` whose condition fires → block=True.
  - Any rule with ``auto_approve: true`` whose condition fires AND no other
    rule routed the proposal → auto_approve=True.
  - Any rule with a non-empty ``route_to`` whose condition fires adds those
    approvers to ``needs`` (deduplicated, order-preserved).
  - ``thresholds_hit`` is the list of rule IDs that fired (for the UI's
    "why does this need approval?" tooltip).

A8 caching contract
-------------------
``load_rules()`` populates a module-level cache the first time it is hit
(file first; DB ``approval_routes`` second when the file is missing or
malformed). ``get_rules()`` is the fast path everyone else uses.
``refresh_rules()`` clears the cache; ``start_file_watcher()`` (called from
``backend/main.py``) hooks watchdog up so a save on the JSON file flushes
the cache without a process restart.

A typo in the rules file used to 500 every proposal submission — with the
DB fallback we degrade to the last-seeded routes instead.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Defensive cap: nested {"and":[{"and":[...]}]} structures would otherwise
# blow the Python recursion limit and 500 the approval endpoint. 64 is
# orders of magnitude beyond anything a real rule needs.
_MAX_RULE_DEPTH = 64

DEFAULT_RULES_PATH = (
    Path(__file__).resolve().parents[3] / "backend" / "data" / "pricing_approval_rules.json"
)


@dataclass
class Proposal:
    """Subset of proposal fields the rules engine reads.

    Higher-level callers (workflow_service) build this from the persisted
    PricingProposal + customer tier + effective-date math. Keeping the
    surface narrow makes the rules trivial to unit-test.
    """

    delta_pct: float = 0.0
    delta_pp: float = 0.0
    tier: str = "C"
    effective_in_hours: float = 999.0
    customer_id: Optional[str] = None
    aid: Optional[str] = None
    extras: dict[str, Any] = field(default_factory=dict)

    def as_context(self) -> dict[str, Any]:
        ctx: dict[str, Any] = {
            "delta_pct": self.delta_pct,
            "delta_pp": self.delta_pp,
            "tier": self.tier,
            "effective_in_hours": self.effective_in_hours,
            "customer_id": self.customer_id,
            "aid": self.aid,
        }
        ctx.update(self.extras)
        return ctx


@dataclass
class ApprovalDecision:
    needs: list[str] = field(default_factory=list)
    thresholds_hit: list[str] = field(default_factory=list)
    auto_approve: bool = False
    block: bool = False
    reasons: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Mini JSON-logic evaluator
# ---------------------------------------------------------------------------


def _resolve_var(node: Any, ctx: dict[str, Any]) -> Any:
    """Resolve a {var: 'path'} expression. Only dot-free keys supported.

    JsonLogic's ``var`` operator also supports dotted paths + defaults; we
    don't need either for the seed rules, so we keep the implementation
    minimal and well-defined.
    """
    if isinstance(node, list):
        node = node[0] if node else ""
    if not isinstance(node, str):
        raise ValueError(f"var operator requires a string key, got {node!r}")
    return ctx.get(node)


_BIN_OPS = {
    ">": lambda a, b: a is not None and b is not None and a > b,
    ">=": lambda a, b: a is not None and b is not None and a >= b,
    "<": lambda a, b: a is not None and b is not None and a < b,
    "<=": lambda a, b: a is not None and b is not None and a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def _eval(node: Any, ctx: dict[str, Any], depth: int = 0) -> Any:
    """Recursive JSON-logic evaluator. Returns the node's truth value.

    ``depth`` is bumped on each recursive call. Hitting ``_MAX_RULE_DEPTH``
    raises ``ValueError`` — the public surface treats malformed/abusive
    rules as not-fired (see ``should_route_for_approval``).
    """
    if depth > _MAX_RULE_DEPTH:
        raise ValueError("rule depth exceeded")

    # Primitives — pass through.
    if not isinstance(node, dict):
        return node

    if len(node) != 1:
        raise ValueError(f"json-logic node must have exactly one operator key: {node!r}")
    (op, args), = node.items()

    if op == "var":
        return _resolve_var(args, ctx)

    if op in _BIN_OPS:
        if not isinstance(args, list) or len(args) != 2:
            raise ValueError(f"{op!r} expects [a, b], got {args!r}")
        a = _eval(args[0], ctx, depth + 1)
        b = _eval(args[1], ctx, depth + 1)
        return _BIN_OPS[op](a, b)

    if op == "and":
        if not isinstance(args, list):
            raise ValueError(f"and expects a list, got {args!r}")
        return all(_eval(x, ctx, depth + 1) for x in args)

    if op == "or":
        if not isinstance(args, list):
            raise ValueError(f"or expects a list, got {args!r}")
        return any(_eval(x, ctx, depth + 1) for x in args)

    raise ValueError(f"unsupported json-logic operator: {op!r}")


# ---------------------------------------------------------------------------
# A8 — singleton rules cache (file first, DB fallback, hot reload)
# ---------------------------------------------------------------------------


# Module-level cache + lock guarding it. ``None`` = uninitialised, ``[]`` =
# explicitly loaded-but-empty (treated the same as no rules, but does not
# trigger another reload).
_rules_cache: Optional[list[dict[str, Any]]] = None
_rules_path: Path = DEFAULT_RULES_PATH
_cache_lock = threading.RLock()
_watcher_observer: Any = None  # watchdog.observers.Observer | None

# Legacy/back-compat caches kept for ``reset_cache_for_tests`` and the
# original ``_load_rules_from`` path-keyed cache (used by ``reload_rules``).
_CACHED_RULES: dict[Path, list[dict[str, Any]]] = {}


def _normalize_rule(rule: Any) -> Optional[dict[str, Any]]:
    """Validate the minimal shape of a rule dict, return it or ``None``.

    The contract called out in the plan is ``{name, condition, route_to}``;
    the live JSON file uses ``id`` rather than ``name`` for the identifier,
    and the DB column is ``name``. We accept either and normalise so the
    evaluator (which keys off ``id``) keeps working.
    """
    if not isinstance(rule, dict):
        return None
    rule_id = rule.get("id") or rule.get("name")
    if not isinstance(rule_id, str) or not rule_id:
        return None
    condition = rule.get("condition")
    if not isinstance(condition, dict):
        return None
    route_to = rule.get("route_to") or []
    if not isinstance(route_to, list):
        route_to = []
    normalised = dict(rule)
    normalised["id"] = rule_id
    normalised["condition"] = condition
    normalised["route_to"] = list(route_to)
    return normalised


def _load_from_file(path: Optional[Path] = None) -> list[dict[str, Any]]:
    """Read + validate rules from the JSON file. Raises on missing/invalid.

    When called with no arg we honour the module-level ``DEFAULT_RULES_PATH``
    so the existing tests that monkeypatch that constant continue to work.
    """
    if path is not None:
        p = Path(path)
    else:
        # Prefer the (test-mutable) DEFAULT_RULES_PATH; fall back to the
        # tracking attribute ``_rules_path`` only if a caller has explicitly
        # repointed it (we don't ship a public setter; this is defensive).
        p = Path(DEFAULT_RULES_PATH)
    raw = json.loads(p.read_text(encoding="utf-8"))
    rules = raw.get("rules") if isinstance(raw, dict) else raw
    if not isinstance(rules, list):
        raise ValueError(f"rules file {p} missing top-level `rules` list")
    out: list[dict[str, Any]] = []
    for entry in rules:
        normalised = _normalize_rule(entry)
        if normalised is None:
            raise ValueError(f"rules file {p} contains malformed rule: {entry!r}")
        out.append(normalised)
    return out


def _load_from_db(db: Any) -> list[dict[str, Any]]:
    """Fall back to the seeded ``approval_routes`` table.

    Accepts any object exposing ``.query(ApprovalRoute)`` (SQLAlchemy
    Session) so tests can pass a stub. Disabled rows are skipped.
    """
    # Lazy import — backend.models.pricing pulls in SQLAlchemy declarative
    # state and we want this module to be importable in tooling contexts
    # without DB engines wired up.
    from backend.models.pricing.approval import ApprovalRoute

    rows = (
        db.query(ApprovalRoute)
        .filter(ApprovalRoute.enabled.is_(True))
        .order_by(ApprovalRoute.created_at.asc())
        .all()
    )
    out: list[dict[str, Any]] = []
    for row in rows:
        normalised = _normalize_rule(
            {
                "id": row.name,
                "condition": row.condition,
                "route_to": list(row.route_to or []),
                "note": row.note,
            }
        )
        if normalised is not None:
            out.append(normalised)
    return out


def load_rules(db: Any = None) -> list[dict[str, Any]]:
    """Public loader. Populate the cache from file (or DB on failure).

    The cache is sticky: once populated this just returns the live list.
    Callers on the hot path should prefer :func:`get_rules` — this is the
    bootstrap entry point (and the one that knows how to pull from DB).
    """
    global _rules_cache
    with _cache_lock:
        if _rules_cache is not None:
            return _rules_cache

        try:
            _rules_cache = _load_from_file()
            logger.info("approval_rules: loaded %d rules from %s", len(_rules_cache), _rules_path)
            return _rules_cache
        except FileNotFoundError:
            logger.warning(
                "approval_rules: file %s missing — falling back to approval_routes DB table",
                _rules_path,
            )
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning(
                "approval_rules: file %s invalid (%s) — falling back to approval_routes DB table",
                _rules_path,
                exc,
            )

        if db is not None:
            try:
                _rules_cache = _load_from_db(db)
                logger.info(
                    "approval_rules: loaded %d rules from approval_routes DB", len(_rules_cache)
                )
                return _rules_cache
            except Exception:
                logger.exception("approval_rules: DB fallback failed")

        # Last resort: empty list so callers don't 500. The submit path
        # treats "no rules fire" as auto-routed (no approvers, no block),
        # which matches the safe-default "everything below the threshold
        # auto-approves" intent of the seed rules.
        _rules_cache = []
        return _rules_cache


def get_rules() -> list[dict[str, Any]]:
    """Fast-path accessor. Triggers a file load only if the cache is empty."""
    with _cache_lock:
        if _rules_cache is None:
            return load_rules()
        return _rules_cache


def refresh_rules() -> list[dict[str, Any]]:
    """Clear the cache and reload from disk (used by the file watcher)."""
    global _rules_cache
    with _cache_lock:
        _rules_cache = None
    _CACHED_RULES.clear()
    return load_rules()


def reset_cache_for_tests() -> None:
    """Test-only: drop both the singleton and the legacy path-keyed cache."""
    global _rules_cache
    with _cache_lock:
        _rules_cache = None
    _CACHED_RULES.clear()


# ---------------------------------------------------------------------------
# Legacy public API retained for callers that still pass an explicit path.
# ---------------------------------------------------------------------------


def _load_rules_from(path: Path | str) -> list[dict[str, Any]]:
    """Internal: load + cache the rules file. Cache key is the absolute path.

    PRIVATE — do not expose to HTTP-facing call sites. Arbitrary path input
    would otherwise become an unauthenticated file-read primitive. The
    public ``should_route_for_approval`` always uses ``DEFAULT_RULES_PATH``.
    Tests reach in via ``reload_rules`` / ``reset_cache_for_tests``.
    """
    p = Path(path).resolve()
    if p in _CACHED_RULES:
        return _CACHED_RULES[p]
    raw = json.loads(p.read_text(encoding="utf-8"))
    rules = raw.get("rules", [])
    if not isinstance(rules, list):
        raise ValueError(f"rules file {p} missing top-level `rules` list")
    _CACHED_RULES[p] = rules
    return rules


def reload_rules(path: Path | str = DEFAULT_RULES_PATH) -> list[dict[str, Any]]:
    """Test helper: invalidate the cache and reload ``path``.

    Only intended for tests that need to point at a fixture rules file.
    Not callable from any HTTP handler.
    """
    _CACHED_RULES.pop(Path(path).resolve(), None)
    # Also flush the singleton so subsequent ``get_rules()`` callers see
    # the fixture file when the caller has repointed ``_rules_path``.
    global _rules_cache
    with _cache_lock:
        _rules_cache = None
    return _load_rules_from(path)


# ---------------------------------------------------------------------------
# File watcher (watchdog) — started from backend.main on app startup.
# ---------------------------------------------------------------------------


class _RulesFileEventHandler:
    """Tiny shim so we don't need to import watchdog at module import time."""

    def __init__(self, path: Path) -> None:
        self._path = path

    # watchdog calls dispatch(event); we keep it simple and just refresh
    # on any modify/create/move event whose path matches our rules file.
    def dispatch(self, event: Any) -> None:  # pragma: no cover — exercised live
        try:
            src = getattr(event, "src_path", "") or ""
            dest = getattr(event, "dest_path", "") or ""
            target = str(self._path)
            if src == target or dest == target:
                logger.info("approval_rules: detected change to %s — reloading", target)
                try:
                    refresh_rules()
                except Exception:
                    logger.exception("approval_rules: hot reload failed")
        except Exception:
            logger.exception("approval_rules: watchdog dispatch failed")


def start_file_watcher() -> Any:
    """Start a watchdog Observer that hot-reloads the rules cache.

    No-op (returns ``None``) when:
      - we're running under pytest (``PYTEST_CURRENT_TEST`` is set),
      - watchdog isn't installed,
      - the rules file's parent directory doesn't exist.

    Idempotent: a second call returns the already-running observer.
    """
    global _watcher_observer
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return None
    if _watcher_observer is not None:
        return _watcher_observer
    try:
        from watchdog.observers import Observer
    except ImportError:
        logger.warning(
            "approval_rules: watchdog not installed — file hot reload disabled"
        )
        return None

    path = Path(DEFAULT_RULES_PATH)
    parent = path.parent
    if not parent.is_dir():
        logger.warning(
            "approval_rules: parent dir %s missing — file hot reload disabled", parent
        )
        return None

    observer = Observer()
    observer.schedule(_RulesFileEventHandler(path), str(parent), recursive=False)
    observer.daemon = True
    observer.start()
    _watcher_observer = observer
    logger.info("approval_rules: watchdog observing %s", path)
    return observer


def stop_file_watcher() -> None:
    """Stop the watchdog observer if it was started. Safe to call always."""
    global _watcher_observer
    obs = _watcher_observer
    _watcher_observer = None
    if obs is None:
        return
    try:
        obs.stop()
        obs.join(timeout=2.0)
    except Exception:
        logger.exception("approval_rules: stop watcher failed")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def should_route_for_approval(proposal: Proposal) -> ApprovalDecision:
    """Apply every rule and aggregate into a single decision.

    Rules come from the in-memory cache populated on first access. We do
    NOT accept a caller-supplied path here — exposing that would turn this
    helper into an arbitrary file-read sink if it ever reached the HTTP
    boundary. Tests use ``reload_rules()`` to point at fixtures.
    """
    rules = get_rules()
    ctx = proposal.as_context()
    decision = ApprovalDecision()

    for rule in rules:
        rule_id = rule.get("id", "?")
        try:
            fired = bool(_eval(rule["condition"], ctx))
        except (KeyError, ValueError, TypeError) as exc:
            # A malformed rule must not silently auto-approve. ``TypeError``
            # surfaces when comparison operators see mismatched types
            # (e.g. ``None > 5``). Treat as not-fired, log so silent rule
            # corruption is visible in ops dashboards, and surface via the
            # reasons list so the UI can flag it.
            logger.warning(
                "approval rule %s evaluation failed: %s", rule_id, exc
            )
            decision.reasons.append(f"rule {rule_id} failed to evaluate")
            continue

        if not fired:
            continue

        decision.thresholds_hit.append(rule.get("id", "?"))
        note = rule.get("note")
        if note:
            decision.reasons.append(note)

        if rule.get("block"):
            decision.block = True

        for approver in rule.get("route_to") or []:
            if approver not in decision.needs:
                decision.needs.append(approver)

        if rule.get("auto_approve"):
            # auto_approve flag survives only if nothing else has routed.
            decision.auto_approve = True

    # Resolve the auto_approve / needs conflict last: any routed approval
    # wins over auto_approve. Blocked proposals can never auto-approve.
    if decision.needs or decision.block:
        decision.auto_approve = False

    return decision


__all__ = [
    "ApprovalDecision",
    "DEFAULT_RULES_PATH",
    "Proposal",
    "get_rules",
    "load_rules",
    "refresh_rules",
    "reload_rules",
    "reset_cache_for_tests",
    "should_route_for_approval",
    "start_file_watcher",
    "stop_file_watcher",
]
