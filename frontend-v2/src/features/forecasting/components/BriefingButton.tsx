// Phase 7 — "Generate forecast briefing" button + modal.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import { postJson } from '@/lib/api/client';
import { useScenarios } from '@/data/api/useScenarios';

interface BriefingReceipt {
  jobId: string;
  status: string;
  artifactUrl: string;
  format: string;
  recipient: string;
}

export function BriefingButton() {
  const [open, setOpen] = useState(false);
  const [params] = useSearchParams();
  const [recipient, setRecipient] = useState<'self' | 'till' | 'heiko'>('self');
  const [format, setFormat] = useState<'pdf' | 'html'>('pdf');
  const [receipt, setReceipt] = useState<BriefingReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const activeScenario = params.get('scenario_id') ?? undefined;

  // Bug #4: resolve the active scenario id to its human-readable name.
  const { data: scenarios } = useScenarios();
  const activeScenarioName = useMemo(() => {
    if (!activeScenario || !scenarios) return null;
    const all = [...scenarios.system, ...scenarios.saved, ...scenarios.teamShared];
    return all.find((s) => s.id === activeScenario)?.name ?? null;
  }, [activeScenario, scenarios]);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const result = await postJson<BriefingReceipt>(
        '/forecast/briefing',
        { scenario_id: activeScenario, output_format: format, recipient },
        {
          mockResolve: () => ({
            jobId: crypto.randomUUID(),
            status: 'queued',
            artifactUrl: `/api/v1/reports/synth.${format}`,
            format,
            recipient,
          }),
        },
      );
      setReceipt(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setReceipt(null);
        }}
        data-testid="briefing-open"
        className="rounded-md bg-[var(--rose-deep)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[var(--rose-deep)]/90"
      >
        Generate forecast briefing →
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          data-testid="briefing-modal"
        >
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="relative w-full max-w-md rounded-[14px] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h2 className="font-display text-[16px] font-bold tracking-tight">
                Forecast briefing
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)]"
              >
                <X size={14} />
              </button>
            </header>
            <div className="p-5 space-y-3">
              <Field label="Scenario">
                <span className="text-[12.5px] text-[var(--ink-2)]" data-testid="briefing-scenario-name">
                  {activeScenario
                    ? activeScenarioName ?? `Scenario ${activeScenario.slice(0, 8)}…`
                    : 'Base case'}
                </span>
              </Field>
              <Field label="Format">
                <select
                  data-testid="briefing-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'pdf' | 'html')}
                  className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[12.5px]"
                >
                  <option value="pdf">PDF</option>
                  <option value="html">HTML</option>
                </select>
              </Field>
              <Field label="Recipient">
                <select
                  data-testid="briefing-recipient"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value as 'self' | 'till' | 'heiko')}
                  className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[12.5px]"
                >
                  <option value="self">Just me</option>
                  <option value="till">Till (MD)</option>
                  <option value="heiko">Heiko (Sales)</option>
                </select>
              </Field>
              {receipt && (
                <div
                  className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12px] space-y-2"
                  data-testid="briefing-receipt"
                >
                  <div>
                    <b>Job queued:</b> {receipt.jobId.slice(0, 8)}… · format {receipt.format} ·
                    recipient {receipt.recipient}
                  </div>
                  {/* Bug #5: surface the artifact URL so Frank can actually open the PDF. */}
                  <a
                    href={receipt.artifactUrl}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="briefing-download-link"
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--rose-deep)] px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-[var(--rose-deep)]/90"
                  >
                    <Download size={12} /> Open {receipt.format.toUpperCase()} →
                  </a>
                </div>
              )}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[12.5px] font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={busy}
                data-testid="briefing-submit"
                className="rounded-md bg-[var(--rose-deep)] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Generating…' : 'Generate'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
