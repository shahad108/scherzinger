import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, MoreHorizontal, Plus, Clock, GripVertical } from 'lucide-react';
import { chart } from '@/lib/chartColors';
import { useAcceptDecision, useDeclineDecision } from '@/data/api/useActions';
import { MessageStrip } from '@/components/fiori/MessageStrip';
import type { DecisionCard, DecisionFact, DecisionTrend } from '@/types';
import type { ActionIntent } from '@/types/uiActions';
import { EmptyBlock } from './EmptyBlock';

type ActState = 'acc' | 'nim' | 'par' | 'rej' | 'ab' | null;

const accLabel: Record<'acc' | 'nim' | 'par', string> = {
  acc: 'Accept & implement',
  nim: 'Accept, not yet implemented',
  par: 'Accept, partial',
};

function MiniSpark({ trend }: { trend: DecisionTrend }) {
  const w = 100;
  const h = 42;
  const min = Math.min(...trend.spark);
  const max = Math.max(...trend.spark);
  const range = max - min || 1;
  const points = trend.spark.map((v, i) => {
    const x = (i / (trend.spark.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.78 - 4;
    return `${x},${y}`;
  });
  const path = `M ${points.join(' L ')}`;
  const last = points[points.length - 1].split(',');
  const stroke = chart.rose();
  const fill = chart.roseSoft();
  return (
    <div className="mt-2 h-[42px]">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id={`mc-${trend.value}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity="0.35" />
            <stop offset="100%" stopColor={fill} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L ${w},${h} L 0,${h} Z`} fill={`url(#mc-${trend.value})`} />
        <path d={path} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={Number(last[0])} cy={Number(last[1])} r="2.2" fill={stroke} />
      </svg>
    </div>
  );
}

function ChipCluster({ c }: { c: NonNullable<DecisionCard['cluster']> }) {
  const dot = c.confidence >= 80 ? 'var(--green)' : c.confidence >= 60 ? 'var(--amber)' : 'var(--red)';
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium text-[var(--ink-2)]"
      style={{ background: 'var(--surface-sunken)', borderRadius: 7, padding: '5px 9px' }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      Cluster {c.label} · {c.confidence}% (n={c.n})
    </span>
  );
}

type LifecycleState = NonNullable<DecisionCard['lifecycleState']>;

const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  open: 'Open',
  accepted: 'Accepted',
  rejected: 'Rejected',
  partial: 'Partial',
  snoozed: 'Snoozed',
  ab_running: 'A/B running',
  ab_promoted: 'A/B promoted',
};

// Tone classes — rose for positive lifecycle (accepted/promoted), amber for
// in-flight states, warm-gray for neutral. Uses theme tokens only.
function lifecycleStyle(state: LifecycleState): React.CSSProperties {
  switch (state) {
    case 'accepted':
    case 'ab_promoted':
      return {
        background: 'var(--rose-tint)',
        color: 'var(--rose-deep)',
        borderColor: 'var(--rose-soft)',
      };
    case 'partial':
    case 'ab_running':
    case 'snoozed':
      return {
        background: 'var(--amber-bg)',
        color: 'var(--amber)',
        borderColor: 'var(--amber-border)',
      };
    default:
      return {
        background: 'var(--surface-sunken)',
        color: 'var(--ink-2)',
        borderColor: 'var(--hairline)',
      };
  }
}

function LifecycleChip({ state }: { state: LifecycleState }) {
  const style = lifecycleStyle(state);
  return (
    <span
      data-testid={`lifecycle-chip-${state}`}
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.04em]"
      style={{
        ...style,
        border: `1px solid ${style.borderColor as string}`,
        borderRadius: 999,
        padding: '3px 9px',
      }}
    >
      {LIFECYCLE_LABEL[state]}
    </span>
  );
}

function LockedDrivers() {
  return (
    <div
      data-testid="locked-drivers"
      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[var(--hairline)] px-3 py-2 text-[11.5px] text-[var(--muted)]"
      style={{ background: 'var(--surface-sunken)' }}
    >
      <span aria-hidden>🔒</span>
      Feature importance ships with the model registry (Phase 2).
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

function formatNum(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value);
}

function primaryCtaLabel(d: DecisionCard): string {
  // Plan §2.6 F13 — uniform CTA copy. Override whatever the backend sent.
  if (d.queue === 'cost_riser' || d.queue === 'margin_erosion') {
    return 'Open in Pricing Studio';
  }
  if (d.queue === 'churn') {
    return 'Open customer';
  }
  return d.primaryCta ?? d.cta ?? 'Open';
}

function ChipContract({ kind }: { kind: NonNullable<DecisionCard['contract']> }) {
  const map = {
    movable: { dot: 'var(--green)',  label: 'Movable' },
    locked:  { dot: 'var(--amber)',  label: 'Locked' },
    abtest:  { dot: 'var(--violet)', label: 'A/B' },
  } as const;
  const s = map[kind];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium text-[var(--ink-2)]"
      style={{ background: 'var(--surface-sunken)', borderRadius: 7, padding: '5px 9px' }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

function SelectPill({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[12.5px] font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--border-strong)]"
    >
      <span className="truncate">{children}</span>
      <ChevronDown size={12} className="text-[var(--muted)]" />
    </button>
  );
}

function FactRow({ fact }: { fact: DecisionFact }) {
  const valueColor = fact.tone === 'negative' ? 'var(--red)' : fact.tone === 'positive' ? 'var(--green)' : 'var(--ink-2)';
  return (
    <div
      className="grid grid-cols-[130px_minmax(0,1fr)] items-baseline gap-3.5 first:border-t-0 first:pt-0 last:pb-0"
      style={{ padding: '9px 0', borderTop: '1px solid rgba(0,0,0,0.05)' }}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] leading-[1.4] text-[var(--muted)]">{fact.label}</div>
      <div className="min-w-0">
        <div
          className="text-[13.5px] font-bold leading-[1.35] tracking-[-0.005em] tabular-nums"
          style={{ color: valueColor }}
        >
          {fact.value}
        </div>
        <div className="mt-0.5 text-[11.5px] leading-[1.4] text-[var(--muted)]">{fact.detail}</div>
      </div>
    </div>
  );
}

function FeedbackRow({
  id,
  decision,
  onAccept,
  onReject,
  onSliceAb,
  onShare,
}: {
  id: string;
  decision: DecisionCard;
  onAccept?: (d: DecisionCard, variant: 'acc' | 'nim' | 'par') => void;
  onReject?: (d: DecisionCard) => void;
  onSliceAb?: (d: DecisionCard) => void;
  onShare?: (d: DecisionCard) => void;
}) {
  const [act, setAct] = useState<ActState>('acc');
  const [open, setOpen] = useState(false);

  const accSelected = act === 'acc' || act === 'nim' || act === 'par';
  const accText = accSelected && act ? accLabel[act as 'acc' | 'nim' | 'par'] : 'Accept & implement';

  // Accept is GREEN by default (selected on mount); Reject is white-with-red-text default; A/B is white-with-violet-text default.
  const baseFbtn = 'inline-flex items-center gap-1.5 rounded-[10px] border text-[12.5px] font-medium transition-colors';

  const accStyle: React.CSSProperties = accSelected
    ? { background: 'var(--green)', borderColor: 'transparent', color: '#fff', padding: '8px 12px', fontWeight: 600 }
    : { background: '#fff', borderColor: 'var(--border)', color: 'var(--ink-2)', padding: '8px 12px', fontWeight: 500 };

  const rejStyle: React.CSSProperties = act === 'rej'
    ? { background: 'var(--red)', borderColor: 'transparent', color: '#fff', padding: '8px 12px', fontWeight: 600 }
    : { background: '#fff', borderColor: 'var(--border)', color: 'var(--ink-2)', padding: '8px 12px', fontWeight: 500 };

  const abStyle: React.CSSProperties = act === 'ab'
    ? { background: 'var(--violet)', borderColor: 'transparent', color: '#fff', padding: '8px 12px', fontWeight: 600 }
    : { background: '#fff', borderColor: 'var(--border)', color: 'var(--ink-2)', padding: '8px 12px', fontWeight: 500 };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`ac-decision-feedback-${id}`}>
      <div className="relative inline-flex">
        <button
          type="button"
          data-testid={`ac-decision-accept-${id}`}
          onClick={() => {
            setAct('acc');
            setOpen(false);
            onAccept?.(decision, 'acc');
          }}
          className={`${baseFbtn} rounded-r-none pr-2.5`}
          style={accStyle}
        >
          <span aria-hidden>✓</span>{accText}
        </button>
        <button
          type="button"
          aria-label="Accept variant menu"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className={`${baseFbtn} rounded-l-none border-l-0`}
          style={{ ...accStyle, padding: '8px 9px' }}
        >
          <ChevronDown size={12} />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 flex w-[260px] flex-col gap-1 rounded-xl border border-[var(--hairline)] bg-white p-1 shadow-[var(--shadow-pop)]">
            {(['acc', 'nim', 'par'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setAct(k);
                  setOpen(false);
                  onAccept?.(decision, k);
                }}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-soft)]"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: k === 'par' ? 'var(--amber)' : k === 'nim' ? 'var(--muted)' : 'var(--green)' }}
                />
                <span className="flex-1">
                  <span className="block text-[12.5px] font-semibold text-[var(--ink)]">{accLabel[k]}</span>
                  <span className="block text-[11px] text-[var(--muted)]">
                    {k === 'acc' ? 'Apply now to live pricing' : k === 'nim' ? 'Queue for later cycle' : 'Apply with custom amount'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        data-testid={`ac-decision-reject-${id}`}
        onClick={() => { setAct('rej'); onReject?.(decision); }}
        className={baseFbtn}
        style={rejStyle}
      >
        <span aria-hidden>✗</span> Reject
      </button>
      <button
        type="button"
        onClick={() => { setAct('ab'); onSliceAb?.(decision); }}
        className={baseFbtn}
        style={abStyle}
      >
        <span aria-hidden>🧪</span> Slice as A/B
      </button>
      <button
        type="button"
        aria-label="Share with Till or Heiko"
        onClick={() => onShare?.(decision)}
        className={baseFbtn}
        style={{ background: '#fff', borderColor: 'var(--border)', color: 'var(--ink-2)', padding: '8px 12px', fontWeight: 500 }}
      >
        <span aria-hidden>↗</span> Share
      </button>
      <span className="sr-only">Action {id}</span>
    </div>
  );
}

export function DecisionCards({
  decisions,
  onAction,
}: {
  decisions: DecisionCard[];
  onAction?: (intent: ActionIntent) => void;
}) {
  // Phase 12 — optimistic accept. Cards added to `accepted` are hidden
  // immediately; on POST /actions failure they re-appear with a MessageStrip.
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Plan §2.6 F10 — inline evidence panel state. One row open at a time.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const acceptMutation = useAcceptDecision();
  const declineMutation = useDeclineDecision();

  const handleAccept = (d: DecisionCard, variant: 'acc' | 'nim' | 'par' = 'acc') => {
    setErrorMsg(null);

    // Phase 3 — "par" (Apply with custom amount) opens the partial_accept
    // form drawer instead of dispatching directly. The form submits to
    // the same backend kind but captures price + reason for the audit row.
    if (variant === 'par') {
      const intent = d.partialAction ?? {
        drawer: {
          title: 'Partial acceptance',
          description: `Soft proposal for ${d.primaryAction?.articleId ?? d.recommendationId ?? d.title}.`,
          formKind: 'partial_accept',
          context: {
            recommendationId: d.recommendationId ?? d.primaryAction?.targetId,
            articleId: d.primaryAction?.articleId,
            customerId: d.primaryAction?.customerId,
            cluster: d.primaryAction?.cluster,
            sourceKind: d.primaryAction?.sourceScreen,
            headline: d.headline ?? d.title,
          },
        },
      };
      onAction?.(intent);
      return;
    }

    const id = d.rank;
    setAccepted((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const mutation = acceptMutation;
    // Prefer the backend-attached intent so target_id is the stable
    // recommendation ref and the row created here is the same one the
    // composer will look up on the next refresh.
    const intent = d.primaryAction;
    const recId = d.recommendationId ?? intent?.targetId ?? id;
    mutation.mutate(
      {
        ...(intent?.body ?? {}),
        target_type: intent?.targetType ?? 'recommendation',
        target_id: recId,
        recommendation_id: recId,
        after: { headline: d.headline ?? d.title, variant },
      },
      {
        onSuccess: () =>
          onAction?.({
            toast:
              variant === 'acc'
                ? `Accepted "${d.headline ?? d.title}".`
                : `Queued "${d.headline ?? d.title}" for the next cycle.`,
          }),
        onError: (err) => {
          setAccepted((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setErrorMsg(`Could not accept "${d.headline ?? d.title}": ${(err as Error).message}`);
        },
      },
    );
  };

  const handleReject = (d: DecisionCard) => {
    const id = d.rank;
    setErrorMsg(null);
    setAccepted((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    const recId = d.recommendationId ?? d.primaryAction?.targetId ?? id;
    declineMutation.mutate(
      {
        target_type: 'recommendation',
        target_id: recId,
        recommendation_id: recId,
        article_id: d.primaryAction?.articleId,
        customer_id: d.primaryAction?.customerId,
        cluster: d.primaryAction?.cluster,
        after: { headline: d.headline ?? d.title },
      },
      {
        onSuccess: () => onAction?.({ toast: `Rejected "${d.headline ?? d.title}".` }),
        onError: (err) => {
          setAccepted((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          setErrorMsg(`Could not reject "${d.headline ?? d.title}": ${(err as Error).message}`);
        },
      },
    );
  };

  const handleShare = (d: DecisionCard) => {
    setErrorMsg(null);
    // Phase 11 — open the share_decision form drawer so Frank picks
    // Till vs Heiko and writes an optional note before fanning out.
    onAction?.({
      drawer: {
        title: 'Share decision',
        description: `Forward "${d.headline ?? d.title}" with a note. Recipient gets an unread notification + audit-trail link.`,
        formKind: 'share_decision',
        context: {
          recommendationId: d.recommendationId ?? d.primaryAction?.targetId,
          articleId: d.primaryAction?.articleId,
          customerId: d.primaryAction?.customerId,
          cluster: d.primaryAction?.cluster,
          sourceKind: d.primaryAction?.sourceScreen,
          headline: d.headline ?? d.title,
        },
      },
      requiredPermission: 'act.share_decision',
      permissionDeniedReason: 'You are not allowed to share decisions from this workspace.',
    });
  };

  const handleSliceAb = (d: DecisionCard) => {
    setErrorMsg(null);
    // Phase 4 — open the ab_setup form drawer so the analyst chooses
    // control/treatment/slice/duration before starting the test.
    const intent = d.sliceAbAction ?? {
      drawer: {
        title: 'Start A/B test',
        description: `Slice a measured price test for ${d.primaryAction?.articleId ?? d.recommendationId ?? d.title}.`,
        formKind: 'ab_setup',
        context: {
          recommendationId: d.recommendationId ?? d.primaryAction?.targetId,
          articleId: d.primaryAction?.articleId,
          cluster: d.primaryAction?.cluster,
          headline: d.headline ?? d.title,
        },
      },
      requiredPermission: 'act.start_ab_test',
      permissionDeniedReason: 'You are not allowed to start A/B tests from this workspace.',
    };
    onAction?.(intent);
  };

  const visible = (decisions ?? []).filter((d) => !accepted.has(d.rank));

  if (!decisions || decisions.length === 0) {
    return (
      <EmptyBlock
        title="Today's analyst decisions"
        hint="No decisions for the active filter. Decisions are ranked by impact and refresh on Monday morning."
      />
    );
  }
  return (
    <>
      {errorMsg && (
        <div className="mb-3">
          <MessageStrip severity="error" closable>{errorMsg}</MessageStrip>
        </div>
      )}
      <div id="sec-decisions" className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
            Today's analyst decisions
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">
            Ranked by impact. Frank analyzes; outputs flow to Heiko (Sales) and Till (MD). Generated Mon 8:00 · reranks daily.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Add"
            onClick={() =>
              onAction?.({
                drawer: {
                  title: 'Create manual action',
                  description: 'Create an operator-owned action and attach it to this review queue.',
                  items: [
                    { label: 'Default owner', value: 'Frank' },
                    { label: 'Destination', value: 'Action Center decision queue' },
                  ],
                },
                requiredPermission: 'create.action',
              })
            }
            className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--hairline)] bg-white text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink-2)]"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            aria-label="More"
            onClick={() =>
              onAction?.({
                drawer: {
                  title: 'Decision queue options',
                  description: 'Queue-wide actions depend on backend support for grouped writes and are not yet available in this workspace.',
                  items: [
                    { label: 'Available now', value: 'Sort, inspect, and act on each recommendation.' },
                    { label: 'Unavailable', value: 'Bulk accept and bulk snooze' },
                  ],
                },
              })
            }
            className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--hairline)] bg-white text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink-2)]"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3.5" data-testid="ac-decisions">
        {visible.map((d, i) => {
          const cardId = d.id ?? d.recommendationId ?? d.rank;
          const isExpanded = expandedId === cardId;
          const lifecycle: LifecycleState = d.lifecycleState ?? 'open';
          return (
          <motion.div
            key={d.rank + d.title}
            data-testid={`ac-decision-card-${cardId}`}
            data-queue={d.queue}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[14px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
          >
            {/* Top section: rank + title + tools, then chips */}
            <div style={{ padding: '18px 22px' }}>
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  data-testid={`ac-decision-rank-${cardId}`}
                  aria-label={`Toggle evidence for decision ${d.rank}`}
                  aria-expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : cardId)}
                  className="grid shrink-0 place-items-center font-display text-[13px] font-bold transition-colors hover:bg-[var(--hairline)]"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: 'var(--surface-sunken)',
                    color: 'var(--ink-2)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {d.rank}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 text-[15.5px] font-bold leading-[1.3] tracking-[-0.012em] text-[var(--ink)]">
                      {d.headline ?? d.title}
                    </div>
                    <LifecycleChip state={lifecycle} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--muted)]">
                    <span>{[d.tag, d.daysOpenLabel, d.authorityLabel].filter(Boolean).join(' · ')}</span>
                    <button
                      type="button"
                      data-testid={`ac-decision-why-${cardId}`}
                      onClick={() => setExpandedId(isExpanded ? null : cardId)}
                      className="rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-[var(--rose-deep)] underline-offset-2 transition-colors hover:bg-[var(--rose-tint)] hover:underline"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Hide' : 'Why this?'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center" style={{ gap: 6 }}>
                  <button
                    type="button"
                    aria-label="Snooze"
                    onClick={() =>
                      onAction?.({
                        drawer: {
                          title: `Snooze ${d.headline ?? d.title}`,
                          description: 'Snooze needs a durable backend action so the decision returns at the right time. This preview records the intended deferral.',
                          items: [
                            { label: 'Decision', value: d.rank },
                            { label: 'Suggested', value: 'Tomorrow 08:00' },
                            { label: 'Backend gap', value: 'snooze_recommendation action kind' },
                          ],
                        },
                        toast: `Snooze preview opened for "${d.headline ?? d.title}".`,
                        toastSeverity: 'info',
                      })
                    }
                    className="grid place-items-center"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: 'var(--surface-sunken)',
                      color: 'var(--ink-2)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Clock size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="More"
                    onClick={() =>
                      onAction?.({
                        drawer: {
                          title: `More actions: ${d.headline ?? d.title}`,
                          description: 'Inspect ownership, evidence, and next workflow options for this decision.',
                          items: [
                            { label: 'Rank', value: d.rank },
                            { label: 'Recommendation', value: d.recommendation ?? d.cta },
                            { label: 'Confidence', value: d.confLabel ?? 'High' },
                          ],
                        },
                        toast: 'Decision details opened',
                        toastSeverity: 'info',
                      })
                    }
                    className="grid place-items-center"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: 'var(--surface-sunken)',
                      color: 'var(--ink-2)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                  <span
                    aria-hidden
                    className="grid place-items-center"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: 'var(--surface-sunken)',
                      color: 'var(--muted)',
                      cursor: 'grab',
                    }}
                  >
                    <GripVertical size={14} />
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.cluster && <ChipCluster c={d.cluster} />}
                {d.contract && <ChipContract kind={d.contract} />}
                {d.tag && (
                  <span
                    className="inline-flex items-center whitespace-nowrap text-[11.5px] font-medium text-[var(--ink-2)]"
                    style={{ background: 'var(--surface-sunken)', borderRadius: 7, padding: '5px 9px' }}
                  >
                    {d.tag}
                  </span>
                )}
              </div>
            </div>

            {/* Middle section: meta-grid + signal + trend */}
            <div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Recommendation
                  </div>
                  <SelectPill>{d.recommendation ?? d.cta}</SelectPill>
                </div>
                <div>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Cluster
                  </div>
                  <SelectPill>{d.cluster?.label ?? '—'}</SelectPill>
                </div>
                <div>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Time
                  </div>
                  <div className="inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[12.5px] font-semibold text-[var(--ink-2)]">
                    <span>{d.timeMinutes ?? 10}</span>
                    <span className="text-[var(--muted)]">min</span>
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Confidence
                  </div>
                  <SelectPill>{d.confLabel ?? 'High'}</SelectPill>
                </div>
              </div>

              {(d.facts || d.trend) && (
                <div
                  className="mt-4 grid grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_200px]"
                  style={{
                    background: 'var(--surface-soft)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 11,
                  }}
                >
                  <div style={{ padding: '14px 18px' }}>
                    <div className="mb-3 flex flex-wrap items-baseline gap-2 text-[12.5px] font-bold leading-tight tracking-[-0.005em] text-[var(--ink)]">
                      <b>Why now</b>
                      <span className="text-[11.5px] font-medium text-[var(--muted)]">— top signals driving this recommendation</span>
                    </div>
                    <div className="flex flex-col">
                      {(d.facts ?? []).map((f, j) => <FactRow key={j} fact={f} />)}
                    </div>
                  </div>
                  {d.trend && (
                    <div
                      className="flex flex-col justify-between gap-2"
                      style={{
                        padding: '14px 16px',
                        borderLeft: '1px solid var(--hairline)',
                        background: 'rgba(0,0,0,0.012)',
                      }}
                    >
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{d.trend.label}</div>
                      <div className="font-display text-[32px] font-bold leading-[1.05] tracking-[-0.025em] tabular-nums text-[var(--ink)]">
                        {d.trend.value}
                        <span className="ml-1.5 text-[12px] font-semibold" style={{ color: 'var(--red)' }}>{d.trend.delta}</span>
                      </div>
                      <MiniSpark trend={d.trend} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Inline evidence panel — plan §2.6 F10/F11/F12. Toggled by the
                rank chip or the "Why this?" button. Stays inside the card
                frame; the full lineage drawer is a separate Phase B route. */}
            {isExpanded && (
              <div
                data-testid={`evidence-panel-${cardId}`}
                style={{ padding: '14px 22px', borderTop: '1px solid var(--hairline)', background: 'var(--surface-soft)' }}
              >
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                  Evidence
                </div>
                <div className="mt-1 text-[12.5px] text-[var(--ink-2)]">
                  Invoices: <b className="tabular-nums">{formatNum(d.evidence?.invoiceCount)}</b>
                  {' · '}Quotes: <b className="tabular-nums">{formatNum(d.evidence?.quoteCount)}</b>
                  {' · '}Last invoice: <b>{formatDate(d.evidence?.lastInvoiceDate)}</b>
                  {' · '}Sample size: <b className="tabular-nums">{formatNum(d.evidence?.sampleSize)}</b>
                </div>

                <div className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                  Confidence
                </div>
                {d.confidence ? (
                  <div className="mt-1 text-[12.5px] text-[var(--ink-2)]">
                    Score: <b className="tabular-nums">{d.confidence.score}%</b>
                    {' · '}Tone: <b>{d.confidence.tone}</b>
                    {' · '}Model:{' '}
                    <b>{d.confidence.model.id ?? '—'}</b>
                    {d.confidence.model.version ? <> v<b>{d.confidence.model.version}</b></> : null}
                    {' · '}Trained: <b>{formatDate(d.confidence.model.trainedAt)}</b>
                  </div>
                ) : (
                  <div className="mt-1 text-[12.5px] text-[var(--muted)]">—</div>
                )}

                <div className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
                  Top drivers
                </div>
                {d.featureImportance && d.featureImportance.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.featureImportance.map((f) => (
                      <span
                        key={f.feature}
                        className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ink-2)]"
                        style={{ background: 'var(--surface-sunken)', borderRadius: 7, padding: '4px 9px' }}
                      >
                        {f.feature}
                        <b className="tabular-nums">{f.weightPct}%</b>
                      </span>
                    ))}
                  </div>
                ) : !d.confidence?.model.id ? (
                  <LockedDrivers />
                ) : (
                  <div className="mt-1 text-[12px] text-[var(--muted)]">
                    No driver decomposition available yet.
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      onAction?.({
                        drawer: {
                          title: `Lineage: ${d.headline ?? d.title}`,
                          description: 'Full lineage and audit trail for this recommendation.',
                          formKind: 'lineage',
                          context: {
                            recommendationId: d.recommendationId ?? cardId,
                            articleId: d.primaryAction?.articleId,
                            customerId: d.primaryAction?.customerId,
                            cluster: d.primaryAction?.cluster,
                            headline: d.headline ?? d.title,
                          },
                        },
                      })
                    }
                    className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-soft)]"
                  >
                    See full lineage
                  </button>
                </div>
              </div>
            )}

            {/* Bottom section: feedback row + CTA row, SAME ac-section */}
            <div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
              <FeedbackRow
                id={d.rank}
                decision={d}
                onAccept={(card, variant) => handleAccept(card, variant)}
                onReject={(card) => handleReject(card)}
                onSliceAb={(card) => handleSliceAb(card)}
                onShare={(card) => handleShare(card)}
              />
              <div className="mt-3.5 flex items-stretch" style={{ gap: 10 }}>
                {d.secondaryCta && (
                  <button
                    type="button"
                    onClick={() =>
                      onAction?.({
                        drawer: {
                          title: d.secondaryCta ?? 'Library action',
                          description: 'Reusable playbooks and proposal snippets will be inserted from the sales library. This preview shows what will be attached.',
                          items: [
                            { label: 'Decision', value: d.headline ?? d.title },
                            { label: 'Template', value: d.recommendation ?? d.cta },
                          ],
                        },
                        toast: `${d.secondaryCta} opened`,
                        toastSeverity: 'info',
                      })
                    }
                    className="inline-flex flex-1 items-center justify-center gap-2 text-[13px] font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)]"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '11px 18px',
                      cursor: 'pointer',
                    }}
                  >
                    {d.secondaryCta}
                  </button>
                )}
                <button
                  type="button"
                  data-testid={`ac-decision-primary-${cardId}`}
                  onClick={() => {
                    // Phase 1 contract: prefer the backend-attached secondary
                    // action intent (typically a Pricing Studio deep link with
                    // recommendation context). For locked rows whose primary
                    // is queue_renewal, dispatch that form drawer. Only fall
                    // back to label parsing when no intent is provided.
                    if (d.secondaryAction) {
                      onAction?.(d.secondaryAction);
                      return;
                    }
                    if (d.primaryAction?.kind === 'queue_renewal' || d.primaryAction?.drawer?.formKind === 'queue_renewal') {
                      onAction?.(d.primaryAction);
                      return;
                    }
                    const label = d.primaryCta ?? d.cta;
                    if (label.includes('Studio')) {
                      onAction?.({
                        route: '/pricing',
                        query: { decision: d.rank, source: 'action-center' },
                        toast: `Opening Pricing Studio for "${d.headline ?? d.title}".`,
                      });
                    } else if (label.includes('Queue renewal')) {
                      onAction?.({
                        drawer: {
                          title: `Queue renewal: ${d.headline ?? d.title}`,
                          description: 'Renewal actions are staged for the next contract window so locked revenue is not repriced blindly.',
                          formKind: 'queue_renewal',
                          context: {
                            recommendationId: d.recommendationId,
                            articleId: d.primaryAction?.articleId,
                            headline: d.headline ?? d.title,
                          },
                        },
                      });
                    } else {
                      handleAccept(d);
                    }
                  }}
                  disabled={acceptMutation.isPending}
                  className="inline-flex flex-1 items-center justify-center gap-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-60"
                  style={{
                    background: 'var(--rose)',
                    border: '1px solid var(--rose)',
                    borderRadius: 12,
                    padding: '11px 18px',
                    boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--rose-deep)';
                    e.currentTarget.style.boxShadow = '0 6px 16px -8px rgba(90,125,163,0.55)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--rose)';
                    e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.06)';
                  }}
                >
                  {primaryCtaLabel(d)}
                </button>
              </div>
            </div>
          </motion.div>
          );
        })}
      </div>
    </>
  );
}
