// Pricing Studio v3 / Phase 5 — useProposalCollab tests.

import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProposalCollab } from '../useProposalCollab';

// In-memory WebSocket stub. Tracks every connect / send / close so the
// tests can assert connection lifecycle + outbound frames.
class WSStub {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: WSStub[] = [];
  readyState = WSStub.OPEN;
  sent: string[] = [];
  closed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onopen: ((ev: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onclose: ((ev: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((ev: any) => void) | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onmessage: ((ev: any) => void) | null = null;

  constructor(public url: string) {
    WSStub.instances.push(this);
    // Defer the open callback to the next tick so React can subscribe first.
    queueMicrotask(() => {
      this.onopen?.({});
    });
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = WSStub.CLOSED;
    this.onclose?.({});
  }
}

beforeEach(() => {
  WSStub.instances = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = WSStub;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useProposalCollab', () => {
  it('opens a WebSocket on mount and closes it on unmount', async () => {
    const { unmount } = renderHook(() =>
      useProposalCollab({ proposalId: 'p-1', aid: 'AID-1' }),
    );
    // Allow the deferred open callback to run.
    await act(async () => {
      await Promise.resolve();
    });
    expect(WSStub.instances.length).toBe(1);
    expect(WSStub.instances[0].url).toContain('/ws/proposal/p-1');
    expect(WSStub.instances[0].closed).toBe(false);
    unmount();
    expect(WSStub.instances[0].closed).toBe(true);
  });

  it('is a no-op when disabled (no WS opened)', () => {
    renderHook(() =>
      useProposalCollab({ proposalId: 'p-1', aid: 'AID-1', enabled: false }),
    );
    expect(WSStub.instances.length).toBe(0);
  });

  it('parses peer cursor frames into the peers list', async () => {
    const { result } = renderHook(() =>
      useProposalCollab({ proposalId: 'p-1', aid: 'AID-1' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    const ws = WSStub.instances[0];
    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify({
          kind: 'cursor',
          user_id: 'someone-else',
          position: { x: 10, y: 20 },
        }),
      });
    });
    expect(result.current.peers.length).toBe(1);
    expect(result.current.peers[0].user_id).toBe('someone-else');
    expect(result.current.peers[0].cursor_x).toBe(10);
    expect(result.current.peers[0].cursor_y).toBe(20);
  });

  it('attempts to reconnect after an unexpected close and exposes connectionState', async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useProposalCollab({ proposalId: 'p-1', aid: 'AID-1' }),
      );
      // Allow the first deferred open callback to run.
      await act(async () => {
        await vi.advanceTimersToNextTimerAsync();
      });
      // Open callback fires via queueMicrotask — flush it.
      await act(async () => {
        await Promise.resolve();
      });
      expect(WSStub.instances.length).toBe(1);
      expect(result.current.connectionState).toBe('connected');

      // Simulate an unexpected drop from the server side. The hook should
      // mark itself "reconnecting" and schedule a new socket.
      await act(async () => {
        WSStub.instances[0].readyState = WSStub.CLOSED;
        WSStub.instances[0].onclose?.({});
      });
      expect(result.current.connectionState).toBe('reconnecting');

      // Run the backoff timer; a new socket should be opened.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(WSStub.instances.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after the max reconnect attempts and surfaces a disconnected state with a manual reconnect()', async () => {
    // Use a stub that DOESN'T auto-open, so each reconnect represents a
    // failed connection attempt (close arrives before open). That's the
    // condition where the 5-attempt cap matters.
    class WSNoOpen {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = WSNoOpen.CLOSED;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onopen: ((ev: any) => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onclose: ((ev: any) => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onerror: ((ev: any) => void) | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onmessage: ((ev: any) => void) | null = null;
      constructor() {
        WSNoOpen.instances.push(this);
        queueMicrotask(() => this.onclose?.({}));
      }
      static instances: WSNoOpen[] = [];
      send() {}
      close() {
        this.onclose?.({});
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = WSNoOpen;

    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useProposalCollab({ proposalId: 'p-1', aid: 'AID-1' }),
      );
      // Flush each scheduled close + backoff timer. With the cap at 5,
      // there should be 1 initial + 5 reconnect attempts = 6 sockets total
      // before the hook gives up.
      for (let i = 0; i < 7; i++) {
        await act(async () => {
          await Promise.resolve();
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(9000);
        });
      }
      expect(WSNoOpen.instances.length).toBeLessThanOrEqual(6);
      expect(result.current.connectionState).toBe('disconnected');

      // Manual reconnect() resets the attempt counter and opens a fresh WS.
      const sizeBefore = WSNoOpen.instances.length;
      await act(async () => {
        result.current.reconnect();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(WSNoOpen.instances.length).toBe(sizeBefore + 1);
    } finally {
      vi.useRealTimers();
      // Restore the auto-open WSStub for subsequent tests.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).WebSocket = WSStub;
    }
  });

  it('sendComment sends a JSON comment frame', async () => {
    const { result } = renderHook(() =>
      useProposalCollab({ proposalId: 'p-1', aid: 'AID-1' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    const ws = WSStub.instances[0];
    await act(async () => {
      const ok = result.current.sendComment('Hello there');
      expect(ok).toBe(true);
    });
    expect(ws.sent.length).toBe(1);
    const frame = JSON.parse(ws.sent[0]);
    expect(frame).toEqual({ kind: 'comment', comment: 'Hello there', aid: 'AID-1' });
  });
});
