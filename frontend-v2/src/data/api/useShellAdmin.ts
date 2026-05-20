// Phase 7 — admin mutations on the shell + saved views + sections +
// reviewer panels. Each hook wraps the matching FastAPI endpoint and
// invalidates the right cache so the right rail / sidebar / toggles
// refresh on success.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';

// ---------- sections ----------

export interface SidebarSection {
  id: string;
  title: string;
  sub: string | null;
  href: string;
  sort_order: number;
}

export interface CreateSectionBody {
  title: string;
  sub?: string;
  href: string;
}

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSectionBody) =>
      postJson<SidebarSection>('/sections', body, {
        mockResolve: () => ({
          id: `mock-section-${Date.now()}`,
          title: body.title,
          sub: body.sub ?? null,
          href: body.href,
          sort_order: 0,
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shell() }),
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

export function useSavedViews(screen: string) {
  return useQuery({
    queryKey: ['saved-views', screen] as const,
    queryFn: () =>
      apiFetch<{ items: SavedView[] }>('/saved-views', {
        params: { screen },
        mockResolve: () => ({ items: readSynth<SavedView>('saved_views').filter((v) => v.screen === screen) }),
      }),
    staleTime: 30_000,
  });
}

export interface CreateSavedViewBody {
  screen: string;
  label: string;
  filters: Record<string, unknown>;
  is_default?: boolean;
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSavedViewBody) =>
      postJson<SavedView>('/saved-views', body, {
        mockResolve: () => {
          const row: SavedView = {
            id: `mock-view-${Date.now()}`,
            screen: body.screen,
            label: body.label,
            filters: body.filters,
            is_default: body.is_default ?? false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          writeSynth('saved_views', [row, ...readSynth<SavedView>('saved_views')]);
          return row;
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views'] }),
  });
}

// ---------- reviewers ----------

export interface Reviewer {
  id: string;
  initials: string;
  bg: string;
  sort_order?: number;
}

export interface AddReviewerBody {
  initials: string;
  bg?: string;
}

export function useAddReviewer(panelId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddReviewerBody) =>
      postJson<Reviewer>(`/panels/${panelId}/reviewers`, body, {
        mockResolve: () => ({
          id: `mock-reviewer-${Date.now()}`,
          initials: body.initials.toUpperCase().slice(0, 4),
          bg: body.bg ?? '#7c66dc',
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shell() }),
  });
}

// ---------- search ----------

export interface SearchHit {
  kind: 'article' | 'customer' | 'recommendation';
  id: string;
  title: string;
  subtitle: string;
  route: string;
  query: Record<string, string | number | boolean | undefined | null>;
}

export function useGlobalSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['search', trimmed] as const,
    enabled: trimmed.length >= 2,
    queryFn: () =>
      apiFetch<{ query: string; results: SearchHit[] }>('/search', {
        params: { q: trimmed, limit: 5 },
        mockResolve: () => ({
          query: trimmed,
          results: synthSearch(trimmed),
        }),
      }),
    staleTime: 10_000,
  });
}

// ---------- mock-mode synthesizers ----------

const SYNTH_PREFIX = 'pryzm_v2_admin_';
function synthKey(slot: string) {
  return `${SYNTH_PREFIX}${slot}`;
}
function readSynth<T>(slot: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(synthKey(slot)) ?? '[]');
  } catch {
    return [];
  }
}
function writeSynth<T>(slot: string, rows: T[]) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(synthKey(slot), JSON.stringify(rows));
}

function synthSearch(needle: string): SearchHit[] {
  const lower = needle.toLowerCase();
  const articles = ['200832-E', '204604', '205169', '200834-B', '201773', '205418-A'];
  const out: SearchHit[] = [];
  for (const aid of articles) {
    if (aid.toLowerCase().includes(lower)) {
      out.push({
        kind: 'article',
        id: aid,
        title: `${aid} · Pump article`,
        subtitle: 'Mock product',
        route: '/pricing',
        query: { aid, source: 'search' },
      });
    }
  }
  if ('customer'.startsWith(lower) || lower.includes('cust')) {
    out.push({
      kind: 'customer',
      id: '102330',
      title: '102330 · Mock customer',
      subtitle: 'Customer',
      route: '/quotes',
      query: { customer: '102330', source: 'search' },
    });
  }
  return out.slice(0, 5);
}
