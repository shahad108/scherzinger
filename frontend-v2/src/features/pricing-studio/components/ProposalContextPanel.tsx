import { useMemo } from 'react';
import { CheckCircle2, Clock, FileText, ShieldCheck, AlertCircle } from 'lucide-react';
import { useProposals, useSubmitProposal } from '@/data/api/useProposals';
import type { ProposalRow } from '@/data/api/useRecommendation';

const STATUS_TONE: Record<ProposalRow['status'], { bg: string; fg: string; label: string; icon: React.ComponentType<{ size?: number }> }> = {
  draft: { bg: 'var(--surface-soft)', fg: 'var(--ink-2)', label: 'Draft', icon: FileText },
  pending_approval: { bg: 'color-mix(in oklab, var(--amber) 12%, white)', fg: 'var(--amber)', label: 'Pending approval', icon: Clock },
  approved: { bg: 'color-mix(in oklab, var(--green) 12%, white)', fg: 'var(--green)', label: 'Approved', icon: ShieldCheck },
  implemented: { bg: 'color-mix(in oklab, var(--green) 16%, white)', fg: 'var(--green)', label: 'Implemented', icon: CheckCircle2 },
  rejected: { bg: 'color-mix(in oklab, var(--red) 10%, white)', fg: 'var(--red)', label: 'Rejected', icon: AlertCircle },
};

interface Props {
  articleId: string;
  recommendationId?: string | null;
}

/**
 * Phase 5 — proposal lifecycle panel beside the Studio workbench.
 *
 * Lists every pricing_proposal for the open SKU (filtered by
 * recommendation when a deep link supplied one) and surfaces the
 * "Submit for approval" button on draft rows. Approval-required
 * proposals route to MD via the existing pricing/proposals/submit
 * endpoint. The panel is hidden when no proposal exists yet — the
 * DecisionFooter "Save as proposal" is the way to create one.
 */
export function ProposalContextPanel({ articleId, recommendationId }: Props) {
  const { data, isLoading } = useProposals({
    article_id: articleId,
    recommendation_id: recommendationId ?? undefined,
  });
  const submit = useSubmitProposal();

  const items = useMemo(() => data?.items ?? [], [data]);
  if (isLoading || items.length === 0) return null;

  return (
    <div className="mt-3 mb-4 rounded-[14px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--ink)]">
            Pricing proposals · {articleId}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
            {items.length} proposal{items.length === 1 ? '' : 's'} for this SKU.
            {recommendationId ? ' Filtered by the recommendation that opened this page.' : ''}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((p) => {
          const tone = STATUS_TONE[p.status] ?? STATUS_TONE.draft;
          const Icon = tone.icon;
          const delta = p.delta_pp != null ? `${p.delta_pp >= 0 ? '+' : ''}${p.delta_pp.toFixed(1)}pp` : '—';
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3"
            >
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide"
                style={{ background: tone.bg, color: tone.fg }}
              >
                <Icon size={11} /> {tone.label}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold tabular-nums text-[var(--ink)]">
                  €{(p.current_price ?? 0).toFixed(2)} →{' '}
                  <span className="text-[var(--rose-deep)]">
                    €{(p.proposed_price ?? 0).toFixed(2)}
                  </span>
                  <span className="ml-2 text-[11.5px] text-[var(--muted)]">Δ {delta}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                  Created {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                  {p.approval_required ? ' · MD approval required' : ''}
                </div>
              </div>
              {p.status === 'draft' && (
                <button
                  type="button"
                  onClick={() => submit.mutate(p.id)}
                  disabled={submit.isPending}
                  className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-white/70 disabled:opacity-60"
                >
                  {submit.isPending ? 'Submitting…' : 'Submit for approval'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
