import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { OverrideLog } from './OverrideLog';
import type { FvaSummary } from '@/types/forecast';

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

  it('shows a retry-able error block when the list fetch fails', async () => {
    // First load: simulate a 500 → useQuery treats !ok as error (the hook
    // throws on non-ok responses; see useForecastOverrides).
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'boom' }),
    });

    wrap(<OverrideLog />);

    const button = await screen.findByRole('button', { name: /Override log/i });
    fireEvent.click(button);

    const errorBlock = await screen.findByTestId('override-log-error');
    expect(errorBlock).toHaveTextContent(/Couldn’t load overrides/i);
    // Empty-state must NOT also be rendered — that's what was masking errors.
    expect(screen.queryByTestId('override-log-empty')).toBeNull();

    // Clicking Retry triggers refetch — mock the next call returning items.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('override-log-error')).toBeNull();
    });
  });

  it('does not disable other rows while one delete is in flight', async () => {
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
            reason: 'first row',
            author: 'frank',
            createdAt: '2026-05-14T00:00:00Z',
            fvaDelta: null,
          },
          {
            id: 'ov2',
            month: '2026-09',
            cluster: null,
            mode: 'revenue',
            actual: 700000,
            modelP50: 660000,
            adjustmentPct: 0.06,
            source: 'manual',
            confidence: 'medium',
            reason: 'second row',
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

    await screen.findByTestId('override-row-ov1');
    await screen.findByTestId('override-row-ov2');

    // Stall the DELETE for ov1 so we can observe in-flight state.
    let resolveDelete: (v: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveDelete = resolve; }),
    );

    fireEvent.click(screen.getByTestId('override-delete-ov1'));

    // ov1's delete button reflects in-flight state…
    await waitFor(() => {
      expect(screen.getByTestId('override-delete-ov1')).toBeDisabled();
    });
    // …but ov2's button remains enabled (per-row mutation hook).
    expect(screen.getByTestId('override-delete-ov2')).not.toBeDisabled();

    // Resolve to avoid leaving the request hanging.
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    resolveDelete({ ok: true });
  });

  describe('FVA summary strip (Phase G)', () => {
    const baseSummary: FvaSummary = {
      period: '2026Q2',
      entered: 14,
      improved: 9,
      worsened: 5,
      neutral: 0,
      netFvaDeltaPp: 1.8,
    };

    it('renders the summary strip when fvaSummary is provided and tone is green for positive net Δ', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      wrap(<OverrideLog fvaSummary={baseSummary} />);

      const button = await screen.findByRole('button', { name: /Override log/i });
      fireEvent.click(button);

      const strip = await screen.findByTestId('override-fva-summary');
      expect(strip).toHaveAttribute('data-tone', 'pos');
      expect(strip).toHaveTextContent(/Q2 2026/);
      expect(screen.getByTestId('override-fva-summary-entered')).toHaveTextContent('14');
      expect(screen.getByTestId('override-fva-summary-improved')).toHaveTextContent('9');
      expect(screen.getByTestId('override-fva-summary-worsened')).toHaveTextContent('5');
      expect(screen.getByTestId('override-fva-summary-net')).toHaveTextContent('+1.8pp');
    });

    it('uses negative (red) tone when netFvaDeltaPp is negative', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      wrap(
        <OverrideLog
          fvaSummary={{ ...baseSummary, netFvaDeltaPp: -2.3 }}
        />,
      );

      const button = await screen.findByRole('button', { name: /Override log/i });
      fireEvent.click(button);

      const strip = await screen.findByTestId('override-fva-summary');
      expect(strip).toHaveAttribute('data-tone', 'neg');
      // formatted with mathematical minus '−' + magnitude
      expect(screen.getByTestId('override-fva-summary-net').textContent).toMatch(
        /−2\.3pp/,
      );
    });

    it('does not render the strip when fvaSummary is undefined (back-compat)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      wrap(<OverrideLog />);

      const button = await screen.findByRole('button', { name: /Override log/i });
      fireEvent.click(button);

      // Wait for the accordion content (empty state) to render so we know
      // the open transition has completed before asserting absence.
      await screen.findByTestId('override-log-empty');
      expect(screen.queryByTestId('override-fva-summary')).toBeNull();
    });
  });
});
