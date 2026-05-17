// Phase 5 (§5.5) — WebSocket-driven collab hook for the proposal
// channel. Opens a WS to /api/v1/ws/proposal/{id} when a proposal is
// being viewed; surfaces peer cursor presence + a comment stream;
// exposes `sendComment(text)` so UI can post into the channel.
//
// Cursor frames are throttled to one per animation frame so a noisy
// mousemove handler can't flood the socket. The hook cleans up on
// unmount (no leaked connections).
//
// SF3: an unexpected close triggers exponential-backoff reconnect (up
// to MAX_ATTEMPTS). After exhausting attempts the hook surfaces a
// "disconnected" state and exposes a manual `reconnect()` so the UI
// can offer a retry button.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE =
  (import.meta.env.VITE_SCHERZINGER_API as string | undefined) || '/api/v1';

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_RECONNECT_DELAY_MS = 8000;

export interface CollabPeer {
  user_id: string;
  cursor_x?: number;
  cursor_y?: number;
  last_seen?: number;
}

export interface CollabComment {
  id?: string;
  user_id: string;
  text: string;
  at: string;
  aid?: string | null;
}

export type CollabConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface UseProposalCollabResult {
  peers: CollabPeer[];
  comments: CollabComment[];
  isConnected: boolean;
  connectionState: CollabConnectionState;
  sendComment: (text: string) => boolean;
  /** Reset attempt counter and open a fresh WS immediately. */
  reconnect: () => void;
  /** For tests / debug — last frame received. */
  lastFrame: unknown;
}

interface Options {
  proposalId: string | null | undefined;
  aid: string | null | undefined;
  /** When false the hook is a no-op (no socket opened). */
  enabled?: boolean;
}

function wsUrlFor(proposalId: string): string {
  // Map the configured HTTP base ("/api/v1" or "https://host/api/v1") to
  // the matching WS scheme. Same-origin "/api/v1" → derive scheme + host
  // from window.location; absolute → swap http(s):// for ws(s)://.
  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    const wsBase = API_BASE.replace(/^http/, 'ws');
    return `${wsBase}/ws/proposal/${encodeURIComponent(proposalId)}`;
  }
  if (typeof window === 'undefined') {
    return `ws://localhost${API_BASE}/ws/proposal/${encodeURIComponent(proposalId)}`;
  }
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}${API_BASE}/ws/proposal/${encodeURIComponent(
    proposalId,
  )}`;
}

function backoffMs(attempt: number): number {
  // 0-indexed attempt → 1000, 2000, 4000, 8000, 8000…
  return Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
}

export function useProposalCollab(
  { proposalId, aid, enabled = true }: Options,
): UseProposalCollabResult {
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [comments, setComments] = useState<CollabComment[]>([]);
  const [connectionState, setConnectionState] =
    useState<CollabConnectionState>('connecting');
  const [lastFrame, setLastFrame] = useState<unknown>(null);
  // Bumping `epoch` forces the connect-effect to re-run, so the manual
  // `reconnect()` path doesn't depend on stale refs.
  const [epoch, setEpoch] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const queuedCursorRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  // Skip in non-browser / test environments.
  const canOpen = typeof window !== 'undefined' && typeof WebSocket !== 'undefined';

  useEffect(() => {
    if (!canOpen || !enabled || !proposalId) {
      setConnectionState('disconnected');
      return undefined;
    }

    let cancelled = false;
    intentionalCloseRef.current = false;

    const open = () => {
      if (cancelled) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrlFor(proposalId));
      } catch {
        // Constructor threw — schedule a reconnect (treats as drop).
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;
      setConnectionState((prev) => (prev === 'reconnecting' ? prev : 'connecting'));

      ws.onopen = () => {
        if (cancelled) return;
        attemptRef.current = 0;
        setConnectionState('connected');
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (cancelled || intentionalCloseRef.current) return;
        scheduleReconnect();
      };
      ws.onerror = () => {
        // onclose follows; reconnect logic lives there.
      };
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(typeof event.data === 'string' ? event.data : '');
          setLastFrame(parsed);
          const kind = (parsed as { kind?: string }).kind;
          if (kind === 'cursor') {
            const { user_id, position } = parsed as {
              user_id: string;
              position?: { x?: number; y?: number };
            };
            if (!user_id) return;
            setPeers((prev) => {
              const without = prev.filter((p) => p.user_id !== user_id);
              return [
                ...without,
                {
                  user_id,
                  cursor_x: position?.x,
                  cursor_y: position?.y,
                  last_seen: Date.now(),
                },
              ];
            });
          } else if (kind === 'comment') {
            const { user_id, comment, at, aid: msgAid } = parsed as {
              user_id?: string;
              comment?: string;
              at?: string;
              aid?: string | null;
            };
            if (!comment || !user_id) return;
            setComments((prev) => [
              ...prev,
              {
                user_id,
                text: comment,
                at: at ?? new Date().toISOString(),
                aid: msgAid ?? null,
              },
            ]);
          } else if (kind === 'presence') {
            const roster = (parsed as { users?: string[] }).users ?? [];
            setPeers(roster.map((u) => ({ user_id: u })));
          }
        } catch {
          // Malformed frames are dropped.
        }
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionState('disconnected');
        return;
      }
      const delay = backoffMs(attemptRef.current);
      attemptRef.current += 1;
      setConnectionState('reconnecting');
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        open();
      }, delay);
    };

    open();

    return () => {
      cancelled = true;
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const ws = wsRef.current;
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [canOpen, enabled, proposalId, epoch]);

  const sendCursor = useCallback((x: number, y: number) => {
    queuedCursorRef.current = { x, y };
    if (rafRef.current !== null || typeof window === 'undefined') return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const ws = wsRef.current;
      const pos = queuedCursorRef.current;
      queuedCursorRef.current = null;
      if (!ws || ws.readyState !== WebSocket.OPEN || !pos) return;
      ws.send(JSON.stringify({ kind: 'cursor', position: pos }));
    });
  }, []);

  const sendComment = useCallback(
    (text: string) => {
      const ws = wsRef.current;
      const trimmed = text.trim();
      if (!ws || ws.readyState !== WebSocket.OPEN || !trimmed) return false;
      ws.send(
        JSON.stringify({
          kind: 'comment',
          comment: trimmed,
          aid: aid ?? null,
        }),
      );
      return true;
    },
    [aid],
  );

  const reconnect = useCallback(() => {
    // Reset the backoff counter and tell the effect to re-run.
    attemptRef.current = 0;
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setEpoch((n) => n + 1);
  }, []);

  // Cursor presence is exposed by sendCursor; consumers can wire it to a
  // mousemove handler. Kept here as part of the public API for tests.
  void sendCursor;

  return useMemo(
    () => ({
      peers,
      comments,
      isConnected: connectionState === 'connected',
      connectionState,
      sendComment,
      reconnect,
      lastFrame,
    }),
    [peers, comments, connectionState, sendComment, reconnect, lastFrame],
  );
}
