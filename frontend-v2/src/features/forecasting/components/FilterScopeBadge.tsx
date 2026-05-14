// FilterScopeBadge — small pill that declares whether a card honors the
// active page-level filter (tier/family/cluster/scenario). Either an
// `(unfiltered — all clusters)` warning or a muted `(scope: …)` chip.
//
// Phase 8 review on v2 highlighted half-filtered cards as a worse
// failure mode than no filter at all. This primitive lets each card
// declare its contract explicitly.

import type { FilterScope } from '@/types/forecast';

interface Props {
  unfiltered?: boolean;
  scope?: FilterScope;
}

function scopeLabel(scope: FilterScope | undefined): string {
  if (!scope) return '';
  const parts: string[] = [];
  if (scope.tier) parts.push(`tier=${scope.tier}`);
  if (scope.family) parts.push(`family=${scope.family}`);
  if (scope.cluster) parts.push(`cluster=${scope.cluster}`);
  if (scope.scenarioId) parts.push(`scenario=${scope.scenarioId}`);
  return parts.join(' · ');
}

export function FilterScopeBadge({ unfiltered, scope }: Props) {
  const hasActiveFilter =
    !!scope && (!!scope.tier || !!scope.family || !!scope.cluster || !!scope.scenarioId);

  if (unfiltered) {
    if (!hasActiveFilter) return null; // no filter is active anyway — no badge needed
    return (
      <span
        data-testid="filter-scope-badge"
        data-variant="unfiltered"
        className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800"
      >
        unfiltered — all clusters
      </span>
    );
  }

  if (!hasActiveFilter) return null;
  return (
    <span
      data-testid="filter-scope-badge"
      data-variant="scoped"
      className="inline-flex items-center rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]"
    >
      scope: {scopeLabel(scope)}
    </span>
  );
}
