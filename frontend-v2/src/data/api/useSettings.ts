// Phase 14 — settings hooks: profile, preferences, saved views, notes.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import { apiFetch, postJson } from '@/lib/api/client';

// ---------- preferences ----------

export interface UserPreferences {
  language: 'de' | 'en';
  density: 'comfortable' | 'compact';
  default_persona: 'frank' | 'till' | 'heiko';
  briefing_email_cadence: 'daily' | 'weekly' | 'off';
  notify_quotes: boolean;
  notify_margin: boolean;
  notify_pro: boolean;
  updated_at: string | null;
}

export type PreferencesPatch = Partial<Omit<UserPreferences, 'updated_at'>>;

const PREFS_KEY: QueryKey = ['me', 'preferences'];

export function usePreferences() {
  return useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => apiFetch<UserPreferences>('/me/preferences'),
    staleTime: 60_000,
  });
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const base = import.meta.env.VITE_SCHERZINGER_API as string | undefined;
  if (!base) return {} as T;
  const csrf = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('pryzm_csrf='))
    ?.slice('pryzm_csrf='.length);
  const res = await fetch(`${base}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrf': decodeURIComponent(csrf) } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API PATCH ${path} → ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function usePatchPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PreferencesPatch) => patchJson<UserPreferences>('/me/preferences', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: PREFS_KEY }),
  });
}

export function usePatchProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string }) => patchJson<{ id: string; name: string; email: string }>('/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

// ---------- saved views ----------

export interface SavedView {
  id: string;
  screen: string;
  label: string;
  filters: Record<string, unknown>;
  is_default: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export function useSavedViews(screen?: string) {
  return useQuery({
    queryKey: ['saved-views', screen ?? 'all'],
    queryFn: () =>
      apiFetch<{ items: SavedView[] }>('/saved-views', screen ? { params: { screen } } : undefined),
    staleTime: 60_000,
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { screen: string; label: string; filters?: Record<string, unknown>; is_default?: boolean }) =>
      postJson<SavedView>('/saved-views', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views'] }),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const base = import.meta.env.VITE_SCHERZINGER_API as string | undefined;
      if (!base) return { status: 'ok' as const };
      const csrf = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('pryzm_csrf='))
        ?.slice('pryzm_csrf='.length);
      const res = await fetch(`${base}/saved-views/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: csrf ? { 'x-csrf': decodeURIComponent(csrf) } : undefined,
      });
      if (!res.ok) throw new Error(`DELETE /saved-views/${id} → ${res.status}`);
      return res.json() as Promise<{ status: string }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views'] }),
  });
}

// ---------- notes ----------

export interface Note {
  id: string;
  title: string | null;
  body: string;
  pinned: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export function useNotes(q?: string) {
  return useQuery({
    queryKey: ['notes', q ?? ''],
    queryFn: () =>
      apiFetch<{ items: Note[] }>('/notes', q ? { params: { q } } : undefined),
    staleTime: 30_000,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string | null; body: string; pinned?: boolean }) =>
      postJson<Note>('/notes', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function usePatchNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { title?: string | null; body?: string; pinned?: boolean } }) =>
      patchJson<Note>(`/notes/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const base = import.meta.env.VITE_SCHERZINGER_API as string | undefined;
      if (!base) return { status: 'ok' as const };
      const csrf = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('pryzm_csrf='))
        ?.slice('pryzm_csrf='.length);
      const res = await fetch(`${base}/notes/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: csrf ? { 'x-csrf': decodeURIComponent(csrf) } : undefined,
      });
      if (!res.ok) throw new Error(`DELETE /notes/${id} → ${res.status}`);
      return res.json() as Promise<{ status: string }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}
