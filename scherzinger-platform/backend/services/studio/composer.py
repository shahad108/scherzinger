"""Studio shell composer.

The shell endpoint returns: header, filters, toggles, defaultAid, skus[]
and (for backward compat with the existing frontend) the *default-aid*
workbench under the ``workbench`` key. Per-aid workbenches are fetched
on demand from /studio/workbench/{aid}.

Phase A3 (Pricing Studio plan §5): the seed-fallback was removed. UI
chrome (header / filters / toggles / crossLinks / footerNote) is built
from static scaffolds in this module — these are not domain data.
Domain data (the SKU list, recommendations, the workbench payload,
comparable) must come from the database; when DB queries return empty
the response carries ``meta.blocks.{block}.status = 'empty'`` and an
empty list — never a synthesised SKU.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select

from backend.database import SessionLocal
from backend.services import recommendation_service

from ._seed import StudioBlockError  # noqa: F401 — re-exported for callers

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 60
_CACHE: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}


# ---------------------------------------------------------------------------
# Static UI chrome (NOT domain data — fixed scaffold for the screen shell).
# ---------------------------------------------------------------------------

_HEADER_SCAFFOLD: dict[str, Any] = {
    "crumbs": ["Cockpit", "Pricing Analyst · Frank", "Pricing Studio"],
    "title": "Pricing Studio",
    "subPills": ["SKU pricing workbench", "Predictive Portfolio Pricing"],
    "subStats": [],
    "headPills": [
        {"label": "Action queue →", "target": "action"},
        {"label": "Cluster forecast →", "target": "forecast"},
        {"label": "Approvals →", "target": "quotes"},
    ],
}

_FILTERS_SCAFFOLD: list[dict[str, str]] = [
    {"id": "all", "label": "All"},
    {"id": "floor", "label": "Floor breached"},
    {"id": "cost", "label": "Cost-shifted"},
    {"id": "stale", "label": "Stale > 12mo"},
    {"id": "frame", "label": "Frame contract due"},
]

_TOGGLES_SCAFFOLD: list[dict[str, Any]] = [
    {"id": "hide-locked", "label": "🔒 Hide locked", "defaultActive": False},
    {"id": "new-skus", "label": "🆕 New SKUs", "defaultActive": False},
]

_CROSSLINKS_SCAFFOLD: list[dict[str, str]] = [
    {"label": "Action Center", "target": "action"},
    {"label": "Margin Cockpit", "target": "margin"},
    {"label": "Quotes & Guardrails", "target": "quotes"},
]


def _empty_workbench_scaffold(aid: str | None) -> dict[str, Any]:
    """Empty scaffold for the default-aid workbench when no DB data exists.

    Every block is shaped so the frontend's empty/degraded states render
    cleanly. Status metadata travels in the per-block ``meta.blocks``
    payload, not inline on each block.
    """
    return {
        "aid": aid,
        "hero": {
            "aid": aid,
            "title": "—",
            "sub": "",
            "currentPrice": None,
            "currentMargin": None,
            "targetText": "",
        },
        "options": {},
        "fanout": {"rows": [], "clusterNote": "", "footNote": ""},
        "cost": {"components": [], "note": ""},
        "history": [],
        "decision": {},
        "memo": {"paragraphs": []},
    }


def _empty_comparable_scaffold(aid: str | None) -> dict[str, Any]:
    return {"aid": aid, "isNew": False, "rows": []}


def invalidate_cache() -> None:
    _CACHE.clear()


def _resolve_data_through() -> Optional[datetime]:
    """Return the most-recent ingestion timestamp across cost_state +
    competitor signals + invoice ledger.

    Best-effort: if any source is unavailable we treat it as missing.
    Tests stub this directly via monkeypatch.
    """
    try:
        from backend.models.invoice import Invoice
        from backend.models.pricing.cost_state import CostStateRow

        candidates: list[datetime] = []
        with SessionLocal() as db:
            try:
                cs = db.execute(
                    select(func.max(CostStateRow.last_ingested_at))
                ).scalar_one_or_none()
                if cs is not None:
                    candidates.append(_ensure_aware(cs))
            except Exception:
                logger.exception("studio:dataThrough:cost_state probe failed")
                try:
                    db.rollback()
                except Exception:
                    pass
            try:
                inv = db.execute(select(func.max(Invoice.date))).scalar_one_or_none()
                if inv is not None:
                    # Date → end-of-day UTC datetime.
                    candidates.append(
                        datetime(
                            inv.year, inv.month, inv.day, 23, 59, 59, tzinfo=timezone.utc
                        )
                    )
            except Exception:
                logger.exception("studio:dataThrough:invoice probe failed")
                try:
                    db.rollback()
                except Exception:
                    pass
        return max(candidates) if candidates else None
    except Exception:
        logger.exception("studio:dataThrough:resolver failed")
        return None


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _compute_data_through() -> str:
    """ISO-8601 freshness chip value. Falls back to ``now - 24h`` when no
    signals are present so the chip always renders something."""
    resolved = _resolve_data_through()
    if resolved is None:
        resolved = datetime.now(timezone.utc) - timedelta(hours=24)
    return resolved.isoformat().replace("+00:00", "Z")


def _persona_gate(persona: str) -> None:
    if persona == "frank":
        return
    if persona == "till":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_not_implemented",
                "persona": "till",
                "message": "Till read-only Studio with override-approve coming in Phase 10.",
            },
        )
    if persona == "heiko":
        # Per §14.2 P8.T6 Heiko has no view.studio permission. The 404
        # body matches the other phases' shape so the frontend's persona
        # redirect can intercept consistently.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "persona_no_access",
                "persona": "heiko",
                "message": "Heiko has no Studio access; redirect to /deal/inbox.",
            },
        )
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown persona")


def _load_skus_from_db(
    *,
    tier: Optional[str] = None,
    family: Optional[str] = None,
    cluster: Optional[str] = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Load the SKU picker rows from live tables.

    Returns ``(skus, status_meta)`` — the status_meta describes whether
    the list is live / empty / degraded.

    Phase A3: this used to merge ``studio.json`` rows; now it returns
    only what's actually in price_state + cost_state. An empty DB yields
    an empty list, not a seeded shape.
    """
    skus: list[dict[str, Any]] = []
    try:
        from backend.models.pricing.cost_state import CostStateRow
        from backend.models.pricing.pricing_state import PriceStateRow

        with SessionLocal() as db:
            price_rows = db.execute(select(PriceStateRow)).scalars().all()
            cost_by_aid = {
                c.aid: c
                for c in db.execute(select(CostStateRow)).scalars().all()
            }
            for pr in price_rows:
                aid = pr.aid
                cr = cost_by_aid.get(aid)
                cp = float(pr.current_price) if pr.current_price is not None else None
                uc = float(cr.unit_cost) if cr and cr.unit_cost is not None else None
                margin_label: Optional[str] = None
                margin_tone: Optional[str] = None
                if cp is not None and uc is not None and cp > 0:
                    margin_pct = (cp - uc) / cp * 100
                    sign = "+" if margin_pct >= 0 else "−"
                    margin_label = f"{sign}{abs(margin_pct):.1f}%"
                    margin_tone = (
                        "hi" if margin_pct >= 25 else ("mid" if margin_pct >= 0 else "lo")
                    )
                skus.append(
                    {
                        "aid": aid,
                        "margin": margin_label,
                        "marginTone": margin_tone,
                        "productLine": None,
                        "cluster": getattr(pr, "cluster", None),
                        "meta": "",
                        "flag": None,
                        "tag": None,
                        "tagTone": None,
                        "locked": False,
                        "isNew": False,
                    }
                )
    except Exception as exc:
        logger.exception("studio:shell:sku_list failed")
        return [], {
            "status": "degraded",
            "reason": f"SKU list unavailable ({type(exc).__name__})",
        }

    # Apply optional narrowing filters; soft-narrow (keep prior list if
    # the filter eliminates everything).
    if tier:
        narrowed = [s for s in skus if str(s.get("tier", "")).upper() == tier.upper()]
        skus = narrowed or skus
    if family:
        narrowed = [s for s in skus if str(s.get("family", "")).upper() == family.upper()]
        skus = narrowed or skus
    if cluster:
        narrowed = [
            s for s in skus if str(s.get("cluster", "")).lower() == cluster.lower()
        ]
        skus = narrowed or skus

    if not skus:
        return [], {"status": "empty", "reason": None}
    return skus, {"status": "live", "reason": None}


async def build_studio_shell(
    *,
    user_id: str,
    persona: str,
    aid: str | None,
    filter_value: str | None,
    hide_locked: bool,
    lang: str | None,
    tier: str | None = None,
    family: str | None = None,
    cluster: str | None = None,
    scenario_id: str | None = None,
) -> dict[str, Any]:
    _persona_gate(persona)

    key = (
        user_id,
        persona,
        aid,
        filter_value,
        hide_locked,
        lang,
        tier,
        family,
        cluster,
        scenario_id,
    )
    cached = _CACHE.get(key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    skus, sku_status = _load_skus_from_db(tier=tier, family=family, cluster=cluster)

    # Optional `filter_value` narrowing (legacy `filter=` query param).
    if filter_value:
        narrowed = [
            s for s in skus
            if filter_value.lower() in str(s.get("flag", "")).lower()
            or filter_value.lower() in str(s.get("status", "")).lower()
        ]
        skus = narrowed or skus

    if hide_locked:
        skus = [s for s in skus if not s.get("locked")]

    # Per-SKU recommendation enrichment (canonical per-SKU recommendation
    # contract — same shape as /action-center.skuTable[].recommendation).
    recommendation_status: dict[str, Any] = {"status": "empty", "reason": None}
    if skus:
        try:
            with SessionLocal() as db:
                aids = [str(s.get("aid")) for s in skus if s.get("aid")]
                recs = recommendation_service.get_sku_recommendations_bulk(db, aids)
            for s in skus:
                s["recommendation"] = recs.get(str(s.get("aid")))
            if any(s.get("recommendation") for s in skus):
                recommendation_status = {"status": "live", "reason": None}
        except Exception as exc:
            logger.exception("studio:shell:recommendation_enrichment failed")
            for s in skus:
                s.setdefault("recommendation", None)
            recommendation_status = {
                "status": "degraded",
                "reason": f"Recommendation enrichment unavailable ({type(exc).__name__})",
            }

    # Determine the default aid: caller-supplied wins; otherwise the
    # first SKU in the picker; otherwise None (truly-empty shell).
    default_aid = aid or (skus[0]["aid"] if skus else None)

    # The shell's bundled `workbench` block carries the default-aid
    # workbench for backward-compat with the legacy frontend. Phase A3:
    # we no longer ship a seeded payload — empty scaffold + status meta.
    workbench_scaffold = _empty_workbench_scaffold(default_aid)
    comparable_scaffold = _empty_comparable_scaffold(default_aid)

    meta_blocks: dict[str, Any] = {
        "header": {"status": "live", "reason": None},
        "filters": {"status": "live", "reason": None},
        "toggles": {"status": "live", "reason": None},
        "skus": sku_status,
        "recommendation": recommendation_status,
        "workbench": {
            "status": "empty",
            "reason": (
                "Default-aid workbench is fetched per-SKU; see "
                "/screens/studio/workbench/{aid}."
            ),
        },
        "comparable": {"status": "empty", "reason": None},
    }

    payload = {
        "header": _HEADER_SCAFFOLD,
        "filters": _FILTERS_SCAFFOLD,
        "toggles": _TOGGLES_SCAFFOLD,
        "defaultAid": default_aid,
        "skus": skus,
        # Backward-compat: existing frontend reads .workbench from the shell
        # for the default SKU. Per-aid workbenches use /studio/workbench/{aid}.
        "workbench": workbench_scaffold,
        "comparable": comparable_scaffold,
        "crossLinks": _CROSSLINKS_SCAFFOLD,
        "footerNote": "",
        # Phase 21 — echo back applied filters so the UI can confirm a deep
        # link landed on the intended slice + render the cleared-filter chips.
        "appliedFilters": {
            "tier": tier,
            "family": family,
            "cluster": cluster,
            "scenarioId": scenario_id,
        },
        # Pricing Studio v3 / Phase 10 — canonical freshness chip value.
        "dataThrough": _compute_data_through(),
        # Phase A2 — per-block status metadata (mirrors action-center shape).
        "meta": {"blocks": meta_blocks},
    }
    _CACHE[key] = (now, payload)
    return payload
