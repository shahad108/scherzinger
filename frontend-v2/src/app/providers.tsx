import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { useEffect, useState, type ReactNode } from 'react';
import { useDensity } from '@/hooks/useDensity';
import '@/i18n';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  useDensity();
  useEffect(() => {
    document.documentElement.lang = 'de';
  }, []);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
