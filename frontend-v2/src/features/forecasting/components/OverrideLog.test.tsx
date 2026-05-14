import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { OverrideLog } from './OverrideLog';

const fetchMock = vi.fn();

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = fetchMock as any;
  fetchMock.mockReset();
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('OverrideLog', () => {
  it('shows the empty-state nudge when there are no overrides', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    wrap(<OverrideLog />);

    // Accordion starts closed — open it to see the empty state.
    const button = await screen.findByRole('button', { name: /Override log/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByTestId('override-log-empty')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('override-log-empty')).toHaveTextContent(
      /Click any month on the forecast above/i,
    );
  });

  it('renders a row for each override and deletes on click', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'ov1',
            month: '2026-08',
            cluster: null,
            mode: 'revenue',
            actual: 650000,
            modelP50: 612000,
            adjustmentPct: 0.062,
            source: 'manual',
            confidence: 'medium',
            reason: 'Q3 contract renegotiation confirmed',
            author: 'frank',
            createdAt: '2026-05-14T00:00:00Z',
            fvaDelta: null,
          },
        ],
      }),
    });

    wrap(<OverrideLog />);

    const button = await screen.findByRole('button', { name: /Override log/i });
    fireEvent.click(button);

    const row = await screen.findByTestId('override-row-ov1');
    expect(row).toHaveTextContent('2026-08');
    expect(row).toHaveTextContent('650,000');
    expect(row).toHaveTextContent('612,000');
    expect(row).toHaveTextContent('Q3 contract renegotiation confirmed');

    // Badge reflects count = 1.
    expect(screen.getByTestId('accordion-badge')).toHaveTextContent('1');

    // Clicking Delete fires the DELETE request. The mutation's onSuccess
    // invalidates the list query → React Query refetches, so we also mock a
    // follow-up list response to avoid an unhandled fetch.
    fetchMock.mockResolvedValueOnce({ ok: true });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });

    fireEvent.click(screen.getByTestId('override-delete-ov1'));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(deleteCall).toBeTruthy();
      expect(String(deleteCall![0])).toContain('/api/v1/forecast/overrides/ov1');
    });
  });
});
