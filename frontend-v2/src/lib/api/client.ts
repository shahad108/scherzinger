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

function readMock<T>(path: string): T {
  const key = mockKey(path);
  const entry = Object.entries(mocks).find(([file]) => file.includes(`/${key}.json`));
  if (!entry) throw new Error(`No mock found for ${path} (looked for ${key}.json)`);
  return entry[1].default as T;
}

const FALLBACK_STATUSES = new Set([404, 503]);

export async function apiFetch<T>(path: string): Promise<T> {
  if (USE_MOCKS) {
    return readMock<T>(path);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { credentials: 'include' });
  } catch (err) {
    // Network error / DNS / CORS preflight failure / etc.
    if (ALLOW_FALLBACK) {
      console.warn(`[apiFetch] ${path} network error — falling back to mock`, err);
      return readMock<T>(path);
    }
    throw err;
  }

  if (res.ok) {
    return (await res.json()) as T;
  }

  if (ALLOW_FALLBACK && FALLBACK_STATUSES.has(res.status)) {
    console.warn(`[apiFetch] ${path} → ${res.status} — falling back to mock`);
    return readMock<T>(path);
  }

  throw new Error(`API ${path} → ${res.status}`);
}
