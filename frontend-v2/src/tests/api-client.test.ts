import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We re-import the module after mutating env so the BASE/ALLOW_FALLBACK consts
// pick up the new values.
async function importClient() {
  vi.resetModules();
  return import('../lib/api/client');
}

const ORIGINAL_ENV = { ...import.meta.env };

afterEach(() => {
  // Restore env between tests.
  for (const k of Object.keys(import.meta.env)) {
    if (!(k in ORIGINAL_ENV)) {
      delete (import.meta.env as Record<string, unknown>)[k];
    }
  }
  Object.assign(import.meta.env, ORIGINAL_ENV);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  describe('pure mock mode (VITE_SCHERZINGER_API unset)', () => {
    beforeEach(() => {
      delete (import.meta.env as Record<string, unknown>).VITE_SCHERZINGER_API;
      delete (import.meta.env as Record<string, unknown>).VITE_ALLOW_MOCK_FALLBACK;
    });

    it('reads from bundled mocks for /shell', async () => {
      const { apiFetch } = await importClient();
      const data = await apiFetch<{ notifications: unknown }>('/shell');
      expect(data).toBeDefined();
      expect(data).toHaveProperty('notifications');
    });

    it('throws when no mock matches', async () => {
      const { apiFetch } = await importClient();
      await expect(apiFetch('/does-not-exist')).rejects.toThrow(/No mock found/);
    });
  });

  describe('pure API mode (mock fallback disabled)', () => {
    beforeEach(() => {
      import.meta.env.VITE_SCHERZINGER_API = 'https://api.test/api/v1/screens';
      delete (import.meta.env as Record<string, unknown>).VITE_ALLOW_MOCK_FALLBACK;
    });

    it('returns parsed json on 200', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { apiFetch } = await importClient();
      const out = await apiFetch<{ ok: boolean }>('/shell');
      expect(out).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/api/v1/screens/shell',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    it('throws on 404 (no fallback)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('not found', { status: 404 })),
      );
      const { apiFetch } = await importClient();
      await expect(apiFetch('/shell')).rejects.toThrow(/→ 404/);
    });

    it('propagates network errors', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('network down')),
      );
      const { apiFetch } = await importClient();
      await expect(apiFetch('/shell')).rejects.toThrow(/network down/);
    });

    it('throws on non-JSON content-type', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('<!DOCTYPE html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        ),
      );
      const { apiFetch } = await importClient();
      await expect(apiFetch('/shell')).rejects.toThrow(/expected JSON/);
    });

    it('strips UTF-8 BOM before parsing', async () => {
      const bomBody = '﻿' + JSON.stringify({ ok: true });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(bomBody, {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          }),
        ),
      );
      const { apiFetch } = await importClient();
      await expect(apiFetch<{ ok: boolean }>('/shell')).resolves.toEqual({ ok: true });
    });

    it('throws on malformed JSON body', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('{not json', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
      const { apiFetch } = await importClient();
      await expect(apiFetch('/shell')).rejects.toThrow(/invalid JSON/);
    });
  });

  describe('lang routing (P13.T3)', () => {
    beforeEach(() => {
      import.meta.env.VITE_SCHERZINGER_API = 'https://api.test/api/v1/screens';
      delete (import.meta.env as Record<string, unknown>).VITE_ALLOW_MOCK_FALLBACK;
      // Set the pryzm_lang cookie that i18n/index.ts writes on languageChanged.
      document.cookie = 'pryzm_lang=en; path=/';
    });

    it('appends ?lang=en from the pryzm_lang cookie', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { apiFetch } = await importClient();
      await apiFetch('/shell');
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('lang=en');
    });

    it('does NOT override an explicit lang param', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { apiFetch } = await importClient();
      await apiFetch('/shell', { params: { lang: 'de' } });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('lang=de');
      expect(url).not.toContain('lang=en');
    });
  });

  describe('hybrid mode (mock fallback enabled)', () => {
    beforeEach(() => {
      import.meta.env.VITE_SCHERZINGER_API = 'https://api.test/api/v1/screens';
      import.meta.env.VITE_ALLOW_MOCK_FALLBACK = '1';
    });

    it('falls back to mock on 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('not found', { status: 404 })),
      );
      const { apiFetch } = await importClient();
      const data = await apiFetch<{ notifications: unknown }>('/shell');
      expect(data).toHaveProperty('notifications');
    });

    it('falls back to mock on 503', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('busy', { status: 503 })),
      );
      const { apiFetch } = await importClient();
      const data = await apiFetch<{ notifications: unknown }>('/shell');
      expect(data).toHaveProperty('notifications');
    });

    it('falls back to mock on network error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('offline')),
      );
      const { apiFetch } = await importClient();
      const data = await apiFetch<{ notifications: unknown }>('/shell');
      expect(data).toHaveProperty('notifications');
    });

    it('does NOT fall back on 500 (programmer error, surface it)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
      );
      const { apiFetch } = await importClient();
      await expect(apiFetch('/shell')).rejects.toThrow(/→ 500/);
    });
  });
});
