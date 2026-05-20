import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postJson } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';

/**
 * Mark a notification read by its external id (e.g. 'pro', 'sku') or
 * internal UUID. Invalidates the shell rail so the unread dot disappears.
 *
 * Mock-mode: this is a no-op that resolves to {} so dev work without a
 * backend keeps clicking smoothly. Real-mode: hits POST /notifications/{id}/read.
 */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postJson<{ status: string }>(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shell() });
    },
  });
}

interface SectionPayload {
  title: string;
  sub?: string | null;
  href: string;
  sort_order?: number;
}

export function useAddSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SectionPayload) => postJson<{ id: string }>('/sections', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shell() }),
  });
}

export function usePatchSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SectionPayload }) =>
      postJson<{ id: string }>(`/sections/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shell() }),
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    // postJson is POST-only; delete uses fetch directly.
    mutationFn: async (id: string) => {
      const base = import.meta.env.VITE_SCHERZINGER_API as string | undefined;
      if (!base) return { status: 'ok' as const };
      const csrf = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('pryzm_csrf='))
        ?.slice('pryzm_csrf='.length);
      const res = await fetch(`${base}/sections/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: csrf ? { 'x-csrf': decodeURIComponent(csrf) } : undefined,
      });
      if (!res.ok) throw new Error(`DELETE /sections/${id} → ${res.status}`);
      return res.json() as Promise<{ status: string }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shell() }),
  });
}
