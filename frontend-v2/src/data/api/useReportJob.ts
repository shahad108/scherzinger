// Phase 6 — report job lifecycle hooks. Wraps the FastAPI endpoints at
// /api/v1/reports/* so the Action Center ReportCard can drive
// generate → poll → download → send without re-implementing state in
// every consumer.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';

export type ReportStatus = 'pending' | 'ready' | 'sent' | 'failed';

export interface ReportPreview {
  recommendation_count: number;
  proposal_count: number;
  draft_proposal_count: number;
  pending_approval_count: number;
  ab_test_count: number;
  audit_count: number;
  estimated_impact_eur_per_unit: number;
  generated_at: string;
  generated_for_name?: string;
}

export interface ReportJob {
  id: string;
  screen: string;
  filters: Record<string, unknown>;
  status: ReportStatus;
  artifact_url: string | null;
  payload: Record<string, unknown>;
  created_at: string | null;
  /** Backend-provided convenience URL (relative). */
  download_url?: string | null;
  /** Phase 9 — inline summary shown in the ReportCard preview tile. */
  preview?: ReportPreview | null;
}

const SYNTH_KEY = 'pryzm_v2_synth_reports';

function readSynth(): ReportJob[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(SYNTH_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function writeSynth(rows: ReportJob[]) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SYNTH_KEY, JSON.stringify(rows));
}

function synthCreate(filters: ReportFiltersBody): ReportJob {
  const id = `mock-report-${Date.now()}`;
  const job: ReportJob = {
    id,
    screen: 'action-center',
    filters: { ...filters },
    status: 'ready',
    artifact_url: null,
    payload: {
      artifact_html: '<html><body><h1>Mock-mode pricing report</h1><p>Bundled mock fixture; live API renders the real action-center snapshot.</p></body></html>',
    },
    created_at: new Date().toISOString(),
    download_url: `mock://reports/${id}`,
    preview: {
      recommendation_count: 12,
      proposal_count: 4,
      draft_proposal_count: 3,
      pending_approval_count: 1,
      ab_test_count: 2,
      audit_count: 9,
      estimated_impact_eur_per_unit: 38.42,
      generated_at: new Date().toISOString(),
      generated_for_name: 'Frank',
    },
  };
  writeSynth([job, ...readSynth()].slice(0, 25));
  return job;
}

function synthSend(reportId: string): ReportJob {
  const rows = readSynth();
  const idx = rows.findIndex((r) => r.id === reportId);
  if (idx === -1) {
    throw new Error('report not found in synthetic store');
  }
  rows[idx] = {
    ...rows[idx],
    status: 'sent',
    payload: {
      ...rows[idx].payload,
      sent: { recipient: 'till', at: new Date().toISOString() },
    },
  };
  writeSynth(rows);
  return rows[idx];
}

export interface ReportFiltersBody {
  week?: string;
  cluster?: string;
  hide_locked?: boolean;
  limit?: number;
}

export function useGenerateActionCenterReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filters: ReportFiltersBody) =>
      postJson<ReportJob>('/reports/action-center', filters, {
        mockResolve: () => synthCreate(filters),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useSendReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, recipient, note }: { reportId: string; recipient?: string; note?: string }) =>
      postJson<ReportJob>(`/reports/${reportId}/send`, { recipient: recipient ?? 'till', note }, {
        mockResolve: () => synthSend(reportId),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

/** Open the artifact in a new tab. Falls back to inline preview if the
 * download URL is the synthetic mock placeholder. */
export function openReportArtifact(job: ReportJob): void {
  if (typeof window === 'undefined') return;
  if (job.download_url && !job.download_url.startsWith('mock://')) {
    window.open(job.download_url, '_blank', 'noopener,noreferrer');
    return;
  }
  // Mock-mode: inline preview from the synthetic html.
  const html = (job.payload?.artifact_html as string | undefined) ?? '<html><body>No artifact.</body></html>';
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Phase 9 — open the artifact and auto-trigger the browser Print dialog.
 *  Backed by an injected <script>window.print()</script> for the live
 *  download path; for the mock-mode synthetic html we splice the script
 *  in before opening the blob. */
export function printReportArtifact(job: ReportJob): void {
  if (typeof window === 'undefined') return;
  if (job.download_url && !job.download_url.startsWith('mock://')) {
    // Live path: open in a new tab and call print() once loaded.
    const w = window.open(job.download_url, '_blank', 'noopener,noreferrer');
    // Many browsers strip the opener for noopener — fall back gracefully.
    if (w) {
      try {
        w.addEventListener('load', () => w.print(), { once: true });
      } catch {
        /* opener stripped; user can still print via menu */
      }
    }
    return;
  }
  const html = (job.payload?.artifact_html as string | undefined) ?? '<html><body>No artifact.</body></html>';
  const printable = html.replace(
    /<\/body>/i,
    "<script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 50); });</script></body>",
  );
  const blob = new Blob([printable], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
}

// `apiFetch` exposed for callers that want to refetch a job (status poll).
export async function fetchReport(reportId: string): Promise<ReportJob> {
  return apiFetch<ReportJob>(`/reports/${reportId}`, {
    mockResolve: () => readSynth().find((r) => r.id === reportId) ?? synthCreate({}),
  });
}
