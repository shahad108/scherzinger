"""Pricing Studio v3 — Server-Sent Events stream.

Endpoint: ``GET /api/v1/events/stream?topic=pricing&aid=&cluster=``

Returns a ``text/event-stream`` body keep-alive'd by a heartbeat comment
every 15s. Topic is a prefix or fnmatch glob (``pricing``, ``pricing.*``,
``pricing.price_set``). aid + cluster are optional inclusion filters
applied server-side before fan-out.

Auth: reuses the cookie-based ``require_auth`` dependency that every
other Phase 2+ endpoint relies on.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from backend.auth.security import AuthContext, require_auth
from backend.services.events import DEFAULT_QUEUE_SIZE, InProcessEventBus, get_bus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])

HEARTBEAT_SECONDS = 15.0
# Hard lifetime cap per stream. Half-open TCP sessions can keep a
# subscription alive past the OS keepalive window otherwise. Clients
# auto-reconnect on close, so capping at one hour is a safe ceiling.
MAX_STREAM_SECONDS = 3600.0


def _sse_format(event_id: float, payload: dict) -> str:
    """Format a single SSE message. We use a synthetic id = ts for replay."""
    return f"id: {event_id}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


async def _stream(
    *,
    request: Request,
    topic: str,
    aid: Optional[str],
    cluster: Optional[str],
) -> AsyncIterator[bytes]:
    bus = get_bus()
    # In-process bus exposes a sync ``open_subscription`` so we register the
    # subscriber *before* yielding any bytes — otherwise events published in
    # the brief window between the prime line and the first await would be
    # dropped. The Redis bus will surface the same shape in Phase 1+.
    if isinstance(bus, InProcessEventBus):
        subscription = bus.open_subscription(
            topic,
            aid=aid,
            cluster=cluster,
            queue_size=DEFAULT_QUEUE_SIZE,
        )
    else:  # pragma: no cover — covered by Phase 1+ Redis tests
        raise RuntimeError(
            "Non in-process EventBus must implement open_subscription()."
        )

    # ``finally`` MUST close the subscription regardless of which branch
    # exits — disconnect, lifetime cap, exception, normal completion.
    try:
        # Prime: tell the client the stream is alive so EventSource fires
        # `onopen` before the first real event.
        yield b": stream opened\n\n"
        # Even the prime byte can race a fast unmount; bail if so.
        if await request.is_disconnected():
            return

        loop = asyncio.get_event_loop()
        opened_at = loop.time()
        last_beat = opened_at
        last_drop_warn_at = 0.0
        announced_drops = subscription.sub.dropped

        while True:
            # Hard lifetime cap. Clients reconnect transparently on close.
            elapsed = loop.time() - opened_at
            if elapsed >= MAX_STREAM_SECONDS:
                break

            if await request.is_disconnected():
                break

            now = loop.time()
            timeout = max(0.05, HEARTBEAT_SECONDS - (now - last_beat))
            # Also clamp the timeout to whatever is left in the lifetime
            # window so the cap fires within at most one event-cycle.
            timeout = min(timeout, MAX_STREAM_SECONDS - elapsed)
            event = await subscription.next(timeout=timeout)

            # If a drop happened since the last successful send, surface it
            # as a control comment so the client can full-refresh.
            current_dropped = subscription.sub.dropped
            if current_dropped > announced_drops:
                missed = current_dropped - announced_drops
                yield f": dropped {missed} events\n\n".encode("utf-8")
                announced_drops = current_dropped
                if now - last_drop_warn_at >= 1.0:
                    logger.warning(
                        "sse subscription %s dropped %d events (total=%d)",
                        id(subscription.sub),
                        missed,
                        current_dropped,
                    )
                    last_drop_warn_at = now
                # check disconnect after this control yield too
                if await request.is_disconnected():
                    break

            if event is None:
                yield b": heartbeat\n\n"
                last_beat = loop.time()
                if await request.is_disconnected():
                    break
                continue

            payload = {
                "topic": event.topic,
                "aid": event.aid,
                "cluster": event.cluster,
                "ts": event.ts,
                "payload": event.payload,
            }
            yield _sse_format(event.ts, payload).encode("utf-8")
            last_beat = loop.time()
            if await request.is_disconnected():
                break
    finally:
        subscription.close()


@router.get("/stream")
async def events_stream(
    request: Request,
    topic: str = Query(default="pricing", description="Topic pattern; prefix or fnmatch glob."),
    aid: Optional[str] = Query(default=None),
    cluster: Optional[str] = Query(default=None),
    ctx: AuthContext = Depends(require_auth),
):
    """SSE: live pricing events scoped by topic / aid / cluster."""
    # Audit every subscribe so abuse is traceable. Full role-scoped ACL is
    # a later-phase concern; here we only need the breadcrumb trail.
    actor_id = getattr(ctx, "user_id", None) or getattr(ctx, "user", None) or "anon"
    logger.info(
        "sse subscribe actor=%s topic=%s aid=%s cluster=%s",
        actor_id,
        topic,
        aid,
        cluster,
    )
    return StreamingResponse(
        _stream(request=request, topic=topic, aid=aid, cluster=cluster),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # tell nginx not to buffer.
            "Connection": "keep-alive",
        },
    )
