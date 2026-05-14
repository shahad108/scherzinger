import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ActualEntryPanel } from './ActualEntryPanel';

const fetchMock = vi.fn();

beforeEach(() => {
  // useCreateOverride uses fetch() directly; mock at the global level.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.fetch = fetchMock as any;
  fetchMock.mockReset();
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ActualEntryPanel', () => {
  it('renders the panel with model band context', () => {
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={612000}
        band80={[587000, 638000]}
        band95={[561000, 672000]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('actual-entry-panel')).toBeInTheDocument();
    expect(screen.getByText('2026-08')).toBeInTheDocument();
    expect(screen.getByText(/612,000/)).toBeInTheDocument();
  });

  it('blocks save when reason is too short', () => {
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={612000}
        band80={[587000, 638000]}
        band95={[561000, 672000]}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId('actual-input'), { target: { value: '650000' } });
    fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'short' } });
    const save = screen.getByRole('button', { name: /Save actual/i });
    expect(save).toBeDisabled();
  });

  it('shows FVA warning for a <5% adjustment', () => {
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={100}
        band80={[95, 105]}
        band95={[90, 110]}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId('actual-input'), { target: { value: '102' } });
    fireEvent.change(screen.getByTestId('reason-input'), {
      target: { value: 'within model band - small reconciliation' },
    });
    expect(screen.getByTestId('fva-warning')).toBeInTheDocument();
    expect(screen.getByText(/Small overrides/i)).toBeInTheDocument();
  });

  it('hides FVA warning when adjustment >= 5%', () => {
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={100}
        band80={[95, 105]}
        band95={[90, 110]}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId('actual-input'), { target: { value: '120' } });
    fireEvent.change(screen.getByTestId('reason-input'), {
      target: { value: 'large contract pull-in confirmed' },
    });
    expect(screen.queryByTestId('fva-warning')).not.toBeInTheDocument();
  });

  it('POSTs override and closes the panel on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'x',
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
      }),
    });
    const onClose = vi.fn();
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={612000}
        band80={[587000, 638000]}
        band95={[561000, 672000]}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByTestId('actual-input'), { target: { value: '650000' } });
    fireEvent.change(screen.getByTestId('reason-input'), {
      target: { value: 'Q3 contract renegotiation confirmed' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save actual/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v1/forecast/overrides');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      month: '2026-08',
      mode: 'revenue',
      actual: 650000,
      modelP50: 612000,
      source: 'manual',
      confidence: 'medium',
    });
    expect(body.reason).toBe('Q3 contract renegotiation confirmed');
  });

  it('renders an error message and does NOT close when save fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const onClose = vi.fn();
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={612000}
        band80={[587000, 638000]}
        band95={[561000, 672000]}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByTestId('actual-input'), { target: { value: '650000' } });
    fireEvent.change(screen.getByTestId('reason-input'), {
      target: { value: 'reason long enough to pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save actual/i }));
    await waitFor(() => expect(screen.getByTestId('actual-entry-error')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('exposes aria-modal="true" for assistive tech', () => {
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={612000}
        band80={[587000, 638000]}
        band95={[561000, 672000]}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('actual-entry-panel')).toHaveAttribute('aria-modal', 'true');
  });

  it('traps focus inside the dialog when tabbing past the last element', () => {
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={612000}
        band80={[587000, 638000]}
        band95={[561000, 672000]}
        onClose={() => {}}
      />,
    );
    const panel = screen.getByTestId('actual-entry-panel');
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    );
    const list = Array.from(focusables).filter((el) => !el.hasAttribute('disabled'));
    const first = list[0];
    const last = list[list.length - 1];

    // Tab from last element should cycle back to first.
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(panel, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from first element should cycle to last.
    first.focus();
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    wrap(
      <ActualEntryPanel
        month="2026-08"
        mode="revenue"
        cluster={null}
        modelP50={612000}
        band80={[587000, 638000]}
        band95={[561000, 672000]}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
