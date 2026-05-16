"""In-process pub/sub event bus for Pricing Studio v3 live updates.

Topic conventions (Phase 0 — extended in later phases):
  pricing.price_set
  pricing.cost_moved
  pricing.proposal_created
  pricing.proposal_approved
  pricing.proposal_rejected
  pricing.alert_triggered
  pricing.ab_test_*

Each subscriber gets its own bounded ``asyncio.Queue`` (size 100). On
overflow the oldest event is dropped — clients reconnect and re-fetch
the canonical state. Topics are matched by prefix or fnmatch-style glob
(``pricing.*``); aid + cluster filters are applied before fan-out so
fan-out is cheap.

The ``EventBus`` ABC lets us swap in a Redis backplane later without
touching call sites. ``redis_bus.py`` is a placeholder stub.
"""
from __future__ import annotations

import abc
import asyncio
import fnmatch
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Optional

logger = logging.getLogger(__name__)

DEFAULT_QUEUE_SIZE = 100


def _make_id_gen():
    n = 0
    while True:
        n += 1
        yield n


_SUB_ID_GEN = _make_id_gen()


@dataclass
class Event:
    """A single published event."""

    topic: str
    ts: float
    payload: dict
    aid: Optional[str] = None
    cluster: Optional[str] = None

    def matches(
        self,
        *,
        topic_pattern: str,
        aid: Optional[str] = None,
        cluster: Optional[str] = None,
    ) -> bool:
        if not fnmatch.fnmatchcase(self.topic, topic_pattern) and not self.topic.startswith(
            topic_pattern
        ):
            return False
        if aid is not None and self.aid is not None and aid != self.aid:
            return False
        if cluster is not None and self.cluster is not None and cluster != self.cluster:
            return False
        return True


@dataclass
class _Subscriber:
    queue: asyncio.Queue
    loop: asyncio.AbstractEventLoop
    topic_pattern: str
    aid: Optional[str] = None
    cluster: Optional[str] = None
    dropped: int = 0
    # Stable id for log correlation across drop warnings.
    id: int = field(default_factory=lambda: next(_SUB_ID_GEN))
    # Monotonic timestamp of the most-recent drop warning emitted for
    # this subscriber. Rate-limited to once per second.
    _last_drop_log_at: float = 0.0


class EventBus(abc.ABC):
    """Abstract event bus. Two impls: in-process (default) + future Redis."""

    @abc.abstractmethod
    async def publish(
        self,
        topic: str,
        payload: dict,
        *,
        aid: Optional[str] = None,
        cluster: Optional[str] = None,
    ) -> None: ...

    @abc.abstractmethod
    def subscribe(
        self,
        topic_pattern: str,
        *,
        aid: Optional[str] = None,
        cluster: Optional[str] = None,
        queue_size: int = DEFAULT_QUEUE_SIZE,
    ) -> AsyncIterator[Event]: ...


class InProcessEventBus(EventBus):
    """Default single-process bus. Suitable for one uvicorn worker.

    Production with multiple workers should swap to RedisEventBus (Phase 1+).
    """

    def __init__(self) -> None:
        self._subscribers: list[_Subscriber] = []
        # threading.Lock — publishers may originate from any loop/thread.
        self._lock = threading.Lock()

    def _deliver_sync(self, sub: _Subscriber, event: Event) -> None:
        """Deliver an event to one subscriber from inside its own loop.

        Scheduled via ``call_soon_threadsafe`` so publishers from another
        thread / loop wake the consumer correctly.
        """
        try:
            sub.queue.put_nowait(event)
            return
        except asyncio.QueueFull:
            try:
                sub.queue.get_nowait()
                sub.dropped += 1
                sub.queue.put_nowait(event)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                sub.dropped += 1
        # Rate-limited drop warning: at most one log per subscriber per
        # second so a runaway publisher doesn't drown the log stream.
        now = time.monotonic()
        if now - sub._last_drop_log_at >= 1.0:
            logger.warning(
                "event bus dropped event on subscription %s (total dropped=%d)",
                sub.id,
                sub.dropped,
            )
            sub._last_drop_log_at = now

    async def publish(
        self,
        topic: str,
        payload: dict,
        *,
        aid: Optional[str] = None,
        cluster: Optional[str] = None,
    ) -> None:
        event = Event(topic=topic, ts=time.time(), payload=payload, aid=aid, cluster=cluster)
        # Snapshot subscribers under lock; deliver outside it so a slow
        # consumer never blocks the publisher.
        with self._lock:
            snapshot = list(self._subscribers)
        for sub in snapshot:
            if not event.matches(
                topic_pattern=sub.topic_pattern, aid=sub.aid, cluster=sub.cluster
            ):
                continue
            # Cross-loop safe: schedule onto the subscriber's loop. If the
            # publisher is already on the same loop this is still correct
            # (and barely slower).
            try:
                sub.loop.call_soon_threadsafe(self._deliver_sync, sub, event)
            except RuntimeError:
                # Loop is closed — subscriber will be cleaned up on its
                # generator's finally block.
                pass

    def _register(self, sub: _Subscriber) -> None:
        with self._lock:
            self._subscribers.append(sub)

    def _unregister(self, sub: _Subscriber) -> None:
        with self._lock:
            try:
                self._subscribers.remove(sub)
            except ValueError:
                pass

    def open_subscription(
        self,
        topic_pattern: str,
        *,
        aid: Optional[str] = None,
        cluster: Optional[str] = None,
        queue_size: int = DEFAULT_QUEUE_SIZE,
    ) -> "_Subscription":
        """Synchronously register a subscriber and return a helper handle.

        Use this from the SSE handler so the subscription exists *before* the
        first ``yield`` — otherwise events published in the brief window
        between the prime line and the first ``await`` would be lost.
        """
        sub = _Subscriber(
            queue=asyncio.Queue(maxsize=queue_size),
            loop=asyncio.get_running_loop(),
            topic_pattern=topic_pattern,
            aid=aid,
            cluster=cluster,
        )
        self._register(sub)
        return _Subscription(bus=self, sub=sub)

    async def subscribe(
        self,
        topic_pattern: str,
        *,
        aid: Optional[str] = None,
        cluster: Optional[str] = None,
        queue_size: int = DEFAULT_QUEUE_SIZE,
    ) -> AsyncIterator[Event]:
        sub = _Subscriber(
            queue=asyncio.Queue(maxsize=queue_size),
            loop=asyncio.get_running_loop(),
            topic_pattern=topic_pattern,
            aid=aid,
            cluster=cluster,
        )
        self._register(sub)
        try:
            while True:
                event = await sub.queue.get()
                yield event
        finally:
            self._unregister(sub)

    # Test helper — not part of the EventBus contract.
    def _subscriber_count(self) -> int:
        return len(self._subscribers)


@dataclass
class _Subscription:
    """Helper handle returned by ``InProcessEventBus.open_subscription``.

    Wraps the registered ``_Subscriber`` with explicit ``next()`` and
    ``close()`` semantics so SSE handlers can register synchronously and
    iterate asynchronously without the async-generator's lazy registration
    race window.
    """

    bus: "InProcessEventBus"
    sub: _Subscriber
    _closed: bool = False

    async def next(self, *, timeout: Optional[float] = None) -> Optional[Event]:
        """Await the next event. Returns ``None`` on timeout."""
        if self._closed:
            raise StopAsyncIteration
        try:
            if timeout is None:
                return await self.sub.queue.get()
            return await asyncio.wait_for(self.sub.queue.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    def close(self) -> None:
        if not self._closed:
            self.bus._unregister(self.sub)
            self._closed = True


# Module-level singleton. Imported by api/v1/events.py + service callers.
_bus: EventBus = InProcessEventBus()


def get_bus() -> EventBus:
    """Return the active bus. Tests can swap via ``set_bus()``."""
    return _bus


def set_bus(bus: EventBus) -> None:
    """Replace the active bus (test seam / future Redis wiring)."""
    global _bus
    _bus = bus


async def publish(
    topic: str,
    payload: dict,
    *,
    aid: Optional[str] = None,
    cluster: Optional[str] = None,
) -> None:
    """Convenience: publish via the active bus."""
    await _bus.publish(topic, payload, aid=aid, cluster=cluster)


def publish_sync(
    topic: str,
    payload: dict,
    *,
    aid: Optional[str] = None,
    cluster: Optional[str] = None,
) -> None:
    """Sync façade for in-process bus.

    Cross-loop safe — fan-out uses ``call_soon_threadsafe`` per subscriber
    so callers from any thread can publish without spinning up an asyncio
    loop just to await ``publish()``. The Redis impl will override this
    with a sync XADD path.

    MUST NOT be called from inside a running event loop. If you have an
    ``await`` in scope, use ``await publish(...)`` — otherwise the
    ``asyncio.run(...)`` fallback below would crash, and on the
    in-process path you'd be issuing ``call_soon_threadsafe`` against
    your own loop while blocking it. This guard makes the misuse
    explicit instead of silently confusing.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # No running loop — safe to proceed. This is the intended path.
        pass
    else:
        raise RuntimeError(
            "publish_sync cannot be called from an async context — "
            "use `await publish(...)` instead"
        )

    bus = _bus
    if not isinstance(bus, InProcessEventBus):
        # Fall back to async path on non-in-process buses.
        asyncio.run(bus.publish(topic, payload, aid=aid, cluster=cluster))
        return
    event = Event(topic=topic, ts=time.time(), payload=payload, aid=aid, cluster=cluster)
    with bus._lock:
        snapshot = list(bus._subscribers)
    for sub in snapshot:
        if not event.matches(
            topic_pattern=sub.topic_pattern, aid=sub.aid, cluster=sub.cluster
        ):
            continue
        try:
            sub.loop.call_soon_threadsafe(bus._deliver_sync, sub, event)
        except RuntimeError:
            pass


def subscribe(
    topic_pattern: str,
    *,
    aid: Optional[str] = None,
    cluster: Optional[str] = None,
    queue_size: int = DEFAULT_QUEUE_SIZE,
) -> AsyncIterator[Event]:
    """Convenience: subscribe via the active bus."""
    return _bus.subscribe(
        topic_pattern,
        aid=aid,
        cluster=cluster,
        queue_size=queue_size,
    )
