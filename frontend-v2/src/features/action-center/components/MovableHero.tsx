import { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { chart } from '@/lib/chartColors';
import type { MovableHero as Hero } from '@/types';

interface Props {
  hero: Hero;
  onAction?: () => void;
}

export function MovableHero({ hero, onAction }: Props) {
  const [showHeuristic, setShowHeuristic] = useState(false);
  const stroke = chart.rose();
  const fillStop = chart.roseSoft();
  const dot = chart.roseDeep();
  const heuristic = hero.heuristic;

  const w = 320;
  const h = 110;
  const min = Math.min(...hero.spark);
  const max = Math.max(...hero.spark);
  const range = max - min || 1;
  const points = hero.spark.map((v, i) => {
    const x = (i / (hero.spark.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.85 - 8;
    return `${x},${y}`;
  });
  const path = `M ${points.join(' L ')}`;
  const area = `M 0,${h} L ${points.join(' L ')} L ${w},${h} Z`;

  const movablePct = hero.movablePct;
  const lockedPct = hero.lockedPct;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6 rounded-[14px] border border-[var(--border)] bg-white shadow-[var(--shadow-card)]"
      style={{ padding: '24px 28px 22px' }}
      id="sec-movable"
    >
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
              Movable revenue
            </span>
            {heuristic && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowHeuristic((v) => !v)}
                  onMouseEnter={() => setShowHeuristic(true)}
                  onMouseLeave={() => setShowHeuristic(false)}
                  aria-label="Show movable-revenue heuristic"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--amber)] bg-[var(--amber-bg,#FEF3C7)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--amber,#92400E)]"
                  style={{ background: 'color-mix(in srgb, var(--amber, #F59E0B) 15%, white)' }}
                >
                  <span
                    className="inline-grid h-3 w-3 place-items-center rounded-full border border-current text-[8px] leading-none"
                    aria-hidden
                  >
                    ?
                  </span>
                  {heuristic.label}
                </button>
                {showHeuristic && (
                  <div
                    role="tooltip"
                    className="absolute left-0 top-full z-30 mt-2 w-[320px] rounded-lg border border-[var(--hairline)] bg-white p-3 text-[12px] leading-relaxed text-[var(--ink)] shadow-[var(--shadow-md)]"
                  >
                    <div className="font-semibold text-[var(--ink)]">{heuristic.label}</div>
                    <p className="mt-1 text-[var(--ink-2)]">{heuristic.rule}</p>
                    {heuristic.qualifier && (
                      <p className="mt-2 text-[11.5px] italic text-[var(--muted)]">
                        {heuristic.qualifier}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="font-display text-[56px] font-bold leading-none tracking-tight tabular-nums text-[var(--ink)]">
              {hero.value}
            </span>
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums"
              style={{ background: 'var(--green-bg)', color: 'var(--green)', padding: '5px 10px', borderRadius: 7, letterSpacing: '-0.005em' }}
            >
              <svg viewBox="0 0 12 12" width={11} height={11} fill="none" aria-hidden>
                <path
                  d="M6 10V2M6 2L2.5 5.5M6 2L9.5 5.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {hero.delta}
            </span>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
            of <b className="font-semibold text-[var(--ink-2)]">{hero.totalRevenue}</b> total revenue
            {' '}({hero.windowLabel ?? 'trailing 12 months'}) —{' '}
            <b className="font-semibold text-[var(--ink-2)]">{movablePct}% open to repricing</b>.
            {heuristic?.qualifier && (
              <>
                {' '}
                <span className="italic text-[var(--muted-2)]">{heuristic.qualifier}</span>
              </>
            )}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-0">
            <div className="pr-5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: 'var(--rose)' }}
                />
                Movable share
              </div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular-nums text-[var(--ink)]">
                {movablePct}%
                <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">of revenue</span>
              </div>
            </div>
            <div className="border-l border-[var(--border)] px-5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                SKUs in scope
              </div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular-nums text-[var(--ink)]">
                {hero.skusInScope}
                <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">
                  of {hero.skusTotal}
                </span>
              </div>
            </div>
            <div className="border-l border-[var(--border)] pl-5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: 'var(--ink-3)', opacity: 0.45 }}
                />
                Locked
              </div>
              <div className="mt-1.5 font-display text-[22px] font-bold tabular-nums text-[var(--ink-2)]">
                {hero.lockedValue}
                <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">
                  {lockedPct}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3.5 flex h-1.5 overflow-hidden rounded bg-[var(--surface-soft)]">
            <div style={{ width: `${movablePct}%`, background: 'var(--rose)' }} />
            <div className="flex-1" style={{ background: 'var(--ink-3)', opacity: 0.35 }} />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11.5px] italic text-[var(--muted)]">
              Movable share refined per cluster — see Heterogeneous Portfolio.
            </span>
            <Link
              to="/pricing#queue"
              onClick={() => onAction?.()}
              className="inline-flex items-center gap-1.5 rounded-lg text-[12.5px] font-semibold text-white shadow-sm transition-colors"
              style={{ background: 'var(--ink)', padding: '9px 14px' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#000')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--ink)')}
            >
              Open repricing queue
              <svg viewBox="0 0 12 12" width={11} height={11} fill="none" aria-hidden>
                <path
                  d="M2.5 6h7M6 2.5L9.5 6 6 9.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            <span>Movable revenue trend</span>
            <span className="tabular-nums text-[var(--muted-2)]">€M</span>
          </div>
          <div className="relative flex-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
            <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="heroSparkFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={fillStop} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={fillStop} stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.path
                d={area}
                fill="url(#heroSparkFill)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.4 }}
              />
              <motion.path
                d={path}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
              <circle
                cx={w}
                cy={h - ((hero.spark[hero.spark.length - 1] - min) / range) * h * 0.85 - 8}
                r={4}
                fill={dot}
              />
            </svg>
          </div>
          <div className="mt-2 flex justify-between text-[10.5px] text-[var(--muted)]">
            <span>Wk 6</span>
            <span>Wk 12</span>
            <span className="font-semibold" style={{ color: 'var(--rose)' }}>
              Wk 18 · {hero.value}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
