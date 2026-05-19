import { History } from 'lucide-react';
import type { HeroChipData } from '@/types/studio';
import { renderInline } from './renderInline';

export interface HeroView {
  eyebrow: string;
  title: string;
  sub: string;
  chips: HeroChipData[];
  meta: string;
  currentPrice: string;
  currentMargin: string;
  currentMarginTone: 'bad' | 'good';
  targetText: string;
}

interface Props {
  hero: HeroView;
  /** Phase 4 — open the Audit Drawer. When undefined the button is hidden. */
  onOpenAudit?: () => void;
  /** Optional badge count surfaced beside the History button label. */
  auditBadge?: number;
}

export function WorkbenchHero({ hero, onOpenAudit, auditBadge }: Props) {
  const showBadge = typeof auditBadge === 'number' && auditBadge > 0;
  // Phase C regression fix — every field on `hero` is rendered defensively
  // so a partially-populated workbench (e.g. a still-loading per-aid fetch
  // or a sparse BFF response) cannot trip the React error boundary.
  const chips = hero?.chips ?? [];
  const eyebrow = hero?.eyebrow ?? '';
  const title = hero?.title ?? '';
  const sub = hero?.sub ?? '';
  const meta = hero?.meta ?? '';
  const currentPrice = hero?.currentPrice ?? '—';
  const currentMargin = hero?.currentMargin ?? '—';
  const currentMarginTone = hero?.currentMarginTone ?? 'good';
  const targetText = hero?.targetText ?? '';
  return (
    <div className="ws-hero">
      <div>
        <div className="ws-hero-eyebrow">{eyebrow}</div>
        <h3>{title}</h3>
        <div className="ws-hero-sub">{renderInline(sub)}</div>
        <div className="ws-hero-chips">
          {chips.map((c, i) => (
            <span key={i} className={c.variant ?? ''}>
              {c.label}
            </span>
          ))}
        </div>
        <div className="ws-hero-meta">{renderInline(meta)}</div>
      </div>
      <div className="ws-hero-num">
        {onOpenAudit && (
          <div className="mb-1 flex justify-end">
            <button
              type="button"
              data-testid="workbench-hero-history-button"
              onClick={onOpenAudit}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] hover:border-[var(--rose-border)] hover:bg-[var(--rose-bg)] hover:text-[var(--rose-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)] focus-visible:ring-offset-1"
              aria-label="Open audit history"
            >
              <History size={12} aria-hidden="true" />
              History
              {showBadge && (
                <span
                  data-testid="workbench-hero-history-badge"
                  className="ml-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[var(--rose-deep)] px-1 text-[9.5px] font-bold text-white"
                >
                  {auditBadge}
                </span>
              )}
            </button>
          </div>
        )}
        <div className="ws-cur">{currentPrice}</div>
        <div className={`ws-marg-now ${currentMarginTone}`}>{currentMargin}</div>
        <div className="ws-target">{targetText}</div>
      </div>
    </div>
  );
}
