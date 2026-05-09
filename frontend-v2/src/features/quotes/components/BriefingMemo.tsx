import { X } from 'lucide-react';
import type { QuoteBriefingMemo } from '@/types/quotes';

interface Props {
  data: QuoteBriefingMemo;
  open: boolean;
  onClose: () => void;
}

export function BriefingMemo({ data, open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]"
      style={{ borderLeft: '4px solid var(--rose)' }}
    >
      <div className="mb-3.5 flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] pb-3">
        <span className="mr-auto font-display text-[13px] font-bold text-[var(--ink)]">{data.title}</span>
        <button type="button" className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--ink-2)] hover:bg-[var(--surface-sunken)]">
          Copy
        </button>
        <button type="button" className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--ink-2)] hover:bg-[var(--surface-sunken)]">
          Email
        </button>
        <button type="button" className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--ink-2)] hover:bg-[var(--surface-sunken)]">
          PDF
        </button>
        <button
          type="button"
          aria-label="Close briefing"
          onClick={onClose}
          className="rounded-[8px] p-1.5 text-[var(--muted)] hover:bg-[var(--surface-soft)]"
        >
          <X size={14} />
        </button>
      </div>
      <div
        role="textbox"
        aria-multiline="true"
        aria-label="Editable quote-decision briefing"
        className="space-y-2.5 text-[13px] leading-[1.7] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]"
        contentEditable
        suppressContentEditableWarning
      >
        {data.paragraphs.map((p) => (
          <p key={p.html.slice(0, 40)} dangerouslySetInnerHTML={{ __html: p.html }} />
        ))}
        <p className="mt-3.5 border-t border-[var(--hairline)] pt-2.5 text-[12px] italic text-[var(--muted)]">
          {data.signature}
        </p>
      </div>
    </div>
  );
}
