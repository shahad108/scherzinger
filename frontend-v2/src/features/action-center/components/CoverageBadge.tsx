import type { BlockMeta } from '@/types';

const TONE_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  green: { dot: 'var(--green)', bg: 'var(--green-bg, #ECFDF5)', text: 'var(--green, #047857)' },
  amber: { dot: 'var(--amber, #F59E0B)', bg: 'color-mix(in srgb, var(--amber, #F59E0B) 15%, white)', text: 'var(--amber, #92400E)' },
  red:   { dot: 'var(--red)',   bg: 'var(--red-bg, #FEF2F2)',   text: 'var(--red, #B91C1C)' },
};

interface Props {
  coverage?: BlockMeta['coverage'];
  size?: 'sm' | 'md';
}

export function CoverageBadge({ coverage, size = 'sm' }: Props) {
  if (!coverage) return null;
  const tone = TONE_STYLES[coverage.tone] ?? TONE_STYLES.amber;
  const px = size === 'md' ? '4px 10px' : '2px 8px';
  return (
    <span
      title={coverage.label}
      className="inline-flex items-center gap-1.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wider"
      style={{ background: tone.bg, color: tone.text, padding: px }}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: tone.dot }}
      />
      {coverage.label}
    </span>
  );
}
