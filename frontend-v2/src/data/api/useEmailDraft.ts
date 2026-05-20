// Pricing Studio v3 / 2026-05-19 coherence pass — Email draft mutation.
//
// Backs <EmailDraftDrawer> via POST /api/v1/briefing/sku/{aid}/email-draft.
// Returns {subject, body_md} so the drawer can render two editable fields
// + a "Copy to clipboard" + an mailto: link.

import { useMutation } from '@tanstack/react-query';
import { postJson } from '@/lib/api/client';

export interface EmailDraftRequest {
  persona?: 'frank' | 'till' | 'manuel';
  lang?: 'en' | 'de';
  proposed_price?: string | null;
}

export interface EmailDraftPayload {
  aid: string;
  persona_used: string;
  lang: string;
  subject: string;
  body_md: string;
  model: string;
}

export function useEmailDraft(aid: string | null | undefined) {
  return useMutation({
    mutationFn: (req: EmailDraftRequest) =>
      postJson<EmailDraftPayload>(
        `/briefing/sku/${encodeURIComponent(aid ?? '')}/email-draft`,
        req,
      ),
  });
}
