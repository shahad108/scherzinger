// Pricing Studio v3 / 2026-05-19 coherence pass — AI insights hook.
//
// Backs <AiInsightsPane> via GET /api/v1/briefing/sku/{aid}/insights
// The BFF synthesises three buckets — gains / risks / watch — from the
// recommendation + customer_fanout summary blocks. Output is structured
// (not markdown) so the FE can render three toned cards without any
// parsing on the hot path. Cached 24h server-side keyed on
// (aid, persona, lang); pass `?regenerate=1` to bust the cache.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export interface AiInsight {
  headline: string;
  body_md: string;
}

export interface AiInsightsPayload {
  aid: string;
  persona: string;
  lang: string;
  model: string;
  computed_at: string;
  gains: AiInsight[];
  risks: AiInsight[];
  watch: AiInsight[];
}

export const aiInsightsKey = (
  aid: string,
  persona: string,
  lang: string | null,
) => ['ai-insights', 'sku', aid, persona, lang ?? 'auto'] as const;

export function useAiInsights(
  aid: string | null | undefined,
  persona: string = 'frank',
  lang: string | null = null,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && Boolean(aid);
  return useQuery({
    queryKey: aiInsightsKey(aid ?? '', persona, lang),
    enabled,
    queryFn: () => {
      const params: Record<string, string> = { persona };
      if (lang) params.lang = lang;
      return apiFetch<AiInsightsPayload>(
        `/briefing/sku/${encodeURIComponent(aid ?? '')}/insights`,
        {
          params,
          mockResolve: () => ({
            aid: aid ?? '',
            persona,
            lang: lang ?? 'en',
            model: 'mock-v0',
            computed_at: new Date().toISOString(),
            gains: [],
            risks: [],
            watch: [],
          }),
        },
      );
    },
    staleTime: 5 * 60_000,
  });
}
