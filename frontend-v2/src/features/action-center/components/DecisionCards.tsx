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
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium text-[var(--ink-2)]"
      style={{ background: 'var(--surface-sunken)', borderRadius: 7, padding: '5px 9px' }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      Cluster {c.label} · {c.confidence}% (n={c.n})
    </span>
  );
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

function FeedbackRow({ id }: { id: string }) {
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
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => { setAct('acc'); setOpen(false); }}
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
      <button type="button" onClick={() => setAct('rej')} className={baseFbtn} style={rejStyle}>
        <span aria-hidden>✗</span> Reject
      </button>
      <button type="button" onClick={() => setAct('ab')} className={baseFbtn} style={abStyle}>
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
            className="rounded-[14px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
          >
            {/* Top section: rank + title + tools, then chips */}
            <div style={{ padding: '18px 22px' }}>
              <div className="flex items-center gap-3.5">
                <div
                  className="grid shrink-0 place-items-center font-display text-[13px] font-bold"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: 'var(--surface-sunken)',
                    color: 'var(--ink-2)',
                  }}
                >
                  {d.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15.5px] font-bold leading-[1.3] tracking-[-0.012em] text-[var(--ink)]">
                    {d.headline ?? d.title}
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">
                    {[d.tag, d.daysOpenLabel, d.authorityLabel].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="flex items-center" style={{ gap: 6 }}>
                  <button
                    type="button"
                    aria-label="Snooze"
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

            {/* Bottom section: feedback row + CTA row, SAME ac-section */}
            <div style={{ padding: '18px 22px', borderTop: '1px solid var(--hairline)' }}>
              <FeedbackRow id={d.rank} />
              <div className="mt-3.5 flex items-stretch" style={{ gap: 10 }}>
                {d.secondaryCta && (
                  <button
                    type="button"
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
                  className="inline-flex flex-1 items-center justify-center gap-2 text-[13px] font-semibold text-white transition-colors"
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
