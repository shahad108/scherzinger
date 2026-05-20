// Phase 2 — Inline accuracy chip.
//
// Renders inside every forecast block header (HeroForecast, ClusterLens,
// WalkForward, NewProductForecast, TornadoCard, DistributionGrid). Click
// opens the LineageDrawer.

import { useState } from 'react';
import type { AccuracyBadgeData } from '@/types/forecast';
import { LineageDrawer } from './LineageDrawer';

interface Props {
  // value=null renders "—" instead of a fake percentage.
  data: Omit<AccuracyBadgeData, 'value'> & { value: number | null };
  entityType?: string;
  entityId?: string;
  modelId?: string;
  drawerTitle?: string;
}

const METRIC_LABEL: Record<AccuracyBadgeData['metric'], string> = {
  mape: 'MAPE',
  auc_roc: 'AUC',
  calibration_p80_hit: 'P80 hit',
  wape: 'WAPE',
};

function formatValue(metric: AccuracyBadgeData['metric'], value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (metric === 'mape' || metric === 'wape') return `${(value * 100).toFixed(1)}%`;
  if (metric === 'auc_roc') return value.toFixed(2);
  if (metric === 'calibration_p80_hit') return `${(value * 100).toFixed(0)}%`;
  return value.toFixed(2);
}

export function AccuracyBadge({ data, entityType, entityId, modelId, drawerTitle }: Props) {
  const [open, setOpen] = useState(false);
  const label = METRIC_LABEL[data.metric] ?? data.metric;

  return (
    <>
      <button
        type="button"
        data-testid="accuracy-badge"
        onClick={() => setOpen(true)}
        title="View model lineage"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[var(--ink-2)] hover:border-[var(--rose-deep)] hover:text-[var(--rose-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)]"
      >
        <span className="text-[var(--muted)]">{label}</span>
        <span className="tabular-nums">{formatValue(data.metric, data.value)}</span>
        <span className="text-[var(--muted)]">· n={data.n}</span>
        <span className="text-[var(--muted)]">· h={data.horizonMonths}mo</span>
      </button>
      <LineageDrawer
        open={open}
        onClose={() => setOpen(false)}
        entityType={entityType}
        entityId={entityId ?? data.clusterId}
        metric={data.metric}
        modelId={modelId ?? data.modelId}
        title={drawerTitle ?? `${label} ${formatValue(data.metric, data.value)} — lineage`}
      />
    </>
  );
}
