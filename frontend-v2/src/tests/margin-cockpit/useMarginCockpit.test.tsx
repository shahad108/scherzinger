import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { useMarginCockpit } from '@/data/api/useMarginCockpit';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useMarginCockpit', () => {
  it('loads margin-cockpit mock and exposes the page payload', async () => {
    const { result } = renderHook(() => useMarginCockpit(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.header.title).toBe('Margin Intelligence');
    expect(data.health).toHaveLength(4);
    expect(data.waterfall.buckets).toHaveLength(7);
    expect(data.tabs.seg.subPanes).toHaveLength(4);
  });
});
