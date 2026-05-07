import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { ShellRailData } from '@/types/shell';

export function useShell() {
  return useQuery({
    queryKey: ['shell'] as const,
    queryFn: () => apiFetch<ShellRailData>('/shell'),
    staleTime: 60_000,
  });
}
