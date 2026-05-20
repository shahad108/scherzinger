// Single fetcher for all data.
//
// Runtime: always hits the real backend. ``VITE_SCHERZINGER_API`` configures
// the base URL (default ``/api/v1`` for same-origin proxy / nginx). The
// historical mock-fallback paths have been removed — the BFF must be up
// for the app to render.
//
// Tests (Vitest): ``import.meta.env.MODE === 'test'`` flips on the mock
// resolver so component tests don't need a running backend. Per-call
// ``mockResolve`` callbacks remain the way to inject synthesised payloads
// (used by deep-link surfaces where a static JSON fixture would be wrong).

import { newTraceId } from '@/lib/observability';

const BASE = (import.meta.env.VITE_SCHERZINGER_API as string | undefined) || '/api/v1';
const USE_MOCKS = import.meta.env.MODE === 'test';

const mocks = import.meta.glob('../../data/mocks/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

function mockKey(path: string): string {
  return path.replace(/^\/screens\//, '/').replace(/^\//, '').replace(/\//g, '-');
}

type QueryParamValue = string | number | boolean | undefined | null;

export type QueryParams = Record<string, QueryParamValue>;

function buildQuery(params?: object): string {
  // P13.T3: every BFF request gets ?lang= from the pryzm_lang cookie unless
  // the caller already supplied one. The cookie is written by i18n/index.ts
  // on every languageChanged event.
  const cookieLang = readCookie('pryzm_lang');
  const merged = { ...((params ?? {}) as Record<string, unknown>) };
  if (cookieLang && merged.lang === undefined) merged.lang = cookieLang;

  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === '') continue;
    usp.append(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

function readMock<T>(path: string): T {
  const key = mockKey(path);
  const entry = Object.entries(mocks).find(([file]) => file.includes(`/${key}.json`));
  if (!entry) throw new Error(`No mock found for ${path} (looked for ${key}.json)`);
  return entry[1].default as T;
}

export async function apiFetch<T>(
  path: string,
  options?: { params?: object; mockResolve?: () => T },
): Promise<T> {
  // Tests don't have a backend; they resolve through the bundled mocks or a
  // per-call synthesizer. Production / dev always hits the network.
  if (USE_MOCKS) {
    if (options?.mockResolve) return options.mockResolve();
    return readMock<T>(path);
  }

  const url = `${BASE}${path}${buildQuery(options?.params)}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'x-pryzm-trace-id': newTraceId() },
  });

  if (res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('application/json')) {
      throw new Error(`API ${path} → expected JSON, got "${ct || 'no content-type'}"`);
    }
    let text = await res.text();
    // Strip UTF-8 BOM if present (some servers/proxies emit it).
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new Error(`API ${path} → invalid JSON: ${(err as Error).message}`);
    }
  }

  throw new Error(`API ${path} → ${res.status}`);
}

/**
 * POST a JSON body. Used by mutating endpoints (auth, actions). In mock mode
 * the call is a no-op that resolves to {} unless a custom `mockResolve`
 * is provided — mutating flows are exercised in vitest with mocked fetch.
 *
 * Honours the Phase 2 CSRF double-submit by forwarding the `pryzm_csrf`
 * cookie value as the `x-csrf` request header.
 */
export async function postJson<T>(
  path: string,
  body?: unknown,
  options?: {
    params?: object;
    mockResolve?: () => T;
    headers?: Record<string, string>;
  },
): Promise<T> {
  if (USE_MOCKS) {
    return (options?.mockResolve ? options.mockResolve() : ({} as T));
  }
  const url = `${BASE}${path}${buildQuery(options?.params)}`;

  const csrf = readCookie('pryzm_csrf');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-pryzm-trace-id': newTraceId(),
    ...(options?.headers ?? {}),
  };
  if (csrf) headers['x-csrf'] = csrf;

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('application/json')) {
      // 200 with empty body is acceptable for fire-and-forget POSTs.
      return {} as T;
    }
    return (await res.json()) as T;
  }

  const detail = await res.text();
  throw new Error(`API POST ${path} → ${res.status}: ${detail}`);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}
