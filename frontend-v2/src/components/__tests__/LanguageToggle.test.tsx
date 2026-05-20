// Pricing Studio v3 / Phase 10 — LanguageToggle tests.
//
// Covers the toggle's three responsibilities:
//   1. Reads current language via GET /api/v1/users/me/language.
//   2. On click, PUTs the new value to the BFF.
//   3. After a successful PUT, invalidates every query in the cache so
//      every lang-sensitive surface refetches.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { LanguageToggle } from '../LanguageToggle';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>(
    '@/lib/api/client',
  );
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('LanguageToggle', () => {
  it('reads the current language and shows EN active when server returns en', async () => {
    apiFetchMock.mockResolvedValueOnce({ lang: 'en' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LanguageToggle />, { wrapper: wrap(qc) });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith('/users/me/language');
    await waitFor(() => {
      expect(screen.getByTestId('language-toggle-en')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  it('renders the Beta badge next to the German option', async () => {
    apiFetchMock.mockResolvedValueOnce({ lang: 'en' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LanguageToggle />, { wrapper: wrap(qc) });
    expect(screen.getByTestId('language-toggle-de-beta')).toBeInTheDocument();
    expect(screen.queryByTestId('language-toggle-en-beta')).not.toBeInTheDocument();
  });

  it('PUTs the new language and invalidates every query on click', async () => {
    apiFetchMock.mockResolvedValueOnce({ lang: 'en' });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ lang: 'de' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    render(<LanguageToggle />, { wrapper: wrap(qc) });

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('language-toggle-de'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/me/language');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ lang: 'de' });
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });

  it('reverts to the previous language when the PUT fails', async () => {
    apiFetchMock.mockResolvedValueOnce({ lang: 'en' });
    const fetchMock = vi.fn(async () =>
      new Response('boom', { status: 500 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<LanguageToggle />, { wrapper: wrap(qc) });
    await waitFor(() =>
      expect(screen.getByTestId('language-toggle-en')).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    fireEvent.click(screen.getByTestId('language-toggle-de'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // After server error, EN regains active state.
    await waitFor(() =>
      expect(screen.getByTestId('language-toggle-en')).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
  });
});
