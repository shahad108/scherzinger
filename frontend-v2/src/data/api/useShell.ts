import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type ShellParams } from '@/lib/api/queryKeys';
import type { ShellRailData } from '@/types/shell';

export function useShell(params?: ShellParams) {
  return useQuery({
    queryKey: qk.shell(params),
    queryFn: () => apiFetch<ShellRailData>('/screens/shell', { params }),
    staleTime: 60_000,
  });
}
