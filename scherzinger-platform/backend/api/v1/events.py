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
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from backend.auth.security import AuthContext, require_auth
from backend.services.events import DEFAULT_QUEUE_SIZE, InProcessEventBus, get_bus

router = APIRouter(prefix="/events", tags=["events"])

HEARTBEAT_SECONDS = 15.0


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

    # Prime: tell the client the stream is alive so EventSource fires `onopen`
    # before the first real event.
    yield b": stream opened\n\n"

    last_beat = asyncio.get_event_loop().time()
    try:
        while True:
            if await request.is_disconnected():
                break

            now = asyncio.get_event_loop().time()
            timeout = max(0.05, HEARTBEAT_SECONDS - (now - last_beat))
            event = await subscription.next(timeout=timeout)
            if event is None:
                yield b": heartbeat\n\n"
                last_beat = asyncio.get_event_loop().time()
                continue

            payload = {
                "topic": event.topic,
                "aid": event.aid,
                "cluster": event.cluster,
                "ts": event.ts,
                "payload": event.payload,
            }
            yield _sse_format(event.ts, payload).encode("utf-8")
            last_beat = asyncio.get_event_loop().time()
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
    _ = ctx  # auth-gated; ctx unused for now but available for ACL extension.
    return StreamingResponse(
        _stream(request=request, topic=topic, aid=aid, cluster=cluster),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",  # tell nginx not to buffer.
            "Connection": "keep-alive",
        },
    )
