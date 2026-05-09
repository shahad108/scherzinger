import type { Tier } from '@/types/quotes';

const palette: Record<Tier, string> = {
  A: 'var(--rose)',
  B: 'var(--ink-3)',
  C: 'var(--amber)',
  D: 'var(--red)',
};

interface Props {
  tier: Tier;
  className?: string;
}

export function TierChip({ tier, className = '' }: Props) {
  return (
    <span
      className={`mr-1.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] text-[10px] font-bold text-white ${className}`}
      style={{ background: palette[tier] }}
    >
      {tier}
    </span>
  );
}
