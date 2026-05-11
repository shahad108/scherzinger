import { useState } from 'react';
import { ArrowRight, FileText, Mail, Printer, RefreshCcw, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import {
  openReportArtifact,
  printReportArtifact,
  useGenerateActionCenterReport,
  useSendReport,
  type ReportJob,
} from '@/data/api/useReportJob';
import type { ActionIntent } from '@/types/uiActions';

export function ReportCard({
  onAction,
  enabled = true,
  disabledReason,
  traceId,
}: {
  onAction?: (intent: ActionIntent) => void;
  enabled?: boolean;
  disabledReason?: string;
  traceId?: string;
}) {
  const [job, setJob] = useState<ReportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generate = useGenerateActionCenterReport();
  const send = useSendReport();

  const sendDisabled =
    !enabled ||
    !job ||
    job.status === 'failed' ||
    job.status === 'sent' ||
    !(job.payload?.artifact_html || job.download_url);

  function handleGenerate() {
    if (!enabled) {
      if (disabledReason) {
        onAction?.({ toast: disabledReason, toastSeverity: 'warning' });
      }
      return;
    }
    setError(null);
    generate.mutate(
      {},
      {
        onSuccess: (j) => {
          setJob(j);
          onAction?.({
            toast: `Report ${j.id.slice(0, 8)} ready (${j.status})${traceId ? ` · ${traceId}` : ''}.`,
            toastSeverity: 'success',
          });
        },
        onError: (err) => {
          setError((err as Error).message);
          onAction?.({
            toast: `Report failed: ${(err as Error).message}`,
            toastSeverity: 'error',
          });
        },
      },
    );
  }

  function handleSend() {
    if (!enabled || !job) return;
    setError(null);
    send.mutate(
      { reportId: job.id, recipient: 'till' },
      {
        onSuccess: (j) => {
          setJob(j);
          onAction?.({
            toast: `Report sent to Till.`,
            toastSeverity: 'success',
          });
        },
        onError: (err) => {
          setError((err as Error).message);
          onAction?.({
            toast: `Send failed: ${(err as Error).message}`,
            toastSeverity: 'error',
          });
        },
      },
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[var(--hairline)] pb-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
            Generate branded report
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            Auto-generated from the live Action Center snapshot. Audit trail attached. Reports are
            persisted as report_jobs for board review.
          </p>
          {traceId && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Trace ID: <code>{traceId}</code>
            </p>
          )}
        </div>
        {job ? (
          <ReportStatusBadge status={job.status} />
        ) : (
          <Badge tone="info">Audit-ready</Badge>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-[var(--red)] bg-[color-mix(in_oklab,var(--red)_8%,white)] px-3 py-2 text-[12.5px] text-[var(--red)]"
        >
          {error}
          <button
            type="button"
            className="ml-3 inline-flex items-center gap-1 text-[var(--ink-2)] underline"
            onClick={handleGenerate}
            disabled={generate.isPending}
          >
            <RefreshCcw size={11} /> Retry
          </button>
        </div>
      )}

      {!enabled && disabledReason && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2 text-[12.5px] text-[var(--ink-2)]"
        >
          {disabledReason}
        </div>
      )}

      {job && job.status === 'ready' && job.preview && (
        <ReportPreviewTile preview={job.preview} />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-[var(--rose)]" />
            <h3 className="font-display text-sm font-bold text-[var(--ink)]">Branded report</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            HTML artifact today; PDF rendering swaps in without changing this surface.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge>Report</Badge>
              <Badge tone="info">Audit-ready</Badge>
            </div>
            <div className="flex items-center gap-2">
              {job && job.status === 'ready' && (
                <>
                  <button
                    type="button"
                    onClick={() => openReportArtifact(job)}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] hover:bg-[var(--grey-bg)]"
                  >
                    Open
                    <ArrowRight size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => printReportArtifact(job)}
                    title="Open and print — produces a branded PDF via the browser's Print-to-PDF."
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] hover:bg-[var(--grey-bg)]"
                  >
                    <Printer size={12} />
                    Print PDF
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!enabled || generate.isPending}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-60"
              >
                {generate.isPending
                  ? 'Generating…'
                  : job
                    ? 'Regenerate'
                    : 'Generate report'}
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-[var(--rose)]" />
            <h3 className="font-display text-sm font-bold text-[var(--ink)]">Send to Till</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Forwards the generated artifact to Till's MD review queue with audit provenance.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge>Board pack</Badge>
              {job?.status === 'sent' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_oklab,var(--green)_12%,white)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--green)]">
                  <CheckCircle2 size={10} /> Sent
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={sendDisabled || send.isPending}
              title={
                !job
                  ? 'Generate the report first.'
                  : job.status === 'sent'
                    ? 'Already sent — regenerate to send again.'
                    : undefined
              }
              className="inline-flex items-center gap-1 rounded-md bg-[var(--rose)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--rose-deep)] disabled:opacity-50"
            >
              {send.isPending ? 'Sending…' : 'Send to Till'}
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportPreviewTile({ preview }: { preview: NonNullable<ReportJob['preview']> }) {
  const tiles = [
    { label: 'Recommendations', value: preview.recommendation_count, sub: 'live signals' },
    {
      label: 'Proposals',
      value: preview.proposal_count,
      sub: `${preview.draft_proposal_count} draft · ${preview.pending_approval_count} pending`,
    },
    { label: 'A/B tests', value: preview.ab_test_count, sub: 'in window' },
    {
      label: 'Audit events',
      value: preview.audit_count,
      sub: 'with hash chain',
    },
  ];
  return (
    <div
      data-testid="report-preview-tile"
      className="mb-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-3"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--ink-3)]">
          Report preview · what Till will see
        </div>
        <div className="text-[10.5px] text-[var(--muted)]">
          Prepared by {preview.generated_for_name ?? 'Frank'} · {new Date(preview.generated_at).toLocaleString()}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-[var(--hairline)] bg-white px-2.5 py-1.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              {t.label}
            </div>
            <div className="mt-0.5 font-display text-[18px] font-bold leading-none tabular-nums text-[var(--ink)]">
              {t.value}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--muted)]">{t.sub}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] leading-snug text-[var(--muted)]">
        Branded PDF · Pryzm header on every page · audit hash chain footer (last{' '}
        {preview.audit_count} actions). Use <b>Print PDF</b> to save the artifact directly.
      </p>
    </div>
  );
}

function ReportStatusBadge({ status }: { status: ReportJob['status'] }) {
  const tone =
    status === 'failed'
      ? 'rose'
      : status === 'sent'
        ? 'positive'
        : status === 'ready'
          ? 'info'
          : 'neutral';
  const label =
    status === 'pending'
      ? 'Generating…'
      : status === 'ready'
        ? 'Ready'
        : status === 'sent'
          ? 'Sent'
          : 'Failed';
  return <Badge tone={tone as React.ComponentProps<typeof Badge>['tone']}>{label}</Badge>;
}
