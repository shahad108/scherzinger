// Single fetcher for all data.
//
// Modes (controlled by env at build time):
//   1. Pure mock          — VITE_SCHERZINGER_API unset.
//                           apiFetch always reads from src/data/mocks/<key>.json.
//   2. Pure API           — VITE_SCHERZINGER_API set, VITE_ALLOW_MOCK_FALLBACK
//                           unset or "0". apiFetch hits the network; failures
//                           surface to React Query.
//   3. Hybrid             — VITE_SCHERZINGER_API set, VITE_ALLOW_MOCK_FALLBACK="1".
//                           apiFetch hits the network and, on network error
//                           or 404 / 503, falls back to the bundled mock for
//                           that path. Used while the BFF is partial.
//
// The mock-key convention strips the leading slash and replaces the rest with
// hyphens. So /action-center -> action-center.json and /margin-cockpit ->
// margin-cockpit.json.

import { newTraceId } from '@/lib/observability';

const BASE = import.meta.env.VITE_SCHERZINGER_API as string | undefined;
const ALLOW_FALLBACK = import.meta.env.VITE_ALLOW_MOCK_FALLBACK === '1';
const USE_MOCKS = !BASE;

const mocks = import.meta.glob('../../data/mocks/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

function mockKey(path: string): string {
  return path.replace(/^\//, '').replace(/\//g, '-');
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

function buildQuery(params?: QueryParams): string {
  // P13.T3: every BFF request gets ?lang= from the pryzm_lang cookie unless
  // the caller already supplied one. The cookie is written by i18n/index.ts
  // on every languageChanged event.
  const cookieLang = readCookie('pryzm_lang');
  const merged: QueryParams = { ...(params ?? {}) };
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

const FALLBACK_STATUSES = new Set([404, 503]);

export async function apiFetch<T>(
  path: string,
  options?: { params?: QueryParams },
): Promise<T> {
  if (USE_MOCKS) {
    // Mocks ignore params: every shape is fully covered by the bundled JSON.
    return readMock<T>(path);
  }

  const url = `${BASE}${path}${buildQuery(options?.params)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      headers: { 'x-pryzm-trace-id': newTraceId() },
    });
  } catch (err) {
    // Network error / DNS / CORS preflight failure / etc.
    if (ALLOW_FALLBACK) {
      console.warn(`[apiFetch] ${path} network error — falling back to mock`, err);
      return readMock<T>(path);
    }
    throw err;
  }

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

  if (ALLOW_FALLBACK && FALLBACK_STATUSES.has(res.status)) {
    console.warn(`[apiFetch] ${path} → ${res.status} — falling back to mock`);
    return readMock<T>(path);
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
    params?: QueryParams;
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
