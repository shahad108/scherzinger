"""Redis-backed EventBus — placeholder.

Phase 0 ships the in-process bus only. When we move to multi-worker
uvicorn / multi-pod deployments (Phase 5+ for collab) we'll back this
with Redis pub/sub. The shape is locked-in via ``services.events.EventBus``.
"""
from __future__ import annotations

from typing import AsyncIterator, Optional

from backend.services.events import (
    DEFAULT_QUEUE_SIZE,
    Event,
    EventBus,
)


class RedisEventBus(EventBus):
    """Future Redis-backed pub/sub. Not yet implemented.

    Implementation contract (for the follow-up PR):
      - publish() XADDs to ``stream:{topic}`` and PUBLISHes a thin
        notification on a control channel so subscribers wake up.
      - subscribe() XREAD-blocks on the matching streams, then yields
        ``Event``s decoded from JSON. Topic patterns map to a fanout
        across the matching streams.
      - aid/cluster filters apply *after* decode (cheap) — we don't
        partition streams on aid because it would explode key cardinality.
    """

    def __init__(self, url: str) -> None:
        self.url = url

    async def publish(
        self,
        topic: str,
        payload: dict,
        *,
        aid: Optional[str] = None,
        cluster: Optional[str] = None,
    ) -> None:
        raise NotImplementedError("RedisEventBus is a placeholder — Phase 1+ work.")

    def subscribe(
        self,
        topic_pattern: str,
        *,
        aid: Optional[str] = None,
        cluster: Optional[str] = None,
        queue_size: int = DEFAULT_QUEUE_SIZE,
    ) -> AsyncIterator[Event]:
        raise NotImplementedError("RedisEventBus is a placeholder — Phase 1+ work.")
