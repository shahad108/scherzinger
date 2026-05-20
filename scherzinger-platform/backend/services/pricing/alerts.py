"""Pricing Studio v3 / Phase 9 — alerts engine.

Three top-level entry points:

  - ``create_alert(spec, db_session) -> PricingAlert``
        Validate the discriminated-union spec, persist the row, return it.
  - ``evaluate_alerts(db_session) -> list[PricingAlertEvent]``
        Iterate every enabled alert, evaluate its trigger condition. On a
        firing condition, write a ``pricing_alert_events`` row, publish
        ``pricing.alerts.triggered`` on the SSE bus, fan out to the
        configured channels, and (best-effort) create an Action Center
        recommendation card with ``source=alert`` so the alert shows up
        in the Action Center as well as the bell-inbox.
  - ``get_alert_inbox(user_id, db_session) -> list[PricingAlertEvent]``
        Returns the user's recent triggered events ordered by
        ``triggered_at DESC``.

Specs are a Pydantic-v2 discriminated union over ``kind``. The Phase 9
plan ships seven kinds:

  cost_threshold
  competitor_undercut
  churn_spike
  floor_cross
  proposal_stuck
  pa_pr_surge
  cluster_db2_drop

Each spec carries scoping (``aid``/``cluster``/``family``), notification
``channels`` (subset of ``in_app|email|slack``), and ``created_by``.

Evaluation is deliberately stateless: the per-event payload captures
"current value vs threshold" so the inbox row is self-explanatory. We
don't try to debounce here — the runner in
``services/pricing/alerts_runner.py`` is responsible for the cadence
(hourly call from a periodic task — left as a TODO so we don't wire a
scheduler from inside the service module).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Any, Iterable, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.pricing.alerts import PricingAlert, PricingAlertEvent
from backend.services.events import publish_sync

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors / enums
# ---------------------------------------------------------------------------


class AlertError(Exception):
    """Base class for alert workflow errors."""


class AlertNotFoundError(AlertError):
    pass


class AlertChannel:
    IN_APP = "in_app"
    EMAIL = "email"
    SLACK = "slack"
    ALL = ("in_app", "email", "slack")


# ---------------------------------------------------------------------------
# Spec models — Pydantic-v2 discriminated union
# ---------------------------------------------------------------------------


class _AlertSpecBase(BaseModel):
    """Common fields shared by every kind."""

    model_config = ConfigDict(extra="forbid")

    aid: Optional[str] = None
    cluster: Optional[str] = None
    family: Optional[str] = None
    channels: list[str] = Field(default_factory=lambda: ["in_app"])
    created_by: str

    def scope_dict(self) -> dict[str, Optional[str]]:
        return {
            "scope_aid": self.aid,
            "scope_cluster": self.cluster,
            "scope_family": self.family,
        }


class CostThresholdAlert(_AlertSpecBase):
    """Fire when ``unit_cost`` moves ≥ ``pct`` over the trailing ``days``."""

    kind: Literal["cost_threshold"] = "cost_threshold"
    pct: Decimal = Field(gt=Decimal("0"))
    days: int = Field(gt=0)


class CompetitorUndercutAlert(_AlertSpecBase):
    """Fire when competitor_ref drops below our price by ``pct`` (or more)."""

    kind: Literal["competitor_undercut"] = "competitor_undercut"
    pct: Decimal = Field(gt=Decimal("0"))


class ChurnSpikeAlert(_AlertSpecBase):
    """Fire when a customer's ``churn_p`` rises by ≥ ``pp`` (percentage points)."""

    kind: Literal["churn_spike"] = "churn_spike"
    pp: Decimal = Field(gt=Decimal("0"))


class FloorCrossAlert(_AlertSpecBase):
    """Fire when the recommended price ≤ floor for the alert's scope SKU."""

    kind: Literal["floor_cross"] = "floor_cross"


class ProposalStuckAlert(_AlertSpecBase):
    """Fire when a proposal sits in ``pending_approval`` for > ``days``."""

    kind: Literal["proposal_stuck"] = "proposal_stuck"
    days: int = Field(gt=0)


class PaPrSurgeAlert(_AlertSpecBase):
    """Fire when PA/PR rejection count for a SKU exceeds ``count`` in ``days``."""

    kind: Literal["pa_pr_surge"] = "pa_pr_surge"
    count: int = Field(gt=0)
    days: int = Field(gt=0)


class ClusterDb2DropAlert(_AlertSpecBase):
    """Fire when weekly cluster DB2 falls ≥ ``pp`` (percentage points)."""

    kind: Literal["cluster_db2_drop"] = "cluster_db2_drop"
    pp: Decimal = Field(gt=Decimal("0"))


AlertSpec = Annotated[
    CostThresholdAlert
    | CompetitorUndercutAlert
    | ChurnSpikeAlert
    | FloorCrossAlert
    | ProposalStuckAlert
    | PaPrSurgeAlert
    | ClusterDb2DropAlert,
    Field(discriminator="kind"),
]


class _SpecEnvelope(BaseModel):
    """Helper for parsing untyped dict payloads back into the right kind."""

    model_config = ConfigDict(extra="forbid")
    spec: AlertSpec


def parse_spec(payload: dict[str, Any]) -> AlertSpec:
    """Parse a raw payload dict into the right ``AlertSpec`` subclass.

    Used by the API layer to lift JSON into the discriminated union.
    """
    return _SpecEnvelope(spec=payload).spec  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Channel validation
# ---------------------------------------------------------------------------


def _normalize_channels(channels: Iterable[str]) -> list[str]:
    valid = set(AlertChannel.ALL)
    out: list[str] = []
    for ch in channels:
        if ch not in valid:
            raise ValueError(f"unsupported channel: {ch!r}")
        if ch not in out:
            out.append(ch)
    if not out:
        out = [AlertChannel.IN_APP]
    return out


# ---------------------------------------------------------------------------
# create_alert
# ---------------------------------------------------------------------------


def create_alert(spec: AlertSpec, db_session: Session) -> PricingAlert:
    """Persist a validated alert spec.

    ``spec`` must already be one of the discriminated-union subclasses
    (call ``parse_spec`` first if you only have a dict).
    """
    if not isinstance(spec, _AlertSpecBase):
        raise TypeError(
            f"spec must be an AlertSpec subclass, got {type(spec).__name__}"
        )
    channels = _normalize_channels(spec.channels)

    # ``model_dump`` keeps the ``kind`` discriminator + every spec-specific
    # field. We store the whole thing as ``spec_json`` so the evaluator
    # can rehydrate without re-deriving the type from columns.
    spec_dict = spec.model_dump(mode="json")
    # Don't double-store scope/channels — the dedicated columns own that.
    for key in ("aid", "cluster", "family", "channels", "created_by"):
        spec_dict.pop(key, None)

    row = PricingAlert(
        kind=spec.kind,
        spec_json=spec_dict,
        scope_aid=spec.aid,
        scope_cluster=spec.cluster,
        scope_family=spec.family,
        channels=channels,
        created_by=spec.created_by,
        enabled=True,
    )
    db_session.add(row)
    db_session.flush()
    return row


def disable_alert(alert_id: UUID, db_session: Session) -> PricingAlert:
    """Flip ``enabled`` to ``False`` (soft-delete)."""
    row = db_session.get(PricingAlert, alert_id)
    if row is None:
        raise AlertNotFoundError(f"alert {alert_id} not found")
    row.enabled = False
    db_session.flush()
    return row


def get_alert(alert_id: UUID, db_session: Session) -> PricingAlert:
    row = db_session.get(PricingAlert, alert_id)
    if row is None:
        raise AlertNotFoundError(f"alert {alert_id} not found")
    return row


def list_alerts_for_user(
    user_id: str, db_session: Session, *, include_disabled: bool = False
) -> list[PricingAlert]:
    stmt = select(PricingAlert).where(PricingAlert.created_by == user_id)
    if not include_disabled:
        stmt = stmt.where(PricingAlert.enabled.is_(True))
    stmt = stmt.order_by(PricingAlert.created_at.desc())
    return list(db_session.execute(stmt).scalars())


# ---------------------------------------------------------------------------
# Spec rehydration — dict → AlertSpec
# ---------------------------------------------------------------------------


def _rehydrate_spec(row: PricingAlert) -> AlertSpec:
    """Reassemble the discriminated-union spec from a DB row."""
    payload: dict[str, Any] = {
        "kind": row.kind,
        **(row.spec_json or {}),
        "aid": row.scope_aid,
        "cluster": row.scope_cluster,
        "family": row.scope_family,
        "channels": list(row.channels or []),
        "created_by": row.created_by,
    }
    return parse_spec(payload)


# ---------------------------------------------------------------------------
# Trigger evaluators — one function per kind
# ---------------------------------------------------------------------------


def _eval_cost_threshold(
    spec: CostThresholdAlert, db_session: Session
) -> Optional[dict[str, Any]]:
    """Return a payload dict if the trigger fires, else ``None``."""
    if not spec.aid:
        return None
    from backend.models.pricing.cost_state import CostStateRow

    row = db_session.get(CostStateRow, spec.aid)
    if row is None or not row.trajectory_30d:
        return None

    cutoff = datetime.now(timezone.utc) - timedelta(days=spec.days)
    baseline: Optional[Decimal] = None
    for pt in row.trajectory_30d:
        # trajectory entries are dicts with "at" + "unit_cost".
        at_raw = pt.get("at") if isinstance(pt, dict) else None
        uc_raw = pt.get("unit_cost") if isinstance(pt, dict) else None
        if not at_raw or uc_raw is None:
            continue
        try:
            at = datetime.fromisoformat(str(at_raw).replace("Z", "+00:00"))
        except ValueError:
            continue
        if at.tzinfo is None:
            at = at.replace(tzinfo=timezone.utc)
        if at <= cutoff:
            baseline = Decimal(str(uc_raw))
        else:
            # First point AFTER the cutoff — use the most recent prior
            # baseline if we've seen one; otherwise fall back to this.
            if baseline is None:
                baseline = Decimal(str(uc_raw))
            break
    if baseline is None or baseline <= 0:
        return None

    current = Decimal(row.unit_cost)
    pct_move = (current - baseline) / baseline * Decimal("100")
    if pct_move >= spec.pct:
        return {
            "aid": spec.aid,
            "baseline_unit_cost": str(baseline),
            "current_unit_cost": str(current),
            "pct_move": str(pct_move.quantize(Decimal("0.01"))),
            "threshold_pct": str(spec.pct),
            "days": spec.days,
        }
    return None


def _eval_competitor_undercut(
    spec: CompetitorUndercutAlert, db_session: Session
) -> Optional[dict[str, Any]]:
    if not spec.aid:
        return None
    from backend.models.pricing.pricing_state import PriceStateRow
    from backend.services.competitor.index import build_competitor_ref

    price = db_session.get(PriceStateRow, spec.aid)
    if price is None:
        return None
    try:
        ref = build_competitor_ref(aid=spec.aid, n_days=90, db_session=db_session)
    except Exception:
        logger.exception("alerts._eval_competitor_undercut competitor_ref failed")
        return None
    if ref is None or ref.median_price is None:
        return None

    competitor = Decimal(ref.median_price)
    ours = Decimal(price.current_price)
    if ours <= 0:
        return None
    undercut_pct = (ours - competitor) / ours * Decimal("100")
    if undercut_pct >= spec.pct:
        return {
            "aid": spec.aid,
            "our_price": str(ours),
            "competitor_median": str(competitor),
            "undercut_pct": str(undercut_pct.quantize(Decimal("0.01"))),
            "threshold_pct": str(spec.pct),
            "sample_count": ref.sample_count,
        }
    return None


def _eval_churn_spike(
    spec: ChurnSpikeAlert, db_session: Session
) -> Optional[dict[str, Any]]:
    """Fire when any customer on the scope SKU has churn_p ≥ threshold.

    The spec carries a ``pp`` threshold expressed in percentage points
    (0-100). We compare against the stored 0..1 ``churn_p`` value after
    converting.
    """
    if not spec.aid:
        return None
    from backend.models.pricing.customer_on_sku import CustomerOnSkuRow

    rows = (
        db_session.query(CustomerOnSkuRow)
        .filter(
            CustomerOnSkuRow.aid == spec.aid,
            CustomerOnSkuRow.churn_p.isnot(None),
        )
        .all()
    )
    threshold = spec.pp / Decimal("100")
    triggered = [
        {
            "customer_id": r.customer_id,
            "churn_p": str(Decimal(r.churn_p)),
        }
        for r in rows
        if Decimal(r.churn_p) >= threshold
    ]
    if triggered:
        return {
            "aid": spec.aid,
            "threshold_pp": str(spec.pp),
            "customers": triggered,
        }
    return None


def _eval_floor_cross(
    spec: FloorCrossAlert, db_session: Session
) -> Optional[dict[str, Any]]:
    """Fire when the recommended price ≤ floor for the scope SKU.

    We approximate the "recommended price" with the current ``price_state``
    target. The full recommendation derivation lives in
    ``services.pricing.recommendation`` and is too expensive to compute
    per alert per tick — the cheaper check here covers the realistic
    case (publish dropped the price below floor or floor moved up).
    """
    if not spec.aid:
        return None
    from backend.models.pricing.pricing_state import PriceStateRow

    row = db_session.get(PriceStateRow, spec.aid)
    if row is None or row.floor is None:
        return None
    current = Decimal(row.current_price)
    floor = Decimal(row.floor)
    if current <= floor:
        return {
            "aid": spec.aid,
            "current_price": str(current),
            "floor": str(floor),
        }
    return None


def _eval_proposal_stuck(
    spec: ProposalStuckAlert, db_session: Session
) -> Optional[dict[str, Any]]:
    """Fire for any proposal stuck in ``pending_approval`` longer than ``days``."""
    from backend.models import PricingProposal

    cutoff = datetime.now(timezone.utc) - timedelta(days=spec.days)
    q = db_session.query(PricingProposal).filter(
        PricingProposal.status == "pending_approval",
        PricingProposal.updated_at <= cutoff.replace(tzinfo=None),
    )
    if spec.aid:
        q = q.filter(PricingProposal.article_id == spec.aid)
    proposals = q.all()
    if not proposals:
        return None
    return {
        "threshold_days": spec.days,
        "stuck_proposals": [
            {
                "proposal_id": str(p.id),
                "aid": p.article_id,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in proposals
        ],
    }


def _eval_pa_pr_surge(
    spec: PaPrSurgeAlert, db_session: Session
) -> Optional[dict[str, Any]]:
    """Fire when PA/PR rejection count in the window exceeds threshold."""
    if not spec.aid:
        return None
    from backend.models.quote import Quote

    cutoff = (datetime.now(timezone.utc) - timedelta(days=spec.days)).date()
    cnt = (
        db_session.query(Quote)
        .filter(
            Quote.article_id == spec.aid,
            Quote.rejection_code.in_(("PA", "PR")),
            Quote.date >= cutoff,
        )
        .count()
    )
    if cnt > spec.count:
        return {
            "aid": spec.aid,
            "rejection_count": cnt,
            "threshold_count": spec.count,
            "days": spec.days,
        }
    return None


def _eval_cluster_db2_drop(
    spec: ClusterDb2DropAlert, db_session: Session
) -> Optional[dict[str, Any]]:
    """Fire when the cluster's weekly DB2 margin falls ≥ ``pp`` (percentage points).

    Compares trailing 7 days vs the 7 days before that for quotes in the
    given cluster (commodity_group). ``db2_margin`` on the quote row is
    already a ratio (0..1).
    """
    cluster = spec.cluster
    if not cluster:
        return None
    from backend.models.quote import Quote

    now_date = datetime.now(timezone.utc).date()
    last_week_start = now_date - timedelta(days=7)
    prior_week_start = now_date - timedelta(days=14)

    def _avg(start, end) -> Optional[Decimal]:
        rows = (
            db_session.query(Quote.db2_margin)
            .filter(
                Quote.commodity_group == cluster,
                Quote.date >= start,
                Quote.date < end,
                Quote.db2_margin.isnot(None),
            )
            .all()
        )
        vals = [Decimal(str(r[0])) for r in rows if r[0] is not None]
        if not vals:
            return None
        return sum(vals, Decimal("0")) / Decimal(len(vals))

    last = _avg(last_week_start, now_date)
    prior = _avg(prior_week_start, last_week_start)
    if last is None or prior is None:
        return None

    drop_pp = (prior - last) * Decimal("100")  # both ratios → pp
    if drop_pp >= spec.pp:
        return {
            "cluster": cluster,
            "last_week_db2": str(last.quantize(Decimal("0.0001"))),
            "prior_week_db2": str(prior.quantize(Decimal("0.0001"))),
            "drop_pp": str(drop_pp.quantize(Decimal("0.01"))),
            "threshold_pp": str(spec.pp),
        }
    return None


_EVALUATORS = {
    "cost_threshold": _eval_cost_threshold,
    "competitor_undercut": _eval_competitor_undercut,
    "churn_spike": _eval_churn_spike,
    "floor_cross": _eval_floor_cross,
    "proposal_stuck": _eval_proposal_stuck,
    "pa_pr_surge": _eval_pa_pr_surge,
    "cluster_db2_drop": _eval_cluster_db2_drop,
}


def evaluate_single(
    spec: AlertSpec, db_session: Session
) -> Optional[dict[str, Any]]:
    """Evaluate the trigger for a single spec; return payload if it fires."""
    fn = _EVALUATORS.get(spec.kind)
    if fn is None:
        logger.warning("alerts.evaluate_single: no evaluator for kind=%s", spec.kind)
        return None
    try:
        return fn(spec, db_session)  # type: ignore[arg-type]
    except Exception:
        logger.exception("alerts.evaluate_single failed kind=%s", spec.kind)
        return None


# ---------------------------------------------------------------------------
# Channel dispatch
# ---------------------------------------------------------------------------


def _dispatch_channels(
    *,
    alert: PricingAlert,
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    """Stub channel dispatch.

    ``in_app`` is satisfied by the SSE publish + inbox row. Email + Slack
    reuse the Phase 7 stub connectors so behaviour stays consistent.

    Returns a per-channel result list shaped like the publish notification
    fan-out so the inbox/audit row tells one story.
    """
    from backend.services.pricing.notifications import send_email, send_slack_dm

    now = datetime.now(timezone.utc).isoformat()
    results: list[dict[str, Any]] = []
    for ch in alert.channels or []:
        if ch == AlertChannel.IN_APP:
            results.append(
                {
                    "channel": "in_app",
                    "recipient": alert.created_by,
                    "status": "sent",
                    "dispatched_at": now,
                }
            )
        elif ch == AlertChannel.EMAIL:
            try:
                results.append(
                    send_email(
                        alert.created_by,
                        subject=f"[Pryzm] {alert.kind} alert",
                        body=str(payload),
                    )
                )
            except Exception as exc:  # pragma: no cover - best-effort
                logger.exception("alerts._dispatch_channels email failed")
                results.append(
                    {
                        "channel": "email",
                        "recipient": alert.created_by,
                        "status": "failed",
                        "error": str(exc),
                        "dispatched_at": now,
                    }
                )
        elif ch == AlertChannel.SLACK:
            try:
                results.append(
                    send_slack_dm(alert.created_by, f"[Pryzm] {alert.kind}")
                )
            except Exception as exc:  # pragma: no cover - best-effort
                logger.exception("alerts._dispatch_channels slack failed")
                results.append(
                    {
                        "channel": "slack",
                        "recipient": alert.created_by,
                        "status": "failed",
                        "error": str(exc),
                        "dispatched_at": now,
                    }
                )
    return results


# ---------------------------------------------------------------------------
# Action Center bridge — create a recommendation card from a fired alert
# ---------------------------------------------------------------------------


def _create_action_center_card(
    *, alert: PricingAlert, event: PricingAlertEvent, db_session: Session
) -> None:
    """Best-effort: create a recommendation card from a triggered alert.

    Uses ``workflow_service.ensure_recommendation`` so the card is keyed
    by a stable ``source_ref`` (``alert:<alert_id>:<event_id>``). The
    Action Center read path picks it up via the existing
    recommendation pipeline.

    Wrapped in a SAVEPOINT so a failure here (e.g. FK violation when the
    alert's ``created_by`` isn't a real users.id) doesn't poison the
    outer transaction. The alert event itself is the source of truth.
    """
    from uuid import UUID as _UUID

    # ``ensure_recommendation`` requires an actor user UUID. The
    # alert's ``created_by`` is a string — try to coerce, otherwise
    # synthesise a zero-UUID so the card still lands.
    try:
        actor_uuid = _UUID(alert.created_by)
    except (ValueError, AttributeError):
        actor_uuid = _UUID("00000000-0000-0000-0000-000000000000")

    scope_aid = alert.scope_aid or (
        event.payload.get("aid") if isinstance(event.payload, dict) else None
    )
    body: dict[str, Any] = {
        "source_kind": "alert",
        "source_ref": f"alert:{alert.id}:{event.id}",
        "article_id": scope_aid,
        "cluster": alert.scope_cluster,
        "title": f"Alert: {alert.kind}",
        "headline": f"Alert fired: {alert.kind}",
        "after": {
            "alert_id": str(alert.id),
            "alert_event_id": str(event.id),
            "kind": alert.kind,
            "payload": event.payload,
            "source": "alert",
        },
        "authority": "alerts-engine",
    }

    from backend.services import workflow_service

    # Nested transaction (SAVEPOINT) so a bridge failure rolls back only
    # the recommendation insert, not the alert event row we already wrote.
    try:
        with db_session.begin_nested():
            workflow_service.ensure_recommendation(
                db_session, body=body, actor_user_id=actor_uuid
            )
    except Exception:
        logger.exception(
            "alerts._create_action_center_card failed alert_id=%s", alert.id
        )


# ---------------------------------------------------------------------------
# evaluate_alerts — the periodic-task entry point
# ---------------------------------------------------------------------------


def evaluate_alerts(db_session: Session) -> list[PricingAlertEvent]:
    """Iterate every enabled alert, evaluate triggers, fire on hits.

    Returns the list of ``PricingAlertEvent`` rows that were written
    during this pass.
    """
    stmt = select(PricingAlert).where(PricingAlert.enabled.is_(True))
    rows = list(db_session.execute(stmt).scalars())
    fired: list[PricingAlertEvent] = []
    for alert in rows:
        try:
            spec = _rehydrate_spec(alert)
        except Exception:
            logger.exception("alerts.evaluate_alerts: spec rehydrate failed id=%s", alert.id)
            continue
        payload = evaluate_single(spec, db_session)
        if payload is None:
            continue
        event = _fire_alert(alert=alert, payload=payload, db_session=db_session)
        fired.append(event)
    return fired


def _fire_alert(
    *,
    alert: PricingAlert,
    payload: dict[str, Any],
    db_session: Session,
) -> PricingAlertEvent:
    """Persist a ``pricing_alert_events`` row + run side effects."""
    event = PricingAlertEvent(
        alert_id=alert.id,
        payload=payload,
        channels_dispatched=[],
    )
    db_session.add(event)
    db_session.flush()

    dispatched = _dispatch_channels(alert=alert, payload=payload)
    event.channels_dispatched = dispatched
    db_session.flush()

    # Best-effort SSE publish — must not raise into the runner.
    try:
        publish_sync(
            "pricing.alerts.triggered",
            {
                "alert_id": str(alert.id),
                "event_id": str(event.id),
                "kind": alert.kind,
                "aid": alert.scope_aid,
                "cluster": alert.scope_cluster,
                "family": alert.scope_family,
                "payload": payload,
                "channels_dispatched": dispatched,
                "triggered_at": (
                    event.triggered_at.isoformat()
                    if event.triggered_at is not None
                    else None
                ),
            },
            aid=alert.scope_aid,
            cluster=alert.scope_cluster,
        )
    except RuntimeError:
        # publish_sync refuses to run inside a live event loop. The
        # runner is sync; tests that drive evaluate_alerts inside an
        # async context can await publish themselves.
        logger.debug("alerts._fire_alert: publish_sync inside loop, skipping")
    except Exception:
        logger.exception("alerts._fire_alert: SSE publish failed")

    # Best-effort: create an Action Center recommendation card.
    _create_action_center_card(alert=alert, event=event, db_session=db_session)

    return event


# ---------------------------------------------------------------------------
# Inbox read path
# ---------------------------------------------------------------------------


def get_alert_inbox(
    user_id: str,
    db_session: Session,
    *,
    limit: int = 100,
) -> list[PricingAlertEvent]:
    """Return the user's recent triggered events, newest first.

    Cross-joins ``pricing_alert_events`` with ``pricing_alerts`` to filter
    by ``created_by`` — the alert's owner is the inbox owner.
    """
    stmt = (
        select(PricingAlertEvent)
        .join(PricingAlert, PricingAlertEvent.alert_id == PricingAlert.id)
        .where(PricingAlert.created_by == user_id)
        .order_by(PricingAlertEvent.triggered_at.desc())
        .limit(limit)
    )
    return list(db_session.execute(stmt).scalars())
