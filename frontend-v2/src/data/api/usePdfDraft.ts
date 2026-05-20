// Pricing Studio v3 / 2026-05-19 coherence pass — PDF draft mutation.
//
// Backs the "Branded PDF" preview popover via
// POST /api/v1/briefing/sku/{aid}/pdf-draft. Returns the structured
// narrative blocks the PDF renderer composes (exec_summary, bullets,
// risks, next_steps). Today we render the blocks inline as a preview;
// a follow-up will swap the legacy hard-coded PDF for this content.

import { useMutation } from '@tanstack/react-query';
import { postJson } from '@/lib/api/client';

export interface PdfDraftRequest {
  persona?: 'frank' | 'till' | 'manuel';
  lang?: 'en' | 'de';
  proposed_price?: string | null;
}

export interface PdfDraftPayload {
  aid: string;
  persona_used: string;
  lang: string;
  exec_summary: string;
  bullets: string[];
  risks: string[];
  next_steps: string[];
  model: string;
}

export function usePdfDraft(aid: string | null | undefined) {
  return useMutation({
    mutationFn: (req: PdfDraftRequest) =>
      postJson<PdfDraftPayload>(
        `/briefing/sku/${encodeURIComponent(aid ?? '')}/pdf-draft`,
        req,
      ),
  });
}
