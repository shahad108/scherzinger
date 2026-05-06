// Single fetcher for all data. Phase 0-7: reads from JSON mocks.
// Phase 8: same signature, hits Scherzinger backend behind VITE_SCHERZINGER_API.

const USE_MOCKS = !import.meta.env.VITE_SCHERZINGER_API;

const mocks = import.meta.glob('../../data/mocks/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

function mockKey(path: string): string {
  return path.replace(/^\//, '').replace(/\//g, '-');
}

export async function apiFetch<T>(path: string): Promise<T> {
  if (USE_MOCKS) {
    const key = mockKey(path);
    const entry = Object.entries(mocks).find(([file]) => file.includes(`/${key}.json`));
    if (!entry) throw new Error(`No mock found for ${path} (looked for ${key}.json)`);
    return entry[1].default as T;
  }
  const base = import.meta.env.VITE_SCHERZINGER_API as string;
  const res = await fetch(`${base}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return (await res.json()) as T;
}
