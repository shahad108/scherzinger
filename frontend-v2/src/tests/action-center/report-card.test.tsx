/**
 * Phase 6 — ReportCard generate → ready → send lifecycle, exercised
 * against the synthetic mock store so the full state machine runs
 * without a backend.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ReportCard } from '@/features/action-center/components/ReportCard';

beforeEach(() => {
  if (typeof window !== 'undefined') window.sessionStorage.clear();
});

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('ReportCard lifecycle', () => {
  it('generate → ready unlocks Send to Till; send → sent locks it again', async () => {
    render(withQc(<ReportCard />));

    const generate = screen.getByRole('button', { name: /Generate report/i });
    const send = screen.getByRole('button', { name: /Send to Till/i });
    expect(send).toBeDisabled();

    fireEvent.click(generate);

    // Once ready: Open + Regenerate appear; Send is enabled; status badge "Ready".
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Regenerate/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Open/i })).toBeInTheDocument();
    expect(screen.getByText(/^Ready$/)).toBeInTheDocument();

    const sendReady = screen.getByRole('button', { name: /Send to Till/i });
    expect(sendReady).not.toBeDisabled();

    fireEvent.click(sendReady);
    await waitFor(() => expect(screen.getAllByText(/^\s*Sent\s*$/i).length).toBeGreaterThan(0));

    // After send, the button locks again (regenerate to send another).
    expect(screen.getByRole('button', { name: /Send to Till/i })).toBeDisabled();
  });
});
