/**
 * P15.T3 + P15.T4 — observability primitives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initObservability, newTraceId, reportError } from '@/lib/observability';

describe('newTraceId', () => {
  it('returns a UUID-shaped string', () => {
    const t = newTraceId();
    expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('reportError', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    initObservability(undefined); // ensure no Sentry client
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('falls back to console.warn when no Sentry client is configured', () => {
    reportError(new Error('boom'), { route: '/x', persona: 'frank' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe('[observability]');
  });

  it('forwards to a configured Sentry-shaped client', () => {
    const captured: unknown[] = [];
    initObservability({
      captureException: (e, extra) => captured.push({ e, extra }),
    });
    reportError(new Error('plumbing'), { route: '/y' });
    expect(captured.length).toBe(1);
    expect((captured[0] as { extra: Record<string, unknown> }).extra.route).toBe('/y');
    initObservability(undefined);
  });
});

describe('apiFetch trace ID', () => {
  // We re-import the module after mutating env so BASE picks up the new value.
  async function importClient() {
    vi.resetModules();
    return import('@/lib/api/client');
  }

  const ORIGINAL_MODE = import.meta.env.MODE;
  beforeEach(() => {
    // Force non-test runtime so apiFetch actually hits fetch().
    (import.meta.env as Record<string, unknown>).MODE = 'production';
    import.meta.env.VITE_SCHERZINGER_API = 'https://api.test/api/v1/screens';
  });
  afterEach(() => {
    (import.meta.env as Record<string, unknown>).MODE = ORIGINAL_MODE;
    delete (import.meta.env as Record<string, unknown>).VITE_SCHERZINGER_API;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches x-pryzm-trace-id to every fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { apiFetch } = await importClient();
    await apiFetch('/shell');
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers['x-pryzm-trace-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
