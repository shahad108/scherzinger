// Pricing Studio v3 / Phase 7 — publish + rollback + price-book hooks.
//
// Wraps the BFF push-to-quoting endpoints:
//   POST /pricing/sku/{aid}/publish     → publish receipt (or scheduled row)
//   POST /pricing/sku/{aid}/rollback    → rollback within the 72h window
//   GET  /pricing/sku/{aid}/price-book  → recent price_book rows
//
// Decimal-as-string is preserved end-to-end: the BFF accepts and emits
// prices as JSON strings via Pydantic Decimal serialisation; the mutation
// body keeps the cent-precise canonical string. Numbers never round-trip
// through a JS float here.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';

// ---------------------------------------------------------------------------
// Wire types — mirror the FastAPI payloads in `backend/api/v1/pricing.py`
// (PublishIn / RollbackIn / serialize_receipt / serialize_price_book_row).
// ---------------------------------------------------------------------------

export interface NotificationDispatched {
  channel: string;
  recipient: string;
  status: 'sent' | 'failed' | string;
  error?: string | null;
  dispatched_at?: string | null;
}

export interface PublishReceipt {
  id: string;
  aid: string;
  source_proposal_id: string | null;
  old_price_book_row_id: string | null;
  new_price_book_row_id: string;
  published_at: string | null;
  rolled_back_at: string | null;
  notifications_dispatched: NotificationDispatched[];
  published_by: string;
  rollback_reason: string | null;
}

export interface ScheduledPublish {
  id: string;
  aid: string;
  price: string;
  effective_at: string;
  source_proposal_id: string | null;
  status: string;
  created_by: string;
  created_at: string;
}

export interface PublishResponse {
  scheduled: boolean;
  receipt?: PublishReceipt;
  scheduled_publish?: ScheduledPublish;
}

export interface RollbackResponse {
  receipt: PublishReceipt;
}

export interface PriceBookRow {
  id: string;
  aid: string;
  price: string;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  source_proposal_id: string | null;
  lineage_ref_id: string | null;
  created_at: string | null;
}

export interface PriceBookResponse {
  aid: string;
  rows: PriceBookRow[];
}

// ---------------------------------------------------------------------------
// Query keys.
// ---------------------------------------------------------------------------

export const priceBookKey = (aid: string | null | undefined) =>
  ['price-book', aid ?? null] as const;

// ---------------------------------------------------------------------------
// usePriceBook — GET /pricing/sku/{aid}/price-book
// ---------------------------------------------------------------------------

export function usePriceBook(
  aid: string | null | undefined,
  options?: { limit?: number; enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && Boolean(aid);
  return useQuery<PriceBookResponse>({
    queryKey: priceBookKey(aid),
    enabled,
    queryFn: () =>
      apiFetch<PriceBookResponse>(
        `/pricing/sku/${encodeURIComponent(aid ?? '')}/price-book`,
        {
          params: { limit: options?.limit ?? 20 },
          mockResolve: () => ({ aid: aid ?? '', rows: [] }),
        },
      ),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// usePublishPrice — POST /pricing/sku/{aid}/publish
// ---------------------------------------------------------------------------

export interface PublishBody {
  /** Decimal-as-string. e.g. "127.00". */
  price: string;
  /** Optional ISO-8601 datetime. Omit / past → publishes immediately. */
  effective_at?: string | null;
  source_proposal_id?: string | null;
}

export function usePublishPrice(aid: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<PublishResponse, Error, PublishBody>({
    mutationFn: (body: PublishBody) =>
      postJson<PublishResponse>(
        `/pricing/sku/${encodeURIComponent(aid ?? '')}/publish`,
        body,
        {
          mockResolve: () => ({
            scheduled: Boolean(
              body.effective_at && new Date(body.effective_at) > new Date(),
            ),
            receipt: {
              id: `mock-receipt-${Date.now()}`,
              aid: aid ?? '',
              source_proposal_id: body.source_proposal_id ?? null,
              old_price_book_row_id: null,
              new_price_book_row_id: `mock-row-${Date.now()}`,
              published_at: new Date().toISOString(),
              rolled_back_at: null,
              notifications_dispatched: [],
              published_by: 'mock-user',
              rollback_reason: null,
            },
          }),
        },
      ),
    onSuccess: () => {
      // The studio hero current-price tile reads from ['studio']; the
      // price book panel reads from ['price-book']; the Action Center
      // recommendation card retires on the SSE event but we still
      // invalidate eagerly to avoid relying on the network round-trip.
      if (aid) qc.invalidateQueries({ queryKey: priceBookKey(aid) });
      qc.invalidateQueries({ queryKey: ['studio'] });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
      qc.invalidateQueries({ queryKey: ['pricing-proposals'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useRollback — POST /pricing/sku/{aid}/rollback
// ---------------------------------------------------------------------------

export interface RollbackBody {
  receipt_id: string;
  reason: string;
}

export function useRollback(aid: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<RollbackResponse, Error, RollbackBody>({
    mutationFn: (body: RollbackBody) =>
      postJson<RollbackResponse>(
        `/pricing/sku/${encodeURIComponent(aid ?? '')}/rollback`,
        body,
        {
          mockResolve: () => ({
            receipt: {
              id: body.receipt_id,
              aid: aid ?? '',
              source_proposal_id: null,
              old_price_book_row_id: null,
              new_price_book_row_id: `mock-row-${Date.now()}`,
              published_at: new Date().toISOString(),
              rolled_back_at: new Date().toISOString(),
              notifications_dispatched: [],
              published_by: 'mock-user',
              rollback_reason: body.reason,
            },
          }),
        },
      ),
    onSuccess: () => {
      if (aid) qc.invalidateQueries({ queryKey: priceBookKey(aid) });
      qc.invalidateQueries({ queryKey: ['studio'] });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers shared with the UI.
// ---------------------------------------------------------------------------

/**
 * Build a branded PDF URL — used by DecisionFooter's "Branded PDF" button.
 *
 * Pricing Studio v3 / Phase 10 — accepts optional `persona` + `lang` query
 * params so the BFF can swap rationale voice + language. Persona is purely
 * cosmetic for v3 (rationale text style); the BFF honours both knobs but
 * most numeric fields remain identical.
 */
export interface ProposalPdfUrlOpts {
  persona?: 'frank' | 'till' | 'manuel';
  lang?: 'en' | 'de';
}

export function proposalPdfUrl(
  proposalId: string,
  opts?: ProposalPdfUrlOpts,
): string {
  const base =
    (import.meta.env.VITE_SCHERZINGER_API as string | undefined) || '/api/v1';
  const qs = new URLSearchParams();
  if (opts?.persona) qs.set('persona', opts.persona);
  if (opts?.lang) qs.set('lang', opts.lang);
  const suffix = qs.toString();
  return `${base}/pricing/proposals/${encodeURIComponent(proposalId)}/pdf${
    suffix ? `?${suffix}` : ''
  }`;
}

/** True when a receipt is still within the 72h rollback window. */
export function isWithinRollbackWindow(
  publishedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return false;
  const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
  return now.getTime() - t < seventyTwoHoursMs;
}

/** Default effective date: next day 00:00 UTC, formatted as YYYY-MM-DDTHH:mm. */
export function defaultEffectiveAt(now: Date = new Date()): string {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  // Format as datetime-local style (UTC). Trimming the trailing Z so the
  // <input type="datetime-local"> accepts it.
  return next.toISOString().slice(0, 16);
}
