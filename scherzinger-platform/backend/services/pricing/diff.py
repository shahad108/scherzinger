"""Pricing Studio v3 / Phase 4 — diff composer.

``build_diff(aid, since, db_session)`` returns the collapsed
``DiffSummary`` powering the "What changed since you last looked"
strip in the Studio workbench + the inbox unread badges.

Five change kinds are surfaced today:
  - ``cost``               unit cost moved (from CostState + audit log)
  - ``competitor_signal``  median competitor price moved (re-derived)
  - ``proposal``           new draft / approval landed in the window
  - ``customer_risk``      per-customer ``risk_if_moved`` moved (top 5)
  - ``price``              list/current price moved (PriceState + audit)

The changes list is sorted by ``kind`` alpha-ascending so the frontend
can render with no client-side sorting (deterministic test diffs too).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from backend.models.pricing.audit import PricingAuditEntry
from backend.models.pricing.cost_state import CostStateRow
from backend.models.pricing.customer_on_sku import CustomerOnSkuSnapshotRow
from backend.models.pricing.diff import ChangeKind, DiffChange, DiffSummary
from backend.models.pricing.lineage import LineageSourceKind
from backend.models.pricing.pricing_state import PriceStateRow
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


_DEFAULT_LOOKBACK = timedelta(days=7)
_TOP_N_CUSTOMER_MOVERS = 5

# SF1 — Sentinel lineage_ref returned when ``changes`` is empty so we don't
# allocate a fresh ``lineage_refs`` row on every page-open diff GET (the diff
# endpoint is hit on every Studio render → table bloat). The UUID is
# deterministic (UUID5 over a namespaced string) so clients can recognize
# the sentinel if they want, and the wire shape stays non-nullable.
_EMPTY_DIFF_SENTINEL_LINEAGE_REF: uuid.UUID = uuid.uuid5(
    uuid.NAMESPACE_URL, "scherzinger://pricing/diff/empty"
)


def _safe_decimal(v: Any) -> Optional[Decimal]:
    if v is None:
        return None
    try:
        return Decimal(str(v))
    except Exception:
        return None


def _pct(before: Optional[Decimal], after: Optional[Decimal]) -> Optional[Decimal]:
    if before is None or after is None or before == 0:
        return None
    try:
        return ((after - before) / before * Decimal("100")).quantize(Decimal("0.01"))
    except Exception:
        return None


def _cost_link(aid: str) -> str:
    return f"/forecasting?aid={aid}#commodities"


def _customer_link(aid: str, customer_id: str) -> str:
    return f"/studio/sku/{aid}/customer/{customer_id}"


def _proposal_link(aid: str) -> str:
    return f"/studio/sku/{aid}/proposals"


def _price_link(aid: str) -> str:
    return f"/studio/sku/{aid}"


# ---------------------------------------------------------------------------
# Per-kind diff builders. Each returns 0..N DiffChange rows.
# ---------------------------------------------------------------------------


def _diff_cost(
    *, aid: str, since: datetime, now: datetime, db_session: Session
) -> list[DiffChange]:
    """Cost diff: current CostState vs the closest audit row at-or-before ``since``.

    Falls back to the earliest audit row when no row exists before
    ``since`` — preserves a useful signal when the SKU was just onboarded.
    """
    cost_row = db_session.execute(
        select(CostStateRow).where(CostStateRow.aid == aid)
    ).scalar_one_or_none()
    if cost_row is None:
        return []
    current = _safe_decimal(cost_row.unit_cost)

    # Find a cost-bearing audit row near ``since``. The Phase 0 spec
    # tracks cost mutations as ``price_set`` / ``override_added`` /
    # ``alert_triggered`` / ``rollback`` actions whose ``after`` payload
    # carries a ``unit_cost`` field. We accept any of those + check the
    # payload for a numeric ``unit_cost``.
    cost_predicate = and_(
        PricingAuditEntry.target_kind == "sku",
        PricingAuditEntry.target_id == aid,
        PricingAuditEntry.after["unit_cost"].astext.isnot(None),
    )
    earlier = db_session.execute(
        select(PricingAuditEntry)
        .where(and_(cost_predicate, PricingAuditEntry.at <= since))
        .order_by(PricingAuditEntry.at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if earlier is None:
        # Fall back to the earliest audit row with a cost field.
        earlier = db_session.execute(
            select(PricingAuditEntry)
            .where(cost_predicate)
            .order_by(PricingAuditEntry.at.asc())
            .limit(1)
        ).scalar_one_or_none()
    if earlier is None:
        return []

    before = _safe_decimal((earlier.after or {}).get("unit_cost"))
    if before is None or current is None or before == current:
        return []
    return [
        DiffChange(
            kind=ChangeKind.COST,
            before=before,
            after=current,
            pct=_pct(before, current),
            lineage_ref=earlier.lineage_ref_id,
            link_target=_cost_link(aid),
        )
    ]


def _diff_price(
    *, aid: str, since: datetime, now: datetime, db_session: Session
) -> list[DiffChange]:
    """Price diff: current PriceState vs the closest audit row at-or-before ``since``."""
    price_row = db_session.execute(
        select(PriceStateRow).where(PriceStateRow.aid == aid)
    ).scalar_one_or_none()
    if price_row is None:
        return []
    current = _safe_decimal(price_row.current_price)
    if current is None:
        return []

    predicate = and_(
        PricingAuditEntry.target_kind == "sku",
        PricingAuditEntry.target_id == aid,
        PricingAuditEntry.action == "price_set",
    )
    earlier = db_session.execute(
        select(PricingAuditEntry)
        .where(and_(predicate, PricingAuditEntry.at <= since))
        .order_by(PricingAuditEntry.at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if earlier is None:
        earlier = db_session.execute(
            select(PricingAuditEntry)
            .where(predicate)
            .order_by(PricingAuditEntry.at.asc())
            .limit(1)
        ).scalar_one_or_none()
    if earlier is None:
        return []
    before = _safe_decimal(
        (earlier.after or {}).get("price")
        or (earlier.after or {}).get("current_price")
        or (earlier.after or {}).get("new_price")
    )
    if before is None or before == current:
        return []
    return [
        DiffChange(
            kind=ChangeKind.PRICE,
            before=before,
            after=current,
            pct=_pct(before, current),
            lineage_ref=earlier.lineage_ref_id,
            link_target=_price_link(aid),
        )
    ]


def _diff_competitor_signal(
    *, aid: str, since: datetime, now: datetime, db_session: Session
) -> list[DiffChange]:
    """Competitor signal diff.

    We delegate to ``services.competitor.index.build_competitor_ref`` for
    the **current** median (90-day window). For the "before" anchor we
    recompute the same query with the window ending at ``since`` so we're
    comparing apples-to-apples (90 days then vs 90 days now). When no
    competitor signal is available we return an empty list so the diff
    strip omits the row instead of rendering a confusing "—".
    """
    from sqlalchemy import text

    from backend.services.competitor.index import build_competitor_ref

    try:
        current_ref = build_competitor_ref(aid=aid, n_days=90, db_session=db_session)
    except Exception:
        logger.exception("diff._diff_competitor_signal current aid=%s", aid)
        return []
    if current_ref is None:
        return []

    # Recompute median over the 90-day window ending at ``since``.
    window_start = (since - timedelta(days=90)).date()
    window_end = since.date()
    try:
        rows = db_session.execute(
            text(
                """
                SELECT (q.revenue / NULLIF(q.quantity, 0))::numeric AS unit_price
                  FROM quotes q
                 WHERE q.article_id = :aid
                   AND q.is_won = FALSE
                   AND q.rejection_code IN ('PA', 'PR')
                   AND q.revenue IS NOT NULL
                   AND q.quantity IS NOT NULL
                   AND q.quantity > 0
                   AND q.date >= :since
                   AND q.date <= :until
                """
            ),
            {"aid": aid, "since": window_start, "until": window_end},
        ).fetchall()
    except Exception:
        logger.exception("diff._diff_competitor_signal historical aid=%s", aid)
        return []
    prices = [Decimal(str(r[0])) for r in rows if r[0] is not None]
    if not prices:
        return []
    prices.sort()
    mid = len(prices) // 2
    before = (
        prices[mid] if len(prices) % 2 == 1 else (prices[mid - 1] + prices[mid]) / 2
    )
    after = Decimal(str(current_ref.median_price))
    if before == after:
        return []
    lineage_ref_id = (
        current_ref.lineage_ref.id if current_ref.lineage_ref is not None else None
    )
    return [
        DiffChange(
            kind=ChangeKind.COMPETITOR_SIGNAL,
            before=before,
            after=after,
            pct=_pct(before, after),
            lineage_ref=lineage_ref_id,
            link_target=_price_link(aid),
        )
    ]


def _diff_proposal(
    *, aid: str, since: datetime, now: datetime, db_session: Session
) -> list[DiffChange]:
    """Proposal diff: count of created + approved proposals in the window."""
    predicate = and_(
        PricingAuditEntry.target_kind == "sku",
        PricingAuditEntry.target_id == aid,
        PricingAuditEntry.action.in_(("proposal_created", "proposal_approved")),
        PricingAuditEntry.at > since,
        PricingAuditEntry.at <= now,
    )
    rows = (
        db_session.execute(
            select(PricingAuditEntry)
            .where(predicate)
            .order_by(PricingAuditEntry.at.asc())
        )
        .scalars()
        .all()
    )
    if not rows:
        return []
    last = rows[-1]
    payload = last.after or {}
    proposal_id = (
        payload.get("proposal_id")
        or payload.get("rec_ref")
        or payload.get("recommendation_id")
        or str(last.id)[:8]
    )
    label = f"{last.action} #{str(proposal_id)[:8]}"
    return [
        DiffChange(
            kind=ChangeKind.PROPOSAL,
            before=None,
            after=Decimal(str(len(rows))),
            pct=None,
            label=label,
            lineage_ref=last.lineage_ref_id,
            link_target=_proposal_link(aid),
        )
    ]


def _diff_customer_risk(
    *, aid: str, since: datetime, now: datetime, db_session: Session
) -> list[DiffChange]:
    """Per-customer risk diff: top ``_TOP_N_CUSTOMER_MOVERS`` by |Δ|.

    Uses ``customer_on_sku_snapshot.risk_if_moved`` as the current value
    and the audit log's customer-targeted entries (``after.risk_if_moved``)
    for the before value. When no audit row is found for a customer we
    skip it — without a "before" the delta is meaningless.
    """
    snap_rows = (
        db_session.execute(
            select(CustomerOnSkuSnapshotRow).where(CustomerOnSkuSnapshotRow.aid == aid)
        )
        .scalars()
        .all()
    )
    if not snap_rows:
        return []
    movers: list[tuple[Decimal, DiffChange]] = []
    for snap in snap_rows:
        current = _safe_decimal(snap.risk_if_moved)
        if current is None:
            continue
        predicate = and_(
            PricingAuditEntry.target_kind == "customer",
            PricingAuditEntry.target_id == snap.customer_id,
            PricingAuditEntry.after["aid"].astext == aid,
            PricingAuditEntry.at <= since,
        )
        earlier = db_session.execute(
            select(PricingAuditEntry)
            .where(predicate)
            .order_by(PricingAuditEntry.at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if earlier is None:
            continue
        before = _safe_decimal((earlier.after or {}).get("risk_if_moved"))
        if before is None or before == current:
            continue
        change = DiffChange(
            kind=ChangeKind.CUSTOMER_RISK,
            before=before,
            after=current,
            pct=_pct(before, current),
            customer_id=snap.customer_id,
            lineage_ref=earlier.lineage_ref_id,
            link_target=_customer_link(aid, snap.customer_id),
        )
        delta = abs(current - before)
        movers.append((delta, change))
    movers.sort(key=lambda t: t[0], reverse=True)
    return [c for _, c in movers[:_TOP_N_CUSTOMER_MOVERS]]


# ---------------------------------------------------------------------------
# Public entry point.
# ---------------------------------------------------------------------------


def build_diff(
    *,
    aid: str,
    since: datetime,
    db_session: Session,
    now: Optional[datetime] = None,
) -> DiffSummary:
    """Compose the per-(aid, since) DiffSummary.

    Empty ``changes`` list when nothing moved (still a 200 OK).
    """
    if now is None:
        now = datetime.now(timezone.utc)
    if since.tzinfo is None:
        # Normalize naive datetimes to UTC so the < / > comparisons in
        # the per-kind builders behave deterministically against the
        # timestamptz columns.
        since = since.replace(tzinfo=timezone.utc)

    changes: list[DiffChange] = []
    for builder in (
        _diff_cost,
        _diff_competitor_signal,
        _diff_customer_risk,
        _diff_price,
        _diff_proposal,
    ):
        try:
            changes.extend(
                builder(aid=aid, since=since, now=now, db_session=db_session)
            )
        except Exception:
            logger.exception("diff.builder failed aid=%s builder=%s", aid, builder.__name__)
            continue

    # Deterministic order — alpha by kind, then customer_id for stable
    # within-kind ordering.
    changes.sort(key=lambda c: (c.kind.value, c.customer_id or ""))

    # SF1 — skip the lineage_refs INSERT when nothing changed. The diff
    # endpoint is hit on every Studio page-open, so writing a row per call
    # bloats the table. Only stamp lineage when there's an actual diff.
    if changes:
        lineage_row = create_lineage(
            source_kind=LineageSourceKind.MANUAL_OVERRIDE,
            source_id=f"diff:{aid}:{since.isoformat()}",
            sql=None,
            model="diff_v1",
            computed_by="system",
            session=db_session,
        )
        summary_lineage_ref = lineage_row.id
    else:
        summary_lineage_ref = _EMPTY_DIFF_SENTINEL_LINEAGE_REF

    return DiffSummary(
        aid=aid,
        since=since,
        now=now,
        changes=changes,
        summary_lineage_ref=summary_lineage_ref,
    )


def default_lookback(now: Optional[datetime] = None) -> datetime:
    """Default ``since`` when neither ``?since=`` nor view-state is set."""
    base = now or datetime.now(timezone.utc)
    return base - _DEFAULT_LOOKBACK
