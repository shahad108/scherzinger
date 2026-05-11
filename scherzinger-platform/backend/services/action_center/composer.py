"""Action-Center composer — fan-out across per-block helpers.

The composer:
  * runs every block helper concurrently via ``asyncio.gather``
  * applies a 60-second per-(user, week, cluster, hide_locked) cache
  * gates by persona — Phase 4 implements 'frank' only
  * raises FastAPI's HTTPException 404 for till/heiko with a body
    explaining when their variant ships
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import text

from backend.database import SessionLocal

from . import (
    abtests_stub,
    audit_stub,
    buckets as buckets_block,
    decisions as decisions_block,
    header as header_block,
    long_tail as long_tail_block,
    lost_quote as lost_quote_block,
    movable_hero as movable_hero_block,
    negotiation as negotiation_block,
    rejections as rejections_block,
    sku_table as sku_table_block,
    trust as trust_block,
)
from ._seed import ActionCenterBlockError

CACHE_TTL_SECONDS = 60
_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}

_BLOCK_FALLBACKS: dict[str, Any] = {
    "header": {
        "greeting": "Action Center",
        "week": "—",
        "dateRange": "Live data unavailable",
        "stats": [],
    },
    "movableHero": {
        "value": "—",
        "delta": "—",
        "deltaDirection": "flat",
        "totalRevenue": "—",
        "movablePct": 0,
        "skusInScope": 0,
        "skusTotal": 0,
        "lockedValue": "—",
        "lockedPct": 0,
        "spark": [],
    },
    "buckets": [],
    "decisions": [],
    "trust": [],
    "lostQuote": {
        "wonAvg": 0,
        "lostAvg": 0,
        "differential": 0,
        "pValue": None,
        "implication": "Live lost-quote evidence is currently unavailable.",
        "linkedRecords": 0,
    },
    "skuTable": [],
    "longTail": {"tiles": [], "mix": [], "subhead": "Live long-tail coverage is unavailable."},
    "negotiation": {
        "discountGap": "—",
        "discountGapDelta": "—",
        "commodities": [],
        "summary": ["Live negotiation signals are unavailable."],
    },
    "rejections": [],
    "audit": [],
    "abTests": [],
}


def _empty_status(value: Any) -> bool:
    if isinstance(value, list):
        return len(value) == 0
    return False


def _coverage_tone(n: int | None, *, green_at: int, amber_at: int) -> str:
    """Map a sample-size into a green/amber/red coverage tone."""
    if n is None:
        return "amber"
    if n >= green_at:
        return "green"
    if n >= amber_at:
        return "amber"
    return "red"


def _data_freshness() -> dict[str, Any]:
    """Latest invoice/quote date + linkage refresh stamp for the freshness footer."""
    try:
        with SessionLocal() as db:
            row = db.execute(
                text(
                    """
                    SELECT (SELECT MAX(date) FROM invoices)       AS inv_through,
                           (SELECT MAX(date) FROM quotes)         AS qt_through,
                           (SELECT MAX(created_at) FROM quote_invoice_links) AS links_at
                    """
                )
            ).mappings().one_or_none()
        if not row:
            return {}
        return {
            "invoicesThrough": row["inv_through"].isoformat() if row["inv_through"] else None,
            "quotesThrough": row["qt_through"].isoformat() if row["qt_through"] else None,
            "linksUpdatedAt": row["links_at"].isoformat() if row["links_at"] else None,
        }
    except Exception:
        return {}


def _enrich_coverage(payload_blocks: dict[str, Any], meta_blocks: dict[str, Any]) -> None:
    """Annotate per-block meta with a `coverage` hint where the value carries
    a defensible sample size. Tone bands are deliberately conservative —
    Frank's persona rewards honest red over hopeful green.
    """
    hero = payload_blocks.get("movableHero") or {}
    skus = hero.get("skusInScope")
    if isinstance(skus, int) and "movableHero" in meta_blocks:
        meta_blocks["movableHero"]["coverage"] = {
            "tone": _coverage_tone(skus, green_at=100, amber_at=20),
            "label": f"{skus} movable SKUs (pilot heuristic)",
            "n": skus,
        }

    lq = payload_blocks.get("lostQuote") or {}
    overall = (lq.get("quoteInvoiceGap") or {}).get("overall") or {}
    n_links = overall.get("n")
    if isinstance(n_links, int) and "lostQuote" in meta_blocks:
        meta_blocks["lostQuote"]["coverage"] = {
            "tone": _coverage_tone(n_links, green_at=500, amber_at=100),
            "label": f"{n_links:,} linked quote–invoice records · 4-yr depth",
            "n": n_links,
        }

    trust = payload_blocks.get("trust") or []
    if isinstance(trust, list) and "trust" in meta_blocks:
        # The drawer carries per-cluster n; here we summarize how many tiles
        # made it through (max 4). Red if fewer than 3 tiles rendered.
        n_tiles = len(trust)
        meta_blocks["trust"]["coverage"] = {
            "tone": _coverage_tone(n_tiles, green_at=4, amber_at=3),
            "label": f"{n_tiles}/4 trust signals live · click a tile for per-cluster detail",
            "n": n_tiles,
        }

    abtests = payload_blocks.get("abTests") or []
    if isinstance(abtests, list) and "abTests" in meta_blocks:
        n_ab = len(abtests)
        meta_blocks["abTests"]["coverage"] = {
            "tone": "amber" if n_ab == 0 else "green",
            "label": (
                "No A/B tests running yet — Slice button on Decision cards starts one."
                if n_ab == 0
                else f"{n_ab} A/B tests in flight"
            ),
            "n": n_ab,
        }

    audit = payload_blocks.get("audit") or []
    if isinstance(audit, list) and "audit" in meta_blocks:
        n_audit = len(audit)
        meta_blocks["audit"]["coverage"] = {
            "tone": "amber" if n_audit == 0 else "green",
            "label": (
                "No audited actions yet — every Accept/Decline writes here."
                if n_audit == 0
                else f"{n_audit} audited actions in the last 30d"
            ),
            "n": n_audit,
        }


async def _resolve_block(name: str, builder) -> tuple[Any, dict[str, str | None]]:
    try:
        value = await builder()
    except ActionCenterBlockError as exc:
        return _BLOCK_FALLBACKS[name], {"status": "degraded", "reason": exc.reason}
    except Exception:
        return _BLOCK_FALLBACKS[name], {
            "status": "degraded",
            "reason": f"{name} live data unavailable.",
        }

    if _empty_status(value):
        return value, {"status": "empty", "reason": None}
    return value, {"status": "live", "reason": None}


def _cache_key(
    user_id: str,
    persona: str,
    week: str | None,
    cluster: str | None,
    hide_locked: bool,
    limit: int,
) -> tuple[Any, ...]:
    return (user_id, persona, week, cluster, hide_locked, limit)


def invalidate_cache() -> None:
    """Called by audit-write hooks (e.g. POST /actions) to drop entries."""
    _CACHE.clear()


async def build_action_center(
    *,
    user_id: str,
    user_name: str,
    persona: str,
    week: str | None,
    cluster: str | None,
    hide_locked: bool,
    limit: int = 5,
) -> dict[str, Any]:
    if persona == "frank":
        pass
    elif persona in {"till", "heiko"}:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": persona,
                "message": (
                    "Till Action Center coming in Phase 10."
                    if persona == "till"
                    else "Heiko Action Center coming in Phase 11."
                ),
            },
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="unknown persona"
        )

    key = _cache_key(user_id, persona, week, cluster, hide_locked, limit)
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    (
        (header, header_meta),
        (movable_hero, movable_hero_meta),
        (buckets, buckets_meta),
        (decisions, decisions_meta),
        (trust, trust_meta),
        (lost_quote, lost_quote_meta),
        (sku_table, sku_table_meta),
        (long_tail, long_tail_meta),
        (negotiation, negotiation_meta),
        (rejections, rejections_meta),
        (audit, audit_meta),
        (abtests, abtests_meta),
    ) = await asyncio.gather(
        _resolve_block("header", lambda: header_block.build(user_name=user_name, week=week)),
        _resolve_block("movableHero", lambda: movable_hero_block.build(week=week, cluster=cluster)),
        _resolve_block("buckets", lambda: buckets_block.build(hide_locked=hide_locked)),
        _resolve_block("decisions", lambda: decisions_block.build(cluster=cluster, limit=max(3, limit))),
        _resolve_block("trust", trust_block.build),
        _resolve_block("lostQuote", lost_quote_block.build),
        _resolve_block(
            "skuTable",
            lambda: sku_table_block.build(
                cluster=cluster,
                hide_locked=hide_locked,
                limit=max(50, limit),
            ),
        ),
        _resolve_block("longTail", long_tail_block.build),
        _resolve_block("negotiation", negotiation_block.build),
        _resolve_block("rejections", lambda: rejections_block.build(limit=limit)),
        _resolve_block("audit", lambda: audit_stub.build(user_id=user_id, user_name=user_name)),
        _resolve_block("abTests", abtests_stub.build),
    )

    meta_blocks: dict[str, Any] = {
        "header": header_meta,
        "movableHero": movable_hero_meta,
        "buckets": buckets_meta,
        "decisions": decisions_meta,
        "trust": trust_meta,
        "lostQuote": lost_quote_meta,
        "skuTable": sku_table_meta,
        "longTail": long_tail_meta,
        "negotiation": negotiation_meta,
        "rejections": rejections_meta,
        "audit": audit_meta,
        "abTests": abtests_meta,
    }

    payload_blocks: dict[str, Any] = {
        "header": header,
        "movableHero": movable_hero,
        "buckets": buckets,
        "decisions": decisions,
        "trust": trust,
        "lostQuote": lost_quote,
        "skuTable": sku_table,
        "longTail": long_tail,
        "negotiation": negotiation,
        "rejections": rejections,
        "audit": audit,
        "abTests": abtests,
    }

    _enrich_coverage(payload_blocks, meta_blocks)

    payload = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "traceId": f"ac-{uuid4().hex[:12]}",
            "dataFreshness": _data_freshness(),
            "blocks": meta_blocks,
        },
        **payload_blocks,
    }
    _CACHE[key] = (now, payload)
    return payload
