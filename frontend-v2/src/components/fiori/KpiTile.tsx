import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/format';
import type { KpiData } from '@/types';

interface KpiTileProps {
  kpi: KpiData;
  className?: string;
  onClick?: () => void;
}

export function KpiTile({ kpi, className, onClick }: KpiTileProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-xl border border-[var(--border-subtle)] bg-white px-5 py-4 text-left',
        'shadow-[var(--shadow-1)] transition-all hover:shadow-[var(--shadow-2)]',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpi.label}</div>
      <div className="text-2xl font-semibold tabular-nums text-gray-900">{kpi.value}</div>
      {kpi.delta && (
        <div
          className={cn(
            'flex items-center gap-1 text-xs font-medium',
            kpi.delta.good ? 'text-emerald-600' : 'text-red-600',
          )}
        >
          {kpi.delta.direction === 'up' && <ArrowUp size={12} />}
          {kpi.delta.direction === 'down' && <ArrowDown size={12} />}
          {kpi.delta.direction === 'flat' && <ArrowRight size={12} />}
          <span>{fmt.signedPct(kpi.delta.value)}</span>
        </div>
      )}
    </Wrapper>
  );
}
