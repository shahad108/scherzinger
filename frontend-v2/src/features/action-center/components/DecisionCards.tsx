import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown, MoreHorizontal, Plus, Clock, GripVertical } from 'lucide-react';
import { chart } from '@/lib/chartColors';
import type { DecisionCard, DecisionFact, DecisionTrend } from '@/types';

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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)]">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      Cluster {c.label} · {c.confidence}% (n={c.n})
    </span>
  );
}

function ChipContract({ kind }: { kind: NonNullable<DecisionCard['contract']> }) {
  const map = {
    movable: { bg: 'var(--green-bg)', color: 'var(--green)', label: 'Movable' },
    locked:  { bg: 'var(--amber-bg)', color: 'var(--amber)', label: 'Locked' },
    abtest:  { bg: 'var(--violet-bg)', color: 'var(--violet)', label: 'A/B' },
  } as const;
  const s = map[kind];
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: s.bg, color: s.color }}>
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
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-3 border-t border-[var(--hairline)] py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="text-[11.5px] font-semibold text-[var(--muted)]">{fact.label}</div>
      <div>
        <div className="text-[13px] font-bold tabular-nums" style={{ color: valueColor }}>{fact.value}</div>
        <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">{fact.detail}</div>
      </div>
    </div>
  );
}

function FeedbackRow({ id }: { id: string }) {
  const [act, setAct] = useState<ActState>(null);
  const [open, setOpen] = useState(false);

  const accSelected = act === 'acc' || act === 'nim' || act === 'par';
  const accText = accSelected && act ? accLabel[act as 'acc' | 'nim' | 'par'] : 'Accept & implement';

  const fbtnBase = 'inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-soft)]';

  const acceptStyles = accSelected ? { background: 'var(--green)', borderColor: 'transparent', color: '#fff' } : undefined;
  const rejStyles = act === 'rej' ? { background: 'var(--red)', borderColor: 'transparent', color: '#fff' } : undefined;
  const abStyles = act === 'ab' ? { background: 'var(--violet)', borderColor: 'transparent', color: '#fff' } : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => { setAct('acc'); setOpen(false); }}
          className={`${fbtnBase} rounded-r-none pr-2.5`}
          style={acceptStyles}
        >
          <span aria-hidden>✓</span>{accText}
        </button>
        <button
          type="button"
          aria-label="Accept variant menu"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className={`${fbtnBase} rounded-l-none border-l-0 px-2`}
          style={acceptStyles}
        >
          <ChevronDown size={12} />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 flex w-[260px] flex-col gap-1 rounded-xl border border-[var(--hairline)] bg-white p-1 shadow-[var(--shadow-pop)]">
            {(['acc', 'nim', 'par'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setAct(k); setOpen(false); }}
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
      <button type="button" onClick={() => setAct('rej')} className={fbtnBase} style={rejStyles}>
        <span aria-hidden>✗</span> Reject
      </button>
      <button type="button" onClick={() => setAct('ab')} className={fbtnBase} style={abStyles}>
        <span aria-hidden>🧪</span> Slice as A/B
      </button>
      <span className="sr-only">Action {id}</span>
    </div>
  );
}

export function DecisionCards({ decisions }: { decisions: DecisionCard[] }) {
  return (
    <>
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
          <button type="button" aria-label="Add" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--hairline)] bg-white text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink-2)]">
            <Plus size={14} />
          </button>
          <button type="button" aria-label="More" className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--hairline)] bg-white text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink-2)]">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3.5">
        {decisions.map((d, i) => (
          <motion.div
            key={d.rank + d.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
          >
            {/* Top section: rank + title + tools, then chips */}
            <div className="px-5 pt-4 pb-4">
              <div className="flex items-center gap-3.5">
                <div
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[13px] font-bold text-white"
                  style={{ background: 'var(--ink)' }}
                >
                  {d.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold leading-tight tracking-[-0.012em] text-[var(--ink)]">
                    {d.headline ?? d.title}
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">
                    {[d.tag, d.daysOpenLabel, d.authorityLabel].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[var(--muted-2)]">
                  <button type="button" aria-label="Snooze" className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--surface-soft)] hover:text-[var(--ink-3)]">
                    <Clock size={14} />
                  </button>
                  <button type="button" aria-label="More" className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--surface-soft)] hover:text-[var(--ink-3)]">
                    <MoreHorizontal size={14} />
                  </button>
                  <span aria-hidden className="grid h-8 w-5 place-items-center text-[var(--muted-2)]">
                    <GripVertical size={14} />
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.cluster && <ChipCluster c={d.cluster} />}
                {d.contract && <ChipContract kind={d.contract} />}
                {d.tag && (
                  <span className="inline-flex items-center rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)]">
                    {d.tag}
                  </span>
                )}
              </div>
            </div>

            {/* Middle section: meta-grid + signal + trend */}
            <div className="border-t border-[var(--hairline)] px-5 py-4">
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
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] px-4 py-3">
                    <div className="mb-2 text-[12px]">
                      <b className="font-bold text-[var(--ink)]">Why now</b>
                      <span className="ml-1 text-[var(--muted)]">— top signals driving this recommendation</span>
                    </div>
                    <div className="flex flex-col">
                      {(d.facts ?? []).map((f, j) => <FactRow key={j} fact={f} />)}
                    </div>
                  </div>
                  {d.trend && (
                    <div className="rounded-xl border border-[var(--hairline)] bg-white px-4 py-3">
                      <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">{d.trend.label}</div>
                      <div className="mt-1 font-display text-[26px] font-bold leading-none tabular-nums text-[var(--ink)]">
                        {d.trend.value}
                        <span className="ml-2 text-[12px] font-semibold" style={{ color: 'var(--red)' }}>{d.trend.delta}</span>
                      </div>
                      <MiniSpark trend={d.trend} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom section: feedback + cta-row */}
            <div className="border-t border-[var(--hairline)] px-5 py-4">
              <FeedbackRow id={d.rank} />
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {d.secondaryCta && (
                  <button type="button" className="rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]">
                    {d.secondaryCta}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-xl px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm transition-colors"
                  style={{ background: 'var(--rose)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--rose-deep)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--rose)')}
                >
                  {d.primaryCta ?? d.cta}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}
