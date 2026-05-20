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

  it('Phase 9: renders the branded preview tile + Print PDF button once ready', async () => {
    render(withQc(<ReportCard />));
    fireEvent.click(screen.getByRole('button', { name: /Generate report/i }));
    await waitFor(() =>
      expect(screen.getByTestId('report-preview-tile')).toBeInTheDocument(),
    );
    // Preview shows the 4 KPI tiles with the synth-mock numbers.
    expect(screen.getByText(/Report preview · what Till will see/)).toBeInTheDocument();
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Audit events')).toBeInTheDocument();
    // Synth-mock values: 12 / 4 / 2 / 9.
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    // Print PDF button appears next to Open.
    expect(screen.getByRole('button', { name: /Print PDF/i })).toBeInTheDocument();
  });
});
