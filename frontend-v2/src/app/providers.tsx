import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { ActionFeedback } from '@/components/ui/ActionFeedback';
import { useEffect, useState, type ReactNode } from 'react';
import { useDensity } from '@/hooks/useDensity';
import { reportError } from '@/lib/observability';
import { useAuthStore } from '@/stores/authStore';
import '@/i18n';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    // P15.T3: every failed query / mutation funnels through reportError so a
    // future Sentry transport sees them with persona + query_key tags.
    return new QueryClient({
      queryCache: new QueryCache({
        onError: (err, query) => {
          const persona = useAuthStore.getState().user?.ui_persona;
          reportError(err, {
            query_key: query.queryKey,
            route: typeof window !== 'undefined' ? window.location.pathname : undefined,
            persona,
          });
        },
      }),
      mutationCache: new MutationCache({
        onError: (err, _vars, _ctx, mutation) => {
          const persona = useAuthStore.getState().user?.ui_persona;
          reportError(err, {
            query_key: mutation.options.mutationKey,
            route: typeof window !== 'undefined' ? window.location.pathname : undefined,
            persona,
          });
        },
      }),
      defaultOptions: {
        queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
      },
    });
  });
  useDensity();
  useEffect(() => {
    document.documentElement.lang = 'de';
  }, []);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        {children}
        <ActionFeedback />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
