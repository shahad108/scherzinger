// Pricing Studio v3 / Phase 4 — "What changed since you last looked" strip.
//
// Renders ONLY when the diff endpoint returns ≥1 changes. Lives above the
// TriggerBanner; each row is a focusable button that either deep-links to
// its `link_target` or opens the AuditDrawer. The Dismiss button calls the
// diff endpoint again (side-effect: stamps `last_seen_at = now()` on the
// server), clearing the changes list locally so the strip collapses.
//
// Per §4.4: subtle rose-tint background, no heavy chrome.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmt } from '@/lib/format';
import { parseDecimal } from '@/features/pricing-studio/lib/decimal';
import {
  useSkuDiff,
  useDismissSkuDiff,
  type SkuDiffChange,
  type SkuDiffChangeKind,
} from '@/data/api/useSkuDiff';

interface Props {
  aid: string;
  onOpenAudit: () => void;
}

const KIND_LABEL: Record<SkuDiffChangeKind, string> = {
  cost: 'Cost',
  competitor_signal: 'Competitor moved',
  proposal: 'New proposal',
  customer_risk: 'Churn risk',
  price: 'Price',
};

export function WhatChangedStrip({ aid, onOpenAudit }: Props) {
  const navigate = useNavigate();
  const query = useSkuDiff(aid, { enabled: Boolean(aid) });
  const dismiss = useDismissSkuDiff(aid);

  const changes = query.data?.changes ?? [];
  const since = query.data?.since ?? null;

  const sinceText = useMemo(() => formatSince(since), [since]);

  if (query.isLoading || !query.data || changes.length === 0) return null;

  return (
    <section
      data-testid="what-changed-strip"
      className="mb-3 rounded-[12px] border border-[var(--rose-border)] bg-[var(--rose-bg)] px-4 py-3 shadow-[var(--shadow-card)]"
      aria-label="What changed since your last visit"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--rose-deep)]">
          Since your last visit{sinceText ? ` · ${sinceText}` : ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAudit}
            data-testid="what-changed-open-audit"
            className="rounded-md border border-[var(--rose-border)] bg-white px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--rose-deep)] hover:bg-[var(--rose-bg)]"
          >
            Open audit
          </button>
          <button
            type="button"
            onClick={() => dismiss.mutate()}
            disabled={dismiss.isPending}
            data-testid="what-changed-dismiss"
            className="rounded-md border border-[var(--hairline)] bg-white px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)] hover:text-[var(--ink-2)] disabled:opacity-60"
          >
            Dismiss
          </button>
        </div>
      </div>
      <ul className="flex flex-col gap-1" data-testid="what-changed-list">
        {changes.map((c, i) => (
          <ChangeRow
            key={`${c.kind}-${c.customer_id ?? c.label ?? i}`}
            change={c}
            onNavigate={navigate}
            onOpenAudit={onOpenAudit}
          />
        ))}
      </ul>
    </section>
  );
}

interface ChangeRowProps {
  change: SkuDiffChange;
  onNavigate: ReturnType<typeof useNavigate>;
  onOpenAudit: () => void;
}

function ChangeRow({ change, onNavigate, onOpenAudit }: ChangeRowProps) {
  const label = KIND_LABEL[change.kind] ?? change.kind;
  const body = renderChangeBody(change);
  return (
    <li>
      <button
        type="button"
        data-testid={`what-changed-row-${change.kind}`}
        onClick={() => {
          if (change.link_target) {
            onNavigate(change.link_target);
            return;
          }
          onOpenAudit();
        }}
        className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--ink-2)] hover:bg-white"
      >
        <span aria-hidden="true" className="text-[var(--rose-deep)]">•</span>
        <span className="font-semibold text-[var(--ink)]">{label}</span>
        <span className="tabular-nums">{body}</span>
      </button>
    </li>
  );
}

function renderChangeBody(c: SkuDiffChange): string {
  const before = parseDecimal(c.before);
  const after = parseDecimal(c.after);
  const pct = parseDecimal(c.pct);
  const pctStr = Number.isFinite(pct) ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : '';
  switch (c.kind) {
    case 'cost':
    case 'price':
    case 'competitor_signal': {
      if (Number.isFinite(before) && Number.isFinite(after)) {
        return `${fmt.eurPrecise(before)} → ${fmt.eurPrecise(after)}${pctStr}`;
      }
      if (Number.isFinite(after)) return `${fmt.eurPrecise(after)}${pctStr}`;
      return c.label ?? '—';
    }
    case 'customer_risk': {
      const left = Number.isFinite(before) ? `${(before * 100).toFixed(0)}%` : '—';
      const right = Number.isFinite(after) ? `${(after * 100).toFixed(0)}%` : '—';
      const who = c.customer_id ? `${c.customer_id} ` : '';
      return `${who}${left} → ${right}`;
    }
    case 'proposal': {
      const beforeLabel = c.before === null ? 'none' : c.label ?? 'previous';
      const afterLabel = c.label ?? (c.after === null ? '—' : `#${String(c.after).slice(0, 6)}`);
      return `${beforeLabel} → ${afterLabel}`;
    }
    default:
      return c.label ?? '—';
  }
}

function formatSince(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const days = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (days === 0) return `${date} (today)`;
  if (days === 1) return `${date} (1 day ago)`;
  return `${date} (${days} days ago)`;
}
