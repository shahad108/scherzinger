// Pricing Studio v3 — live Studio query.
//
// Wraps `useStudio()` and invalidates its cache whenever a matching SSE
// event arrives. Exposes a small live-state surface for the trust strip:
//   - data           the latest Studio payload
//   - isLive         the SSE channel is connected
//   - lastTickAt     timestamp of the most recent invalidation
//   - stalenessSec   seconds since the last tick (or null if no tick yet)
//   - lastToast      transient toast payload — page renders + clears it
//   - dismissToast() drops the toast manually
//   - retry()        force-reconnect the SSE channel

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStudio } from '@/data/api/useStudio';
import { qk, type StudioParams } from '@/lib/api/queryKeys';
import { usePricingStream, type PricingStreamEvent } from './usePricingStream';

export interface LivePricingToast {
  topic: string;
  aid: string | null;
  message: string;
  ts: number;
}

export interface UseLivePricingResult {
  data: ReturnType<typeof useStudio>['data'];
  isLoading: ReturnType<typeof useStudio>['isLoading'];
  isError: ReturnType<typeof useStudio>['isError'];
  isLive: boolean;
  lastTickAt: number | null;
  stalenessSec: number | null;
  lastToast: LivePricingToast | null;
  dismissToast: () => void;
  retry: () => void;
}

const COST_MOVED_TOPIC = 'pricing.cost_moved';

export function useLivePricing(params?: StudioParams): UseLivePricingResult {
  const queryClient = useQueryClient();
  const query = useStudio(params);

  const { lastEvent, isConnected, retry } = usePricingStream({
    topic: 'pricing',
    aid: params?.aid ?? null,
    cluster: params?.cluster ?? null,
  });

  const [lastTickAt, setLastTickAt] = useState<number | null>(null);
  const [lastToast, setLastToast] = useState<LivePricingToast | null>(null);
  const lastTopicRef = useRef<string | null>(null);

  // Invalidate the cache on every matching event so the next read pulls
  // fresh data from the BFF. The aid filter is enforced on the bus, so
  // any event we receive is relevant to the current view.
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.topic === lastTopicRef.current && lastEvent.ts === lastTickAt) {
      return;
    }
    lastTopicRef.current = lastEvent.topic;
    setLastTickAt(lastEvent.ts);

    queryClient.invalidateQueries({ queryKey: qk.studio() });

    if (
      lastEvent.topic === COST_MOVED_TOPIC &&
      params?.aid &&
      (lastEvent.aid === params.aid || lastEvent.aid === null)
    ) {
      setLastToast({
        topic: lastEvent.topic,
        aid: lastEvent.aid,
        message: `Cost moved on ${lastEvent.aid ?? params.aid} — recommendation refreshed.`,
        ts: lastEvent.ts,
      });
    }
  }, [lastEvent, lastTickAt, params?.aid, queryClient]);

  // Re-render every second while we have a tick so stalenessSec ticks down
  // (cheap; no extra network).
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (lastTickAt === null) return;
    const id = window.setInterval(() => setNow(Date.now() / 1000), 1_000);
    return () => window.clearInterval(id);
  }, [lastTickAt]);

  const stalenessSec = useMemo(() => {
    if (lastTickAt === null) return null;
    return Math.max(0, Math.round(now - lastTickAt));
  }, [lastTickAt, now]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isLive: isConnected,
    lastTickAt,
    stalenessSec,
    lastToast,
    dismissToast: () => setLastToast(null),
    retry,
  };
}

// Re-exported so consumers can type their own narrow event handlers.
export type { PricingStreamEvent };
