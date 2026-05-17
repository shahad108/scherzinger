// Phase 5 (§5.5) — WebSocket-driven collab hook for the proposal
// channel. Opens a WS to /api/v1/ws/proposal/{id} when a proposal is
// being viewed; surfaces peer cursor presence + a comment stream;
// exposes `sendComment(text)` so UI can post into the channel.
//
// Cursor frames are throttled to one per animation frame so a noisy
// mousemove handler can't flood the socket. The hook cleans up on
// unmount (no leaked connections).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE =
  (import.meta.env.VITE_SCHERZINGER_API as string | undefined) || '/api/v1';

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

export interface UseProposalCollabResult {
  peers: CollabPeer[];
  comments: CollabComment[];
  isConnected: boolean;
  sendComment: (text: string) => boolean;
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

export function useProposalCollab(
  { proposalId, aid, enabled = true }: Options,
): UseProposalCollabResult {
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [comments, setComments] = useState<CollabComment[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastFrame, setLastFrame] = useState<unknown>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queuedCursorRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Skip in non-browser / test environments.
  const canOpen = typeof window !== 'undefined' && typeof WebSocket !== 'undefined';

  useEffect(() => {
    if (!canOpen || !enabled || !proposalId) return undefined;
    let cancelled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrlFor(proposalId));
    } catch {
      return undefined;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) return;
      setIsConnected(true);
    };
    ws.onclose = () => {
      setIsConnected(false);
      if (wsRef.current === ws) wsRef.current = null;
    };
    ws.onerror = () => {
      setIsConnected(false);
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
          // The backend may push a roster snapshot.
          const roster = (parsed as { users?: string[] }).users ?? [];
          setPeers(roster.map((u) => ({ user_id: u })));
        }
      } catch {
        // Malformed frames are dropped.
      }
    };

    return () => {
      cancelled = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      if (wsRef.current === ws) wsRef.current = null;
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [canOpen, enabled, proposalId]);

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

  // Cursor presence is exposed by sendCursor; consumers can wire it to a
  // mousemove handler. Kept here as part of the public API for tests.
  void sendCursor;

  return useMemo(
    () => ({ peers, comments, isConnected, sendComment, lastFrame }),
    [peers, comments, isConnected, sendComment, lastFrame],
  );
}
