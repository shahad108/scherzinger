# Live wiring — SSE event bus

> Last updated: 2026-05-17 (Pricing Studio v3 Phase 12).
>
> Reference design for the in-process SSE event bus that Pricing Studio
> v3 uses to make Frank's workbench reactive. Forecasting and Margin
> Cockpit reuse the same primitives — the same hooks, the same topics,
> the same backpressure rules — when they add live tiles.

This document is the source of truth for **publishers** (server-side
code that emits domain events) and **subscribers** (the React hooks
that consume them).

---

## 1. Why we built it

Pre-v3, the Studio refreshed on user action only. After Frank submitted
a proposal, his colleague Till had to refresh to see the approval row
appear in the inbox. Cost ticks, alert triggers, A/B promote actions —
all invisible until a manual refresh. That's a non-starter for a tool
that's supposed to feel like a cockpit.

v3 introduces a **single in-process event bus** that fans events out
to React Query cache invalidations + small reactive state in components.
The frontend treats SSE as "the cache invalidation channel": data
stays in TanStack Query, but the bus tells it when to refetch.

Two design rules:

1. **Events invalidate, they do not carry payloads.** Components fetch
   fresh data via their existing hooks; the bus just says "go ask
   again." This keeps the wire shape decoupled from the UI shape and
   means missing events degrade to slightly-stale UI, not broken UI.
2. **One bus, many subscribers.** The same `audit.appended` event wakes
   the audit drawer, the badge counter, AND the cross-page audit feed.
   Subscribers register with a topic prefix + optional aid/cluster
   filter so the bus only delivers what they need.

---

## 2. Bus design (backend)

Code: `scherzinger-platform/backend/services/events.py`.

### Event shape

```python
@dataclass
class Event:
    topic: str          # "pricing.price_set", "audit.appended", ...
    ts: float           # time.time() when published
    payload: dict       # always JSON-serialisable; minimal
    aid: Optional[str]  # SKU id (for aid-scoped fan-out)
    cluster: Optional[str]  # cluster (for cluster-scoped fan-out)
```

### Topic conventions

Topics are dot-namespaced. Subscribers can match a prefix:
`subscribe("pricing")` receives every `pricing.*` event.

| Namespace | Events |
|---|---|
| `pricing` | `pricing.price_set`, `pricing.price_rolled_back`, `pricing.cost_moved`, `pricing.proposal_created`, `pricing.proposal_submitted` |
| `audit` | `audit.appended` |
| `approval` | `approval.requested`, `approval.acted`, `approval.completed`, `approval.recalled` |
| `alerts` | `alerts.triggered`, `alerts.acked` |
| `batches` | `batches.preview_built`, `batches.committed` |
| `ab` | `ab.promoted`, `ab.rejected` |

Add new namespaces by convention; the bus doesn't enforce a closed set.
Document new topics in this file when you add them.

### Publish

Two entry points:

```python
# Async — use from async request handlers.
from backend.services.events import publish
await publish("pricing.price_set", {"aid": aid}, aid=aid)

# Sync — use from sync code paths (record_audit, publish_price, ...).
from backend.services.events import publish_sync
publish_sync("audit.appended", {"audit_id": entry.id}, aid=aid)
```

`publish_sync` is **cross-loop safe**: under the hood it uses
`loop.call_soon_threadsafe(...)` against each subscriber's own asyncio
loop. This means sync code in a FastAPI dependency or background thread
can publish without spinning up a new event loop. The only constraint
is that `publish_sync` raises if called from inside a running loop —
use `await publish(...)` there.

### Subscribe

```python
from backend.services.events import get_bus

bus = get_bus()
sub = bus.open_subscription("pricing", aid="200832-E")
event = await sub.next(timeout=2.0)  # returns None on timeout
sub.close()
```

The bus delivers an event to a subscriber only if all of:

- topic matches the subscriber's prefix
- the subscriber's `aid` is None **or** matches the event's `aid`
- the subscriber's `cluster` is None **or** matches the event's `cluster`

### Backpressure

Each subscription has a bounded `asyncio.Queue` (default 64). When the
queue is full, the bus **drops the oldest event**, increments
`sub.dropped`, and logs a rate-limited warning (one log per subscriber
per second). The choice is deliberate: a slow consumer should not
hold up other subscribers, and a "lost invalidation" degrades to "data
slightly stale until next user interaction" — acceptable for our model.

Operationally: a non-zero `sub.dropped` is a yellow flag. If it
sustains > 5 events/min on any one subscription, that subscriber is
either too slow (the React side isn't draining the EventSource fast
enough) or the publisher is firing too hot (e.g. an N+1 audit
recursion). Tune by:

1. Slow the publisher (debounce upstream).
2. Bump `queue_size` for that subscription (`bus.open_subscription(..., queue_size=256)`).
3. Move to a coarser topic (subscribe at namespace level, filter client-side).

### In-process vs Redis

`InProcessEventBus` is the only impl today. It's correct for a
single-uvicorn-worker deployment, which is what we run.

A `RedisEventBus` swap-in is anticipated when we scale to multiple
workers. The contract is encoded in the `EventBus` abstract base
(`publish`, `subscribe`, `open_subscription`). Tests use
`events.set_bus(...)` to swap the bus per-test for isolation.

Migration path:

1. Implement `RedisEventBus` using XADD (publish) + XREAD streaming
   consumer per subscription.
2. `publish_sync` becomes a sync XADD (no asyncio.run fallback needed).
3. Drop semantics survive — XREAD `MAXLEN` + COUNT bound the stream
   size; the consumer reads at its own pace.
4. The frontend doesn't need to change; the SSE endpoint
   (`/events/stream`) keeps the same wire format.

---

## 3. SSE endpoint

Code: `scherzinger-platform/backend/api/v1/events.py`.

`GET /events/stream?topic=<prefix>&aid=<aid>&cluster=<cluster>`
returns `text/event-stream`. Each line is an
`event: <topic>\ndata: <json>\n\n` block.

The endpoint:

1. Authenticates via the standard auth dependency.
2. Opens a bus subscription with the requested filter.
3. Streams events to the client until the client disconnects.
4. On disconnect, closes the subscription so the bus stops queueing.

### Auth

The endpoint is behind `RequireAuth` — only authenticated users can
subscribe. There's no per-event ACL check yet; if topic/data sensitivity
diverges (e.g. some `audit.appended` events should be Till-only), the
endpoint will need filtering before the wire. Today every authenticated
operator sees every event, which matches the rest of the Studio's
access model.

### Heartbeat

The endpoint emits a `:keepalive\n\n` comment line every 25s so
intermediate proxies don't time the connection out. (Not all proxies
respect SSE-specific `Connection: keep-alive` headers.)

### Known limitation: TestClient

FastAPI's `TestClient` does not stream `text/event-stream` responses
correctly — it hangs waiting for the body to complete. The Phase 0
SSE test suite (`tests/api/test_events_stream.py`) exercises the
**bus** directly (publish → async subscriber → assert delivered) and
asserts the **HTTP layer** only at the level of "200 + Content-Type
+ first prime line." End-to-end SSE behaviour is exercised by
Playwright tests.

---

## 4. Frontend subscriber lifecycle

Code: `frontend-v2/src/hooks/usePricingStream.ts`,
`frontend-v2/src/hooks/useLivePricing.ts`.

### `usePricingStream({ topic, aid, cluster, enabled })`

The base hook. Opens an `EventSource` on mount, closes on unmount.
Returns `{ lastEvent, lastEventTs, lastTickAt, connected }`.

The hook is **read-only** for the component using it — what you do
with `lastEvent` is your business. The two common patterns:

1. **Cache invalidation.** In an effect, watch `lastEventTs`; when it
   changes, call `queryClient.invalidateQueries({ queryKey: … })`. The
   page's normal React Query refetches do the rest.
2. **Local reactive UI.** Read `lastTickAt` to drive a freshness chip
   ("Live since 12s ago"). Read `lastEvent.payload` for transient toast
   text.

### `useLivePricing({ aid, tier, family, cluster, scenario_id })`

A higher-level wrapper that:

1. Subscribes to `pricing` (everything in the pricing namespace).
2. Invalidates `['studio']`, `['proposals', aid]`, and `['price-book', aid]` on any tick.
3. Exposes `lastTickAt` for the freshness chip.

This is the hook the Studio page uses for its "is the data live?" pulse.

### Query invalidation strategy

| Event | Invalidates |
|---|---|
| `pricing.price_set` | `qk.studio`, `qk.priceBook(aid)` |
| `pricing.price_rolled_back` | `qk.studio`, `qk.priceBook(aid)`; plus a toast |
| `pricing.cost_moved` | `qk.costOutlook(aid)`, `qk.studio` (so the trigger banner can refresh) |
| `audit.appended` | `qk.auditFeed(aid)` |
| `approval.*` | `qk.approvalInbox`, `qk.approvalInstance(id)` |
| `alerts.triggered` | `qk.pricingAlertsInbox` |
| `batches.committed` | `qk.batch(id)` |

The frontend treats SSE-driven invalidations the same as user-initiated
invalidations — the cache layer doesn't care about the source.

### Connection lifecycle + reconnect

The `EventSource` browser API handles reconnect automatically with
exponential backoff. On reconnect, the bus does **not** replay missed
events. This is by design — see "Events invalidate, they do not
carry payloads." The next React Query background refetch
(60s `staleTime`) closes any gap.

When `connected` is false for > 30s, the freshness chip flips to
"Reconnecting…" and a small banner offers a manual refresh.

---

## 5. Reusing this pattern in Forecasting + Margin Cockpit

When Forecasting and Margin Cockpit add live tiles, they should:

1. **Add a topic** to the table in §2 — e.g. `forecast.recomputed`,
   `margin.leak_detected`.
2. **Publish** from the relevant service function via `events.publish`
   or `events.publish_sync`. Keep payloads minimal (ids, not blobs).
3. **Subscribe** via `usePricingStream({ topic: 'forecast', … })`
   (the hook is name-locked to Pricing today but the implementation is
   topic-generic; we'll rename it `useEventStream` when the second
   page lands).
4. **Invalidate** the relevant React Query keys on each tick.

Do **not**:

- Inline event payload data into UI state; always re-fetch.
- Build per-page event types — reuse the bus.
- Subscribe at the leaf component level if more than one leaf reacts to
  the same event. Subscribe once at the page level and pass state down.

---

## 6. Tests

| Test | What it covers |
|---|---|
| `tests/api/test_events_stream.py` | Bus-level: publish, topic + aid + cluster filtering, threadsafe publish_sync, drop behaviour. |
| `tests/api/test_sse_integration.py` | Plan §12.1 — `publish_sync` reaches an async subscriber in well under 2s; two subscribers fan out independently. |
| `tests/services/pricing/test_audit_live_wiring.py` | `record_audit` fires `audit.appended` on the bus. |
| `tests/services/pricing/test_recommendation.py` | Recommendation save fires `pricing.proposal_created`. |
| `tests/services/pricing/test_publish.py` | Publish fires `pricing.price_set`; rollback fires `pricing.price_rolled_back`. |
| `tests/e2e/pricing-studio-v3.spec.ts` | Live freshness chip updates on simulated SSE ticks (browser-level). |

---

## 7. Operational checklist (when adding a new event)

- [ ] Pick a topic that fits an existing namespace, or add the
      namespace to §2 of this doc.
- [ ] Publish with `events.publish` (async) or `events.publish_sync`
      (sync). Keep payload to ids + scalars; never raw model rows.
- [ ] Add a `record_*_async` if your callsite is async + needs the
      audit + bus side effects.
- [ ] Add a unit test that asserts the event fires (use the bus
      directly — `set_bus(InProcessEventBus())` per-test).
- [ ] Add the React Query invalidation in `useLivePricing`
      (or the equivalent live hook for your page).
- [ ] Update the invalidation table in §4 of this doc.
- [ ] If the new event is sensitive (PII or restricted business data),
      add a per-topic ACL filter to the SSE endpoint before merging.
