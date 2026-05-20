// Pricing Studio v3 — SSE subscription hook.
//
// Wraps an EventSource against /api/v1/events/stream?topic=…&aid=&cluster=
// and exposes a small live-state surface:
//   - lastEvent   the most recent event payload (typed)
//   - isConnected EventSource readyState === OPEN
//   - retry()     force-close + reopen (used by the retry pill)
//
// Auto-reconnects with exponential backoff (1s → 30s cap) on close/error so
// transient network blips don't take the live indicator offline. Cleans up
// the EventSource on unmount.

import { useCallback, useEffect, useRef, useState } from 'react';

const API_BASE =
  (import.meta.env.VITE_SCHERZINGER_API as string | undefined) || '/api/v1';
const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export interface PricingStreamEvent {
  topic: string;
  aid: string | null;
  cluster: string | null;
  ts: number;
  payload: Record<string, unknown>;
}

export interface UsePricingStreamOptions {
  topic?: string;
  aid?: string | null;
  cluster?: string | null;
  /** Set false to skip opening (e.g. while filters are still pending). */
  enabled?: boolean;
}

export interface UsePricingStreamResult {
  lastEvent: PricingStreamEvent | null;
  isConnected: boolean;
  retry: () => void;
}

function buildUrl(opts: UsePricingStreamOptions): string {
  const params = new URLSearchParams();
  params.set('topic', opts.topic ?? 'pricing');
  if (opts.aid) params.set('aid', opts.aid);
  if (opts.cluster) params.set('cluster', opts.cluster);
  return `${API_BASE}/events/stream?${params.toString()}`;
}

export function usePricingStream(
  opts: UsePricingStreamOptions = {},
): UsePricingStreamResult {
  const { topic = 'pricing', aid = null, cluster = null, enabled = true } = opts;

  const [lastEvent, setLastEvent] = useState<PricingStreamEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const reconnectDelay = useRef<number>(INITIAL_DELAY_MS);
  // `enabledRef` tracks the latest `enabled` value so async reconnect
  // callbacks can re-check it without being baked into `connect`'s deps.
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const cleanup = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectTimer.current !== null) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }
    // Bail BEFORE cleanup so a rapid disable→enable flip can't kill an
    // active connection by accident.
    if (!enabled) return;

    cleanup();

    const url = buildUrl({ topic, aid, cluster });
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      reconnectDelay.current = INITIAL_DELAY_MS;
    };

    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as PricingStreamEvent;
        setLastEvent(parsed);
      } catch {
        // Heartbeats / malformed payloads are dropped silently — the bus
        // contract is JSON-only for `data:` lines.
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      // If `esRef.current` already moved on (e.g. retry() called between
      // open and error), don't touch it.
      if (esRef.current === es) {
        esRef.current = null;
      }

      // Schedule a reconnect with exponential backoff. The scheduled
      // callback MUST re-check `enabled` + that no other connection
      // raced in — otherwise rapid unmount/disable can leak a stream.
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, MAX_DELAY_MS);
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = null;
        if (!enabledRef.current) return;
        if (esRef.current) return; // someone reconnected already
        connect();
      }, delay);
    };
  }, [aid, cleanup, cluster, enabled, topic]);

  useEffect(() => {
    connect();
    return cleanup;
    // No ref values in deps — refs don't trigger re-renders, so including
    // them is misleading. `retry()` invokes `connect()` synchronously
    // (after `cleanup()`); a future refactor must preserve that.
  }, [connect, cleanup]);

  const retry = useCallback(() => {
    reconnectDelay.current = INITIAL_DELAY_MS;
    // Force a fresh attempt synchronously. `connect()` already calls
    // `cleanup()` internally — listed here too so the contract is
    // explicit and a future refactor can't break the reconnect.
    cleanup();
    connect();
  }, [cleanup, connect]);

  return { lastEvent, isConnected, retry };
}
