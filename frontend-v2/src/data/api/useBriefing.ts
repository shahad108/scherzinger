// Pricing Studio v3 / Phase 13 — per-SKU rationale briefing.
//
// Backs `<RationaleMemo>` via
// GET /api/v1/briefing/sku/{aid}?persona=&lang=
//
// The BFF returns a small JSON payload with `rationale_md` — markdown text
// composed from the per-aid recommendation, WTP samples, floor protection,
// and competitor signal. When the recommendation pipeline can't compose a
// real rationale the BFF still returns a "fallback recommendation; inputs
// missing" string so the UI can surface honest text rather than the static
// seed memo.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

export interface BriefingPayload {
  aid: string;
  persona: string;
  lang: string;
  rationale_md: string;
}

export const briefingKey = (
  aid: string,
  persona: string,
  lang: string | null,
) => ['briefing', 'sku', aid, persona, lang ?? 'auto'] as const;

export function useBriefing(
  aid: string | null | undefined,
  persona: string = 'frank',
  lang: string | null = null,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && Boolean(aid);
  return useQuery({
    queryKey: briefingKey(aid ?? '', persona, lang),
    enabled,
    queryFn: () => {
      const params: Record<string, string> = { persona };
      if (lang) params.lang = lang;
      return apiFetch<BriefingPayload>(
        `/briefing/sku/${encodeURIComponent(aid ?? '')}`,
        {
          params,
          mockResolve: () => ({
            aid: aid ?? '',
            persona,
            lang: lang ?? 'en',
            rationale_md: '',
          }),
        },
      );
    },
    staleTime: 60_000,
  });
}
