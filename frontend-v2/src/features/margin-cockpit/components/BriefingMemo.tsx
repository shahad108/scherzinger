import { X } from 'lucide-react';
import type { BriefingMemoData } from '@/types';

interface Props {
  data: BriefingMemoData;
  open: boolean;
  onClose: () => void;
}

export function BriefingMemo({ data, open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow-pop)]"
      style={{ borderLeft: '4px solid var(--rose)' }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          {data.title}
        </span>
        <button type="button" className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-2)]">
          Copy
        </button>
        <button type="button" className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-2)]">
          Email to Till
        </button>
        <button type="button" className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-2)]">
          Branded PDF
        </button>
        <button
          type="button"
          aria-label="Close briefing"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface-soft)]"
        >
          <X size={14} />
        </button>
      </div>
      <div
        role="textbox"
        aria-multiline="true"
        aria-label="Editable margin briefing memo"
        className="space-y-3 text-[13.5px] leading-relaxed text-[var(--ink-2)]"
        contentEditable
        suppressContentEditableWarning
      >
        {data.paragraphs.map((p) => (
          <p key={p.html.slice(0, 40)} dangerouslySetInnerHTML={{ __html: p.html }} />
        ))}
        <p className="text-[12px] text-[var(--muted)]">
          {data.signature}
          <span> · audit hash <code className="rounded bg-[var(--surface-soft)] px-1 py-0.5 text-[11px]">{data.auditHash}</code></span>
        </p>
      </div>
    </div>
  );
}
