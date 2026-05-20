"""TodaySummaryStrip — 4 fixed-id KPI tiles for Action Center.

Plan ref: docs/ACTION_CENTER_PLAN.md §2.3.

The strip lives BELOW ``MovableHero`` and answers "what else matters
today?" in four numbers complementary to the hero. Every tile carries a
typed ``ActionIntent`` so the React component never has to invent
fallback routes or labels.

Tile order is fixed and never reorderable:

    1. open_actions      — count of decisions after filter
    2. recoverable_margin — Σ decisions[i].financialImpact.recoverableMargin
    3. blocked_quotes    — pricing proposals where approval is still required
    4. model_trust       — headline value from the existing trust block

(Movable revenue used to be a fifth tile but it duplicated MovableHero
verbatim — value, delta, sparkline. Dropped 2026-05-18.)
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from backend.database import SessionLocal

from ._intents import summary_tile_actions


# ---------- helpers -----------------------------------------------------


def _format_eur(value: float | None) -> str:
    """Compact € formatter mirroring ``movable_hero._format_eur_m``."""
    if value is None:
        return "—"
    if value >= 1_000_000:
        return f"€{value / 1_000_000:.2f}M"
    if value >= 1_000:
        return f"€{value / 1_000:.0f}k"
    return f"€{value:,.0f}"


def _tone_from_direction(direction: str | None) -> str:
    """Map MovableHero deltaDirection → tile tone."""
    if direction == "up":
        return "positive"
    if direction == "down":
        return "negative"
    return "neutral"


def _sum_recoverable_margin(decisions: list[dict[str, Any]]) -> float | None:
    """Σ decisions[i].financialImpact.recoverableMargin.value (€).

    Returns ``None`` if no decision carries a recoverable margin (so the
    tile renders ``—`` instead of a fake zero).
    """
    total = 0.0
    seen = False
    for d in decisions or []:
        fi = (d or {}).get("financialImpact") or {}
        rm = fi.get("recoverableMargin") if isinstance(fi, dict) else None
        if not isinstance(rm, dict):
            continue
        v = rm.get("value")
        if v is None:
            continue
        try:
            total += float(v)
            seen = True
        except (TypeError, ValueError):
            continue
    return total if seen else None


def _blocked_quotes_count() -> int | None:
    """How many pricing proposals are blocked on approval right now.

    The "Quotes & Guardrails" screen surfaces these as "needing action"
    when ``approval_required = TRUE`` and the proposal hasn't yet been
    accepted, rejected, or implemented. We count off the canonical table
    directly (no HTTP hop to /screens/quotes); if the table doesn't
    exist on this env, return ``None`` so the tile shows ``—``.
    """
    try:
        with SessionLocal() as db:
            row = db.execute(
                text(
                    """
                    SELECT COUNT(*) AS n
                      FROM pricing_proposals
                     WHERE approval_required = TRUE
                       AND status NOT IN (
                         'approved', 'implemented', 'cancelled', 'rejected'
                       )
                    """
                )
            ).mappings().one_or_none()
        if row is None:
            return None
        return int(row.get("n") or 0)
    except Exception:
        return None


# ---------- tile builders -----------------------------------------------


def _movable_revenue_tile(
    movable_hero: dict[str, Any],
    actions: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    value = movable_hero.get("value") if isinstance(movable_hero, dict) else None
    delta = movable_hero.get("delta") if isinstance(movable_hero, dict) else None
    direction = (
        movable_hero.get("deltaDirection")
        if isinstance(movable_hero, dict)
        else None
    )
    return {
        "id": "movable_revenue",
        "label": "Movable revenue",
        "value": value if value not in (None, "—") else None,
        "delta": delta if delta not in (None, "—") else None,
        "deltaDirection": direction or "flat",
        "tone": _tone_from_direction(direction),
        "sourceBlockId": "movableHero",
        "action": actions["movable_revenue"],
        "locked": False,
    }


def _open_actions_tile(
    decisions: list[dict[str, Any]] | None,
    actions: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    # ``locked`` is reserved for "data source not yet connected" (plan §0).
    # Distinguish two cases:
    #   * ``decisions is None``     → upstream block failed.  Lock the tile,
    #                                 emit ``value=None`` so the frontend
    #                                 renders the amber ``—`` chip.
    #   * ``len(decisions) == 0``   → queue legitimately clear.  This is a
    #                                 live signal — emit ``value="0"`` with
    #                                 a neutral tone, NOT locked.
    if decisions is None:
        return {
            "id": "open_actions",
            "label": "Open actions",
            "value": None,
            "delta": None,
            "deltaDirection": "flat",
            "tone": "neutral",
            "sourceBlockId": "decisions",
            "action": actions["open_actions"],
            "locked": True,
        }
    count = len(decisions)
    return {
        "id": "open_actions",
        "label": "Open actions",
        "value": str(count),
        "delta": None,
        "deltaDirection": "flat",
        "tone": "warning" if count > 0 else "neutral",
        "sourceBlockId": "decisions",
        "action": actions["open_actions"],
        "locked": False,
    }


def _recoverable_margin_tile(
    decisions: list[dict[str, Any]],
    actions: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    total = _sum_recoverable_margin(decisions)
    locked = total is None
    return {
        "id": "recoverable_margin",
        "label": "Recoverable margin",
        "value": _format_eur(total) if total is not None else None,
        "delta": None,
        "deltaDirection": "flat",
        "tone": "positive" if (total or 0) > 0 else "neutral",
        "sourceBlockId": "decisions",
        "action": actions["recoverable_margin"],
        "locked": locked,
    }


def _blocked_quotes_tile(actions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    count = _blocked_quotes_count()
    locked = count is None
    return {
        "id": "blocked_quotes",
        "label": "Blocked quotes",
        "value": str(count) if count is not None else None,
        "delta": None,
        "deltaDirection": "flat",
        "tone": "warning" if (count or 0) > 0 else "neutral",
        "sourceBlockId": "quotes",
        "action": actions["blocked_quotes"],
        "locked": locked,
    }


def _model_trust_tile(
    trust: list[dict[str, Any]],
    actions: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    headline = trust[0] if isinstance(trust, list) and trust else None
    value = headline.get("value") if isinstance(headline, dict) else None
    return {
        "id": "model_trust",
        "label": "Model trust",
        "value": value if value not in (None, "—") else None,
        "delta": None,
        "deltaDirection": "flat",
        "tone": "neutral",
        "sourceBlockId": "trust",
        "action": actions["model_trust"],
        "locked": value in (None, "—"),
    }


# ---------- public builder ----------------------------------------------


async def build(
    *,
    decisions: list[dict[str, Any]] | None,
    movable_hero: dict[str, Any],
    trust: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compose the 5-tile summary strip.

    Pulls already-resolved block outputs from the composer's first
    asyncio.gather — no SQL of its own except the blocked-quotes count
    which has no upstream block.

    ``decisions=None`` signals the upstream decisions block failed; tiles
    that derive from it (``open_actions``, ``recoverable_margin``) will
    render as locked. ``decisions=[]`` is a legitimate live state (queue
    cleared) and renders ``"0"`` / ``—`` without a lock.
    """
    # Build the trust drawer intent off the headline tile so clicking the
    # Model-trust tile reuses TrustDrawer (same surface as the strip).
    headline = trust[0] if isinstance(trust, list) and trust else {}
    actions = summary_tile_actions(
        trust_headline_label=str(headline.get("label") or "Model trust"),
        trust_headline_value=str(headline.get("value") or "—"),
        trust_headline_caption=str(headline.get("caption") or ""),
    )

    tiles = [
        _open_actions_tile(decisions, actions),
        _recoverable_margin_tile(decisions or [], actions),
        _blocked_quotes_tile(actions),
        _model_trust_tile(trust or [], actions),
    ]
    return {"tiles": tiles}
