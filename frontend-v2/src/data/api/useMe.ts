import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiFetch } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';
import { useAuthStore, type MeUser } from '@/stores/authStore';

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({
    queryKey: qk.me,
    queryFn: () => apiFetch<MeUser>('/me'),
    staleTime: 5 * 60_000, // 5 min
    retry: false,
  });

  useEffect(() => {
    if (query.isSuccess) setUser(query.data);
    if (query.isError) setUser(null);
  }, [query.isSuccess, query.isError, query.data, setUser]);

  return query;
}
