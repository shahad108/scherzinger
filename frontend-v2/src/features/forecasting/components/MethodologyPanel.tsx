// Phase 2 — Collapsible methodology panel at the bottom of the forecasting page.
//
// Renders the notebook's validation_report.md content + subsections for
// Models, Assumptions, External Sources, Limitations.

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ForecastMethodology } from '@/types/forecast';

interface Props {
  methodology: ForecastMethodology;
}

export function MethodologyPanel({ methodology }: Props) {
  const [open, setOpen] = useState(false);
  const reviewedAt = useMemo(
    () => new Date(methodology.lastReviewedAt).toLocaleString(),
    [methodology.lastReviewedAt],
  );

  return (
    <section className="mt-10" data-testid="methodology-panel">
      <div className="rounded-[14px] border border-[var(--border)] bg-white">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="methodology-body"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[var(--surface-soft)]"
        >
          <div className="flex items-center gap-2">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="font-display text-[15px] font-bold tracking-tight text-[var(--ink)]">
              Methodology, sources &amp; limitations
            </span>
          </div>
          <span className="text-[11.5px] text-[var(--muted)]">Last reviewed {reviewedAt}</span>
        </button>

        {open && (
          <div id="methodology-body" className="border-t border-[var(--border)] px-5 py-5 space-y-6">
            <Section title="Validation report">
              {methodology.validationReportMd ? (
                <pre className="max-h-[260px] overflow-auto rounded-md bg-[var(--surface-sunken)] p-3 text-[11.5px] leading-[1.55] whitespace-pre-wrap font-mono text-[var(--ink-2)]">
                  {methodology.validationReportMd}
                </pre>
              ) : (
                <div className="text-[12.5px] text-[var(--muted)]">
                  Validation report not yet generated. Run the forecast notebook to populate.
                </div>
              )}
            </Section>

            <Section title="Models">
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {methodology.models.map((m) => (
                  <li
                    key={`${m.modelName}-${m.version}`}
                    className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <b className="text-[13px]">{m.modelName}</b>
                      <span className="tag-chip">v{m.version}</span>
                    </div>
                    <div className="mt-1 text-[11.5px] text-[var(--muted)]">
                      {m.metric}: <b>{m.metricValue != null ? m.metricValue.toFixed(3) : '—'}</b> ·
                      n={m.nObservations ?? '—'} · h={m.holdoutMonths ?? '—'}mo
                    </div>
                    {m.notes && (
                      <div className="mt-1 text-[11.5px] italic text-[var(--muted)]">
                        {m.notes}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Assumptions">
              <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {methodology.assumptions.map((a) => (
                  <li
                    key={a.label}
                    className="flex items-baseline justify-between gap-3 rounded-md border border-[var(--hairline)] px-3 py-1.5 text-[12.5px]"
                  >
                    <span>
                      <b>{a.label}:</b> {a.value}
                    </span>
                    {a.note && (
                      <span className="text-[11px] text-[var(--muted)] italic">{a.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="External sources">
              <ul className="space-y-1 text-[12.5px]">
                {methodology.sources.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-start justify-between gap-3 rounded-md border border-[var(--hairline)] px-3 py-1.5"
                  >
                    <div>
                      <b>{s.name}</b>
                      <span className="ml-1 tag-chip">{s.kind}</span>
                      <span className="ml-1 text-[var(--muted)]">{s.description}</span>
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-[var(--muted)]">
                      {new Date(s.lastFetchedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Limitations">
              <ul className="list-disc pl-5 space-y-1 text-[12.5px] text-[var(--ink-2)]">
                {methodology.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Section>
          </div>
        )}
      </div>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}
