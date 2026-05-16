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
"""
from __future__ import annotations

import json
import logging
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
# Public API
# ---------------------------------------------------------------------------


_CACHED_RULES: dict[Path, list[dict[str, Any]]] = {}


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


def reset_cache_for_tests() -> None:
    _CACHED_RULES.clear()


def reload_rules(path: Path | str = DEFAULT_RULES_PATH) -> list[dict[str, Any]]:
    """Test helper: invalidate the cache and reload ``path``.

    Only intended for tests that need to point at a fixture rules file.
    Not callable from any HTTP handler.
    """
    _CACHED_RULES.pop(Path(path).resolve(), None)
    return _load_rules_from(path)


def should_route_for_approval(proposal: Proposal) -> ApprovalDecision:
    """Apply every rule and aggregate into a single decision.

    Rules are loaded from the module-level ``DEFAULT_RULES_PATH``. We do
    NOT accept a caller-supplied path here — exposing that would turn this
    helper into an arbitrary file-read sink if it ever reached the HTTP
    boundary. Tests use ``reload_rules()`` to point at fixtures.
    """
    rules = _load_rules_from(DEFAULT_RULES_PATH)
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
