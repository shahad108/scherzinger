"""Pricing Studio v3 / Phase 3 — trigger banner composer.

When the user arrives at the Studio via a deep-link such as
``?source=forecasting&reason=cost-spike`` we render a one-liner banner above
the recommendation card explaining WHY the SKU is open. The banner clicks
through to the originating context (Forecasting commodity card, Margin
Cockpit erosion lens, …).

The composer is intentionally tolerant — when source/reason are missing or
unknown, we return ``None`` and the workbench omits the banner field.

Reuses ``forecast/market_direction.get_market_direction`` so the headline
text reflects the same internal-proxy signal the Forecasting screen renders.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.forecast.market_direction import get_market_direction
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Wire model
# ---------------------------------------------------------------------------


class TriggerContext(BaseModel):
    """Banner descriptor: origin metadata + a click-through deep link."""

    model_config = ConfigDict(from_attributes=True)

    source: str = Field(
        description="The originating screen — action-center, forecasting, margin."
    )
    reason: str = Field(
        description="Why the user was routed here — cost-spike, leakage, erosion, …"
    )
    headline: str = Field(description="One-liner displayed in the banner.")
    details: str = Field(description="Supporting paragraph (optional UI tooltip).")
    link_label: str
    link_target: str
    lineage_ref: Optional[LineageRef] = None


# ---------------------------------------------------------------------------
# Recognised (source, reason) tuples — anything else returns None.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _TriggerTemplate:
    source: str
    reason: str
    headline: str
    details: str
    link_label: str
    link_target_template: str  # may contain ``{aid}``/``{cluster}``


_TEMPLATES: tuple[_TriggerTemplate, ...] = (
    _TriggerTemplate(
        source="forecasting",
        reason="cost-spike",
        headline=(
            "Steel proxy rose {pct:+.1f}% MoM — cost crossed your safety "
            "margin, so the recommendation may have moved."
        ),
        details=(
            "Forecasting flagged this SKU because the internal material-cost "
            "proxy stepped {pct:+.1f}% versus the prior month. The Cost "
            "Trajectory Drawer shows where the floor crosses today's list "
            "price."
        ),
        link_label="View commodity trend",
        link_target_template="/forecasting?cluster={cluster}#commodities",
    ),
    _TriggerTemplate(
        source="margin",
        reason="erosion",
        headline=(
            "List price erosion narrowed margin — Margin Cockpit flagged "
            "this SKU for re-pricing."
        ),
        details=(
            "The cluster's list-price trajectory is trending below cost — "
            "see the erosion projection block for the projected crossover "
            "month."
        ),
        link_label="Open Margin Cockpit erosion lens",
        link_target_template="/margin?cluster={cluster}#erosion",
    ),
    _TriggerTemplate(
        source="action-center",
        reason="leakage",
        headline=(
            "Recurring leakage on this SKU — Action Center routed you here "
            "to re-price."
        ),
        details=(
            "Recent invoices show list→invoiced leakage above the cluster "
            "norm. The mini-waterfall inside each option card lets you "
            "model the new pocket margin live."
        ),
        link_label="Back to Action Center",
        link_target_template="/action-center",
    ),
    _TriggerTemplate(
        source="forecasting",
        reason="erosion",
        headline=(
            "Cluster erosion projection crossed cost floor — re-price now "
            "or lose margin."
        ),
        details=(
            "Forecasting's erosion projection now shows this cluster's "
            "list price crossing the cost floor inside the horizon window."
        ),
        link_label="View erosion projection",
        link_target_template="/forecasting?cluster={cluster}#erosion",
    ),
)


def _find_template(source: str, reason: str) -> Optional[_TriggerTemplate]:
    s = source.strip().lower()
    r = reason.strip().lower()
    for t in _TEMPLATES:
        if t.source == s and t.reason == r:
            return t
    return None


def _steel_pct_from_market_direction(db_session: Optional[Session]) -> Optional[Decimal]:
    """Extract the steel proxy MoM%, used to fill the cost-spike headline.

    Returns ``None`` when the proxy is unavailable (we keep a humane
    fallback headline rather than fabricate a number).
    """
    try:
        md = get_market_direction(db_session)
    except Exception:
        logger.exception("pricing:trigger_context:_steel_pct_from_market_direction failed")
        try:
            db_session.rollback()
        except Exception:
            pass
        return None
    for tile in md.get("tiles", []):
        name = str(tile.get("name") or "")
        if "steel" in name.lower():
            wow = tile.get("wowPct")
            if wow is None:
                return None
            try:
                return Decimal(str(wow))
            except Exception:
                logger.debug(
                    "pricing:trigger_context: bad wowPct=%r — pure-data parse, no DB",
                    wow,
                )
                return None
    return None


def _persist_lineage(
    *, source: str, reason: str, aid: Optional[str], db_session: Session
) -> LineageRef:
    aid_tag = aid or "?"
    row = create_lineage(
        source_kind=LineageSourceKind.MANUAL_OVERRIDE,
        source_id=f"trigger:{source}:{reason}:aid:{aid_tag}",
        sql=None,
        model="trigger_context_v1",
        computed_by="system",
        session=db_session,
    )
    return LineageRef(
        id=row.id,
        source_kind=row.source_kind,
        source_id=row.source_id,
        sql=row.sql,
        model=row.model,
        computed_at=row.computed_at,
        computed_by=row.computed_by,
    )


def build_trigger_context(
    *,
    aid: Optional[str],
    source: Optional[str],
    reason: Optional[str],
    cluster: Optional[str] = None,
    db_session: Session,
) -> Optional[TriggerContext]:
    """Compose the human-readable banner text when the user deep-linked here.

    ``None`` is returned when:
      - source or reason is missing/empty
      - the (source, reason) tuple is not recognised

    The shell forwards this verbatim so the frontend can render the banner
    above the recommendation card. The lineage_ref captures the (source,
    reason, aid) triple so the audit trail can reconstruct WHY the user
    arrived on this SKU.
    """
    if not source or not reason:
        return None

    template = _find_template(source, reason)
    if template is None:
        return None

    headline = template.headline
    details = template.details
    if "{pct" in headline or "{pct" in details:
        pct = _steel_pct_from_market_direction(db_session)
        if pct is None:
            # Substitute a non-numeric phrasing rather than the placeholder.
            headline = headline.replace(
                "rose {pct:+.1f}%",
                "moved against you",
            ).replace(
                "stepped {pct:+.1f}%",
                "stepped against you",
            )
            details = details.replace(
                "stepped {pct:+.1f}%",
                "stepped against you",
            )
        else:
            try:
                headline = headline.format(pct=float(pct))
                details = details.format(pct=float(pct))
            except (KeyError, ValueError):
                # Defensive — if a template gains a new field we miss, fall
                # back to a static phrasing instead of 500ing the workbench.
                headline = headline.replace("{pct:+.1f}%", "appreciably")
                details = details.replace("{pct:+.1f}%", "appreciably")

    link_target = template.link_target_template
    if "{cluster}" in link_target:
        link_target = link_target.format(cluster=cluster or "")
    if "{aid}" in link_target:
        link_target = link_target.format(aid=aid or "")

    lineage = _persist_lineage(
        source=template.source,
        reason=template.reason,
        aid=aid,
        db_session=db_session,
    )

    return TriggerContext(
        source=template.source,
        reason=template.reason,
        headline=headline,
        details=details,
        link_label=template.link_label,
        link_target=link_target,
        lineage_ref=lineage,
    )
