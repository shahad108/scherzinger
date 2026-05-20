// P15.T3 + P15.T4 — error reporting + trace IDs.
//
// Both are no-ops in dev / test. In production, when VITE_SENTRY_DSN is set
// the project should also `npm i @sentry/react` and call `initSentry()` from
// providers.tsx. Until then this module ships a hook that reports to console
// in dev and a thin shim that real Sentry can replace.

let sentryClient: { captureException: (e: unknown, extra?: Record<string, unknown>) => void } | null = null;

/** Optional bootstrap from providers.tsx. Pass nothing to leave Sentry off. */
export function initObservability(client?: typeof sentryClient): void {
  sentryClient = client ?? null;
}

interface ReportContext {
  persona?: string;
  route?: string;
  query_key?: readonly unknown[];
  trace_id?: string;
  status?: number;
}

export function reportError(err: unknown, ctx: ReportContext = {}): void {
  if (sentryClient) {
    sentryClient.captureException(err, ctx as Record<string, unknown>);
    return;
  }
  // Dev fallback — visible in browser console with the same structured tags
  // a Sentry transport would receive.
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[observability]', { err, ...ctx });
  }
}

// ---------- trace IDs (P15.T4) ----------

/** RFC 4122 v4 lite — sufficient for trace correlation. */
export function newTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes.
  let s = '';
  for (let i = 0; i < 32; i++) {
    const r = Math.floor(Math.random() * 16);
    s += r.toString(16);
  }
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
