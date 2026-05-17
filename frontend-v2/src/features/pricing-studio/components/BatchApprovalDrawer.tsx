// Pricing Studio v3 / Phase 6 — Batch Approval Drawer.
//
// Right-rail drawer opened from the Batch Workbench commit button. Body
// renders the routing breakdown so the user can see who must approve what
// before they confirm. Three primary actions:
//
//   - "Confirm and submit all" → POST /pricing/batches/{id}/commit
//   - "Edit selection"          → close drawer; user can lock more rows
//   - "Cancel"                  → POST /pricing/batches/{id}/cancel

import { useMemo } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import {
  useCancelBatch,
  useCommitBatch,
  type BatchEnvelope,
} from '@/data/api/useBatch';
import { parseDecimal } from '../lib/decimal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch: BatchEnvelope | null;
  lockedAids: string[];
  /** Called after a successful commit so the page can close the drawer + clear state. */
  onCommitted?: (summary: unknown) => void;
  /** Called after a successful cancel so the page can clear state. */
  onCancelled?: () => void;
}

interface BucketSpec {
  key: string;
  label: string;
  sub: string;
}

const BUCKETS: BucketSpec[] = [
  {
    key: 'auto_approve',
    label: 'Auto-approve',
    sub: 'Within delta band · tier C/D — skips approval',
  },
  {
    key: 'manuel',
    label: 'Route to Manuel',
    sub: 'Mid-band moves (Δ > 5%) — sales-controller review',
  },
  {
    key: 'md',
    label: 'Route to MD',
    sub: 'Tier A or Δ > 10% — managing-director sign-off',
  },
  {
    key: 'block',
    label: 'Blocked',
    sub: 'Floor / ceiling violations — must be fixed before commit',
  },
];

function fmtEuroSigned(n: number): string {
  if (!Number.isFinite(n) || n === 0) {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(0);
  }
  const sign = n >= 0 ? '+' : '−';
  return `${sign}${new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.abs(n))}`;
}

export function BatchApprovalDrawer({
  open,
  onOpenChange,
  batch,
  lockedAids,
  onCommitted,
  onCancelled,
}: Props) {
  const batchId = batch?.batch_id ?? null;
  const commit = useCommitBatch(batchId);
  const cancel = useCancelBatch(batchId);

  const lockedSet = useMemo(() => new Set(lockedAids), [lockedAids]);

  // Aggregate impact per bucket. Locked items are excluded from auto/manuel/md
  // counts since they will not commit; blocked items remain blocked regardless.
  const bucketImpacts = useMemo(() => {
    if (!batch) return {} as Record<string, { count: number; impact: number }>;
    const out: Record<string, { count: number; impact: number }> = {};
    for (const item of batch.items) {
      const locked = lockedSet.has(item.aid);
      const before = parseDecimal(item.before_price);
      const after = parseDecimal(item.after_price);
      const delta =
        Number.isFinite(before) && Number.isFinite(after) ? after - before : 0;
      const preview = item.preview;
      const bucket = preview.block
        ? 'block'
        : preview.auto_approve
          ? 'auto_approve'
          : preview.approval_route.includes('md')
            ? 'md'
            : preview.approval_route.includes('manuel')
              ? 'manuel'
              : 'other';
      if (locked && bucket !== 'block') continue;
      if (!out[bucket]) out[bucket] = { count: 0, impact: 0 };
      out[bucket].count += 1;
      out[bucket].impact += delta;
    }
    return out;
  }, [batch, lockedSet]);

  const handleConfirm = () => {
    if (!batchId) return;
    commit.mutate(
      { dry_run: false, locked_aids: lockedAids },
      {
        onSuccess: (data) => {
          onOpenChange(false);
          onCommitted?.(data);
        },
      },
    );
  };

  const handleCancel = () => {
    if (!batchId) {
      onOpenChange(false);
      return;
    }
    cancel.mutate(undefined, {
      onSuccess: () => {
        onOpenChange(false);
        onCancelled?.();
      },
    });
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={480}
      title="Batch approval"
    >
      <div
        className="batch-approval-drawer"
        data-testid="batch-approval-drawer"
      >
        <header className="batch-approval-drawer-head">
          <div className="batch-approval-drawer-eyebrow">Batch approval</div>
          <h2 className="batch-approval-drawer-title">
            Submit {batch?.items.length ?? 0} SKUs for approval
          </h2>
        </header>

        <div className="batch-approval-drawer-body">
          {BUCKETS.map((bucket) => {
            const impact = bucketImpacts[bucket.key] ?? { count: 0, impact: 0 };
            if (impact.count === 0) return null;
            return (
              <div
                key={bucket.key}
                className="batch-approval-routing-row"
                data-testid={`batch-routing-row-${bucket.key}`}
              >
                <div>
                  <div className="batch-approval-routing-row-label">
                    {bucket.label}
                  </div>
                  <div className="batch-approval-routing-row-sub">{bucket.sub}</div>
                </div>
                <div className="batch-approval-routing-row-count">
                  {impact.count}{' '}
                  <span style={{ fontWeight: 500, color: 'var(--muted)' }}>
                    SKUs
                  </span>
                </div>
                <div className="batch-approval-routing-row-impact">
                  {fmtEuroSigned(impact.impact)} impact
                </div>
              </div>
            );
          })}

          {Object.keys(bucketImpacts).length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: 12.5,
              }}
            >
              No items to route. Adjust the rule or unlock SKUs.
            </div>
          )}
        </div>

        <footer className="batch-approval-drawer-footer">
          <button
            type="button"
            className="ghost"
            onClick={handleCancel}
            disabled={cancel.isPending}
            data-testid="batch-drawer-cancel-button"
          >
            Cancel batch
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => onOpenChange(false)}
            data-testid="batch-drawer-edit-selection-button"
          >
            Edit selection
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleConfirm}
            disabled={
              commit.isPending ||
              !batchId ||
              (batch?.items.length ?? 0) === 0
            }
            data-testid="batch-drawer-confirm-button"
          >
            {commit.isPending ? 'Submitting…' : 'Confirm and submit all'}
          </button>
        </footer>
      </div>
    </Drawer>
  );
}
