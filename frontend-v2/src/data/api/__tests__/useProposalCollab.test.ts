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
