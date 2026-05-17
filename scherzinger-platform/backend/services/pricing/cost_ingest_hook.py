"""Pricing Studio v3 / Phase 3.2.6 — cost-ingest live wiring.

When a cost mutation lands for an SKU (ETL batch, manual override, etc.),
call ``on_cost_changed(aid)`` to:

  1. Invalidate the per-(aid) option_margin / cost_outlook caches.
  2. Publish ``pricing.cost_moved`` so the SSE-driven query-invalidation
     pipeline refreshes any open Studio session.
  3. Request a downstream ``pricing.recommendation_recompute_requested``
     so the recommender re-runs with the new cost (a subscriber in
     ``services.pricing.recommendation`` handles the actual recompute —
     today that's the existing ``recompute(aid)`` path).

This hook is intentionally synchronous and best-effort — if the SSE bus
isn't available we still return cleanly so the ingest pipeline doesn't
block. All errors are logged for ops visibility.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def on_cost_changed(
    aid: str,
    *,
    breakdown_changed: bool = True,
    new_unit_cost: Optional[str] = None,
) -> None:
    """Publish cost-moved + recompute-requested events for ``aid``.

    ``new_unit_cost`` (stringified Decimal) is forwarded on the
    ``pricing.cost_moved`` payload so the UI can render the new value
    optimistically while the cache invalidation propagates.
    """
    # Drop both downstream caches first so any racing query lookups read
    # fresh data even if the SSE publish is slow.
    try:
        from backend.services.pricing.cost_outlook import invalidate_cache as _invalidate_cost_outlook
        _invalidate_cost_outlook(aid)
    except Exception:
        logger.exception("cost_ingest_hook.invalidate cost_outlook aid=%s", aid)

    # Customer fanout & drill-in are price-keyed (not cost-keyed) so we
    # don't drop them — but the recommendation recompute will publish
    # ``pricing.recommendation_updated`` which the frontend already wires
    # to invalidate fanout.

    payload: dict[str, Any] = {"aid": aid}
    if new_unit_cost is not None:
        payload["unit_cost"] = new_unit_cost
    if breakdown_changed:
        payload["breakdown_changed"] = True

    try:
        from backend.services.events import publish_sync

        publish_sync("pricing.cost_moved", payload, aid=aid)
    except Exception:
        logger.exception("cost_ingest_hook.publish cost_moved aid=%s", aid)

    # The recommendation recompute is a follow-up; for now publish the
    # request event and let the recommendation subscriber handle it.
    try:
        from backend.services.events import publish_sync

        publish_sync(
            "pricing.recommendation_recompute_requested",
            {"aid": aid, "trigger": "cost_moved"},
            aid=aid,
        )
    except Exception:
        logger.exception(
            "cost_ingest_hook.publish recommendation_recompute_requested aid=%s",
            aid,
        )
