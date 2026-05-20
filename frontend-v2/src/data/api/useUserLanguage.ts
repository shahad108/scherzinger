// Pricing Studio v3 / Phase 10 — server-backed user language preference.
//
// Reads/writes the canonical `users/me/language` BFF endpoint (see
// `backend/api/v1/preferences.py`). All BFF surfaces that accept a `lang`
// query param resolve through this preference; the LanguageToggle in the
// top bar mutates it.
//
// Reads have a 5-minute staleTime — the value is shared across the entire
// app, so once we have it, every subsequent screen mount can reuse it.
// Writes invalidate every query key so all language-sensitive payloads
// (briefing, PDF, persona-toggled rationale, future translated copy)
// refetch with the new value.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export type UserLanguage = 'en' | 'de';

export interface UserLanguagePayload {
  lang: UserLanguage;
}

export const USER_LANGUAGE_KEY = ['me', 'language'] as const;

const DEFAULT_LANGUAGE: UserLanguage = 'en';

async function putLanguage(lang: UserLanguage): Promise<UserLanguagePayload> {
  const base =
    (import.meta.env.VITE_SCHERZINGER_API as string | undefined) || '/api/v1';
  const csrf = readCookie('pryzm_csrf');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf) headers['x-csrf'] = csrf;
  const res = await fetch(`${base}/users/me/language`, {
    method: 'PUT',
    credentials: 'include',
    headers,
    body: JSON.stringify({ lang }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PUT /users/me/language → ${res.status}: ${detail}`);
  }
  return (await res.json()) as UserLanguagePayload;
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

/**
 * Returns the user's current language preference. Defaults to ``en`` while
 * the query is loading or if the BFF call errors — the UI never has to
 * guard against `undefined` here. Hits the BFF at most once per 5 minutes.
 */
export function useUserLanguage(): {
  lang: UserLanguage;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: USER_LANGUAGE_KEY,
    queryFn: () => apiFetch<UserLanguagePayload>('/users/me/language'),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const lang = (query.data?.lang ?? DEFAULT_LANGUAGE) as UserLanguage;
  return { lang, isLoading: query.isLoading };
}

/**
 * Mutation that PUTs a new language to the BFF and invalidates every
 * query in the cache so language-sensitive surfaces (briefing, PDF,
 * future translated copy) refetch. Throws on non-2xx.
 */
export function useSetUserLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lang: UserLanguage) => putLanguage(lang),
    onSuccess: (data) => {
      qc.setQueryData(USER_LANGUAGE_KEY, data);
      // Broad invalidation: every Studio / Forecasting / briefing payload
      // accepts ``lang`` so flip everything to the new tongue.
      qc.invalidateQueries();
    },
  });
}
