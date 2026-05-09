import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';
import { useAuthStore, type MeUser } from '@/stores/authStore';

export function useLogin() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async (vars: { email: string; password: string }) => {
      const me = await postJson<MeUser>('/auth/login', vars);
      return me;
    },
    onSuccess: (me) => {
      setUser(me);
      qc.setQueryData(qk.me, me);
      // Force a refetch of any cached screens for the new user.
      qc.invalidateQueries();
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  return useMutation({
    mutationFn: () => postJson<{ status: string }>('/auth/logout'),
    onSuccess: () => {
      logout();
      qc.clear();
    },
  });
}

// Re-export so callers can also do plain GETs.
export { apiFetch };
