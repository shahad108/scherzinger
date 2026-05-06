import { ArrowRight, FileText, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export function ReportCard() {
  return (
    <div className="mb-6 rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--hairline)] pb-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
            Generate branded report
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            Auto-generated in Scherzinger corporate design. Audit trail attached. Reports persisted
            for board review.
          </p>
        </div>
        <Badge tone="info">Audit-ready</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-[var(--rose)]" />
            <h3 className="font-display text-sm font-bold text-[var(--ink)]">Branded PDF</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Corporate design · audit trail attached
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge>PDF</Badge>
              <Badge tone="info">Audit-ready</Badge>
            </div>
            <button className="inline-flex items-center gap-1 rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-all hover:border-[var(--ink-2)] hover:bg-[var(--grey-bg)]">
              Generate PDF
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-[var(--rose)]" />
            <h3 className="font-display text-sm font-bold text-[var(--ink)]">Send to Till</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Board pack · synthesizes Frank's outputs for upward communication
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge>Board pack</Badge>
              <Badge tone="positive">Forwardable</Badge>
            </div>
            <button className="inline-flex items-center gap-1 rounded-md bg-[var(--rose)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--rose-deep)]">
              Send to Till
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
