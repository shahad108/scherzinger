import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import type { MovableHero as Hero } from '@/types';

interface Props {
  hero: Hero;
}

export function MovableHero({ hero }: Props) {
  // Build sparkline path
  const w = 320;
  const h = 80;
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="mb-6 overflow-hidden rounded-2xl border border-[var(--hairline)] bg-gradient-to-br from-[#0f172a] to-[#1e293b] p-7 text-white shadow-[var(--shadow-md)]"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-sky-300">
              Movable revenue
            </span>
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-sky-300"
              title="Pilot estimate · refined weekly per cluster"
            >
              i
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[44px] font-bold leading-none tracking-tight tabular-nums">
              {hero.value}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-300">
              <ArrowUpRight size={14} />
              {hero.delta}
            </span>
          </div>
          <p className="mt-3 text-sm text-white/70">
            of <b className="font-semibold text-white">{hero.totalRevenue}</b> total revenue this
            week — <b className="font-semibold text-white">{hero.movablePct}% open to repricing</b>.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/60">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Movable share
              </div>
              <div className="mt-1 font-display text-xl font-bold tabular-nums">
                {hero.movablePct}%
                <span className="ml-1 text-[11px] font-normal text-white/50">of revenue</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-white/60">SKUs in scope</div>
              <div className="mt-1 font-display text-xl font-bold tabular-nums">
                {hero.skusInScope}
                <span className="ml-1 text-[11px] font-normal text-white/50">
                  of {hero.skusTotal}
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/60">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Locked
              </div>
              <div className="mt-1 font-display text-xl font-bold tabular-nums">
                {hero.lockedValue}
                <span className="ml-1 text-[11px] font-normal text-white/50">
                  {hero.lockedPct}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="bg-gradient-to-r from-emerald-400 to-emerald-500"
              style={{ width: `${hero.movablePct}%` }}
            />
            <div className="flex-1 bg-gradient-to-r from-slate-400 to-slate-500" />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11.5px] italic text-white/50">
              Movable share refined per cluster — see Heterogeneous Portfolio.
            </span>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-rose-600 hover:shadow-lg">
              Open repricing queue
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-white/50">
            <span>Movable revenue trend</span>
            <span className="text-white/40">€M</span>
          </div>
          <div className="relative flex-1 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <svg
              viewBox={`0 0 ${w} ${h}`}
              className="h-full w-full"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
              </defs>
              <motion.path
                d={area}
                fill="url(#sparkFill)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.4 }}
              />
              <motion.path
                d={path}
                fill="none"
                stroke="#34d399"
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
                fill="#fb7185"
              />
            </svg>
          </div>
          <div className="mt-2 flex justify-between text-[10.5px] text-white/50">
            <span>Wk 6</span>
            <span>Wk 12</span>
            <span className="font-semibold text-rose-300">Wk 18 · {hero.value}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
